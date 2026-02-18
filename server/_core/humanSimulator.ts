/**
 * 类人行为模拟器
 * 
 * 模拟真实人类用户的操作频率和行为模式，防止被论坛反爬系统封禁。
 * 包括：随机延迟、模拟打字、鼠标轨迹、页面滚动等。
 */
import type { Page } from "playwright";

// ============ 随机数工具 ============

/** 生成 [min, max] 之间的随机整数 */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 生成 [min, max] 之间的随机浮点数 */
function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** 高斯分布随机数（Box-Muller 变换） */
function gaussRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stddev + mean;
}

// ============ 延迟模拟 ============

/** 随机等待（模拟人类反应时间） */
export async function humanDelay(minMs: number = 500, maxMs: number = 2000): Promise<void> {
  const delay = randInt(minMs, maxMs);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/** 短暂停顿（如点击后的反应） */
export async function shortPause(): Promise<void> {
  await humanDelay(200, 800);
}

/** 中等停顿（如阅读一段文字） */
export async function mediumPause(): Promise<void> {
  await humanDelay(1000, 3000);
}

/** 长停顿（如阅读一篇文章） */
export async function longPause(): Promise<void> {
  await humanDelay(3000, 8000);
}

/** 页面加载后的等待（模拟人类等待页面加载完成后再操作） */
export async function waitAfterNavigation(): Promise<void> {
  await humanDelay(1500, 4000);
}

// ============ 打字模拟 ============

/**
 * 模拟人类打字 - 逐字符输入，带随机延迟
 * 
 * 特点：
 * - 每个字符之间有随机延迟（50-200ms）
 * - 偶尔会有较长的停顿（模拟思考）
 * - 中文字符输入稍慢
 */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  // 先点击目标输入框
  await page.click(selector);
  await shortPause();
  
  // 清空现有内容
  await page.fill(selector, "");
  await humanDelay(100, 300);
  
  // 逐字符输入
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // 基础延迟：英文字符快，中文字符慢
    const isAscii = char.charCodeAt(0) < 128;
    const baseDelay = isAscii ? randInt(50, 150) : randInt(100, 250);
    
    // 偶尔有较长停顿（5% 概率）
    const thinkPause = Math.random() < 0.05 ? randInt(500, 1500) : 0;
    
    await new Promise(resolve => setTimeout(resolve, baseDelay + thinkPause));
    await page.type(selector, char, { delay: 0 });
  }
}

/**
 * 快速填入文本（用于不需要模拟打字的场景，如密码框）
 * 但仍带有少量延迟
 */
export async function quickFill(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  await humanDelay(100, 300);
  await page.fill(selector, text);
  await shortPause();
}

// ============ 鼠标行为模拟 ============

/**
 * 模拟人类鼠标移动到元素 - 带随机偏移
 */
export async function humanMoveTo(page: Page, selector: string): Promise<void> {
  const element = await page.$(selector);
  if (!element) return;
  
  const box = await element.boundingBox();
  if (!box) return;
  
  // 在元素范围内随机选择一个点（不总是正中心）
  const x = box.x + box.width * randFloat(0.2, 0.8);
  const y = box.y + box.height * randFloat(0.2, 0.8);
  
  // 移动鼠标（Playwright 会自动生成平滑轨迹）
  await page.mouse.move(x, y, { steps: randInt(5, 15) });
  await humanDelay(100, 300);
}

/**
 * 模拟人类点击 - 先移动到元素，再点击
 */
export async function humanClick(page: Page, selector: string): Promise<void> {
  await humanMoveTo(page, selector);
  await humanDelay(50, 200);
  await page.click(selector);
  await shortPause();
}

// ============ 滚动模拟 ============

/**
 * 模拟人类滚动阅读 - 逐步滚动，带随机停顿
 */
export async function humanScroll(page: Page, distance: number = 800): Promise<void> {
  const steps = randInt(3, 8);
  const stepDistance = distance / steps;
  
  for (let i = 0; i < steps; i++) {
    const scrollAmount = stepDistance * randFloat(0.7, 1.3);
    await page.mouse.wheel(0, scrollAmount);
    
    // 每次滚动后随机停顿（模拟阅读）
    const readTime = randInt(300, 1500);
    await new Promise(resolve => setTimeout(resolve, readTime));
  }
}

/**
 * 滚动到页面底部（模拟浏览整个页面）
 */
export async function scrollToBottom(page: Page): Promise<void> {
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  const totalScroll = scrollHeight - viewportHeight;
  
  if (totalScroll > 0) {
    await humanScroll(page, totalScroll);
  }
}

// ============ 浏览器指纹伪装 ============

/**
 * 设置浏览器上下文的反检测参数
 */
export function getStealthContextOptions() {
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
  ];
  
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  ];
  
  const locales = ["zh-CN", "en-US", "zh-TW"];
  const timezones = ["Asia/Shanghai", "Asia/Hong_Kong", "America/New_York"];
  
  const viewport = viewports[randInt(0, viewports.length - 1)];
  
  return {
    viewport,
    userAgent: userAgents[randInt(0, userAgents.length - 1)],
    locale: locales[randInt(0, locales.length - 1)],
    timezoneId: timezones[randInt(0, timezones.length - 1)],
    // 隐藏自动化标志
    javaScriptEnabled: true,
    bypassCSP: true,
    ignoreHTTPSErrors: true,
  };
}

/**
 * 注入反检测脚本到页面
 */
export async function injectStealthScripts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // 隐藏 webdriver 标志
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    
    // 伪装 plugins
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    
    // 伪装 languages
    Object.defineProperty(navigator, "languages", {
      get: () => ["zh-CN", "zh", "en-US", "en"],
    });
    
    // 伪装 chrome 对象
    (window as any).chrome = {
      runtime: {},
      loadTimes: function () { },
      csi: function () { },
      app: {},
    };
    
    // 修改 permissions query
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);
  });
}

// ============ 综合行为模式 ============

/**
 * 模拟人类浏览页面的完整行为
 * - 等待页面加载
 * - 随机滚动阅读
 * - 偶尔移动鼠标
 */
export async function simulateBrowsing(page: Page, durationMs: number = 5000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < durationMs) {
    const action = Math.random();
    
    if (action < 0.4) {
      // 40% 概率：滚动
      await humanScroll(page, randInt(200, 600));
    } else if (action < 0.7) {
      // 30% 概率：随机移动鼠标
      const x = randInt(100, 1200);
      const y = randInt(100, 700);
      await page.mouse.move(x, y, { steps: randInt(3, 10) });
      await humanDelay(200, 800);
    } else {
      // 30% 概率：停顿阅读
      await humanDelay(1000, 3000);
    }
  }
}
