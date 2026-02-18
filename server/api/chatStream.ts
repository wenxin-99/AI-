import { Router, Request, Response } from "express";
import { invokeLLMStream, invokeLLM } from "../_core/llm";
import * as db from "../db";
import { TRPCError } from "@trpc/server";
import { sdk } from "../_core/sdk";
import { COOKIE_NAME } from "@shared/const";
import { ENV } from "../_core/env";
import { generateImage } from "../_core/imageGeneration";
import { analyzeImageIntent } from "./analyzeImageIntent";
import { getDb as getAutomationDb } from "../db";
import { siteAccounts, automationTasks } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { executeAutomationTask } from "../_core/automationService";

const router = Router();

// 从请求中获取用户信息
async function getUserFromRequest(req: Request) {
  // 优先从Authorization头获取token（支持token模式）
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      const user = await sdk.authenticateRequest({ headers: { authorization: authHeader } } as any);
      if (user) return user;
    } catch (error) {
      console.error("[Chat Stream] Token authentication failed:", error);
    }
  }

  // 从cookie获取token（支持cookie模式）
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (cookieToken) {
    try {
      const user = await sdk.authenticateRequest({ headers: { cookie: `${COOKIE_NAME}=${cookieToken}` } } as any);
      if (user) return user;
    } catch (error) {
      console.error("[Chat Stream] Cookie authentication failed:", error);
    }
  }

  return null;
}

// POST /api/chat/stream - 流式AI对话
router.post("/stream", async (req: Request, res: Response) => {
  try {
    // 认证用户
    const user = await getUserFromRequest(req);
    if (!user) {
      return res.status(401).json({ error: "未登录" });
    }

    let { modelId, messages, conversationId, packageId, hasVisionContent } = req.body;

    // 允许modelId为0（套餐模式下的占位符），但必须提供packageId
    if (modelId == null || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "参数错误" });
    }
    
    // 如果modelId为0，必须提供packageId
    if (modelId === 0 && !packageId) {
      return res.status(400).json({ error: "请选择AI模型或模型套餐" });
    }

    // 检测用户是否想要生成图片
    const lastMessageContent = messages[messages.length - 1]?.content || "";
    // 处理多媒体消息：如果是数组，提取所有text内容
    const lastUserMessage = typeof lastMessageContent === "string" 
      ? lastMessageContent 
      : Array.isArray(lastMessageContent)
        ? lastMessageContent
            .filter((item: any) => item.type === "text")
            .map((item: any) => item.text)
            .join(" ")
        : "";
    
    // 使用正则表达式进行更灵活的匹配（包含常见错别字纠正）
    const imageGenerationPatterns = [
      // 常见错别字纠正：花->画, 身成->生成, 涂->图
      /(花|画|帮我花|帮我画|给我花|给我画).{0,100}(图|图片|涂|涂片)/i,
      /(身成|生成|帮我身成|帮我生成).{0,100}(图|图片|涂|涂片)/i,
      // 中文模式：基础动词表达
      /(生成|帮我生成|给我生成).{0,100}(图|图片|图像)/i,
      /(画|帮我画|给我画).{0,100}(图|图片|画)/i,
      /(创建|做|设计).{0,100}(图|图片|图像)/i,
      /(绘制|绘画|作画|画出)/i,
      
      // 口语化表达："来一张"、"要一个"、"弄一个"、"整一个"
      /(来|要|弄|整|帮我弄|帮我整).{0,20}(图|图片|图像)/i,
      /(来|要|弄|整)一张/i,
      /(来|要|弄|整)一个/i,
      
      // 委婉表达："能不能"、"可以吗"、"麻烦"、"请"
      /(能不能|可以吗|可不可以|麻烦|请).{0,50}(图|图片|图像)/i,
      /(能不能|可以吗|可不可以|麻烦|请).{0,20}(生成|画|创建|绘制)/i,
      
      // 特殊模式：匹配"生成一张"、"画一张"等
      /(生成|画|创建|绘制)一张/i,
      /(生成|画|创建|绘制)一个/i,
      
      // 配图相关："配上一张"、"配图"、"配上图片"
      /(配上|配个|加上|添加).{0,20}(图|图片|图像)/i,
      /配图/i,
      /配一张/i,
      
      // 风格相关："XX风格的图"、"XX风格图片"
      /\S+风格.{0,20}(图|图片|图像)/i,
      
      // 简化表达：单独的"图"（需要前面有描述词）
      /.{2,}(图)$/i,
      
      // 英文模式
      /(generate|create|make).{0,100}(image|picture|drawing)/i,
      /(draw|paint|illustrate|design)/i,
      /(add|attach).{0,20}(image|picture)/i,
      /(give me|show me|get me).{0,50}(image|picture|photo)/i,
      /(can you|could you|please).{0,50}(generate|create|make|draw).{0,50}(image|picture)/i,
      /\S+\s+style.{0,20}(image|picture|photo)/i,
      
      // 纯名词短语模式：匹配以"图片"结尾的描述（如"美女图片"、"风景图片"）
      // 只匹配单独的名词短语，不包含问句标志
      /^(?!.*[\uff1f?]).{1,50}(图片|图像)$/i,
      // 匹配英文纯名词短语（如"beautiful woman image", "landscape picture"）
      /^(?!.*(what|how|why|when|where|who|\?)).{1,100}\s+(image|picture|photo|drawing)$/i,
    ];
    
    let isImageRequest = imageGenerationPatterns.some(pattern => 
      pattern.test(lastUserMessage)
    );
    
    // 检查对话历史中是否有图片生成记录，用于上下文关联
    const hasImageHistory = messages.some((msg: any) => {
      if (msg.role === 'assistant' && typeof msg.content === 'string') {
        return msg.content.includes('![AI_IMG]') || msg.content.includes('图片描述：');
      }
      return false;
    });
    
    // 上下文关联：如果历史中有图片生成，模糊指令也应触发
    if (!isImageRequest && hasImageHistory) {
      const contextualPatterns = [
        /换个(风格|颜色|样式)/i,
        /(再来|再试|再画|再生成)/i,
        /(改|调整|修改)(一下|一些)?/i,
        /(更|再)(亮|暗|大|小|鲜艳|柔和)/i,
        /不(满意|喜欢|好看)/i,
        /(加上|去掉|添加|删除).{0,20}/i,
        /(改成|变成|换成).{0,20}/i,
      ];
      isImageRequest = contextualPatterns.some(pattern => pattern.test(lastUserMessage));
      if (isImageRequest) {
        console.log('[Chat Stream] Contextual image request detected from conversation history');
      }
    }

    // 检测是否是视频生成请求
    const videoGenerationPatterns = [
      // 中文模式
      /(生成|帮我生成|给我生成).{0,20}(视频|动画)/i,
      /(创建|做|制作).{0,20}(视频|动画)/i,
      /生成一段视频/i,
      /生成一个视频/i,
      // 英文模式
      /(generate|create|make).{0,20}(video|animation)/i,
    ];
    
    // 禁用后端自动视频检测,改为由前端确认流程控制
    let isVideoRequest = false;
    // let isVideoRequest = videoGenerationPatterns.some(pattern => 
    //   pattern.test(lastUserMessage)
    // );


    // 检测是否是自动化任务请求（论坛发帖、网站运营等，包含常见错别字）
    const automationPatterns = [
      // 中文模式：发帖相关（含错别字：发贴->发帖, 论谈->论坛）
      /(帮我|帮忙|请).{0,20}(发帖|发贴|发个帖|发一个帖|发布帖子|发布内容)/i,
      /(帮我|帮忙|请).{0,20}(运营|管理|运行).{0,20}(论坛|论谈|网站|社区|板块)/i,
      /(帮我|帮忙|请).{0,30}(回帖|回贴|回复帖子|评论)/i,
      /(自动|批量).{0,20}(发帖|发贴|回帖|回贴|发布|评论)/i,
      /(论坛|论谈|网站|社区).{0,20}(发帖|发贴|运营|回复|互动)/i,
      /(登录|登陆|登入).{0,20}(论坛|论谈|网站|社区).{0,20}(发帖|发贴|回复|运营)/i,
      /发帖运营|发贴运营/i,
      /论坛运营|论谈运营/i,
      /网站运营/i,
      // 包含账号密码信息的发帖请求
      /(账号|帐号|用户名|账户).{0,30}(密码|密吗|pwd).{0,80}(发帖|发贴|运营|回复|发布)/i,
      /(发帖|发贴|运营|回复|发布).{0,80}(账号|帐号|用户名|账户).{0,30}(密码|密吗|pwd)/i,
      // 模糊表达："帮我去那个论坛发点东西"
      /(帮我|帮忙).{0,30}(去|到|上).{0,20}(论坛|网站|社区).{0,20}(发|写|弄)/i,
      // 英文模式
      /(help me|please).{0,30}(post|publish|reply).{0,30}(forum|website|community)/i,
      /(auto|automate).{0,20}(post|reply|publish)/i,
    ];
    const isAutomationRequest = automationPatterns.some(pattern =>
      pattern.test(lastUserMessage)
    );

    // 定时任务意图检测
    const scheduledTaskPatterns = [
      /定时(任务|执行|触发|调用|运行)/i,
      /定期(执行|触发|调用|运行|访问|请求)/i,
      /每(天|小时|分钟|周|月|日).*(执行|触发|调用|运行|请求|访问|同步|备份|检查)/i,
      /cron.*(任务|表达式|定时)/i,
      /(设置|创建|添加|配置).*(定时|定期|周期|计划).*(任务|执行)/i,
      /webhook.*(定时|回调|触发)/i,
      /(自动|定时).*(同步|备份|检查|监控|推送|通知|抓取|爬取)/i,
      /(每隔|间隔).*(分钟|小时|秒).*(执行|调用|请求)/i,
      /计划任务/i,
      /定时(调|打|发|推).*(接口|API|链接|URL|网址)/i,
    ];
    const isScheduledTask = scheduledTaskPatterns.some(p => p.test(lastUserMessage));


    // 检测是否包含图片消息
    const hasImageContent = messages.some((msg: any) => {
      if (Array.isArray(msg.content)) {
        return msg.content.some((item: any) => item.type === 'image_url');
      }
      return false;
    });
    
    // 检测是否包含文件消息
    const hasFileContent = messages.some((msg: any) => {
      if (Array.isArray(msg.content)) {
        return msg.content.some((item: any) => item.type === 'file_url');
      }
      return false;
    });
    
    // 检测是否是作业批改请求（包含常见错别字和模糊表达）
    const homeworkCorrectionPatterns = [
      /(批改|检查|看看|帮我看|帮看|帮忙看).{0,10}(作业|题目|答案|试卷|卷子|习题)/i,
      /作业.{0,10}(批改|检查|对不对|正确吗|错没错|有没有错)/i,
      /(这道题|这些题|这个题|这题).{0,10}(对不对|正确吗|有问题吗|错没错|对吗|错了吗)/i,
      /(correct|check|grade).{0,10}(homework|assignment|answer)/i,
      // 模糊表达：用户可能直接说"看看对不对"、"帮我改改"
      /(帮我|帮忙)?(改改|改一下|批一下|批一批|看一下|看一看)/i,
      /(对不对|错没错|正确吗|有错吗|做的对吗|做对了吗)/i,
      // 口语化："这个咋样"、"做的行不行"
      /(做的|写的).{0,5}(咋样|怎么样|行不行|可以吗|OK吗)/i,
    ];
    
    const isHomeworkCorrection = homeworkCorrectionPatterns.some(pattern => 
      pattern.test(lastUserMessage)
    ) && hasImageContent; // 只有当有图片时才认为是作业批改
    
    // 如果用户上传了图片但没有明确的文字意图，使用视觉模型分析意图
    let imageIntentAnalysis = null;
    if (hasImageContent && !isImageRequest && !isVideoRequest && !isHomeworkCorrection) {
      // 提取第一张图片的URL
      const lastMessage = messages[messages.length - 1];
      if (Array.isArray(lastMessage.content)) {
        const imageContent = lastMessage.content.find((item: any) => item.type === 'image_url');
        if (imageContent && imageContent.image_url?.url) {
          imageIntentAnalysis = await analyzeImageIntent(imageContent.image_url.url, lastUserMessage);
          console.log('[Chat Stream] Image intent analysis:', imageIntentAnalysis);
          
          // 根据分析结果调整意图检测
          if (imageIntentAnalysis.confidence > 0.7) {
            // 高置信度：直接触发相应功能
            if (imageIntentAnalysis.intent === 'image_generation') {
              isImageRequest = true;
            } else if (imageIntentAnalysis.intent === 'video_generation') {
              // 禁用后端自动视频检测
              // isVideoRequest = true;
            } else if (imageIntentAnalysis.intent === 'document_processing') {
              // 可以在这里添加文档处理逻辑
            }
          } else if (imageIntentAnalysis.confidence >= 0.5 && imageIntentAnalysis.confidence <= 0.7) {
            // 中等置信度：返回确认消息，让用户选择
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            // 返回确认消息
            const confirmationData = {
              type: 'intent_confirmation',
              intent: imageIntentAnalysis.intent,
              confidence: imageIntentAnalysis.confidence,
              reasoning: imageIntentAnalysis.reasoning,
              imageUrl: imageContent.image_url.url,
            };
            res.write(`data: ${JSON.stringify(confirmationData)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
        }
      }
    }
    
    console.log('[Chat Stream] Request detection:', { 
      lastUserMessage: lastUserMessage.substring(0, 100),
      isImageRequest,
      isVideoRequest,
      isAutomationRequest,
      isHomeworkCorrection,
      hasImageContent,
      hasFileContent,
      imageIntentAnalysis
    });

    // 如果提供了packageId，优先从套餐中获取主模型ID（忽略传入的modelId）
    if (packageId) {
      const modelPackage = await db.getModelPackageById(packageId);
      if (!modelPackage) {
        return res.status(400).json({ error: "套餐不存在" });
      }
      modelId = modelPackage.primaryModelId;
      console.log('[Chat Stream] Using primary model from package:', { packageId, modelId, packageName: modelPackage.displayName });
    } else if (modelId === 0) {
      // 如果没有提供packageId且modelId为0，返回错误
      return res.status(400).json({ error: "请选择AI模型或模型套餐" });
    }

    // 如果提供了packageId和hasVisionContent，则尝试使用套餐中的备用模型
    let selectedModelId = modelId;
    let usedFallback = false;
    let fallbackReason = "";

    if (packageId && hasVisionContent) {
      // 获取套餐信息
      const modelPackage = await db.getModelPackageById(packageId);
      if (modelPackage) {
        // 检查主模型是否支持视觉
        const primaryModel = await db.getAiModelById(modelPackage.primaryModelId);
        if (primaryModel && !primaryModel.supportsVision) {
          // 主模型不支持视觉，尝试使用备用模型
          const fallbackModels = await db.getModelPackageFallbackModels(packageId);
          const visionSupportedFallback = fallbackModels.find(fm => fm.supportsVision);
          
          if (visionSupportedFallback) {
            selectedModelId = visionSupportedFallback.id;
            usedFallback = true;
            fallbackReason = `主模型不支持图片分析，已自动切换到备用模型：${visionSupportedFallback.displayName}`;
            console.log('[Chat Stream] Using fallback model for vision:', visionSupportedFallback.name);
          } else {
            // 所有备用模型都不支持视觉，通知管理员
            fallbackReason = `套餐中没有支持图片分析的模型，已通知管理员添加支持视觉的备用模型`;
            console.error('[Chat Stream] No vision-supported fallback model available for package:', packageId);
            
            // 通知管理员
            try {
              const { notifyOwner } = await import("../_core/notification");
              await notifyOwner({
                title: "套餐缺少视觉支持模型",
                content: `套餐 "${modelPackage.displayName}" (ID: ${packageId}) 中没有支持图片分析的模型。请添加支持视觉的备用模型。`,
              });
            } catch (notifyError) {
              console.error('[Chat Stream] Failed to notify owner:', notifyError);
            }
          }
        }
      }
    }

    // 获取模型信息
    const model = await db.getAiModelById(selectedModelId);
    console.log('[Chat Stream] Model info:', { 
      id: model?.id, 
      name: model?.name, 
      displayName: model?.displayName,
      apiEndpoint: model?.apiEndpoint,
      hasApiKey: !!model?.apiKey,
      apiKeyPrefix: model?.apiKey?.substring(0, 10)
    });
    if (!model || !model.enabled) {
      return res.status(404).json({ error: "模型不可用" });
    }

    if (model.type !== "chat") {
      return res.status(400).json({ error: "该模型不支持对话功能" });
    }

    // 检查用户配额
    const quotaCheck = await db.checkQuota(user.id, "chat");
    if (!quotaCheck.allowed) {
      return res.status(400).json({
        error: `今日对话配额已用完（${quotaCheck.limit}/${quotaCheck.limit}），请明天再试或升级为VIP`,
      });
    }

    // 检查用户余额
    const dbUser = await db.getUserById(user.id);
    if (!dbUser) {
      return res.status(401).json({ error: "用户不存在" });
    }

    const balance = parseFloat(dbUser.fishCoinBalance);
    
    // 如果是图片生成请求，从数据库获取配置的费用
    const isImageGeneration = isImageRequest;
    let originalCost = parseFloat(model.costPerUse);
    
    if (isImageGeneration) {
      const imagePricingConfig = await db.getImageGenerationPricing();
      if (imagePricingConfig && imagePricingConfig.enabled) {
        originalCost = parseFloat(imagePricingConfig.pricePerImage);
      } else {
        // 如果配置不存在或未启用，返回错误
        return res.status(400).json({ error: "图片生成功能当前不可用" });
      }
    }

    // 计算等级折扣后的实际费用
    const { finalCost, discount, discountPercent } = await db.calculateDiscountedCost(
      user.id,
      originalCost,
      isImageGeneration ? "image" : "chat"
    );

    if (balance < finalCost) {
      return res.status(400).json({ error: "🐟币余额不足" });
    }

    // 先保存用户消息（在API调用前，确保即使失败也能保存）
    if (conversationId) {
      await db.updateChatConversation(conversationId, {
        messages: JSON.stringify(messages),
      });
    } else {
      // 如果是新对话，创建对话并保存用户消息
      const newConversation = await db.createChatConversation({
        userId: user.id,
        modelId: model.id,
        packageId: packageId || null,
        messages: JSON.stringify(messages),
      });
      // 更新conversationId以便后续使用
      conversationId = newConversation.insertId;
    }

    // 设置SSE响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // 禁用Nginx缓冲

    // 辅助函数：发送思考步骤
    const sendThinkingStep = (step: string, details?: string) => {
      res.write(
        `data: ${JSON.stringify({
          type: "thinking",
          step,
          details,
          timestamp: Date.now(),
        })}\n\n`
      );
    };

    // 发送实时操作状态
    const sendOperationStatus = (action: string, target?: string, status: 'running' | 'completed' = 'running') => {
      res.write(
        `data: ${JSON.stringify({
          type: "operation",
          action,
          target,
          status,
          timestamp: Date.now(),
        })}\n\n`
      );
    };

    // 发送初始事件（包含费用信息）
    res.write(
      `data: ${JSON.stringify({
        type: "start",
        cost: finalCost.toFixed(2),
        originalCost: originalCost.toFixed(2),
        discount: discount.toFixed(2),
        discountPercent,
      })}\n\n`
    );

    // 如果使用了备用模型，发送fallback事件
    if (usedFallback || fallbackReason) {
      res.write(
        `data: ${JSON.stringify({
          type: "fallback",
          usedFallback,
          fallbackReason,
        })}\n\n`
      );
    }

    let fullMessage = "";
    let imageGenerationFailed = false;
    let _automationTaskId: number | undefined = undefined;
    let _automationTaskName: string = '自动化任务';
    let _automationSiteName: string = '目标网站';

    try {
      // 如果是图片生成请求，则调用图片生成API
      if (isImageRequest) {
        console.log('[Chat Stream] Detected image generation request');
        sendThinkingStep('分析图片生成需求', '正在解析您的消息，提取图片生成的关键信息和风格要求。我会理解您想要的画面内容、艺术风格、色彩搭配等细节。');
        
        try {
          // 使用AI提取图片描述（使用用户选择的模型）
          // 将流式API端点转换为非流式（streamGenerateContent -> generateContent）
          const nonStreamEndpoint = model.apiEndpoint?.replace(':streamGenerateContent', ':generateContent') || model.apiEndpoint;
          const extractPromptResponse = await invokeLLM({
            model: (model as any).apiModel || (model as any).modelIdentifier || model.name,
            apiEndpoint: nonStreamEndpoint,
            apiKey: model.apiKey,
            max_tokens: 1024,
            messages: [
              {
                role: "system",
                content: `You are an image prompt extraction assistant. Extract the image description from the user's message and optimize it into a detailed English prompt for image generation.

IMPORTANT RULES:
1. Return ONLY the English prompt text, nothing else
2. DO NOT return JSON format like {"action": "dalle.text2im", ...}
3. DO NOT include any explanations, thoughts, or metadata
4. Just return the pure text prompt directly
5. If the user's message is already a good prompt, enhance it with more details
6. If the user's message is vague, create a detailed prompt based on their intent

Example:
User: "生成一张动漫美女"
You should return: "A stunningly beautiful anime girl, masterpiece, high quality, highly detailed, solo, long flowing black hair with a blue tint, sparkling blue eyes, wearing a delicate floral sundress, standing in a field of blooming sunflowers under a clear blue sky with fluffy white clouds, soft sunlight, cinematic lighting, vibrant colors, elegant and peaceful atmosphere, Makoto Shinkai style."

DO NOT return: {"action": "dalle.text2im", "action_input": {...}}`
              },
              {
                role: "user",
                content: lastUserMessage
              }
            ],
          });

          let imagePrompt = typeof extractPromptResponse.choices[0].message.content === 'string' 
            ? extractPromptResponse.choices[0].message.content.trim()
            : JSON.stringify(extractPromptResponse.choices[0].message.content);
          
          console.log('[Chat Stream] Raw LLM response:', imagePrompt);
          
          // 如果AI还是返回了JSON格式（尽管我们要求不要），尝试解析并提取prompt字段
          if (imagePrompt.trim().startsWith('{') || imagePrompt.trim().startsWith('[')) {
            console.warn('[Chat Stream] LLM returned JSON despite instructions, attempting to extract prompt...');
            try {
              const parsed = JSON.parse(imagePrompt);
              
              // 处理各种JSON结构
              if (parsed.action_input) {
                // Case 1: action_input 是字符串，需要再次解析
                if (typeof parsed.action_input === 'string') {
                  try {
                    const actionInput = JSON.parse(parsed.action_input);
                    if (actionInput.prompt) {
                      imagePrompt = actionInput.prompt;
                      console.log('[Chat Stream] Extracted prompt from action_input (string):', imagePrompt);
                    }
                  } catch (nestedError) {
                    console.warn('[Chat Stream] Failed to parse action_input string:', nestedError);
                    // 如果解析失败，直接使用action_input作为prompt
                    imagePrompt = parsed.action_input;
                  }
                }
                // Case 2: action_input 是对象，直接提取prompt字段
                else if (typeof parsed.action_input === 'object' && parsed.action_input.prompt) {
                  imagePrompt = parsed.action_input.prompt;
                  console.log('[Chat Stream] Extracted prompt from action_input (object):', imagePrompt);
                }
              }
              // Case 3: 直接的prompt字段
              else if (parsed.prompt) {
                imagePrompt = parsed.prompt;
                console.log('[Chat Stream] Extracted prompt from top-level:', imagePrompt);
              }
              // Case 4: 如果还是没有提取到prompt，就使用用户的原始消息
              else {
                console.warn('[Chat Stream] Could not extract prompt from JSON, using original user message');
                imagePrompt = lastUserMessage;
              }
            } catch (e) {
              // JSON解析失败，可能是不完整的JSON，使用用户原始消息
              console.error('[Chat Stream] Failed to parse JSON response:', e);
              console.log('[Chat Stream] Using original user message as fallback');
              imagePrompt = lastUserMessage;
            }
          }
          
          console.log('[Chat Stream] Final extracted image prompt:', imagePrompt);
          sendThinkingStep('优化图片描述', `正在将您的需求转化为专业的图片生成提示词。我会添加详细的视觉描述、灯光效果、构图方式等专业元素，以提高生成质量。\n\n优化后的提示词：${imagePrompt.substring(0, 100)}${imagePrompt.length > 100 ? '...' : ''}`);

          // 不发送文字提示，直接生成图片
          sendThinkingStep('调用AI图片生成引擎', '正在连接AI图片生成服务，使用先进的扩散模型根据提示词生成高质量图片。这个过程可能需要几秒钟，请耐心等待...');
              // 调用图片生成API
          const imageResult = await generateImage({ prompt: imagePrompt });
          
          // 先发送低分辨率占位图
          if (imageResult.placeholderUrl) {
            res.write(`data: ${JSON.stringify({ 
              type: "image_placeholder", 
              placeholderUrl: imageResult.placeholderUrl,
              prompt: imagePrompt 
            })}

`);
            console.log('[Chat Stream] Placeholder image sent:', imageResult.placeholderUrl);
          }
          
          // 再发送高清图片URL
          fullMessage = `![Generated Image](${imageResult.url})`;
          res.write(`data: ${JSON.stringify({ 
            type: "image", 
            imageUrl: imageResult.url,
            placeholderUrl: imageResult.placeholderUrl,
            prompt: imagePrompt 
          })}

`);
          
          console.log('[Chat Stream] High-resolution image sent:', imageResult.url);
        } catch (imageError) {
          console.error('[Chat Stream] Image generation error:', imageError);
          
          // 分析错误类型，提供更详细的错误信息
          const errorMessage = imageError instanceof Error ? imageError.message : '图片生成失败';
          let userFriendlyError = '图片生成服务暂时不可用，请稍后重试。';
          let errorDetails = '';
          
          // 检查是否是nano banana服务错误
          if (errorMessage.includes('nano_banana') || errorMessage.includes('GENERATE_ERROR')) {
            userFriendlyError = '图片生成服务暂时不可用（服务商错误）';
            errorDetails = '可能原因：1) 服务配额已用完 2) 服务暂时维护中 3) 模型暂时不可用。请稍后重试或联系管理员。';
          } else if (errorMessage.includes('500')) {
            userFriendlyError = '图片生成服务器错误';
            errorDetails = '服务器遇到内部错误，请稍后重试。';
          } else if (errorMessage.includes('timeout')) {
            userFriendlyError = '图片生成超时';
            errorDetails = '生成时间过长，请尝试简化描述或稍后重试。';
          }
          
          // 发送错误事件，包含详细信息
          res.write(`data: ${JSON.stringify({ 
            type: "error", 
            error: `${userFriendlyError}\n\n${errorDetails}`,
            canRetry: true
          })}\n\n`);
          
          // 不再回退到普通对话，直接结束
          fullMessage = "";
          imageGenerationFailed = true;
        }
      } else if (isVideoRequest) {
        console.log('[Chat Stream] Detected video generation request');
        
        try {
          // 直接使用用户消息作为视频描述,跳过LLM提取步骤
          const videoPrompt = lastUserMessage;
          console.log('[Chat Stream] Using user message as video prompt:', videoPrompt);

          // 调用视频生成API（创建任务）
          const { generateVideo } = await import("../_core/videoGeneration");
          const videoResult = await generateVideo({ 
            prompt: videoPrompt,
            duration: 5,
            provider: "pollo" // 默认使用模拟模式
          });
          
          // 发送视频任务事件
          res.write(`data: ${JSON.stringify({ 
            type: "video_task", 
            taskId: videoResult.taskId,
            prompt: videoPrompt,
            status: "pending"
          })}\n\n`);
          
          // 设置消息内容供数据库保存
          fullMessage = `🎥 视频生成任务已创建\n\n**任务ID:** ${videoResult.taskId}\n**视频描述:** ${videoPrompt}\n\n您可以在"视频历史"页面查看任务进度和生成结果。`;
          
          console.log('[Chat Stream] Video task created:', videoResult.taskId);
        } catch (videoError) {
          console.error('[Chat Stream] Video generation error:', videoError);
          // 视频生成失败，回退到普通对话
          const errorMessage = videoError instanceof Error ? videoError.message : '视频生成失败';
          fullMessage = `抱歉，视频生成失败：${errorMessage}\n\n让我以文字形式回复您的问题。`;
          res.write(`data: ${JSON.stringify({ type: "content", content: fullMessage })}\n\n`);
        }
      } else 
    // ===== 定时任务处理 =====
    if (isScheduledTask) {
      sendThinkingStep(res, "识别定时任务需求", "检测到您希望创建定时任务，正在解析任务信息...");

      // 使用 LLM 解析定时任务参数
      const parsePrompt = `用户想创建一个定时任务。请从用户消息中提取以下信息，返回JSON格式：
{
  "name": "任务名称（简短描述）",
  "description": "任务描述",
  "taskType": "webhook 或 automation",
  "cronExpression": "6位cron表达式（秒 分 时 日 月 周）",
  "webhookUrl": "如果提到了URL则填入，否则null",
  "webhookMethod": "GET或POST，默认POST",
  "webhookBody": "请求体JSON字符串，如果有的话",
  "cronHuman": "用中文描述执行频率"
}

常用cron示例：
- 每分钟: 0 * * * * *
- 每5分钟: 0 */5 * * * *
- 每小时: 0 0 * * * *
- 每天8点: 0 0 8 * * *
- 每天12点: 0 0 12 * * *
- 工作日9点: 0 0 9 * * 1-5
- 每周一9点: 0 0 9 * * 1
- 每月1日: 0 0 0 1 * *

用户消息: ${lastUserMessage}

只返回JSON，不要其他内容。`;

      try {
        const { invokeLLM } = await import("../_core/llm");
        const parseResult = await invokeLLM({
          model: modelId || "qwen-plus",
          messages: [{ role: "user", content: parsePrompt }],
          temperature: 0.1,
        });

        let taskInfo: any = {};
        try {
          const jsonMatch = parseResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) taskInfo = JSON.parse(jsonMatch[0]);
        } catch {}

        sendThinkingStep(res, "创建定时任务", "正在创建定时任务并启动调度...");

        // 创建定时任务
        const db = await getDb();
        if (db) {
          const { scheduledTasks } = await import("../../drizzle/schema");
          const cronExpr = taskInfo.cronExpression || "0 0 * * * *";
          
          const [result] = await db.insert(scheduledTasks).values({
            userId: userId,
            name: taskInfo.name || "定时任务",
            description: taskInfo.description || lastUserMessage,
            taskType: taskInfo.taskType || "webhook",
            cronExpression: cronExpr,
            webhookUrl: taskInfo.webhookUrl || null,
            webhookMethod: taskInfo.webhookMethod || "POST",
            webhookBody: taskInfo.webhookBody || null,
            status: "active",
            source: "chat",
            sourceConversationId: conversationId || null,
          }) as any;

          const taskId = result.insertId;

          // 触发调度引擎
          try {
            const { initScheduledTasks } = await import("./scheduledTaskRouter");
            await initScheduledTasks();
          } catch {}

          // 发送SSE事件
          const sseData = {
            type: "scheduled_task",
            taskId: taskId,
            name: taskInfo.name || "定时任务",
            cronExpression: cronExpr,
            cronHuman: taskInfo.cronHuman || cronExpr,
            taskType: taskInfo.taskType || "webhook",
            webhookUrl: taskInfo.webhookUrl || null,
          };
          res.write(`data: ${JSON.stringify(sseData)}\n\n`);

          // 发送文本回复
          const replyText = `**定时任务已创建并启动调度！**\n\n` +
            `- 任务名称：${taskInfo.name || "定时任务"}\n` +
            `- 执行频率：${taskInfo.cronHuman || cronExpr}\n` +
            `- 任务类型：${taskInfo.taskType === "webhook" ? "Webhook回调" : "自动化沙箱"}\n` +
            (taskInfo.webhookUrl ? `- 目标URL：${taskInfo.webhookUrl}\n` : "") +
            `- 任务ID：#${taskId}\n\n` +
            `您可以在 [定时任务管理](/scheduled-tasks) 页面查看和修改此任务。`;

          res.write(`data: ${JSON.stringify({ type: "content", content: replyText })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
          res.end();
          return;
        }
      } catch (err: any) {
        console.error("[ChatStream] Scheduled task creation failed:", err);
      }
    }


    if (isAutomationRequest) {
        console.log('[Chat Stream] Detected automation task request');
        sendThinkingStep('识别自动化任务', '检测到您希望进行网站自动化操作（发帖/运营），正在解析任务信息...');

        try {
          // Use LLM to extract task parameters from user message
          const nonStreamEndpoint2 = model.apiEndpoint?.replace(':streamGenerateContent', ':generateContent') || model.apiEndpoint;
          const extractResponse2 = await invokeLLM({
            model: (model as any).apiModel || (model as any).modelIdentifier || model.name,
            apiEndpoint: nonStreamEndpoint2,
            apiKey: model.apiKey,
            max_tokens: 1024,
            messages: [
              {
                role: "system",
                content: `你是一个自动化任务参数提取助手。从用户消息中提取以下信息并返回JSON格式：
{
  "siteName": "网站名称",
  "siteUrl": "网站首页URL（如 https://example.com）",
  "loginUrl": "登录页URL（如果能推断出来）",
  "username": "用户名/账号",
  "password": "密码",
  "taskType": "browse_and_post 或 search_and_reply 或 custom",
  "taskName": "任务名称（简短描述）",
  "instruction": "详细的任务指令",
  "targetUrls": ["目标URL列表，如果有的话"],
  "contentStyle": "内容风格要求，如果有的话"
}
注意：
1. 只返回JSON，不要有其他文字
2. 如果某些字段无法从消息中提取，设为null
3. loginUrl如果不确定，可以设为 siteUrl + "/login" 或 siteUrl + "/member.php?mod=logging&action=login"
4. instruction应该包含用户想要执行的具体操作描述`
              },
              { role: "user", content: lastUserMessage }
            ],
          });

          let taskParams: any = {};
          const rawResponse2 = extractResponse2.choices[0].message.content;
          const responseText2 = typeof rawResponse2 === 'string' ? rawResponse2 : JSON.stringify(rawResponse2);
          
          // Extract JSON from response (handle markdown code blocks)
          const jsonMatch2 = responseText2.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, responseText2];
          try {
            taskParams = JSON.parse(jsonMatch2[1]!.trim());
          } catch (e) {
            console.error('[Chat Stream] Failed to parse automation params:', e);
            taskParams = {
              siteName: "未知网站",
              siteUrl: lastUserMessage.match(/https?:\/\/[^\s]+/)?.[0] || "",
              username: "",
              password: "",
              taskType: "custom",
              taskName: "自动化任务",
              instruction: lastUserMessage,
            };
          }

          console.log('[Chat Stream] Extracted automation params:', taskParams);
          sendThinkingStep('创建自动化任务', `正在为 ${taskParams.siteName || '目标网站'} 创建自动化任务...`);

          // Create site account and task in database
          const automationDb = await getAutomationDb();
          
          // Check if site account already exists
          let accountId: number;
          const existingAccounts = await automationDb.select()
            .from(siteAccounts)
            .where(and(
              eq(siteAccounts.userId, user.id),
              eq(siteAccounts.siteUrl, taskParams.siteUrl || "")
            ));

          if (existingAccounts.length > 0) {
            accountId = existingAccounts[0].id;
            // Update credentials if provided
            if (taskParams.username && taskParams.password) {
              await automationDb.update(siteAccounts)
                .set({
                  username: taskParams.username,
                  password: taskParams.password,
                  loginUrl: taskParams.loginUrl || existingAccounts[0].loginUrl,
                })
                .where(eq(siteAccounts.id, accountId));
            }
          } else {
            // Create new site account
            const insertResult = await automationDb.insert(siteAccounts).values({
              userId: user.id,
              siteName: taskParams.siteName || "未知网站",
              siteUrl: taskParams.siteUrl || "",
              loginUrl: taskParams.loginUrl || (taskParams.siteUrl ? taskParams.siteUrl + "/login" : ""),
              username: taskParams.username || "",
              password: taskParams.password || "",
              status: "active",
            });
            accountId = (insertResult as any)[0]?.insertId;
          }

          // Create automation task
          const taskInsertResult = await automationDb.insert(automationTasks).values({
            userId: user.id,
            siteAccountId: accountId,
            taskType: taskParams.taskType || "custom",
            name: taskParams.taskName || "对话创建的自动化任务",
            instruction: taskParams.instruction || lastUserMessage,
            targetUrls: taskParams.targetUrls ? JSON.stringify(taskParams.targetUrls) : null,
            contentStyle: taskParams.contentStyle || null,
            modelUsed: "qwen-plus",
          });
          const automationTaskId = (taskInsertResult as any)[0]?.insertId;
          _automationTaskId = automationTaskId;
          _automationTaskName = taskParams.taskName || '自动化任务';
          _automationSiteName = taskParams.siteName || '目标网站';

          console.log('[Chat Stream] Created automation task:', { accountId, automationTaskId });
          sendThinkingStep('启动自动化执行', `任务 #${automationTaskId} 已创建，正在启动浏览器自动化沙箱...`);

          // Start the task execution in background
          executeAutomationTask(automationTaskId).catch((err: any) => {
            console.error(`[Chat Stream] Automation task ${automationTaskId} error:`, err.message);
          });

          // Send automation_task event to frontend
          res.write(`data: ${JSON.stringify({
            type: "automation_task",
            taskId: automationTaskId,
            taskName: taskParams.taskName || "自动化任务",
            siteName: taskParams.siteName || "目标网站",
            status: "running"
          })}\n\n`);

          fullMessage = `🤖 **自动化任务已创建并启动！**\n\n` +
            `**任务名称：** ${taskParams.taskName || '自动化任务'}\n` +
            `**目标网站：** ${taskParams.siteName || taskParams.siteUrl}\n` +
            `**任务类型：** ${taskParams.taskType === 'browse_and_post' ? '浏览并发帖' : taskParams.taskType === 'search_and_reply' ? '搜索并回复' : '自定义任务'}\n` +
            `**任务ID：** #${automationTaskId}`;

          // Send the message content
          res.write(`data: ${JSON.stringify({ type: "content", content: fullMessage })}\n\n`);

        } catch (automationError: any) {
          console.error('[Chat Stream] Automation task creation error:', automationError);
          const errorMsg = automationError instanceof Error ? automationError.message : '创建自动化任务失败';
          fullMessage = `抱歉，创建自动化任务失败：${errorMsg}\n\n您可以前往 [自动化沙箱](/automation) 页面手动创建任务。`;
          res.write(`data: ${JSON.stringify({ type: "content", content: fullMessage })}\n\n`);
        }

      } else {
      sendThinkingStep('分析用户问题', '正在理解您的问题，分析上下文和意图。我会考虑对话历史、相关知识和您的具体需求，以提供最准确和有帮助的回答。');
      // 流式调用LLM，传递模型的API配置
      // 检查模型是否支持视觉识别
      const supportsVision = model.supportsVision || false;
      console.log('[Chat Stream] Vision support:', { supportsVision, hasImageContent });
      
      let processedMessages;
      
      // 处理文件解析（如果有文件消息）
      if (hasFileContent) {
        console.log('[Chat Stream] Parsing file content...');
        sendOperationStatus('正在读取文件', undefined, 'running');
        const { parseFile, isSupportedFileType } = await import('../_core/fileParser');
        
        // 解析所有文件并将内容添加到消息中
        processedMessages = await Promise.all(messages.map(async (msg: any) => {
          if (!Array.isArray(msg.content)) {
            return msg;
          }
          
          const newContent = [];
          for (const item of msg.content) {
            if (item.type === 'file_url' && item.file_url) {
              const { url, mime_type } = item.file_url;
              
              if (mime_type && isSupportedFileType(mime_type)) {
                try {
                  const parseResult = await parseFile(url, mime_type);
                  // 将文件内容作为文本添加
                  newContent.push({
                    type: 'text',
                    text: `\n=== 文件内容 (${mime_type}) ===\n${parseResult.text}\n=== 文件结束 ===\n`
                  });
                  console.log('[Chat Stream] File parsed successfully:', { url, mime_type, textLength: parseResult.text.length });
                  sendOperationStatus('文件读取完成', url.split('/').pop(), 'completed');
                } catch (error) {
                  console.error('[Chat Stream] File parsing error:', error);
                  newContent.push({
                    type: 'text',
                    text: `\n[文件解析失败: ${error instanceof Error ? error.message : '未知错误'}]\n`
                  });
                }
              } else {
                newContent.push({
                  type: 'text',
                  text: `\n[不支持的文件类型: ${mime_type || '未知'}]\n`
                });
              }
            } else {
              newContent.push(item);
            }
          }
          
          return {
            ...msg,
            content: newContent
          };
        }));
      } else {
        processedMessages = messages;
      }
      
      // 处理图片识别
      if (hasImageContent && supportsVision) {
        // 如果模型支持视觉识别且消息包含图片，保持原始多媒体消息格式
        console.log('[Chat Stream] Using vision model with image content');
        sendOperationStatus('正在分析图片内容', undefined, 'running');
        // 记录所有图片URL
        processedMessages.forEach((msg: any, idx: number) => {
          if (Array.isArray(msg.content)) {
            const imageUrls = msg.content
              .filter((item: any) => item.type === 'image_url')
              .map((item: any) => item.image_url?.url);
            if (imageUrls.length > 0) {
              console.log(`[Chat Stream] Message ${idx} contains ${imageUrls.length} images:`, imageUrls);
            }
          }
        });
        sendOperationStatus('图片内容分析完成', `${processedMessages.length}张图片`, 'completed');
        // processedMessages 已经包含图片内容，不需要额外处理
      } else if (hasImageContent && !supportsVision) {
        // 如果消息包含图片但模型不支持vision，提示用户切换模型
        console.log('[Chat Stream] Image content detected but model does not support vision');
        // 将图片消息转换为文本，并添加提示
        processedMessages = processedMessages.map((msg: any) => {
          if (typeof msg.content === 'string') {
            return msg;
          }
          if (Array.isArray(msg.content)) {
            const textParts = [];
            let hasImage = false;
            
            for (const item of msg.content) {
              if (item.type === 'text') {
                textParts.push(item.text);
              } else if (item.type === 'image_url') {
                hasImage = true;
              }
            }
            
            let textContent = textParts.join('\n');
            if (hasImage) {
              textContent = `[检测到图片上传，但当前模型不支持图片识别。请切换到 GPT-4、GPT-4o、Claude 3 或 Gemini 2.5 Flash 等支持视觉识别的模型。]\n\n${textContent}`;
            }
            
            return {
              ...msg,
              content: textContent || '请切换到支持视觉识别的模型以分析图片内容'
            };
          }
          return msg;
        });
      } else {
        // 如果没有图片内容，将多媒体消息转换为纯文本格式
        processedMessages = processedMessages.map((msg: any) => {
          if (typeof msg.content === 'string') {
            return msg;
          }
          if (Array.isArray(msg.content)) {
            const textContent = msg.content
              .filter((item: any) => item.type === 'text')
              .map((item: any) => item.text)
              .join('\n');
            return {
              ...msg,
              content: textContent || '请分析上传的内容'
            };
          }
          return msg;
        });
        console.log('[Chat Stream] Converting to text-only messages');
      }
      
      // 添加通用系统提示词，确保AI能正确参考对话历史
      // === 智能系统提示词：自动纠错 + 对话记忆 + 意图推断 ===
      const hasMultipleTurns = processedMessages.filter((m: any) => m.role === 'user').length > 1;
      
      if (!isHomeworkCorrection) {
        // 构建对话上下文摘要（用于帮助AI更好地理解当前对话主题）
        const recentTopics: string[] = [];
        const recentMessages = processedMessages.slice(-6); // 最近6条消息
        for (const msg of recentMessages) {
          const text = typeof msg.content === 'string' ? msg.content : 
            Array.isArray(msg.content) ? msg.content.filter((i: any) => i.type === 'text').map((i: any) => i.text).join(' ') : '';
          if (text && msg.role === 'user' && text.length > 2) {
            recentTopics.push(text.substring(0, 80));
          }
        }
        const topicContext = recentTopics.length > 0 
          ? '\n\n当前对话主题线索（最近的用户消息摘要）：\n' + recentTopics.map((t, i) => `- 第${i+1}条: "${t}"`).join('\n')
          : '';
        
        const baseSystemPrompt = {
          role: 'system' as const,
          content: `你是一个智能、细心且善于理解用户真实意图的AI助手。你具备以下核心能力：

## 一、自动纠错与理解
1. **错别字纠正**：用户输入中可能包含错别字、同音字混淆（如"在"和"再"、"的"和"地"和"得"、"以"和"已"）、拼音输入法导致的错误选词等。你必须自动识别并理解用户的真实意思，无需提醒用户纠正，直接按正确理解回答。
2. **语序混乱理解**：用户可能因为打字匆忙导致语序混乱或句子不通顺（如"帮我看下这个怎么做题"实际意思是"帮我看下这道题怎么做"）。你应该自动重组理解，按正确语义回答。
3. **表达不完整补全**：用户可能省略主语、谓语或关键信息（如"那个呢？"、"还有吗"、"继续"）。你必须结合对话历史推断完整意思。
4. **口语化/非正式表达**：理解网络用语、缩写、方言表达（如"yyds"、"绝绝子"、"8错"="不错"、"rn"="right now"）。
5. **中英混杂**：用户可能在一句话中混用中英文（如"帮我debug一下这个code"），你应该自然理解并回答。
6. **标点符号缺失**：用户可能完全不使用标点符号，你需要根据语义自动断句理解。

## 二、对话记忆与上下文
1. **深度记忆**：你必须仔细阅读并牢记之前的所有对话内容，包括用户提到的偏好、需求、个人信息、之前讨论的结论等。
2. **连贯回答**：当用户的问题涉及之前讨论过的内容时，必须结合之前的对话进行回答，不要当作全新的问题。
3. **代词解析**：如果用户使用代词（"它"、"这个"、"那个"、"上面的"、"刚才的"）指代之前的内容，你必须准确理解指代对象。
4. **话题延续**：当用户简短回复（如"好的"、"然后呢"、"还有呢"、"详细说说"）时，你应该继续之前的话题深入展开。
5. **偏好记忆**：记住用户在对话中表达的偏好（如喜欢的编程语言、学习阶段、工作领域等），并在后续回答中自然运用。

## 三、意图推断
1. **模糊意图识别**：当用户表达不够明确时（如"那个东西怎么弄"），结合对话历史和上下文推断用户最可能的意图。
2. **隐含需求理解**：用户可能不直接说出需求，而是描述一个问题或场景。你应该理解其背后的真实需求并主动提供帮助。
3. **多意图处理**：如果用户一条消息中包含多个问题或请求，你应该逐一回答，不遗漏任何一个。
4. **情绪感知**：感知用户的情绪状态（着急、困惑、沮丧等），调整回答的语气和详细程度。

## 四、回答质量
1. **准确性优先**：确保回答的事实准确性，不确定时明确说明。
2. **结构清晰**：使用合适的格式（标题、列表、代码块等）组织回答，便于阅读。
3. **适度详细**：根据问题复杂度调整回答长度，简单问题简洁回答，复杂问题详细解释。
4. **主动补充**：在回答用户问题的同时，适当补充相关的有用信息或注意事项。${topicContext}`
        };
        
        processedMessages = [baseSystemPrompt, ...processedMessages];
        console.log('[Chat Stream] Added enhanced system prompt with auto-correction' + (hasMultipleTurns ? ' (multi-turn with topic context)' : ' (single-turn)'));
      }
      
      // 如果是作业批改请求，添加系统提示词
      if (isHomeworkCorrection) {
        const systemPrompt = {
          role: 'system' as const,
          content: `你是一个专业的作业批改助手。当用户上传作业图片并请求批改时，你的任务是：

1. **仔细识别图片中的所有题目**：包括题号、题目内容、学生的答案。
2. **检查每道题的答案是否正确**：
   - 对于数学题，检查计算过程和最终结果
   - 对于填空题，检查填入的内容是否符合题目要求
   - 对于选择题，检查选项是否正确
3. **给出明确的批改结果**：
   - 列出每道题的题号
   - 标注每道题是“✅ 正确”还是“❌ 错误”
   - 对于错误的题，说明错误原因并给出正确答案
4. **不要分析字体书写**：除非题目明确要求检查书写，否则只关注题目答案的正确性。

请以清晰、结构化的方式呈现批改结果，让学生和家长能够一目了然地看到哪些题对了、哪些题错了。`
        };
        
        // 将系统提示词添加到消息列表开头
        processedMessages = [systemPrompt, ...processedMessages];
        console.log('[Chat Stream] Added homework correction system prompt');
      }
      
      let chunkCount = 0;
      const llmStartTime = Date.now();
      let llmSuccess = false;
      
      // 用于缓存chunk，检测工具调用
      let accumulatedChunks: string[] = [];
      let toolCallDetected = false;
      
      sendThinkingStep('生成答案', '正在调用AI语言模型生成回答。我会结合我的知识库和推理能力，为您提供详细、准确且易于理解的答案。');
      sendOperationStatus('正在调用AI模型', model.name, 'running');
      try {
        for await (const chunk of invokeLLMStream({ 
          model: (model as any).apiModel || (model as any).modelIdentifier || model.name, 
          messages: processedMessages,
          ...(model.apiEndpoint && model.apiKey ? {
            apiEndpoint: model.apiEndpoint,
            apiKey: model.apiKey,
          } : {}),
        })) {
        if (chunkCount === 0) {
          console.log('[Chat Stream] First chunk from API:', chunk.substring(0, 100));
        }
        chunkCount++;
        fullMessage += chunk;
        
        // 累积chunk
        accumulatedChunks.push(chunk);
        const accumulatedContent = accumulatedChunks.join('');
        
        // 检测是否包含工具调用
        if (!toolCallDetected && accumulatedContent.includes('"action"') && 
            (accumulatedContent.includes('dalle.text2im') || accumulatedContent.includes('text2im'))) {
          console.log('[Chat Stream] Tool call detected in stream, suppressing output');
          toolCallDetected = true;
          // 不发送任何内容，等待后续处理
        } else if (!toolCallDetected) {
          // 没有检测到工具调用，正常发送内容
          res.write(`data: ${JSON.stringify({ type: "content", content: chunk })}\n\n`);
        }
        // 如果已检测到工具调用，忽略后续所有chunk
      }
        console.log('[Chat Stream] Total chunks received:', chunkCount);
        llmSuccess = true;
        sendOperationStatus('AI模型调用完成', model.name, 'completed');
        
        // 检查AI是否返回了工具调用格式（图片生成）
        if (fullMessage.includes('"action"') && fullMessage.includes('dalle.text2im')) {
          console.log('[Chat Stream] Detected tool call in AI response:', fullMessage.substring(0, 300));
          
          // 清除已经发送的内容，避免显示JSON文本
          fullMessage = '';
          
          try {
            // 使用更robust的方法提取JSON：找到第一个{，然后匹配到对应的}
            let toolCall = null;
            let jsonStr = '';
            
            // 方法1：尝试直接解析整个fullMessage（如果它就是JSON）
            if (fullMessage.trim().startsWith('{')) {
              try {
                toolCall = JSON.parse(fullMessage.trim());
                console.log('[Chat Stream] Parsed entire message as JSON');
              } catch (e) {
                // 不是完整的JSON，继续其他方法
              }
            }
            
            // 方法2：使用堆栈匹配找到完整的JSON对象
            if (!toolCall) {
              const startIndex = fullMessage.indexOf('{');
              if (startIndex !== -1) {
                let braceCount = 0;
                let endIndex = -1;
                
                for (let i = startIndex; i < fullMessage.length; i++) {
                  if (fullMessage[i] === '{') braceCount++;
                  if (fullMessage[i] === '}') braceCount--;
                  
                  if (braceCount === 0) {
                    endIndex = i + 1;
                    break;
                  }
                }
                
                if (endIndex !== -1) {
                  jsonStr = fullMessage.substring(startIndex, endIndex);
                  try {
                    toolCall = JSON.parse(jsonStr);
                    console.log('[Chat Stream] Parsed tool call with brace matching');
                  } catch (e) {
                    console.error('[Chat Stream] Failed to parse matched JSON:', e);
                  }
                }
              }
            }
            
            if (toolCall && toolCall.action === 'dalle.text2im') {
              console.log('[Chat Stream] Parsed tool call:', toolCall);
              
              // 提取图片描述
              let imagePrompt = '';
              if (toolCall.action_input) {
                if (typeof toolCall.action_input === 'string') {
                  try {
                    const actionInput = JSON.parse(toolCall.action_input);
                    imagePrompt = actionInput.prompt || toolCall.action_input;
                  } catch {
                    imagePrompt = toolCall.action_input;
                  }
                } else if (typeof toolCall.action_input === 'object' && toolCall.action_input.prompt) {
                  imagePrompt = toolCall.action_input.prompt;
                }
              } else if (toolCall.prompt) {
                imagePrompt = toolCall.prompt;
              }
              
              // 如果提取到了prompt，执行图片生成
              if (imagePrompt) {
                console.log('[Chat Stream] Executing image generation from tool call:', imagePrompt);
                
                // 不发送任何文本提示，直接生成图片
                sendOperationStatus('正在生成图片', imagePrompt.substring(0, 50) + '...', 'running');
                
                // 调用图片生成API
                const imageResult = await generateImage({ prompt: imagePrompt });
                sendOperationStatus('图片生成完成', undefined, 'completed');
                
                // 发送占位图
                if (imageResult.placeholderUrl) {
                  res.write(`data: ${JSON.stringify({ 
                    type: "image_placeholder", 
                    placeholderUrl: imageResult.placeholderUrl,
                    prompt: imagePrompt 
                  })}\n\n`);
                }
                
                // 发送高清图片（不添加文本描述）
                res.write(`data: ${JSON.stringify({ 
                  type: "image", 
                  imageUrl: imageResult.url,
                  placeholderUrl: imageResult.placeholderUrl,
                  prompt: imagePrompt 
                })}\n\n`);
                
                console.log('[Chat Stream] Image generated from tool call:', imageResult.url);
              }
            }
          } catch (toolCallError) {
            console.error('[Chat Stream] Failed to process tool call:', toolCallError);
            
            // 分析错误类型，发送用户友好的错误消息
            const errorMessage = toolCallError instanceof Error ? toolCallError.message : '工具调用失败';
            let userFriendlyError = '图片生成服务暂时不可用，请稍后重试。';
            let errorDetails = '';
            
            // 检查是否是图片生成错误
            if (errorMessage.includes('nano_banana') || errorMessage.includes('GENERATE_ERROR')) {
              userFriendlyError = '图片生成服务暂时不可用（服务商错误）';
              errorDetails = '可能原因：1) 服务配额已用完 2) 服务暂时维护中 3) 模型暂时不可用。请稍后重试或联系管理员。';
              
              // 发送错误事件
              res.write(`data: ${JSON.stringify({ 
                type: "error", 
                error: `${userFriendlyError}\n\n${errorDetails}`,
                canRetry: true
              })}\n\n`);
            } else if (errorMessage.includes('500')) {
              userFriendlyError = '图片生成服务器错误';
              errorDetails = '服务器遇到内部错误，请稍后重试。';
              
              res.write(`data: ${JSON.stringify({ 
                type: "error", 
                error: `${userFriendlyError}\n\n${errorDetails}`,
                canRetry: true
              })}\n\n`);
            }
            // 如果不是图片生成错误，继续正常流程
          }
        }
      } catch (llmError) {
        console.error('[Chat Stream] LLM invocation failed:', llmError);
        llmSuccess = false;
        throw llmError;
      } finally {
        // 记录模型使用统计
        const llmResponseTime = Date.now() - llmStartTime;
        try {
          await db.updateModelStats(model.id, {
            success: llmSuccess,
            responseTime: llmResponseTime,
          });
        } catch (statsError) {
          console.error('[Chat Stream] Failed to update model stats:', statsError);
        }
      }
      }

      // 图片生成失败时不扣费
      if (imageGenerationFailed) {
        console.log('[Chat Stream] Image generation failed, skipping billing for user', user.id);
        // 发送done事件，余额不变
        res.write(
          `data: ${JSON.stringify({
            type: "done",
            newBalance: balance.toFixed(2),
            cost: "0.00",
            skippedBilling: true,
            reason: "image_generation_failed",
          })}\n\n`
        );
        console.log('[Chat Stream] Done event sent (no charge), ending response');
        res.end();
        return; // 跳过后续扣费和保存逻辑
      }

      // 扣除🐟币
      const newBalance = (balance - finalCost).toFixed(2);
      await db.updateUserFishCoins(user.id, newBalance);

      // 构建交易描述
      let description = isImageGeneration ? '图片生成' : `使用 ${model.displayName} 进行对话`;
      if (discountPercent > 0) {
        description += ` (原价: ${originalCost.toFixed(2)}, 等级折扣: ${discountPercent}%, 实付: ${finalCost.toFixed(2)})`;
      }

      await db.createFishCoinTransaction({
        userId: user.id,
        type: "consume",
        amount: `-${finalCost.toFixed(2)}`,
        balanceAfter: newBalance,
        modelId: model.id,
        description,
      });

      // 增加配额使用次数（根据请求类型扣除对应配额）
      if (isImageRequest) {
        // 图片生成请求，扣除图片配额
        sendOperationStatus('正在更新配额', '图片配额', 'running');
        await db.incrementQuotaUsage(user.id, "image");
        console.log('[Chat Stream] Image quota incremented for user', user.id);
        sendOperationStatus('配额更新完成', '图片配额', 'completed');
      } else if (hasFileContent) {
        // 文档处理请求，扣除文档配额
        sendOperationStatus('正在处理文档', '文档配额', 'running');
        await db.incrementQuotaUsage(user.id, "document");
        console.log('[Chat Stream] Document quota incremented for user', user.id);
        sendOperationStatus('文档处理完成', '文档配额', 'completed');
      } else {
        // 普通对话请求，扣除对话配额
        sendOperationStatus('正在更新配额', '对话配额', 'running');
        await db.incrementQuotaUsage(user.id, "chat");
        console.log('[Chat Stream] Chat quota incremented for user', user.id);
        sendOperationStatus('配额更新完成', '对话配额', 'completed');
      }

      // 保存或更新对话历史
      const assistantMsg: any = { role: "assistant", content: fullMessage };
      if (isAutomationRequest && _automationTaskId) {
        assistantMsg.isAutomationTask = true;
        assistantMsg.automationTaskId = _automationTaskId;
        assistantMsg.automationTaskName = _automationTaskName;
        assistantMsg.automationSiteName = _automationSiteName;
      }
      const allMessages = [...messages, assistantMsg];

      if (conversationId) {
        await db.updateChatConversation(conversationId, {
          messages: JSON.stringify(allMessages),
        });
      } else {
        await db.createChatConversation({
          userId: user.id,
          modelId: model.id,
          messages: JSON.stringify(allMessages),
        });
      }

      // 发送完成事件
      console.log('[Chat Stream] Sending done event:', { newBalance, messageLength: fullMessage.length });
      res.write(
        `data: ${JSON.stringify({
          type: "done",
          newBalance,
          message: fullMessage,
        })}\n\n`
      );
      console.log('[Chat Stream] Done event sent, ending response');

      res.end();
    } catch (error) {
      console.error("[Chat Stream] Error:", error);
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : "AI调用失败",
        })}\n\n`
      );
      res.end();
    }
  } catch (error) {
    console.error("[Chat Stream] Request error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "服务器错误",
      });
    }
  }
});

export default router;
