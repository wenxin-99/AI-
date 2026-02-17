/**
 * Socket.io 管理器 - 负责实时沙箱事件的广播
 * 
 * 增强功能：事件缓冲区，当客户端加入任务房间时，自动回放最近的事件
 */
import { Server, Socket } from "socket.io";
import type { Server as HttpServer } from "http";

// ============ 类型定义 ============
export type SandboxEventType =
  | "browser_navigate"    // 浏览器导航到新URL
  | "browser_screenshot"  // 浏览器页面截图
  | "browser_loading"     // 浏览器正在加载
  | "code_update"         // 代码内容更新
  | "terminal_command"    // 终端执行命令
  | "terminal_output"     // 终端输出内容
  | "agent_thinking"      // Agent 正在思考
  | "agent_searching"     // Agent 正在搜索
  | "agent_step"          // Agent 完成一个步骤
  | "task_status"         // 任务状态变更
  | "task_progress";      // 任务进度更新

export interface SandboxEvent {
  type: SandboxEventType;
  taskId: number;
  timestamp: number;
  payload: Record<string, any>;
}

// ============ 单例管理 ============
let io: Server | null = null;

// ============ 事件缓冲区 ============
// 为每个任务保存最近的事件，以便新连接的客户端可以回放
const EVENT_BUFFER_SIZE = 50; // 每个任务最多缓存50个事件
const EVENT_BUFFER_TTL = 30 * 60 * 1000; // 事件缓冲区30分钟过期
const taskEventBuffers = new Map<number, SandboxEvent[]>();
const taskBufferTimestamps = new Map<number, number>(); // 记录最后更新时间

/**
 * 将事件添加到缓冲区
 */
function bufferEvent(event: SandboxEvent): void {
  const taskId = event.taskId;
  if (!taskEventBuffers.has(taskId)) {
    taskEventBuffers.set(taskId, []);
  }
  const buffer = taskEventBuffers.get(taskId)!;
  buffer.push(event);
  // 限制缓冲区大小（保留最新的事件）
  if (buffer.length > EVENT_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - EVENT_BUFFER_SIZE);
  }
  taskBufferTimestamps.set(taskId, Date.now());
}

/**
 * 获取任务的缓冲事件
 */
function getBufferedEvents(taskId: number): SandboxEvent[] {
  return taskEventBuffers.get(taskId) || [];
}

/**
 * 清理过期的事件缓冲区
 */
function cleanupExpiredBuffers(): void {
  const now = Date.now();
  for (const [taskId, lastUpdate] of taskBufferTimestamps.entries()) {
    if (now - lastUpdate > EVENT_BUFFER_TTL) {
      taskEventBuffers.delete(taskId);
      taskBufferTimestamps.delete(taskId);
    }
  }
}

// 每5分钟清理一次过期缓冲区
setInterval(cleanupExpiredBuffers, 5 * 60 * 1000);

/**
 * 初始化 Socket.io 服务器
 * 应在 HTTP Server 创建后立即调用
 */
export function initSocketIO(httpServer: HttpServer): Server {
  if (io) {
    console.log("[SocketIO] Already initialized");
    return io;
  }

  io = new Server(httpServer, {
    cors: {
      origin: ["https://insights.mom","https://www.insights.mom","https://insights.ren","https://ai.mpsboring.com","http://localhost:3000","http://localhost:5173"],
      credentials: true,
    },
    path: "/socket.io",
    transports: ["websocket", "polling"],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.on("connection", (socket: Socket) => {
    console.log(`[SocketIO] Client connected: ${socket.id}`);

    // 客户端加入特定任务的房间
    socket.on("join_task", (taskId: number) => {
      const room = `task_${taskId}`;
      socket.join(room);
      console.log(`[SocketIO] Client ${socket.id} joined room ${room}`);
      
      // 回放缓冲区中的事件，让新连接的客户端看到之前的步骤
      const bufferedEvents = getBufferedEvents(taskId);
      if (bufferedEvents.length > 0) {
        console.log(`[SocketIO] Replaying ${bufferedEvents.length} buffered events for task ${taskId}`);
        for (const event of bufferedEvents) {
          socket.emit("sandbox_event", event);
        }
      }
    });

    // 客户端离开任务房间
    socket.on("leave_task", (taskId: number) => {
      const room = `task_${taskId}`;
      socket.leave(room);
      console.log(`[SocketIO] Client ${socket.id} left room ${room}`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[SocketIO] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log("[SocketIO] Server initialized with event buffering");
  return io;
}

/**
 * 获取 Socket.io 服务器实例
 */
export function getIO(): Server | null {
  return io;
}

/**
 * 向特定任务房间广播沙箱事件（同时缓存到缓冲区）
 */
export function emitSandboxEvent(event: SandboxEvent): void {
  // 始终缓存事件，即使 Socket.io 未初始化
  bufferEvent(event);
  
  if (!io) {
    console.warn("[SocketIO] Server not initialized, cannot emit event");
    return;
  }
  const room = `task_${event.taskId}`;
  io.to(room).emit("sandbox_event", event);
}

/**
 * 向特定任务广播浏览器导航事件
 */
export function emitBrowserNavigate(taskId: number, url: string): void {
  emitSandboxEvent({
    type: "browser_navigate",
    taskId,
    timestamp: Date.now(),
    payload: { url },
  });
}

/**
 * 向特定任务广播浏览器截图
 */
export function emitBrowserScreenshot(
  taskId: number,
  screenshotBase64: string,
  url: string,
  title?: string
): void {
  emitSandboxEvent({
    type: "browser_screenshot",
    taskId,
    timestamp: Date.now(),
    payload: { screenshot: screenshotBase64, url, title: title || "" },
  });
}

/**
 * 向特定任务广播浏览器加载状态
 */
export function emitBrowserLoading(taskId: number, url: string): void {
  emitSandboxEvent({
    type: "browser_loading",
    taskId,
    timestamp: Date.now(),
    payload: { url },
  });
}

/**
 * 向特定任务广播代码更新
 */
export function emitCodeUpdate(
  taskId: number,
  code: string,
  language: string,
  filename?: string
): void {
  emitSandboxEvent({
    type: "code_update",
    taskId,
    timestamp: Date.now(),
    payload: { code, language, filename: filename || "output" },
  });
}

/**
 * 向特定任务广播终端命令
 */
export function emitTerminalCommand(taskId: number, command: string): void {
  emitSandboxEvent({
    type: "terminal_command",
    taskId,
    timestamp: Date.now(),
    payload: { command },
  });
}

/**
 * 向特定任务广播终端输出
 */
export function emitTerminalOutput(taskId: number, output: string): void {
  emitSandboxEvent({
    type: "terminal_output",
    taskId,
    timestamp: Date.now(),
    payload: { output },
  });
}

/**
 * 向特定任务广播 Agent 思考状态
 */
export function emitAgentThinking(taskId: number, thought: string): void {
  emitSandboxEvent({
    type: "agent_thinking",
    taskId,
    timestamp: Date.now(),
    payload: { thought },
  });
}

/**
 * 向特定任务广播 Agent 搜索状态
 */
export function emitAgentSearching(taskId: number, query: string): void {
  emitSandboxEvent({
    type: "agent_searching",
    taskId,
    timestamp: Date.now(),
    payload: { query },
  });
}

/**
 * 向特定任务广播 Agent 步骤完成
 */
export function emitAgentStep(
  taskId: number,
  stepType: string,
  content: string,
  stepNumber: number
): void {
  emitSandboxEvent({
    type: "agent_step",
    taskId,
    timestamp: Date.now(),
    payload: { stepType, content, stepNumber },
  });
}

/**
 * 向特定任务广播任务状态变更
 */
export function emitTaskStatus(
  taskId: number,
  status: string,
  message?: string
): void {
  emitSandboxEvent({
    type: "task_status",
    taskId,
    timestamp: Date.now(),
    payload: { status, message: message || "" },
  });
}

/**
 * 向特定任务广播任务进度
 */
export function emitTaskProgress(
  taskId: number,
  progress: number,
  currentStep: string
): void {
  emitSandboxEvent({
    type: "task_progress",
    taskId,
    timestamp: Date.now(),
    payload: { progress, currentStep },
  });
}

/**
 * 优雅关闭 Socket.io 服务器
 */
export async function shutdownSocketIO(): Promise<void> {
  if (io) {
    await io.close();
    io = null;
    console.log("[SocketIO] Server shut down");
  }
}
