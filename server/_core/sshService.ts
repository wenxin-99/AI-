/**
 * SSH 服务 - 管理 SSH 连接、命令执行、文件读写
 * 提供给 Agent 工具和 API 路由使用
 */
import { Client, type ConnectConfig } from "ssh2";
import { Readable } from "stream";

export interface SSHConnectionConfig {
  host: string;
  port: number;
  username: string;
  authType: "password" | "privateKey";
  password?: string | null;
  privateKey?: string | null;
  passphrase?: string | null;
  connectTimeout?: number;
}

export interface SSHExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SSHFileInfo {
  path: string;
  content: string;
  size: number;
}

/**
 * 创建 SSH 连接
 */
function createConnection(config: SSHConnectionConfig): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const connectConfig: ConnectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: (config.connectTimeout || 10) * 1000,
    };

    if (config.authType === "password" && config.password) {
      connectConfig.password = config.password;
    } else if (config.authType === "privateKey" && config.privateKey) {
      connectConfig.privateKey = config.privateKey;
      if (config.passphrase) {
        connectConfig.passphrase = config.passphrase;
      }
    }

    conn.on("ready", () => resolve(conn));
    conn.on("error", (err) => reject(err));
    conn.connect(connectConfig);
  });
}

/**
 * 执行 SSH 命令（非流式，返回完整结果）
 */
export async function sshExec(
  config: SSHConnectionConfig,
  command: string,
  timeout: number = 30000
): Promise<SSHExecResult> {
  const conn = await createConnection(config);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        conn.end();
        return reject(err);
      }

      let stdout = "";
      let stderr = "";

      stream.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      stream.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
      stream.on("close", (code: number) => {
        clearTimeout(timer);
        conn.end();
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
    });
  });
}

/**
 * 执行 SSH 命令（流式输出，通过回调逐行推送）
 */
export async function sshExecStream(
  config: SSHConnectionConfig,
  command: string,
  onData: (data: string, isStderr: boolean) => void,
  timeout: number = 60000
): Promise<SSHExecResult> {
  const conn = await createConnection(config);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.end();
      reject(new Error(`Command timed out after ${timeout}ms`));
    }, timeout);

    conn.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer);
        conn.end();
        return reject(err);
      }

      let stdout = "";
      let stderr = "";

      stream.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout += text;
        onData(text, false);
      });
      stream.stderr.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr += text;
        onData(text, true);
      });
      stream.on("close", (code: number) => {
        clearTimeout(timer);
        conn.end();
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
    });
  });
}

/**
 * 读取远程文件内容
 */
export async function sshReadFile(
  config: SSHConnectionConfig,
  filePath: string
): Promise<SSHFileInfo> {
  const result = await sshExec(config, `cat "${filePath}" && stat -c '%s' "${filePath}" 2>/dev/null`, 15000);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to read file ${filePath}: ${result.stderr}`);
  }
  // 最后一行是文件大小
  const lines = result.stdout.split("\n");
  const sizeLine = lines.pop()?.trim() || "0";
  const content = lines.join("\n");
  return {
    path: filePath,
    content,
    size: parseInt(sizeLine) || content.length,
  };
}

/**
 * 写入远程文件内容
 */
export async function sshWriteFile(
  config: SSHConnectionConfig,
  filePath: string,
  content: string
): Promise<void> {
  const conn = await createConnection(config);
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        conn.end();
        return reject(err);
      }
      const writeStream = sftp.createWriteStream(filePath);
      writeStream.on("close", () => {
        conn.end();
        resolve();
      });
      writeStream.on("error", (err: Error) => {
        conn.end();
        reject(err);
      });
      writeStream.end(content, "utf8");
    });
  });
}

/**
 * 备份远程文件（复制到 .bak 文件）
 */
export async function sshBackupFile(
  config: SSHConnectionConfig,
  filePath: string
): Promise<string> {
  const timestamp = Date.now();
  const backupPath = `${filePath}.bak.${timestamp}`;
  const result = await sshExec(config, `cp "${filePath}" "${backupPath}" 2>&1`, 15000);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to backup file ${filePath}: ${result.stderr || result.stdout}`);
  }
  return backupPath;
}

/**
 * 回滚文件（从备份内容恢复）
 */
export async function sshRollbackFile(
  config: SSHConnectionConfig,
  filePath: string,
  originalContent: string
): Promise<void> {
  await sshWriteFile(config, filePath, originalContent);
}

/**
 * 测试 SSH 连接
 */
export async function sshTestConnection(
  config: SSHConnectionConfig
): Promise<{ success: boolean; message: string; info?: string }> {
  try {
    const result = await sshExec(config, "echo 'SSH_OK' && uname -a && whoami", 10000);
    if (result.stdout.includes("SSH_OK")) {
      return {
        success: true,
        message: "连接成功",
        info: result.stdout.replace("SSH_OK\n", "").trim(),
      };
    }
    return { success: false, message: `连接异常: ${result.stderr}` };
  } catch (err: any) {
    return { success: false, message: `连接失败: ${err.message}` };
  }
}

/**
 * 列出远程目录文件
 */
export async function sshListFiles(
  config: SSHConnectionConfig,
  dirPath: string
): Promise<string> {
  const result = await sshExec(config, `ls -la "${dirPath}" 2>&1`, 10000);
  return result.stdout || result.stderr;
}
