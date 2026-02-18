/**
 * 网站全自动交互沙箱 - API 路由
 * 
 * 提供站点账号管理、自动化任务管理、任务执行控制等 API
 */
import { Router, Request, Response, NextFunction } from "express";
import { getDb } from "../db";
import {
  siteAccounts, automationTasks, automationTaskSteps, automationContents,
  type InsertSiteAccount, type InsertAutomationTask,
} from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { COOKIE_NAME } from "../../shared/const";
import { sdk } from "./sdk";
import { executeAutomationTask, pauseAutomationTask, cancelAutomationTask, enableTakeover, disableTakeover } from "./automationService";

const router = Router();

// ============ 认证中间件（复用 SDK 认证，与 sshRouter 一致）============

async function getUserFromRequest(req: Request): Promise<any> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const user = await sdk.authenticateRequest({ headers: { authorization: authHeader } } as any);
      if (user) return user;
    } catch (error) {
      // Token auth failed
    }
  }
  const cookieToken = (req as any).cookies?.[COOKIE_NAME];
  if (cookieToken) {
    try {
      const user = await sdk.authenticateRequest({ headers: { cookie: `${COOKIE_NAME}=${cookieToken}` } } as any);
      if (user) return user;
    } catch (error) {
      // Cookie auth failed
    }
  }
  return null;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "未登录" });
  }
  (req as any).userId = user.id || user.openId || 1;
  next();
}

// ============ 站点账号管理 ============

/** 获取所有站点账号 */
router.get("/accounts", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = (req as any).userId;
    const accounts = await db.select({
      id: siteAccounts.id,
      siteName: siteAccounts.siteName,
      siteUrl: siteAccounts.siteUrl,
      loginUrl: siteAccounts.loginUrl,
      username: siteAccounts.username,
      status: siteAccounts.status,
      lastLoginAt: siteAccounts.lastLoginAt,
      lastLoginSuccess: siteAccounts.lastLoginSuccess,
      loginFailCount: siteAccounts.loginFailCount,
      notes: siteAccounts.notes,
      createdAt: siteAccounts.createdAt,
    })
    .from(siteAccounts)
    .where(eq(siteAccounts.userId, userId))
    .orderBy(desc(siteAccounts.updatedAt));
    
    res.json({ accounts });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** 添加站点账号 */
router.post("/accounts", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = (req as any).userId;
    const { siteName, siteUrl, loginUrl, username, password, notes } = req.body;
    
    if (!siteName || !siteUrl || !loginUrl || !username || !password) {
      return res.status(400).json({ error: "缺少必填字段" });
    }
    
    const result = await db.insert(siteAccounts).values({
      userId,
      siteName,
      siteUrl,
      loginUrl,
      username,
      password, // TODO: 加密存储
      notes: notes || null,
    });
    
    res.json({ success: true, id: (result as any)[0]?.insertId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** 更新站点账号 */
router.put("/accounts/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = (req as any).userId;
    const accountId = parseInt(req.params.id);
    const { siteName, siteUrl, loginUrl, username, password, notes, status } = req.body;
    
    const updateData: Record<string, any> = {};
    if (siteName) updateData.siteName = siteName;
    if (siteUrl) updateData.siteUrl = siteUrl;
    if (loginUrl) updateData.loginUrl = loginUrl;
    if (username) updateData.username = username;
    if (password) updateData.password = password;
    if (notes !== undefined) updateData.notes = notes;
    if (status) updateData.status = status;
    
    await db.update(siteAccounts)
      .set(updateData)
      .where(and(eq(siteAccounts.id, accountId), eq(siteAccounts.userId, userId)));
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** 删除站点账号 */
router.delete("/accounts/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = (req as any).userId;
    const accountId = parseInt(req.params.id);
    
    await db.delete(siteAccounts)
      .where(and(eq(siteAccounts.id, accountId), eq(siteAccounts.userId, userId)));
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 自动化任务管理 ============

/** 获取所有任务 */
router.get("/tasks", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = (req as any).userId;
    const tasks = await db.select()
      .from(automationTasks)
      .where(eq(automationTasks.userId, userId))
      .orderBy(desc(automationTasks.createdAt));
    
    res.json({ tasks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** 获取单个任务详情（含步骤） */
router.get("/tasks/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = (req as any).userId;
    const taskId = parseInt(req.params.id);
    
    const [task] = await db.select()
      .from(automationTasks)
      .where(and(eq(automationTasks.id, taskId), eq(automationTasks.userId, userId)));
    
    if (!task) {
      return res.status(404).json({ error: "任务不存在" });
    }
    
    // 获取任务步骤（不含大的 base64 截图）
    const steps = await db.select({
      id: automationTaskSteps.id,
      stepNumber: automationTaskSteps.stepNumber,
      type: automationTaskSteps.type,
      content: automationTaskSteps.content,
      screenshotUrl: automationTaskSteps.screenshotUrl,
      selector: automationTaskSteps.selector,
      inputText: automationTaskSteps.inputText,
      durationMs: automationTaskSteps.durationMs,
      success: automationTaskSteps.success,
      errorMessage: automationTaskSteps.errorMessage,
      createdAt: automationTaskSteps.createdAt,
    })
    .from(automationTaskSteps)
    .where(eq(automationTaskSteps.taskId, taskId))
    .orderBy(automationTaskSteps.stepNumber);
    
    // 获取生成的内容
    const contents = await db.select()
      .from(automationContents)
      .where(eq(automationContents.taskId, taskId));
    
    // 获取关联的站点账号信息
    const [account] = await db.select({
      id: siteAccounts.id,
      siteName: siteAccounts.siteName,
      siteUrl: siteAccounts.siteUrl,
      username: siteAccounts.username,
    })
    .from(siteAccounts)
    .where(eq(siteAccounts.id, task.siteAccountId));
    
    res.json({ task, steps, contents, account });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** 获取任务步骤的截图 */
router.get("/tasks/:taskId/steps/:stepId/screenshot", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const stepId = parseInt(req.params.stepId);
    
    const [step] = await db.select({
      screenshotBase64: automationTaskSteps.screenshotBase64,
    })
    .from(automationTaskSteps)
    .where(eq(automationTaskSteps.id, stepId));
    
    if (!step?.screenshotBase64) {
      return res.status(404).json({ error: "截图不存在" });
    }
    
    res.json({ screenshot: `data:image/jpeg;base64,${step.screenshotBase64}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** 创建新任务 */
router.post("/tasks", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = (req as any).userId;
    const {
      siteAccountId, taskType, name, instruction,
      targetUrls, searchKeywords, contentStyle, modelUsed,
    } = req.body;
    
    if (!siteAccountId || !name || !instruction) {
      return res.status(400).json({ error: "缺少必填字段" });
    }
    
    // 验证站点账号存在
    const [account] = await db.select()
      .from(siteAccounts)
      .where(and(eq(siteAccounts.id, siteAccountId), eq(siteAccounts.userId, userId)));
    
    if (!account) {
      return res.status(404).json({ error: "站点账号不存在" });
    }
    
    const result = await db.insert(automationTasks).values({
      userId,
      siteAccountId,
      taskType: taskType || "custom",
      name,
      instruction,
      targetUrls: targetUrls ? JSON.stringify(targetUrls) : null,
      searchKeywords: searchKeywords ? JSON.stringify(searchKeywords) : null,
      contentStyle: contentStyle || null,
      modelUsed: modelUsed || "gpt-4.1-mini",
    });
    
    const taskId = (result as any)[0]?.insertId;
    res.json({ success: true, taskId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** 启动任务执行 */
router.post("/tasks/:id/start", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = (req as any).userId;
    const taskId = parseInt(req.params.id);
    
    const [task] = await db.select()
      .from(automationTasks)
      .where(and(eq(automationTasks.id, taskId), eq(automationTasks.userId, userId)));
    
    if (!task) {
      return res.status(404).json({ error: "任务不存在" });
    }
    
    if (task.status === "running") {
      return res.status(400).json({ error: "任务已在运行中" });
    }
    
    // 异步启动任务（不阻塞响应）
    res.json({ success: true, message: "任务已启动" });
    
    // 在后台执行
    executeAutomationTask(taskId).catch(err => {
      console.error(`[AutomationRouter] Task ${taskId} execution error:`, err.message);
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** 暂停任务 */
router.post("/tasks/:id/pause", requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    await pauseAutomationTask(taskId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** 取消任务 */
router.post("/tasks/:id/cancel", requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    await cancelAutomationTask(taskId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/** 删除任务 */
router.delete("/tasks/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = (req as any).userId;
    const taskId = parseInt(req.params.id);
    
    // 先删除关联数据
    await db.delete(automationTaskSteps).where(eq(automationTaskSteps.taskId, taskId));
    await db.delete(automationContents).where(eq(automationContents.taskId, taskId));
    await db.delete(automationTasks)
      .where(and(eq(automationTasks.id, taskId), eq(automationTasks.userId, userId)));
    
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ 统计信息 ============

/** 获取自动化统计 */
router.get("/stats", requireAuth, async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const userId = (req as any).userId;
    
    const accountCount = await db.select({ count: sql<number>`COUNT(*)` })
      .from(siteAccounts).where(eq(siteAccounts.userId, userId));
    
    const taskStats = await db.select({
      status: automationTasks.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(automationTasks)
    .where(eq(automationTasks.userId, userId))
    .groupBy(automationTasks.status);
    
    const contentCount = await db.select({ count: sql<number>`COUNT(*)` })
      .from(automationContents)
      .innerJoin(automationTasks, eq(automationContents.taskId, automationTasks.id))
      .where(eq(automationTasks.userId, userId));
    
    res.json({
      accounts: accountCount[0]?.count || 0,
      tasks: Object.fromEntries(taskStats.map(s => [s.status, s.count])),
      contents: contentCount[0]?.count || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});



// 启用用户接管模式
router.post("/tasks/:id/takeover/enable", requireAuth, async (req: Request, res: Response) => {
  const taskId = parseInt(req.params.id);
  try {
    const success = await enableTakeover(taskId);
    if (success) {
      res.json({ success: true, message: "接管模式已启用" });
    } else {
      res.status(400).json({ success: false, message: "无法接管：任务页面不存在或已关闭" });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 禁用用户接管模式
router.post("/tasks/:id/takeover/disable", requireAuth, async (req: Request, res: Response) => {
  const taskId = parseInt(req.params.id);
  try {
    await disableTakeover(taskId);
    res.json({ success: true, message: "接管模式已关闭" });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
