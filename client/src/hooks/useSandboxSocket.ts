/**
 * useSandboxSocket - Socket.io React Hook
 * 
 * 管理与后端 Socket.io 的连接，接收沙箱事件并维护状态。
 * 为沙箱面板的三个 Tab（浏览器、终端、思考过程）提供实时数据。
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";

// ============ 类型定义 ============

export type SandboxEventType =
  | "browser_navigate"
  | "browser_screenshot"
  | "browser_loading"
  | "code_update"
  | "terminal_output"
  | "terminal_command"
  | "agent_thinking"
  | "agent_searching"
  | "agent_step"
  | "task_status"
  | "task_progress";

export interface SandboxEvent {
  type: SandboxEventType;
  taskId: number;
  timestamp: number;
  payload: Record<string, any>;
}

export interface BrowserState {
  url: string;
  title: string;
  screenshot: string; // base64 JPEG
  isLoading: boolean;
  history: Array<{ url: string; title: string; timestamp: number }>;
}

export interface CodeState {
  code: string;
  language: string;
  filename: string;
  history: Array<{ code: string; language: string; filename: string; timestamp: number }>;
}

export interface TerminalLine {
  content: string;
  timestamp: number;
  type: "command" | "output";
}

export interface AgentStepEvent {
  timestamp: number;
  payload: {
    stepType: string;
    content: string;
    stepNumber: number;
  };
}

export interface SandboxState {
  browser: BrowserState;
  code: CodeState;
  terminal: TerminalLine[];
  isConnected: boolean;
  activeTab: "browser" | "code" | "terminal";
  taskStatus: string;
  taskProgress: number;
  thinking: string;
  steps: AgentStepEvent[];
  currentStep: string;
  progress: number;
}

// ============ Hook ============

export function useSandboxSocket(taskId: number | null) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const [browser, setBrowser] = useState<BrowserState>({
    url: "",
    title: "",
    screenshot: "",
    isLoading: false,
    history: [],
  });

  const [code, setCode] = useState<CodeState>({
    code: "// 等待 Agent 执行...\n// 搜索结果和报告将在此显示",
    language: "markdown",
    filename: "output",
    history: [],
  });

  // terminal 直接作为 TerminalLine[] 数组，方便 Automation.tsx 使用 .length 和 .map()
  const [terminal, setTerminal] = useState<TerminalLine[]>([
    {
      content: "\x1b[32m$ \x1b[0m自动化沙箱终端已就绪\r\n",
      timestamp: Date.now(),
      type: "output",
    },
  ]);

  const [activeTab, setActiveTab] = useState<"browser" | "code" | "terminal">("browser");
  const [taskStatus, setTaskStatus] = useState("");
  const [taskProgress, setTaskProgress] = useState(0);
  
  // Agent 思考过程和步骤
  const [thinking, setThinking] = useState("");
  const [steps, setSteps] = useState<AgentStepEvent[]>([]);
  const [currentStep, setCurrentStep] = useState("");
  const [progress, setProgress] = useState(0);

  // 处理沙箱事件
  const handleSandboxEvent = useCallback((event: SandboxEvent) => {
    switch (event.type) {
      case "browser_navigate":
        setBrowser((prev) => ({
          ...prev,
          url: event.payload.url,
          isLoading: true,
        }));
        setActiveTab("browser");
        break;

      case "browser_loading":
        setBrowser((prev) => ({
          ...prev,
          url: event.payload.url,
          isLoading: true,
        }));
        break;

      case "browser_screenshot":
        setBrowser((prev) => ({
          ...prev,
          screenshot: event.payload.screenshot,
          url: event.payload.url,
          title: event.payload.title || "",
          isLoading: false,
          history: [
            ...prev.history,
            {
              url: event.payload.url,
              title: event.payload.title || "",
              timestamp: event.timestamp,
            },
          ],
        }));
        setActiveTab("browser");
        break;

      case "code_update":
        setCode((prev) => ({
          code: event.payload.code,
          language: event.payload.language,
          filename: event.payload.filename || "output",
          history: [
            ...prev.history,
            {
              code: event.payload.code,
              language: event.payload.language,
              filename: event.payload.filename || "output",
              timestamp: event.timestamp,
            },
          ],
        }));
        if (event.payload.filename === "research_report.md") {
          setActiveTab("code");
        }
        break;

      case "terminal_command":
        setTerminal((prev) => [
          ...prev,
          {
            content: `\x1b[36m$ ${event.payload.command}\x1b[0m\r\n`,
            timestamp: event.timestamp,
            type: "command" as const,
          },
        ]);
        setActiveTab("terminal");
        break;

      case "terminal_output":
        setTerminal((prev) => [
          ...prev,
          {
            content: event.payload.output,
            timestamp: event.timestamp,
            type: "output" as const,
          },
        ]);
        break;

      case "agent_thinking":
        setThinking(event.payload.thought || "");
        // 终端也显示思考状态
        setTerminal((prev) => [
          ...prev,
          {
            content: `\x1b[33m[思考]\x1b[0m ${(event.payload.thought || "").substring(0, 200)}...\r\n`,
            timestamp: event.timestamp,
            type: "output" as const,
          },
        ]);
        break;

      case "agent_searching":
        setActiveTab("browser");
        break;

      case "agent_step":
        // 记录 Agent 步骤
        setSteps((prev) => [
          ...prev,
          {
            timestamp: event.timestamp,
            payload: {
              stepType: event.payload.stepType || "step",
              content: event.payload.content || "",
              stepNumber: event.payload.stepNumber || 0,
            },
          },
        ]);
        // 清除当前思考状态（步骤完成了）
        setThinking("");
        break;

      case "task_status":
        setTaskStatus(event.payload.status);
        break;

      case "task_progress":
        setTaskProgress(event.payload.progress);
        setProgress(event.payload.progress);
        if (event.payload.currentStep) {
          setCurrentStep(event.payload.currentStep);
        }
        break;
    }
  }, []);

  // 连接 Socket.io
  useEffect(() => {
    if (!taskId) return;

    // 连接到后端 Socket.io
    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[SandboxSocket] Connected:", socket.id);
      setIsConnected(true);
      // 加入任务房间
      socket.emit("join_task", taskId);
    });

    socket.on("disconnect", (reason) => {
      console.log("[SandboxSocket] Disconnected:", reason);
      setIsConnected(false);
    });

    socket.on("sandbox_event", (event: SandboxEvent) => {
      handleSandboxEvent(event);
    });

    socket.on("connect_error", (error) => {
      console.warn("[SandboxSocket] Connection error:", error.message);
    });

    return () => {
      if (socket) {
        socket.emit("leave_task", taskId);
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [taskId, handleSandboxEvent]);

  return {
    browser,
    code,
    terminal,
    isConnected,
    activeTab,
    setActiveTab,
    taskStatus,
    taskProgress,
    // 新增：Agent 思考过程和步骤
    thinking,
    steps,
    currentStep,
    progress,
    socket: socketRef.current,
  };
}
