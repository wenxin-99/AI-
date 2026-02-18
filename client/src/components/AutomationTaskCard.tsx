import { useState, useEffect, useRef, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Bot, ExternalLink, Loader2, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp, Eye,
  MousePointer, Keyboard, Navigation, LogIn, FileText, Send
} from "lucide-react";
import { io, Socket } from "socket.io-client";

// ============ 类型定义 ============

interface SandboxEvent {
  type: string;
  taskId: number;
  timestamp: number;
  payload: Record<string, any>;
}

interface StepItem {
  id: number;
  type: string;
  content: string;
  timestamp: number;
  duration?: number;
}

interface AutomationTaskCardProps {
  taskId: number;
  taskName: string;
  siteName: string;
}

// ============ 步骤图标映射 ============

function getStepIcon(type: string) {
  switch (type) {
    case "navigate": return <Navigation className="h-3 w-3 text-blue-500" />;
    case "login": return <LogIn className="h-3 w-3 text-green-500" />;
    case "captcha": return <Eye className="h-3 w-3 text-purple-500" />;
    case "click": return <MousePointer className="h-3 w-3 text-orange-500" />;
    case "type": return <Keyboard className="h-3 w-3 text-cyan-500" />;
    case "post": return <Send className="h-3 w-3 text-emerald-500" />;
    case "thought": return <Bot className="h-3 w-3 text-yellow-500" />;
    case "error": return <XCircle className="h-3 w-3 text-red-500" />;
    default: return <FileText className="h-3 w-3 text-gray-500" />;
  }
}

function classifyStep(event: SandboxEvent): string {
  const { type, payload } = event;
  if (type === "browser_navigate") return "navigate";
  if (type === "agent_thinking") {
    const thought = (payload.thought || "").toLowerCase();
    if (thought.includes("登录") || thought.includes("login")) return "login";
    if (thought.includes("验证码") || thought.includes("captcha")) return "captcha";
    if (thought.includes("发帖") || thought.includes("发布") || thought.includes("post")) return "post";
    if (thought.includes("点击") || thought.includes("click")) return "click";
    return "thought";
  }
  if (type === "agent_step") {
    const content = (payload.content || "").toLowerCase();
    if (content.includes("click")) return "click";
    if (content.includes("type") || content.includes("input") || content.includes("fill")) return "type";
    if (content.includes("navigate")) return "navigate";
    return "action";
  }
  return "action";
}

function formatStepContent(event: SandboxEvent): string {
  const { type, payload } = event;
  if (type === "browser_navigate") return `导航到 ${payload.url}`;
  if (type === "agent_thinking") return payload.thought || "思考中...";
  if (type === "agent_step") return payload.content || `步骤 #${payload.stepNumber}`;
  if (type === "task_status") return `状态: ${payload.status} ${payload.message || ""}`;
  if (type === "task_progress") return `进度: ${payload.progress}% - ${payload.currentStep || ""}`;
  return JSON.stringify(payload).substring(0, 100);
}

// ============ 主组件 ============

export function AutomationTaskCard({ taskId, taskName, siteName }: AutomationTaskCardProps) {
  const [status, setStatus] = useState<string>("running");
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string>("启动中...");
  const [steps, setSteps] = useState<StepItem[]>([]);
  const [thinking, setThinking] = useState<string>("");
  const [isConnected, setIsConnected] = useState(false);
  const [showSteps, setShowSteps] = useState(true);
  const [browserUrl, setBrowserUrl] = useState<string>("");

  const socketRef = useRef<Socket | null>(null);
  const stepCountRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const stepsEndRef = useRef<HTMLDivElement>(null);

  // 连接 Socket.io（仅用于接收步骤和状态，浏览器截图由右侧面板的 useSandboxSocket 处理）
  useEffect(() => {
    if (!taskId) return;

    const socket = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[AutomationCard] Socket connected:", socket.id);
      setIsConnected(true);
      socket.emit("join_task", taskId);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("sandbox_event", (event: SandboxEvent) => {
      if (event.taskId !== taskId) return;
      handleSandboxEvent(event);
    });

    return () => {
      if (socket) {
        socket.emit("leave_task", taskId);
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, [taskId]);

  // 处理沙箱事件（只处理步骤和状态，不处理截图）
  const handleSandboxEvent = useCallback((event: SandboxEvent) => {
    switch (event.type) {
      case "browser_screenshot":
        // 截图由右侧面板处理，这里只更新 URL
        setBrowserUrl(event.payload.url || "");
        break;

      case "browser_navigate":
        setBrowserUrl(event.payload.url || "");
        addStep(event);
        break;

      case "agent_thinking":
        setThinking(event.payload.thought || "");
        break;

      case "agent_step":
        setThinking("");
        addStep(event);
        break;

      case "task_status":
        setStatus(event.payload.status);
        if (event.payload.message) {
          setCurrentStep(event.payload.message);
        }
        break;

      case "task_progress":
        setProgress(event.payload.progress || 0);
        if (event.payload.currentStep) {
          setCurrentStep(event.payload.currentStep);
        }
        break;

      case "browser_loading":
        setBrowserUrl(event.payload.url || "");
        break;
    }
  }, []);

  const addStep = useCallback((event: SandboxEvent) => {
    stepCountRef.current += 1;
    const stepType = classifyStep(event);
    const content = formatStepContent(event);
    const elapsed = ((event.timestamp - startTimeRef.current) / 1000).toFixed(1);

    setSteps(prev => {
      if (prev.length > 0 && prev[prev.length - 1].content === content) {
        return prev;
      }
      const newStep: StepItem = {
        id: stepCountRef.current,
        type: stepType,
        content,
        timestamp: event.timestamp,
        duration: parseFloat(elapsed),
      };
      const updated = [...prev, newStep];
      if (updated.length > 50) updated.splice(0, updated.length - 50);
      return updated;
    });
  }, []);

  // 自动滚动到最新步骤
  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps]);

  // 轮询任务状态（作为 socket 的备份）
  useEffect(() => {
    if (["completed", "failed", "cancelled"].includes(status)) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/automation/tasks/${taskId}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status);
          setProgress(data.progress || 0);
          if (data.currentStep) setCurrentStep(data.currentStep);
          if (["completed", "failed", "cancelled"].includes(data.status)) {
            clearInterval(interval);
          }
        }
      } catch (e) {
        // ignore
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [taskId, status]);

  // ============ 渲染 ============

  const getStatusText = () => {
    switch (status) {
      case "pending": return "等待执行";
      case "running": return "执行中";
      case "completed": return "执行完成";
      case "failed": return "执行失败";
      case "cancelled": return "已取消";
      default: return "未知状态";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "pending": return <Clock className="h-3.5 w-3.5 text-yellow-600" />;
      case "running": return <Loader2 className="h-3.5 w-3.5 text-blue-600 animate-spin" />;
      case "completed": return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
      case "failed": return <XCircle className="h-3.5 w-3.5 text-red-600" />;
      default: return <Bot className="h-3.5 w-3.5 text-gray-600" />;
    }
  };

  const isFinished = ["completed", "failed", "cancelled"].includes(status);

  return (
    <Card className="w-full max-w-2xl border-blue-200/50 bg-gradient-to-b from-blue-50/30 to-white dark:from-blue-950/20 dark:to-background overflow-hidden">
      {/* 头部 - 任务信息 */}
      <div className="px-4 py-3 border-b border-blue-100/50 dark:border-blue-900/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div>
              <div className="font-medium text-sm flex items-center gap-2">
                {taskName || "自动化任务"} #{taskId}
                <Badge variant="outline" className="text-xs h-5">
                  {getStatusIcon()}
                  <span className="ml-1">{getStatusText()}</span>
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span>{siteName}</span>
                {isConnected && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    已连接
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setShowSteps(!showSteps)}
            title={showSteps ? "隐藏步骤" : "显示步骤"}
          >
            {showSteps ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* 进度条 */}
        {!isFinished && (
          <div className="mt-2 space-y-1">
            <Progress value={progress} className="h-1.5" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress}%</span>
              <span className="truncate max-w-[300px]">{currentStep}</span>
            </div>
          </div>
        )}
      </div>

      {/* 当前 URL */}
      {browserUrl && (
        <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900/50 border-b text-xs text-muted-foreground flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="truncate">{browserUrl}</span>
        </div>
      )}

      {/* 当前思考状态 */}
      {thinking && !isFinished && (
        <div className="px-4 py-2 bg-yellow-50/30 dark:bg-yellow-900/10 border-b border-yellow-100/30">
          <div className="flex items-start gap-2 text-xs">
            <Bot className="h-3 w-3 text-yellow-500 animate-pulse mt-0.5 flex-shrink-0" />
            <span className="text-yellow-700 dark:text-yellow-400 line-clamp-2">{thinking}</span>
          </div>
        </div>
      )}

      {/* 操作步骤时间线 */}
      {showSteps && steps.length > 0 && (
        <div className="px-4 py-3">
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center justify-between">
            <span>操作步骤 ({steps.length})</span>
            <span className="text-xs text-muted-foreground">
              {((Date.now() - startTimeRef.current) / 1000).toFixed(0)}s
            </span>
          </div>
          <div className="space-y-0.5 max-h-[250px] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-start gap-2 text-xs group">
                <div className="flex flex-col items-center mt-0.5">
                  {getStepIcon(step.type)}
                  {idx < steps.length - 1 && (
                    <div className="w-px h-3 bg-border mt-0.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0 pb-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-foreground/80 truncate">{step.content}</span>
                    <span className="text-muted-foreground/60 flex-shrink-0 ml-auto">
                      {step.duration}s
                    </span>
                  </div>
                </div>
              </div>
            ))}
            <div ref={stepsEndRef} />
          </div>
        </div>
      )}

      {/* 底部提示 */}
      <div className="px-4 py-2 border-t border-blue-100/50 dark:border-blue-900/30 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {isFinished ? "任务已结束" : "浏览器画面显示在右侧面板 →"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 ml-auto"
          onClick={() => window.open("/automation", "_blank")}
        >
          <ExternalLink className="h-3 w-3" />
          详情
        </Button>
      </div>
    </Card>
  );
}
