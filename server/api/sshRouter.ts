/**
 * SSH 路由 - 提供 SSH 配置管理、命令执行、文件操作的 API
 */
import { Router, Request, Response, NextFunction } from "express";
import { getDb } from "../db";
import { sshConfigs, sshFileBackups } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  sshExec,
  sshExecStream,
  sshReadFile,
  sshWriteFile,
  sshBackupFile,
  sshRollbackFile,
  sshTestConnection,
  sshListFiles,
  type SSHConnectionConfig,
} from "../_core/sshService";
import { getIO, emitTerminalCommand, emitTerminalOutput, emitCodeUpdate } from "../_core/socketManager";
import { sdk } from "../_core/sdk";
import { COOKIE_NAME } from "@shared/const";

const router = Router();

// 简单加密/解密
function simpleEncrypt(text: string): string {
  return Buffer.from(text).toString("base64");
}
function simpleDecrypt(text: string): string {
  return Buffer.from(text, "base64").toString("utf8");
}

// 从数据库记录构建 SSH 连接配置
function buildSSHConfig(record: any): SSHConnectionConfig {
  return {
    host: record.host,
    port: record.port,
    username: record.username,
    authType: record.authType,
    password: record.password ? simpleDecrypt(record.password) : null,
    privateKey: record.privateKey ? simpleDecrypt(record.privateKey) : null,
    passphrase: record.passphrase ? simpleDecrypt(record.passphrase) : null,
    connectTimeout: record.connectTimeout,
  };
}

// 从请求中获取用户信息（复用项目的 SDK 认证）
async function getUserFromRequest(req: Request): Promise<any> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const user = await sdk.authenticateRequest({ headers: { authorization: authHeader } } as any);
      if (user) return user;
    } catch (error) {
      console.error("[SSH] Token auth failed:", error);
    }
  }
  const cookieToken = (req as any).cookies?.[COOKIE_NAME];
  if (cookieToken) {
    try {
      const user = await sdk.authenticateRequest({ headers: { cookie: `${COOKIE_NAME}=${cookieToken}` } } as any);
      if (user) return user;
    } catch (error) {
      console.error("[SSH] Cookie auth failed:", error);
    }
  }
  return null;
}

// 认证中间件
async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return res.status(401).json({ error: "未登录" });
  }
  // 将用户信息附加到请求对象
  (req as any).userId = user.id || user.openId || 1;
  next();
}

// ==================== SSH 配置 CRUD ====================

// 获取所有 SSH 配置
router.get("/configs", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const configs = await (await getDb())
      .select({
        id: sshConfigs.id,
        name: sshConfigs.name,
        host: sshConfigs.host,
        port: sshConfigs.port,
        username: sshConfigs.username,
        authType: sshConfigs.authType,
        isDefault: sshConfigs.isDefault,
        isActive: sshConfigs.isActive,
        connectTimeout: sshConfigs.connectTimeout,
        createdAt: sshConfigs.createdAt,
        updatedAt: sshConfigs.updatedAt,
      })
      .from(sshConfigs)
      .where(eq(sshConfigs.userId, userId))
      .orderBy(desc(sshConfigs.createdAt));
    res.json({ configs });
  } catch (err: any) {
    console.error("[SSH] Get configs error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 创建 SSH 配置
router.post("/configs", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { name, host, port, username, authType, password, privateKey, passphrase, connectTimeout } = req.body;

    if (!name || !host || !username) {
      return res.status(400).json({ error: "名称、主机和用户名为必填项" });
    }

    const insertData: any = {
      name,
      host,
      port: port || 22,
      username,
      authType: authType || "password",
      connectTimeout: connectTimeout || 10,
      userId,
      isDefault: false,
      isActive: true,
    };

    if (password) insertData.password = simpleEncrypt(password);
    if (privateKey) insertData.privateKey = simpleEncrypt(privateKey);
    if (passphrase) insertData.passphrase = simpleEncrypt(passphrase);

    const [result] = await (await getDb()).insert(sshConfigs).values(insertData);
    res.json({ id: (result as any).insertId, message: "配置已保存" });
  } catch (err: any) {
    console.error("[SSH] Create config error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 更新 SSH 配置
router.put("/configs/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const configId = parseInt(req.params.id);
    const { name, host, port, username, authType, password, privateKey, passphrase, connectTimeout, isActive } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (host !== undefined) updateData.host = host;
    if (port !== undefined) updateData.port = port;
    if (username !== undefined) updateData.username = username;
    if (authType !== undefined) updateData.authType = authType;
    if (connectTimeout !== undefined) updateData.connectTimeout = connectTimeout;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password !== undefined) updateData.password = password ? simpleEncrypt(password) : null;
    if (privateKey !== undefined) updateData.privateKey = privateKey ? simpleEncrypt(privateKey) : null;
    if (passphrase !== undefined) updateData.passphrase = passphrase ? simpleEncrypt(passphrase) : null;

    await (await getDb())
      .update(sshConfigs)
      .set(updateData)
      .where(and(eq(sshConfigs.id, configId), eq(sshConfigs.userId, userId)));

    res.json({ message: "配置已更新" });
  } catch (err: any) {
    console.error("[SSH] Update config error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 删除 SSH 配置
router.delete("/configs/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const configId = parseInt(req.params.id);
    await (await getDb())
      .delete(sshConfigs)
      .where(and(eq(sshConfigs.id, configId), eq(sshConfigs.userId, userId)));
    res.json({ message: "配置已删除" });
  } catch (err: any) {
    console.error("[SSH] Delete config error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 设为默认配置
router.post("/configs/:id/set-default", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const configId = parseInt(req.params.id);
    await (await getDb()).update(sshConfigs).set({ isDefault: false }).where(eq(sshConfigs.userId, userId));
    await (await getDb()).update(sshConfigs).set({ isDefault: true }).where(and(eq(sshConfigs.id, configId), eq(sshConfigs.userId, userId)));
    res.json({ message: "已设为默认配置" });
  } catch (err: any) {
    console.error("[SSH] Set default error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 测试 SSH 连接
router.post("/configs/:id/test", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const configId = parseInt(req.params.id);
    const [config] = await (await getDb())
      .select()
      .from(sshConfigs)
      .where(and(eq(sshConfigs.id, configId), eq(sshConfigs.userId, userId)));

    if (!config) {
      return res.status(404).json({ error: "配置不存在" });
    }

    const sshConfig = buildSSHConfig(config);
    const result = await sshTestConnection(sshConfig);
    res.json(result);
  } catch (err: any) {
    console.error("[SSH] Test connection error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 命令执行 ====================

// 执行 SSH 命令（非流式）
router.post("/exec", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { configId, command, timeout } = req.body;
    if (!configId || !command) {
      return res.status(400).json({ error: "configId 和 command 为必填项" });
    }

    const [config] = await (await getDb())
      .select()
      .from(sshConfigs)
      .where(and(eq(sshConfigs.id, configId), eq(sshConfigs.userId, userId)));

    if (!config) {
      return res.status(404).json({ error: "SSH 配置不存在" });
    }

    const sshConfig = buildSSHConfig(config);
    const result = await sshExec(sshConfig, command, timeout || 30000);
    res.json(result);
  } catch (err: any) {
    console.error("[SSH] Exec error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 执行 SSH 命令（流式，通过 Socket.io 推送输出）
router.post("/exec-stream", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { configId, command, taskId, timeout } = req.body;
    if (!configId || !command) {
      return res.status(400).json({ error: "configId 和 command 为必填项" });
    }

    const [config] = await (await getDb())
      .select()
      .from(sshConfigs)
      .where(and(eq(sshConfigs.id, configId), eq(sshConfigs.userId, userId)));

    if (!config) {
      return res.status(404).json({ error: "SSH 配置不存在" });
    }

    const sshConfig = buildSSHConfig(config);
    const effectiveTaskId = taskId || 0;

    // 通过 Socket.io 推送命令开始事件
    emitTerminalCommand(effectiveTaskId, command);

    res.json({ message: "命令已开始执行", taskId: effectiveTaskId });

    try {
      const result = await sshExecStream(
        sshConfig,
        command,
        (data, isStderr) => {
          emitTerminalOutput(effectiveTaskId, (isStderr ? "[STDERR] " : "") + data);
        },
        timeout || 60000
      );

      emitTerminalOutput(effectiveTaskId, `\n[EXIT CODE: ${result.exitCode}]`);
    } catch (err: any) {
      emitTerminalOutput(effectiveTaskId, `\n[ERROR] ${err.message}`);
    }
  } catch (err: any) {
    console.error("[SSH] Exec stream error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== 文件操作 ====================

// 读取远程文件
router.post("/file/read", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { configId, filePath } = req.body;
    if (!configId || !filePath) {
      return res.status(400).json({ error: "configId 和 filePath 为必填项" });
    }

    const [config] = await (await getDb())
      .select()
      .from(sshConfigs)
      .where(and(eq(sshConfigs.id, configId), eq(sshConfigs.userId, userId)));

    if (!config) {
      return res.status(404).json({ error: "SSH 配置不存在" });
    }

    const sshConfig = buildSSHConfig(config);
    const fileInfo = await sshReadFile(sshConfig, filePath);
    res.json(fileInfo);
  } catch (err: any) {
    console.error("[SSH] File read error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 写入远程文件（带自动备份）
router.post("/file/write", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { configId, filePath, content, taskId } = req.body;
    if (!configId || !filePath || content === undefined) {
      return res.status(400).json({ error: "configId、filePath 和 content 为必填项" });
    }

    const [config] = await (await getDb())
      .select()
      .from(sshConfigs)
      .where(and(eq(sshConfigs.id, configId), eq(sshConfigs.userId, userId)));

    if (!config) {
      return res.status(404).json({ error: "SSH 配置不存在" });
    }

    const sshConfig = buildSSHConfig(config);

    // 自动备份原始文件
    let originalContent = "";
    try {
      const fileInfo = await sshReadFile(sshConfig, filePath);
      originalContent = fileInfo.content;
    } catch {
      originalContent = "";
    }

    // 保存备份记录到数据库
    await (await getDb()).insert(sshFileBackups).values({
      sshConfigId: configId,
      taskId: taskId || null,
      filePath,
      originalContent,
      modifiedContent: content,
      rolledBack: false,
    });

    // 在远程服务器上也创建备份文件
    if (originalContent) {
      try {
        await sshBackupFile(sshConfig, filePath);
      } catch {
        // 备份失败不阻塞写入
      }
    }

    // 写入新内容
    await sshWriteFile(sshConfig, filePath, content);

    // 通过 Socket.io 推送 diff 事件
    try {
      const effectiveTaskId = taskId || 0;
      emitCodeUpdate(effectiveTaskId, filePath, content, "write");
    } catch {
      // Socket 推送失败不阻塞
    }

    res.json({ message: "文件已写入", backupCreated: !!originalContent });
  } catch (err: any) {
    console.error("[SSH] File write error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 回滚文件
router.post("/file/rollback", requireAuth, async (req: Request, res: Response) => {
  try {
    const { backupId } = req.body;
    if (!backupId) {
      return res.status(400).json({ error: "backupId 为必填项" });
    }

    const [backup] = await (await getDb())
      .select()
      .from(sshFileBackups)
      .where(eq(sshFileBackups.id, backupId));

    if (!backup) {
      return res.status(404).json({ error: "备份记录不存在" });
    }

    if (backup.rolledBack) {
      return res.status(400).json({ error: "该文件已经回滚过" });
    }

    const [config] = await (await getDb())
      .select()
      .from(sshConfigs)
      .where(eq(sshConfigs.id, backup.sshConfigId));

    if (!config) {
      return res.status(404).json({ error: "SSH 配置不存在" });
    }

    const sshConfig = buildSSHConfig(config);
    await sshRollbackFile(sshConfig, backup.filePath, backup.originalContent);

    await (await getDb())
      .update(sshFileBackups)
      .set({ rolledBack: true })
      .where(eq(sshFileBackups.id, backupId));

    res.json({ message: "文件已回滚" });
  } catch (err: any) {
    console.error("[SSH] File rollback error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 获取文件备份列表
router.get("/file/backups", requireAuth, async (req: Request, res: Response) => {
  try {
    const taskId = req.query.taskId ? parseInt(req.query.taskId as string) : undefined;
    const conditions = taskId ? eq(sshFileBackups.taskId, taskId) : undefined;

    const backups = await (await getDb())
      .select()
      .from(sshFileBackups)
      .where(conditions)
      .orderBy(desc(sshFileBackups.createdAt))
      .limit(50);

    res.json({ backups });
  } catch (err: any) {
    console.error("[SSH] Get backups error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 列出远程目录
router.post("/file/list", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { configId, dirPath } = req.body;
    if (!configId || !dirPath) {
      return res.status(400).json({ error: "configId 和 dirPath 为必填项" });
    }

    const [config] = await (await getDb())
      .select()
      .from(sshConfigs)
      .where(and(eq(sshConfigs.id, configId), eq(sshConfigs.userId, userId)));

    if (!config) {
      return res.status(404).json({ error: "SSH 配置不存在" });
    }

    const sshConfig = buildSSHConfig(config);
    const listing = await sshListFiles(sshConfig, dirPath);
    res.json({ listing });
  } catch (err: any) {
    console.error("[SSH] File list error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
