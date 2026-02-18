/**
 * 验证码识别服务
 * 
 * 使用 Vision LLM 接口识别各类验证码：
 * - 图片文字验证码
 * - 滑块验证码（识别缺口位置）
 * - 点选验证码（识别目标文字/图标位置）
 * 
 * 流程：截图 -> base64 编码 -> 调用 Vision API -> 解析结果
 */
import type { Page, ElementHandle } from "playwright";
import { ENV } from "./env";

// ============ 类型定义 ============

export interface CaptchaResult {
  success: boolean;
  type: "text" | "slider" | "click" | "unknown";
  /** 识别出的文字（文字验证码） */
  text?: string;
  /** 滑块需要移动的像素距离（滑块验证码） */
  sliderDistance?: number;
  /** 需要点击的坐标列表（点选验证码） */
  clickPoints?: Array<{ x: number; y: number }>;
  /** 置信度 0-1 */
  confidence: number;
  /** 原始 AI 响应 */
  rawResponse?: string;
}

// ============ 核心识别函数 ============

/**
 * 截取验证码区域并识别
 */
export async function recognizeCaptcha(
  page: Page,
  captchaSelector?: string
): Promise<CaptchaResult> {
  try {
    let screenshotBuffer: Buffer;
    
    if (captchaSelector) {
      // 截取特定验证码元素
      console.log(`[CaptchaService] Taking screenshot of captcha element: ${captchaSelector}`);
      const element = await page.$(captchaSelector);
      if (!element) {
        console.warn(`[CaptchaService] Captcha element not found: ${captchaSelector}`);
        return { success: false, type: "unknown", confidence: 0, rawResponse: `验证码元素未找到: ${captchaSelector}` };
      }
      // 等待元素可见
      await element.scrollIntoViewIfNeeded().catch(() => {});
      await new Promise(r => setTimeout(r, 500)); // 等待图片加载
      screenshotBuffer = await element.screenshot() as Buffer;
      console.log(`[CaptchaService] Screenshot taken, size: ${screenshotBuffer.length} bytes`);
    } else {
      // 截取整个页面
      console.log(`[CaptchaService] Taking full page screenshot for captcha`);
      screenshotBuffer = await page.screenshot({ fullPage: false }) as Buffer;
    }
    
    if (screenshotBuffer.length < 100) {
      console.warn(`[CaptchaService] Screenshot too small (${screenshotBuffer.length} bytes), element may not be visible`);
      return { success: false, type: "unknown", confidence: 0, rawResponse: "截图太小，元素可能不可见" };
    }
    
    const base64Image = screenshotBuffer.toString("base64");
    
    // 对于已知是图片验证码的选择器（如 img#cap），直接识别文字，跳过类型检测
    const isLikelyTextCaptcha = captchaSelector && (
      captchaSelector.includes('img') || 
      captchaSelector.includes('captcha') ||
      captchaSelector.includes('#cap')
    );
    
    if (isLikelyTextCaptcha) {
      console.log(`[CaptchaService] Selector suggests text captcha, skipping type detection`);
      return await recognizeTextCaptcha(base64Image);
    }
    
    // 检测验证码类型
    const typeResult = await detectCaptchaType(base64Image);
    console.log(`[CaptchaService] Detected captcha type: ${typeResult}`);
    
    // 根据类型调用对应的识别逻辑
    switch (typeResult) {
      case "text":
        return await recognizeTextCaptcha(base64Image);
      case "slider":
        return await recognizeSliderCaptcha(base64Image);
      case "click":
        return await recognizeClickCaptcha(base64Image, page, captchaSelector);
      default:
        // 如果无法识别类型，默认尝试文字识别
        console.log(`[CaptchaService] Unknown type, falling back to text recognition`);
        return await recognizeTextCaptcha(base64Image);
    }
  } catch (error: any) {
    console.error("[CaptchaService] Recognition failed:", error.message, error.stack);
    return { success: false, type: "unknown", confidence: 0, rawResponse: error.message };
  }
}

/**
 * 检测验证码类型
 */
async function detectCaptchaType(base64Image: string): Promise<"text" | "slider" | "click" | "unknown"> {
  const response = await callVisionAPI(
    base64Image,
    `分析这张图片中的验证码类型。请只回答以下之一：
- "text" 如果是需要输入文字/数字的图片验证码
- "slider" 如果是滑块验证码（有缺口的拼图）
- "click" 如果是需要点击特定位置的验证码（如点选文字、点击图标）
- "unknown" 如果无法识别

只回答一个单词，不要解释。`
  );
  
  const type = response.trim().toLowerCase().replace(/['"]/g, "");
  if (["text", "slider", "click"].includes(type)) {
    return type as "text" | "slider" | "click";
  }
  return "unknown";
}

/**
 * 识别文字/数字验证码
 */
async function recognizeTextCaptcha(base64Image: string): Promise<CaptchaResult> {
  const response = await callVisionAPI(
    base64Image,
    `这是一个图片验证码，请识别其中的文字或数字。
要求：
1. 只输出验证码的文字内容，不要有任何其他说明
2. 如果是英文字母，注意区分大小写
3. 如果是数字和字母的组合，仔细辨认容易混淆的字符（如 0 和 O, 1 和 l, 5 和 S）
4. 忽略干扰线和噪点

请直接输出验证码文字：`
  );
  
  const text = response.trim().replace(/['"]/g, "").replace(/\s+/g, "");
  
  return {
    success: text.length > 0,
    type: "text",
    text,
    confidence: text.length >= 4 ? 0.8 : 0.5,
    rawResponse: response,
  };
}

/**
 * 识别滑块验证码（缺口位置）
 */
async function recognizeSliderCaptcha(base64Image: string): Promise<CaptchaResult> {
  const response = await callVisionAPI(
    base64Image,
    `这是一个滑块验证码图片。图片中有一个拼图缺口（通常是一个方形或不规则形状的凹槽）。
请分析：
1. 缺口的水平位置（从左边缘算起的像素数）
2. 图片的总宽度

请以 JSON 格式回答：{"gapX": 数字, "totalWidth": 数字}
只输出 JSON，不要其他内容。`
  );
  
  try {
    const jsonMatch = response.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      return {
        success: true,
        type: "slider",
        sliderDistance: data.gapX || 0,
        confidence: 0.7,
        rawResponse: response,
      };
    }
  } catch (e) {
    // JSON 解析失败
  }
  
  return { success: false, type: "slider", confidence: 0, rawResponse: response };
}

/**
 * 识别点选验证码
 */
async function recognizeClickCaptcha(
  base64Image: string,
  page: Page,
  captchaSelector?: string
): Promise<CaptchaResult> {
  const response = await callVisionAPI(
    base64Image,
    `这是一个点选验证码。图片中可能要求你按顺序点击特定的文字、图标或图案。
请分析图片，找出需要按顺序点击的目标位置。

请以 JSON 数组格式回答每个目标的坐标（相对于图片左上角的像素位置）：
[{"x": 数字, "y": 数字}, {"x": 数字, "y": 数字}, ...]
只输出 JSON 数组，不要其他内容。`
  );
  
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const points = JSON.parse(jsonMatch[0]);
      return {
        success: Array.isArray(points) && points.length > 0,
        type: "click",
        clickPoints: points,
        confidence: 0.6,
        rawResponse: response,
      };
    }
  } catch (e) {
    // JSON 解析失败
  }
  
  return { success: false, type: "click", confidence: 0, clickPoints: [], rawResponse: response };
}

// ============ Vision API 调用 ============

/**
 * 调用 Vision LLM API
 */
async function callVisionAPI(base64Image: string, prompt: string): Promise<string> {
  // 使用项目已有的 LLM 配置
  const apiKey = ENV.forgeApiKey || process.env.OPENAI_API_KEY || "";
  const apiUrl = ENV.forgeApiUrl || "https://api.openai.com/v1";
  
  // 使用 DashScope 支持的视觉模型
  const model = "qwen-vl-max";
  
  const fullUrl = `${apiUrl.endsWith("/v1") ? apiUrl : apiUrl + "/v1"}/chat/completions`;
  console.log(`[CaptchaService] Calling Vision API: ${fullUrl} with model ${model}`);
  console.log(`[CaptchaService] Image base64 length: ${base64Image.length}`);
  
  const requestBody = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${base64Image}`,
              detail: "high",
            },
          },
        ],
      },
    ],
    max_tokens: 500,
    temperature: 0.1,
  };
  
  const response = await fetch(fullUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[CaptchaService] Vision API error: ${response.status} - ${errorText.substring(0, 500)}`);
    throw new Error(`Vision API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }
  
  const data = await response.json() as any;
  const result = data.choices?.[0]?.message?.content || "";
  console.log(`[CaptchaService] Vision API response: ${result.substring(0, 200)}`);
  return result;
}

// ============ 验证码自动处理 ============

/**
 * 自动处理文字验证码：识别 -> 填入
 */
export async function handleTextCaptcha(
  page: Page,
  captchaImageSelector: string,
  captchaInputSelector: string
): Promise<boolean> {
  console.log(`[CaptchaService] handleTextCaptcha called: image=${captchaImageSelector}, input=${captchaInputSelector}`);
  
  const result = await recognizeCaptcha(page, captchaImageSelector);
  
  console.log(`[CaptchaService] Recognition result: success=${result.success}, text="${result.text}", confidence=${result.confidence}`);
  
  if (result.success && result.text) {
    try {
      // 确保输入框存在
      const inputEl = await page.$(captchaInputSelector);
      if (!inputEl) {
        console.warn(`[CaptchaService] Captcha input element not found: ${captchaInputSelector}`);
        return false;
      }
      
      // 模拟人类输入验证码
      await page.click(captchaInputSelector);
      await new Promise(r => setTimeout(r, 300 + Math.random() * 500));
      await page.fill(captchaInputSelector, "");
      
      // 逐字符输入
      for (const char of result.text) {
        await page.type(captchaInputSelector, char, { delay: 0 });
        await new Promise(r => setTimeout(r, 80 + Math.random() * 150));
      }
      
      console.log(`[CaptchaService] Captcha text "${result.text}" filled into ${captchaInputSelector}`);
      return true;
    } catch (err: any) {
      console.error(`[CaptchaService] Failed to fill captcha text:`, err.message);
      return false;
    }
  }
  
  console.warn(`[CaptchaService] Captcha recognition failed or empty text`);
  return false;
}

/**
 * 自动处理滑块验证码：识别缺口 -> 模拟拖动
 */
export async function handleSliderCaptcha(
  page: Page,
  sliderSelector: string,
  captchaImageSelector?: string
): Promise<boolean> {
  const result = await recognizeCaptcha(page, captchaImageSelector);
  
  if (result.success && result.sliderDistance) {
    const slider = await page.$(sliderSelector);
    if (!slider) return false;
    
    const box = await slider.boundingBox();
    if (!box) return false;
    
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const endX = startX + result.sliderDistance;
    
    // 模拟人类拖动：先按下，缓慢移动，最后释放
    await page.mouse.move(startX, startY);
    await new Promise(r => setTimeout(r, 200));
    await page.mouse.down();
    await new Promise(r => setTimeout(r, 100));
    
    // 分多步移动，模拟人类手抖
    const steps = 20 + Math.floor(Math.random() * 15);
    for (let i = 1; i <= steps; i++) {
      const progress = i / steps;
      // 使用缓动函数（先快后慢）
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentX = startX + (endX - startX) * eased;
      const currentY = startY + (Math.random() - 0.5) * 4; // 轻微上下抖动
      await page.mouse.move(currentX, currentY);
      await new Promise(r => setTimeout(r, 10 + Math.random() * 30));
    }
    
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    await page.mouse.up();
    
    return true;
  }
  
  return false;
}
