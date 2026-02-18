/**
 * 网站全自动交互沙箱 - 核心自动化服务
 * 
 * AI Agent 驱动的浏览器自动化引擎：
 * 1. 读取数据库中的站点账号，自动登录
 * 2. 根据任务指令，使用 LLM 决策下一步操作
 * 3. 通过 Playwright 执行浏览器操作
 * 4. 实时通过 Socket.io 推送截图和思考过程
 * 5. 所有操作带类人延迟，防止反爬检测
 */
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { getDb } from "../db";
import {
  siteAccounts,
  automationTasks,
  automationTaskSteps,
  automationContents,
  type AutomationTask,
  type SiteAccount,
} from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { ENV } from "./env";
import {
  humanDelay, shortPause, mediumPause, longPause,
  waitAfterNavigation, humanType, quickFill,
  humanClick, humanScroll, simulateBrowsing,
  getStealthContextOptions, injectStealthScripts,
} from "./humanSimulator";
import { recognizeCaptcha, handleTextCaptcha, handleSliderCaptcha } from "./captchaService";
import {
  emitBrowserScreenshot, emitBrowserNavigate, emitBrowserLoading,
  emitAgentThinking, emitAgentStep, emitTaskStatus, emitTaskProgress,
  emitTerminalCommand, emitTerminalOutput, emitCodeUpdate,
  emitTakeoverStatus,
} from "./socketManager";

// ============ 类型定义 ============

interface AgentAction {
  tool: string;
  params: Record<string, any>;
  reasoning: string;
}

interface PageContext {
  url: string;
  title: string;
  /** 页面可见文本（截取前 3000 字符） */
  visibleText: string;
  /** 可交互元素列表 */
  interactiveElements: Array<{
    index: number;
    tag: string;
    type?: string;
    text: string;
    placeholder?: string;
    selector: string;
  }>;
}

// ============ 已知站点登录配置 ============
// 为常用站点提供硬编码的选择器，避免 LLM 分析失败

interface KnownSiteConfig {
  loginUrlPattern: RegExp;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  captchaImageSelector: string | null;
  captchaInputSelector: string | null;
}

const KNOWN_SITES: KnownSiteConfig[] = [
  {
    loginUrlPattern: /mpsboring\.com/i,
    usernameSelector: 'input[name="email"]',
    passwordSelector: 'input[name="password"]',
    submitSelector: 'button.login-submit-btn',
    captchaImageSelector: 'img#cap',
    captchaInputSelector: 'input[name="captcha"]',
  },
];

function findKnownSiteConfig(url: string): KnownSiteConfig | null {
  for (const config of KNOWN_SITES) {
    if (config.loginUrlPattern.test(url)) {
      return config;
    }
  }
  return null;
}

// ============ 浏览器管理 ============

let automationBrowser: Browser | null = null;

// 存储活跃任务的页面引用，用于用户接管
const activeTaskPages: Map<number, Page> = new Map();
const activeTaskContexts: Map<number, BrowserContext> = new Map();
const takeoverMode: Map<number, boolean> = new Map();

async function getAutomationBrowser(): Promise<Browser> {
  if (automationBrowser && automationBrowser.isConnected()) {
    return automationBrowser;
  }
  console.log("[AutomationService] Launching stealth Chromium...");
  automationBrowser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--window-size=1920,1080",
    ],
  });
  return automationBrowser;
}

async function createStealthContext(browser: Browser, cookies?: string): Promise<BrowserContext> {
  const options = getStealthContextOptions();
  const context = await browser.newContext(options);
  
  // 恢复 cookies（如果有）
  if (cookies) {
    try {
      const cookieArray = JSON.parse(cookies);
      if (Array.isArray(cookieArray) && cookieArray.length > 0) {
        await context.addCookies(cookieArray);
      }
    } catch (e) {
      console.warn("[AutomationService] Failed to restore cookies:", e);
    }
  }
  
  return context;
}

// ============ 页面分析 ============

/**
 * 提取页面上下文信息，供 Agent 决策使用
 */
async function extractPageContext(page: Page): Promise<PageContext> {
  const url = page.url();
  const title = await page.title();
  
  // 提取可见文本（限制长度）
  const visibleText = await page.evaluate(() => {
    const body = document.body;
    if (!body) return "";
    // 移除 script 和 style 标签的文本
    const clone = body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, style, noscript").forEach(el => el.remove());
    return (clone.textContent || "").replace(/\s+/g, " ").trim().substring(0, 3000);
  });
  
  // 提取可交互元素
  const interactiveElements = await page.evaluate(() => {
    const elements: Array<{
      index: number; tag: string; type?: string;
      text: string; placeholder?: string; selector: string;
      href?: string;
    }> = [];
    
    const selectors = [
      "a[href]", "button", "input", "textarea", "select",
      "[role='button']", "[onclick]", "[tabindex]",
    ];
    
    let index = 0;
    const seen = new Set<Element>();
    
    // 辅助函数：生成可靠的唯一选择器
    function generateUniqueSelector(el: Element, tag: string): string {
      // 1. 有 id 直接用
      if (el.id) return `#${el.id}`;
      
      // 2. 有 name 属性
      const name = el.getAttribute("name");
      if (name) return `${tag}[name="${name}"]`;
      
      // 3. 有 href 属性（链接）- 用 href 精确匹配
      const href = el.getAttribute("href");
      if (href && href !== "#" && href !== "javascript:void(0)") {
        return `${tag}[href="${href}"]`;
      }
      
      // 4. 有 data-* 属性
      for (const attr of el.attributes) {
        if (attr.name.startsWith("data-") && attr.value) {
          return `${tag}[${attr.name}="${attr.value}"]`;
        }
      }
      
      // 5. 用 class 组合 + nth-child 确保唯一性
      if (el.className && typeof el.className === "string") {
        const cls = el.className.split(" ").filter(c => c && !c.includes(":") && !c.includes("(")).slice(0, 3).join(".");
        if (cls) {
          const fullSelector = `${tag}.${cls}`;
          const matches = document.querySelectorAll(fullSelector);
          if (matches.length === 1) return fullSelector;
          // 如果有多个匹配，用 nth-of-type 区分
          const siblings = Array.from(matches);
          const idx = siblings.indexOf(el);
          if (idx >= 0) {
            // 使用 :nth-child 基于父元素
            const parent = el.parentElement;
            if (parent) {
              const childIndex = Array.from(parent.children).indexOf(el) + 1;
              return `${tag}.${cls}:nth-child(${childIndex})`;
            }
          }
          return fullSelector; // 回退
        }
      }
      
      // 6. 基于父元素的 nth-child
      const parent = el.parentElement;
      if (parent) {
        const childIndex = Array.from(parent.children).filter(c => c.tagName === el.tagName).indexOf(el) + 1;
        if (parent.id) {
          return `#${parent.id} > ${tag}:nth-of-type(${childIndex})`;
        }
        if (parent.className && typeof parent.className === "string") {
          const parentCls = parent.className.split(" ").filter(c => c && !c.includes(":")).slice(0, 2).join(".");
          if (parentCls) {
            return `${parent.tagName.toLowerCase()}.${parentCls} > ${tag}:nth-of-type(${childIndex})`;
          }
        }
      }
      
      return `${tag}:nth-of-type(${index + 1})`;
    }
    
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        
        const rect = el.getBoundingClientRect();
        // 只包含可见元素
        if (rect.width === 0 || rect.height === 0) return;
        if (rect.top > window.innerHeight * 2) return; // 太远的元素跳过
        
        const tag = el.tagName.toLowerCase();
        const text = (el.textContent || "").trim().substring(0, 100);
        const type = el.getAttribute("type") || undefined;
        const placeholder = el.getAttribute("placeholder") || undefined;
        const href = (el as HTMLAnchorElement).href || undefined;
        
        const selector = generateUniqueSelector(el, tag);
        
        elements.push({ index: index++, tag, type, text, placeholder, selector, href });
      });
    }
    
    return elements.slice(0, 60); // 限制最多 60 个元素
  });
  
  return { url, title, visibleText, interactiveElements };
}

// ============ 截图与实时推送 ============

/**
 * 截图并通过 Socket.io 推送到前端
 */
async function captureAndEmit(page: Page, taskId: number, description: string): Promise<string> {
  try {
    const buffer = await page.screenshot({ type: "jpeg", quality: 60 }) as Buffer;
    const base64 = buffer.toString("base64");
    
    // 通过 Socket.io 推送截图
    emitBrowserScreenshot(taskId, `data:image/jpeg;base64,${base64}`, page.url());
    
    return base64;
  } catch (e) {
    console.warn("[AutomationService] Screenshot failed:", e);
    return "";
  }
}

// ============ LLM Agent 决策 ============

/**
 * 构建 LLM API URL（DashScope 兼容模式）
 */
function getLlmApiUrl(): string {
  const base = ENV.forgeApiUrl || "https://api.openai.com";
  // 确保 URL 以 /v1 结尾
  if (base.endsWith("/v1")) return base;
  return base + "/v1";
}

/**
 * 调用 LLM 决定下一步操作
 */
async function agentDecide(
  task: AutomationTask,
  pageContext: PageContext,
  history: Array<{ role: string; content: string }>,
  stepNumber: number
): Promise<AgentAction> {
  const apiKey = ENV.forgeApiKey || process.env.OPENAI_API_KEY || "";
  const apiUrl = getLlmApiUrl();
  // 使用 qwen-plus 作为默认模型（DashScope 支持）
  const model = "qwen-plus";
  
  const systemPrompt = `你是一个网站自动化操作 Agent。你的任务是控制浏览器完成用户指定的操作。

当前任务：${task.instruction}
任务类型：${task.taskType}
${task.contentStyle ? `内容风格要求：${task.contentStyle}` : ""}
${task.searchKeywords ? `搜索关键词：${task.searchKeywords}` : ""}
${task.targetUrls ? `目标URL列表：${task.targetUrls}` : ""}

你可以使用以下工具：
1. navigate(url) - 导航到指定 URL
2. click(selector) - 点击页面元素（使用 CSS 选择器字符串）
3. click_text(text) - 通过元素的可见文本内容点击（适用于链接和按钮，如 "发帖"、"提交"）
4. click_index(index) - 通过元素列表中的索引号点击（如 [0]、[1]）
5. type(selector, text) - 在输入框中输入文字
6. scroll(direction, distance) - 滚动页面，direction 为 "down" 或 "up"
7. wait(seconds) - 等待指定秒数
8. screenshot() - 截取当前页面截图
9. captcha(imageSelector, inputSelector) - 识别并填入验证码
10. generate_content(topic, type) - 使用 AI 生成帖子/回复内容
11. submit() - 提交当前表单（点击提交按钮）
12. done(summary) - 任务完成，提供摘要

请根据当前页面状态决定下一步操作。以 JSON 格式回答：
{
  "reasoning": "你的思考过程（中文）",
  "tool": "工具名称",
  "params": { "参数名": "参数值" }
}

重要规则：
- 每次只执行一个操作
- 优先使用 click_text 或 click_index，而不是 click(selector)，因为文本和索引更可靠
- 如果使用 click(selector)，selector 必须是元素列表中提供的确切选择器，不要自己编造
- 如果看到验证码，优先处理验证码
- 如果登录失败，最多重试 3 次
- 如果页面没有变化，尝试不同的操作
- 如果 click 失败，尝试用 navigate 直接跳转到目标 URL
- 发帖/回复内容必须自然、有价值，不能是垃圾内容
- 完成所有操作后调用 done() 工具`;

  const userMessage = `当前页面状态（第 ${stepNumber} 步）：
URL: ${pageContext.url}
标题: ${pageContext.title}

页面可见文本（前2000字）：
${pageContext.visibleText.substring(0, 2000)}

可交互元素列表：
${pageContext.interactiveElements.map(el => {
  let desc = `[${el.index}] <${el.tag}${el.type ? ` type="${el.type}"` : ""}> ${el.text || el.placeholder || ""}`;
  if ((el as any).href) desc += ` (href: ${(el as any).href})`;
  desc += ` \u2192 selector: "${el.selector}"`;
  return desc;
}).join("\n")}

请决定下一步操作：`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10), // 保留最近 10 条历史
    { role: "user", content: userMessage },
  ];

  console.log(`[AutomationService] Calling LLM API: ${apiUrl}/chat/completions with model ${model}`);

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1000,
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error(`[AutomationService] LLM API error: ${response.status} ${errText}`);
    throw new Error(`LLM API error: ${response.status} ${errText.substring(0, 200)}`);
  }

  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content || "{}";
  
  console.log(`[AutomationService] LLM response: ${content.substring(0, 200)}`);
  
  try {
    const parsed = JSON.parse(content);
    return {
      tool: parsed.tool || "done",
      params: parsed.params || {},
      reasoning: parsed.reasoning || "无法解析思考过程",
    };
  } catch (e) {
    console.warn("[AutomationService] Failed to parse LLM response:", content.substring(0, 200));
    return { tool: "done", params: { summary: "Agent 响应解析失败" }, reasoning: content };
  }
}

/**
 * 使用 AI 生成发帖/回复内容
 */
async function generateContent(topic: string, contentType: string, style?: string): Promise<string> {
  const apiKey = ENV.forgeApiKey || process.env.OPENAI_API_KEY || "";
  const apiUrl = getLlmApiUrl();
  
  const prompt = `请为以下主题生成一段${contentType === "post" ? "论坛帖子" : "回复评论"}内容。

主题：${topic}
${style ? `风格要求：${style}` : "风格要求：自然、友好、有见解，像真实用户的发言"}

要求：
1. 内容自然真实，不像机器人生成
2. 有个人观点和经验分享
3. 适当使用口语化表达
4. 长度适中（${contentType === "post" ? "200-500字" : "50-200字"}）
5. 不要使用 Markdown 格式
6. 不要出现"作为AI"之类的表述

直接输出内容，不要加任何前缀说明：`;

  const response = await fetch(`${apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "qwen-plus",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    console.error(`[AutomationService] Content generation API error: ${response.status}`);
    return "无法生成内容（API 错误）";
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || "无法生成内容";
}

// ============ 步骤记录 ============

async function recordStep(
  taskId: number,
  stepNumber: number,
  type: string,
  content: string,
  extra: Partial<{
    screenshotBase64: string;
    selector: string;
    inputText: string;
    durationMs: number;
    success: boolean;
    errorMessage: string;
  }> = {}
): Promise<void> {
  const db = await getDb();
  await db.insert(automationTaskSteps).values({
    taskId,
    stepNumber,
    type: type as any,
    content,
    ...extra,
  });
  
  // 通过 Socket.io 推送步骤
  emitAgentStep(taskId, type, content, stepNumber);
}

async function updateTaskProgress(taskId: number, progress: number, currentStep: string): Promise<void> {
  const db = await getDb();
  await db.update(automationTasks)
    .set({ progress, currentStep, updatedAt: new Date() })
    .where(eq(automationTasks.id, taskId));
  
  emitTaskProgress(taskId, progress, currentStep);
}

// ============ 主执行循环 ============

/**
 * 执行自动化任务 - 主入口
 */
export async function executeAutomationTask(taskId: number): Promise<void> {
  const db = await getDb();
  
  // 获取任务信息
  const [task] = await db.select().from(automationTasks).where(eq(automationTasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);
  
  // 获取站点账号
  const [account] = await db.select().from(siteAccounts).where(eq(siteAccounts.id, task.siteAccountId));
  if (!account) throw new Error(`Site account ${task.siteAccountId} not found`);
  
  console.log(`[AutomationService] Starting task ${taskId}: ${task.name}`);
  
  // 更新任务状态
  await db.update(automationTasks)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(automationTasks.id, taskId));
  emitTaskStatus(taskId, "running");
  
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let stepNumber = 0;
  
  try {
    // 启动浏览器
    browser = await getAutomationBrowser();
    context = await createStealthContext(browser, account.cookies || undefined);
    page = await context.newPage();
    
    // 注入反检测脚本
    await injectStealthScripts(page);
    
    // 注册页面引用，用于用户接管
    activeTaskPages.set(taskId, page);
    activeTaskContexts.set(taskId, context);
    
    // ===== 阶段 1：登录 =====
    stepNumber++;
    await recordStep(taskId, stepNumber, "thought", `准备登录 ${account.siteName}（${account.siteUrl}）`);
    await updateTaskProgress(taskId, 5, "正在登录...");
    
    // 导航到登录页
    stepNumber++;
    const loginUrl = account.loginUrl || `${account.siteUrl}/login`;
    console.log(`[AutomationService] Navigating to login URL: ${loginUrl}`);
    emitBrowserLoading(taskId, loginUrl);
    
    try {
      await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (navError: any) {
      console.warn(`[AutomationService] Navigation to login URL failed: ${navError.message}`);
      // 如果登录页无法访问，尝试直接访问站点首页
      try {
        await page.goto(account.siteUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      } catch (e2: any) {
        console.warn(`[AutomationService] Navigation to site URL also failed: ${e2.message}`);
      }
    }
    await waitAfterNavigation();
    
    let screenshot = await captureAndEmit(page, taskId, "登录页面");
    await recordStep(taskId, stepNumber, "navigate", `导航到登录页: ${loginUrl}`, { screenshotBase64: screenshot });
    emitBrowserNavigate(taskId, loginUrl);
    
    // 使用 Agent 完成登录
    const loginSuccess = await performLogin(page, account, taskId, stepNumber);
    stepNumber += 5; // 登录过程大约消耗 5 步
    
    if (!loginSuccess) {
      // 如果登录失败但不是致命错误，尝试继续执行（可能页面不需要登录）
      console.warn(`[AutomationService] Login may have failed, attempting to continue task anyway...`);
      await recordStep(taskId, ++stepNumber, "thought", "登录可能未成功，尝试继续执行任务...");
    } else {
      // 保存登录后的 cookies
      const cookies = await context.cookies();
      await db.update(siteAccounts)
        .set({
          cookies: JSON.stringify(cookies),
          lastLoginAt: new Date(),
          lastLoginSuccess: true,
          loginFailCount: 0,
        })
        .where(eq(siteAccounts.id, account.id));
      
      await recordStep(taskId, ++stepNumber, "login", "登录成功，已保存 Cookies");
    }
    
    await updateTaskProgress(taskId, 20, "开始执行任务...");
    
    // ===== 阶段 2：Agent 循环执行任务 =====
    const history: Array<{ role: string; content: string }> = [];
    const maxSteps = 50; // 最大步骤数，防止无限循环
    let taskCompleted = false;
    let consecutiveErrors = 0;
    
    while (stepNumber < maxSteps && !taskCompleted) {
      // 检查任务是否被取消/暂停
      const [currentTask] = await db.select().from(automationTasks).where(eq(automationTasks.id, taskId));
      if (currentTask?.status === "cancelled" || currentTask?.status === "paused") {
        console.log(`[AutomationService] Task ${taskId} ${currentTask.status}`);
        break;
      }
      
      // 连续错误过多则停止
      if (consecutiveErrors >= 5) {
        console.warn(`[AutomationService] Too many consecutive errors, stopping task ${taskId}`);
        await recordStep(taskId, ++stepNumber, "error", "连续错误过多，自动停止任务");
        break;
      }
      
      // 提取页面上下文
      // 如果用户正在接管，等待接管结束
      while (isInTakeoverMode(taskId)) {
        await new Promise(r => setTimeout(r, 1000));
        // 检查任务是否被取消
        const [currentTask] = await db.select().from(automationTasks).where(eq(automationTasks.id, taskId));
        if (!currentTask || currentTask.status === "cancelled") break;
      }
      
      const pageContext = await extractPageContext(page);
      
      // 截图
      screenshot = await captureAndEmit(page, taskId, `步骤 ${stepNumber}`);
      
      // Agent 决策
      stepNumber++;
      emitAgentThinking(taskId, `正在分析页面并决定下一步操作...`);
      
      const startTime = Date.now();
      let action: AgentAction;
      try {
        action = await agentDecide(task, pageContext, history, stepNumber);
        consecutiveErrors = 0; // 重置错误计数
      } catch (llmError: any) {
        console.error(`[AutomationService] LLM call failed:`, llmError.message);
        await recordStep(taskId, stepNumber, "error", `AI 决策失败: ${llmError.message}`);
        consecutiveErrors++;
        await mediumPause();
        continue;
      }
      const decisionTime = Date.now() - startTime;
      
      // 记录思考过程
      await recordStep(taskId, stepNumber, "thought", action.reasoning, { durationMs: decisionTime });
      emitAgentThinking(taskId, action.reasoning);
      
      // 添加到历史
      history.push({ role: "assistant", content: JSON.stringify(action) });
      
      // 执行操作
      stepNumber++;
      const actionStartTime = Date.now();
      
      try {
        switch (action.tool) {
          case "navigate": {
            const url = action.params.url;
            if (!url || typeof url !== "string") {
              throw new Error("navigate 需要有效的 URL 参数");
            }
            emitBrowserLoading(taskId, url);
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
            await waitAfterNavigation();
            screenshot = await captureAndEmit(page, taskId, `导航到 ${url}`);
            await recordStep(taskId, stepNumber, "navigate", `导航到: ${url}`, {
              screenshotBase64: screenshot, durationMs: Date.now() - actionStartTime,
            });
            emitBrowserNavigate(taskId, url);
            break;
          }
          
          case "click": {
            const selector = action.params.selector;
            if (!selector || typeof selector !== "string") {
              throw new Error("click 需要有效的 CSS 选择器字符串");
            }
            // 先检查元素是否存在，避免 30 秒超时
            const clickEl = await page.$(selector);
            if (!clickEl) {
              throw new Error(`元素不存在: ${selector}，请使用 click_text 或 click_index 代替`);
            }
            await humanClick(page, selector);
            await humanDelay(500, 1500);
            screenshot = await captureAndEmit(page, taskId, `点击 ${selector}`);
            await recordStep(taskId, stepNumber, "click", `点击元素: ${selector}`, {
              selector, screenshotBase64: screenshot, durationMs: Date.now() - actionStartTime,
            });
            break;
          }
          
          case "click_text": {
            const text = action.params.text;
            if (!text || typeof text !== "string") {
              throw new Error("click_text 需要有效的文本参数");
            }
            // 使用 Playwright 的文本定位功能
            const textLocator = page.getByRole('link', { name: text }).or(
              page.getByRole('button', { name: text })
            ).or(
              page.locator(`text="${text}"`)
            );
            const textEl = await textLocator.first();
            await textEl.scrollIntoViewIfNeeded();
            await humanDelay(200, 500);
            await textEl.click({ timeout: 10000 });
            await humanDelay(500, 1500);
            screenshot = await captureAndEmit(page, taskId, `点击文本 "${text}"`);
            await recordStep(taskId, stepNumber, "click", `点击文本: "${text}"`, {
              screenshotBase64: screenshot, durationMs: Date.now() - actionStartTime,
            });
            break;
          }
          
          case "click_index": {
            const idx = action.params.index;
            if (typeof idx !== "number" || idx < 0) {
              throw new Error("click_index 需要有效的索引号");
            }
            // 从上一次提取的元素列表中找到对应元素
            const targetEl = pageContext.interactiveElements.find(e => e.index === idx);
            if (!targetEl) {
              throw new Error(`索引 ${idx} 不存在于元素列表中`);
            }
            // 先检查元素是否存在
            const indexEl = await page.$(targetEl.selector);
            if (!indexEl) {
              throw new Error(`索引 ${idx} 对应的元素不存在: ${targetEl.selector}`);
            }
            await indexEl.scrollIntoViewIfNeeded();
            await humanDelay(200, 500);
            await indexEl.click();
            await humanDelay(500, 1500);
            screenshot = await captureAndEmit(page, taskId, `点击元素 [${idx}] ${targetEl.text}`);
            await recordStep(taskId, stepNumber, "click", `点击元素 [${idx}]: ${targetEl.text} (${targetEl.selector})`, {
              selector: targetEl.selector, screenshotBase64: screenshot, durationMs: Date.now() - actionStartTime,
            });
            break;
          }
          
          case "type": {
            const { selector, text } = action.params;
            if (!selector || typeof selector !== "string") {
              throw new Error("type 需要有效的 CSS 选择器字符串");
            }
            if (!text || typeof text !== "string") {
              throw new Error("type 需要有效的文本内容");
            }
            await humanType(page, selector, text);
            screenshot = await captureAndEmit(page, taskId, `输入文字`);
            await recordStep(taskId, stepNumber, "input", `输入文字到 ${selector}: "${text.substring(0, 50)}..."`, {
              selector, inputText: text, screenshotBase64: screenshot, durationMs: Date.now() - actionStartTime,
            });
            break;
          }
          
          case "scroll": {
            const direction = action.params.direction || "down";
            const distance = action.params.distance || 500;
            await humanScroll(page, direction === "down" ? distance : -distance);
            screenshot = await captureAndEmit(page, taskId, `滚动 ${direction}`);
            await recordStep(taskId, stepNumber, "scroll", `滚动页面 ${direction} ${distance}px`, {
              screenshotBase64: screenshot, durationMs: Date.now() - actionStartTime,
            });
            break;
          }
          
          case "wait": {
            const seconds = action.params.seconds || 2;
            await humanDelay(seconds * 1000, seconds * 1000 + 1000);
            await recordStep(taskId, stepNumber, "wait", `等待 ${seconds} 秒`, {
              durationMs: Date.now() - actionStartTime,
            });
            break;
          }
          
          case "screenshot": {
            screenshot = await captureAndEmit(page, taskId, "手动截图");
            await recordStep(taskId, stepNumber, "screenshot", "截取页面截图", {
              screenshotBase64: screenshot, durationMs: Date.now() - actionStartTime,
            });
            break;
          }
          
          case "captcha": {
            const { imageSelector, inputSelector } = action.params;
            if (!imageSelector || !inputSelector) {
              throw new Error("captcha 需要 imageSelector 和 inputSelector 参数");
            }
            emitAgentThinking(taskId, "正在识别验证码...");
            const captchaResult = await handleTextCaptcha(page, imageSelector, inputSelector);
            screenshot = await captureAndEmit(page, taskId, "验证码处理");
            await recordStep(taskId, stepNumber, "captcha", 
              captchaResult ? "验证码识别并填入成功" : "验证码识别失败", {
              screenshotBase64: screenshot, success: captchaResult, durationMs: Date.now() - actionStartTime,
            });
            break;
          }
          
          case "generate_content": {
            const { topic, type: contentType } = action.params;
            emitAgentThinking(taskId, `正在生成${contentType === "post" ? "帖子" : "回复"}内容...`);
            const generatedText = await generateContent(topic, contentType, task.contentStyle || undefined);
            
            // 记录生成的内容
            await db.insert(automationContents).values({
              taskId,
              siteAccountId: account.id,
              contentType: contentType as any,
              content: generatedText,
              aiPrompt: topic,
              publishStatus: "draft",
            });
            
            await recordStep(taskId, stepNumber, "ai_generate", 
              `AI 生成内容: "${generatedText.substring(0, 100)}..."`, {
              inputText: generatedText, durationMs: Date.now() - actionStartTime,
            });
            
            // 将生成的内容添加到历史，供下一步使用
            history.push({ role: "user", content: `[系统] AI 已生成内容:\n${generatedText}\n\n请将此内容填入对应的输入框。` });
            break;
          }
          
          case "submit": {
            // 查找并点击提交按钮
            const submitSelectors = [
              'button[type="submit"]', 'input[type="submit"]',
              'button:has-text("提交")', 'button:has-text("发布")',
              'button:has-text("回复")', 'button:has-text("发表")',
            ];
            let submitted = false;
            for (const sel of submitSelectors) {
              try {
                const btn = await page.$(sel);
                if (btn) {
                  await humanClick(page, sel);
                  submitted = true;
                  break;
                }
              } catch (e) { /* try next */ }
            }
            await humanDelay(2000, 4000);
            screenshot = await captureAndEmit(page, taskId, "提交表单");
            await recordStep(taskId, stepNumber, "post", 
              submitted ? "表单已提交" : "未找到提交按钮", {
              screenshotBase64: screenshot, success: submitted, durationMs: Date.now() - actionStartTime,
            });
            break;
          }
          
          case "done": {
            taskCompleted = true;
            const summary = action.params.summary || "任务完成";
            await recordStep(taskId, stepNumber, "complete", summary, {
              durationMs: Date.now() - actionStartTime,
            });
            break;
          }
          
          default: {
            await recordStep(taskId, stepNumber, "error", `未知工具: ${action.tool}`, {
              success: false, errorMessage: `Unknown tool: ${action.tool}`,
            });
          }
        }
      } catch (actionError: any) {
        console.error(`[AutomationService] Action error at step ${stepNumber}:`, actionError.message);
        screenshot = await captureAndEmit(page, taskId, "操作出错");
        await recordStep(taskId, stepNumber, "error", `操作失败: ${actionError.message}`, {
          screenshotBase64: screenshot, success: false, errorMessage: actionError.message,
          durationMs: Date.now() - actionStartTime,
        });
        
        // 添加错误信息到历史，让 Agent 知道并调整策略
        history.push({ role: "user", content: `[系统错误] 上一步操作失败: ${actionError.message}。请尝试其他方法。` });
        consecutiveErrors++;
      }
      
      // 更新进度
      const progress = Math.min(20 + Math.floor((stepNumber / maxSteps) * 70), 95);
      await updateTaskProgress(taskId, progress, action.reasoning.substring(0, 100));
      
      // 操作间的随机延迟（类人行为）
      await mediumPause();
    }
    
    // ===== 阶段 3：完成任务 =====
    const finalScreenshot = await captureAndEmit(page, taskId, "任务完成");
    
    // 生成任务摘要
    const resultSummary = JSON.stringify({
      totalSteps: stepNumber,
      completed: taskCompleted,
      finalUrl: page.url(),
      finalTitle: await page.title(),
    });
    
    await db.update(automationTasks)
      .set({
        status: taskCompleted ? "completed" : "failed",
        progress: taskCompleted ? 100 : 95,
        completedActions: stepNumber,
        totalActions: stepNumber,
        resultSummary,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(automationTasks.id, taskId));
    
    activeTaskPages.delete(taskId);
    activeTaskContexts.delete(taskId);
    takeoverMode.delete(taskId);
    emitTaskStatus(taskId, taskCompleted ? "completed" : "failed");
    emitTaskProgress(taskId, 100, taskCompleted ? "任务完成" : "任务未完全完成");
    
    console.log(`[AutomationService] Task ${taskId} ${taskCompleted ? "completed" : "ended"} after ${stepNumber} steps`);
    
  } catch (error: any) {
    console.error(`[AutomationService] Task ${taskId} failed:`, error.message);
    
    // 更新任务状态为失败
    await db.update(automationTasks)
      .set({
        status: "failed",
        errorMessage: error.message,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(automationTasks.id, taskId));
    
    emitTaskStatus(taskId, "failed");
    
    // 更新账号状态（仅在明确登录失败时）
    if (error.message.includes("登录失败") && error.message.includes("账号密码")) {
      await db.update(siteAccounts)
        .set({
          lastLoginSuccess: false,
          loginFailCount: sql`loginFailCount + 1`,
          status: "login_failed",
        })
        .where(eq(siteAccounts.id, task.siteAccountId));
    }
  } finally {
    // 清理资源
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}

// ============ 登录流程 ============

/**
 * 使用 Agent 自动完成登录
 * 优先使用已知站点配置，否则使用 LLM 分析
 */
async function performLogin(
  page: Page,
  account: SiteAccount,
  taskId: number,
  startStep: number
): Promise<boolean> {
  let step = startStep;
  
  // 检查是否有已知站点配置
  const knownConfig = findKnownSiteConfig(account.siteUrl || account.loginUrl);
  
  let usernameSelector: string;
  let passwordSelector: string;
  let submitSelector: string;
  let captchaImageSel: string | null = null;
  let captchaInputSel: string | null = null;
  
  if (knownConfig) {
    console.log(`[AutomationService] Using known site config for ${account.siteUrl}`);
    usernameSelector = knownConfig.usernameSelector;
    passwordSelector = knownConfig.passwordSelector;
    submitSelector = knownConfig.submitSelector;
    captchaImageSel = knownConfig.captchaImageSelector;
    captchaInputSel = knownConfig.captchaInputSelector;
    
    step++;
    await recordStep(taskId, step, "thought", 
      `使用已知站点配置：用户名=${usernameSelector}, 密码=${passwordSelector}, 验证码图片=${captchaImageSel || '无'}`);
  } else {
    // 使用 LLM 分析登录页面
    console.log(`[AutomationService] No known config, using LLM to analyze login page`);
    
    const pageContext = await extractPageContext(page);
    
    if (pageContext.interactiveElements.length === 0) {
      console.warn("[AutomationService] No interactive elements found on login page");
      await recordStep(taskId, ++step, "thought", "登录页面没有可交互元素");
      return false;
    }
    
    const hasInputs = pageContext.interactiveElements.some(el => 
      el.tag === "input" && (el.type === "text" || el.type === "password" || el.type === "email" || !el.type)
    );
    
    if (!hasInputs) {
      console.warn("[AutomationService] No input fields found on login page");
      await recordStep(taskId, ++step, "thought", "页面没有输入框");
      return false;
    }
    
    const apiKey = ENV.forgeApiKey || process.env.OPENAI_API_KEY || "";
    const apiUrl = getLlmApiUrl();
    
    const analysisPrompt = `分析这个登录页面，找出用户名输入框、密码输入框和登录按钮的 CSS 选择器。

页面 URL: ${pageContext.url}
页面标题: ${pageContext.title}

页面可见文本（前500字）：
${pageContext.visibleText.substring(0, 500)}

可交互元素：
${pageContext.interactiveElements.map(el => 
  `[${el.index}] <${el.tag}${el.type ? ` type="${el.type}"` : ""}${el.placeholder ? ` placeholder="${el.placeholder}"` : ""}> ${el.text} \u2192 "${el.selector}"`
).join("\n")}

请以 JSON 格式回答：
{
  "usernameSelector": "用户名输入框的CSS选择器",
  "passwordSelector": "密码输入框的CSS选择器",
  "submitSelector": "登录按钮的CSS选择器",
  "captchaImageSelector": "验证码图片CSS选择器或null",
  "captchaInputSelector": "验证码输入框CSS选择器或null",
  "isLoginPage": true
}`;

    let loginFields: any;
    try {
      console.log(`[AutomationService] Analyzing login page with LLM...`);
      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "qwen-plus",
          messages: [{ role: "user", content: analysisPrompt }],
          max_tokens: 500,
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });
      
      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error(`[AutomationService] Login analysis API error: ${response.status} ${errText}`);
        return false;
      }
      
      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content || "{}";
      console.log(`[AutomationService] Login analysis result: ${content}`);
      loginFields = JSON.parse(content);
    } catch (e: any) {
      console.error("[AutomationService] Failed to analyze login page:", e.message);
      return false;
    }
    
    if (loginFields.isLoginPage === false) {
      console.warn("[AutomationService] LLM determined this is not a login page");
      await recordStep(taskId, ++step, "thought", "AI 分析认为这不是登录页面");
      return false;
    }
    
    usernameSelector = loginFields.usernameSelector;
    passwordSelector = loginFields.passwordSelector;
    submitSelector = loginFields.submitSelector;
    captchaImageSel = loginFields.captchaImageSelector;
    captchaInputSel = loginFields.captchaInputSelector;
    
    if (!usernameSelector || typeof usernameSelector !== "string" || 
        !passwordSelector || typeof passwordSelector !== "string" || 
        !submitSelector || typeof submitSelector !== "string") {
      console.warn("[AutomationService] Invalid selectors from LLM:", JSON.stringify(loginFields));
      await recordStep(taskId, ++step, "thought", 
        `无法识别登录表单元素：用户名=${usernameSelector}, 密码=${passwordSelector}, 按钮=${submitSelector}`);
      return false;
    }
    
    step++;
    await recordStep(taskId, step, "thought", 
      `分析登录页面：用户名框=${usernameSelector}, 密码框=${passwordSelector}, 登录按钮=${submitSelector}`);
  }
  
  try {
    // 验证选择器是否存在于页面上
    const usernameEl = await page.$(usernameSelector);
    const passwordEl = await page.$(passwordSelector);
    const submitEl = await page.$(submitSelector);
    
    if (!usernameEl) {
      console.warn(`[AutomationService] Username selector not found: ${usernameSelector}`);
      await recordStep(taskId, ++step, "error", `用户名输入框未找到: ${usernameSelector}`);
      return false;
    }
    if (!passwordEl) {
      console.warn(`[AutomationService] Password selector not found: ${passwordSelector}`);
      await recordStep(taskId, ++step, "error", `密码输入框未找到: ${passwordSelector}`);
      return false;
    }
    if (!submitEl) {
      console.warn(`[AutomationService] Submit selector not found: ${submitSelector}`);
      await recordStep(taskId, ++step, "error", `登录按钮未找到: ${submitSelector}`);
      return false;
    }
    
    console.log(`[AutomationService] All login selectors verified on page`);
    
    // 输入用户名
    step++;
    console.log(`[AutomationService] Typing username: ${account.username}`);
    await humanType(page, usernameSelector, account.username);
    await recordStep(taskId, step, "input", `输入用户名: ${account.username}`, {
      selector: usernameSelector,
    });
    
    // 输入密码
    step++;
    console.log(`[AutomationService] Typing password...`);
    await quickFill(page, passwordSelector, account.password);
    await recordStep(taskId, step, "input", "输入密码: ****", {
      selector: passwordSelector,
    });
    
    // 处理验证码
    // 如果没有验证码图片选择器但有输入框，自动查找
    if (!captchaImageSel && captchaInputSel && typeof captchaInputSel === "string") {
      console.log("[AutomationService] captchaImageSelector is null, trying to auto-detect...");
      const commonCaptchaSelectors = [
        'img#cap',
        'img[src*="captcha"]',
        'img.captcha',
        'img.login-captcha-image',
        '.captcha img',
        '.captcha-image',
        'img[alt*="captcha"]',
        'img[alt*="验证码"]',
      ];
      for (const sel of commonCaptchaSelectors) {
        const el = await page.$(sel);
        if (el) {
          captchaImageSel = sel;
          console.log("[AutomationService] Auto-detected captcha image selector:", sel);
          break;
        }
      }
    }
    
    if (captchaImageSel && captchaInputSel &&
        typeof captchaImageSel === "string" && 
        typeof captchaInputSel === "string") {
      
      // 验证验证码元素是否存在
      const captchaImgEl = await page.$(captchaImageSel);
      const captchaInputEl = await page.$(captchaInputSel);
      
      if (!captchaImgEl) {
        console.warn(`[AutomationService] Captcha image not found: ${captchaImageSel}`);
        await recordStep(taskId, ++step, "error", `验证码图片未找到: ${captchaImageSel}`);
      } else if (!captchaInputEl) {
        console.warn(`[AutomationService] Captcha input not found: ${captchaInputSel}`);
        await recordStep(taskId, ++step, "error", `验证码输入框未找到: ${captchaInputSel}`);
      } else {
        step++;
        console.log(`[AutomationService] Processing captcha: image=${captchaImageSel}, input=${captchaInputSel}`);
        emitAgentThinking(taskId, "正在识别验证码...");
        
        const captchaOk = await handleTextCaptcha(page, captchaImageSel, captchaInputSel);
        const screenshot = await captureAndEmit(page, taskId, "验证码处理");
        await recordStep(taskId, step, "captcha", captchaOk ? "验证码已填入" : "验证码识别失败", {
          screenshotBase64: screenshot, success: captchaOk,
        });
        
        console.log(`[AutomationService] Captcha recognition result: ${captchaOk ? 'SUCCESS' : 'FAILED'}`);
        
        // 如果验证码识别失败，尝试刷新并重试
        if (!captchaOk) {
          console.log("[AutomationService] Captcha failed, trying to refresh and retry...");
          const refreshSelectors = [
            'a.login-captcha-refresh', '.captcha-refresh',
            'a[onclick*="captcha"]', '.refresh-captcha',
            captchaImageSel, // 点击验证码图片本身通常也能刷新
          ];
          for (const sel of refreshSelectors) {
            try {
              const refreshEl = await page.$(sel);
              if (refreshEl) {
                await refreshEl.click();
                console.log(`[AutomationService] Clicked refresh: ${sel}`);
                await new Promise(r => setTimeout(r, 2000));
                break;
              }
            } catch (e) { /* try next */ }
          }
          step++;
          emitAgentThinking(taskId, "重新识别验证码...");
          const retryOk = await handleTextCaptcha(page, captchaImageSel, captchaInputSel);
          const retryScreenshot = await captureAndEmit(page, taskId, "验证码重试");
          await recordStep(taskId, step, "captcha", retryOk ? "验证码重试成功" : "验证码重试仍失败", {
            screenshotBase64: retryScreenshot, success: retryOk,
          });
          console.log(`[AutomationService] Captcha retry result: ${retryOk ? 'SUCCESS' : 'FAILED'}`);
        }
      }
    } else {
      console.log("[AutomationService] No captcha detected on login page");
    }
    
    // 点击登录
    step++;
    console.log(`[AutomationService] Clicking login button: ${submitSelector}`);
    await humanClick(page, submitSelector);
    await humanDelay(3000, 5000);
    
    const screenshot = await captureAndEmit(page, taskId, "登录后页面");
    await recordStep(taskId, step, "login", "点击登录按钮", { screenshotBase64: screenshot });
    
    // 检查是否登录成功
    const currentUrl = page.url();
    console.log(`[AutomationService] After login, current URL: ${currentUrl}`);
    
    const hasLogout = await page.$('a:has-text("退出"), a:has-text("登出"), a:has-text("注销"), a:has-text("Logout"), a:has-text("Sign out")');
    
    if (currentUrl !== account.loginUrl || hasLogout) {
      console.log(`[AutomationService] Login appears successful`);
      return true;
    }
    
    const errorText = await page.evaluate(() => {
      const errorEls = document.querySelectorAll('.error, .alert-danger, .msg-error, [class*="error"]');
      return Array.from(errorEls).map(el => el.textContent?.trim()).filter(Boolean).join("; ");
    });
    
    if (errorText) {
      console.warn(`[AutomationService] Login error: ${errorText}`);
      return false;
    }
    
    return true;
    
  } catch (error: any) {
    console.error(`[AutomationService] Login failed:`, error.message);
    return false;
  }
}

// ============ 任务控制 ============

/**
 * 暂停任务
 */
export async function pauseAutomationTask(taskId: number): Promise<void> {
  const db = await getDb();
  await db.update(automationTasks)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(automationTasks.id, taskId));
  emitTaskStatus(taskId, "paused");
}

/**
 * 取消任务
 */
export async function cancelAutomationTask(taskId: number): Promise<void> {
  const db = await getDb();
  await db.update(automationTasks)
    .set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(automationTasks.id, taskId));
  emitTaskStatus(taskId, "cancelled");
}

/**
 * 关闭浏览器实例
 */
export async function closeAutomationBrowser(): Promise<void> {
  if (automationBrowser) {
    await automationBrowser.close().catch(() => {});
    automationBrowser = null;
  }
  activeTaskPages.clear();
  takeoverMode.clear();
}

/**
 * 用户接管模式 - 启用/禁用
 */
export async function enableTakeover(taskId: number): Promise<boolean> {
  const page = activeTaskPages.get(taskId);
  if (!page) return false;
  
  takeoverMode.set(taskId, true);
  emitTakeoverStatus(taskId, true, "用户已接管浏览器控制");
  
  // 发送当前页面截图
  try {
    const buffer = await page.screenshot({ type: "jpeg", quality: 70 }) as Buffer;
    const base64 = `data:image/jpeg;base64,${buffer.toString("base64")}`;
    emitBrowserScreenshot(taskId, base64, page.url());
  } catch (e) {}
  
  return true;
}

export async function disableTakeover(taskId: number): Promise<void> {
  takeoverMode.set(taskId, false);
  emitTakeoverStatus(taskId, false, "已退出接管模式，恢复自动化");
}

export function isInTakeoverMode(taskId: number): boolean {
  return takeoverMode.get(taskId) === true;
}

/**
 * 处理用户接管操作
 */
export async function handleTakeoverAction(taskId: number, action: string, payload: any): Promise<void> {
  const page = activeTaskPages.get(taskId);
  if (!page) throw new Error("任务页面不存在或已关闭");
  
  console.log(`[AutomationService] Takeover action: ${action}`, payload);
  
  try {
    switch (action) {
      case "click": {
        const { x, y } = payload;
        await page.mouse.click(x, y);
        break;
      }
      case "type": {
        const { text } = payload;
        await page.keyboard.type(text, { delay: 50 });
        break;
      }
      case "press": {
        const { key } = payload;
        await page.keyboard.press(key);
        break;
      }
      case "navigate": {
        const { url } = payload;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        break;
      }
      case "fill": {
        const { selector, value } = payload;
        await page.fill(selector, value);
        break;
      }
      case "scroll": {
        const { deltaX, deltaY } = payload;
        await page.mouse.wheel(deltaX || 0, deltaY || 0);
        break;
      }
      case "screenshot": {
        // Just take a screenshot and send it
        break;
      }
      default:
        throw new Error(`未知操作: ${action}`);
    }
    
    // 操作后截图并推送
    await new Promise(r => setTimeout(r, 500));
    const buffer = await page.screenshot({ type: "jpeg", quality: 70 }) as Buffer;
    const base64 = `data:image/jpeg;base64,${buffer.toString("base64")}`;
    emitBrowserScreenshot(taskId, base64, page.url());
    
  } catch (err: any) {
    console.error(`[AutomationService] Takeover action error:`, err.message);
    throw err;
  }
}
