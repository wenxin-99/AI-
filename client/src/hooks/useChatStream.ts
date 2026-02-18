import { useState, useCallback, useRef } from "react";

interface Message {
  role: "user" | "assistant" | "system";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string }; file_url?: { url: string; mime_type?: string } }>;
}

interface StreamResponse {
  type: "start" | "content" | "done" | "error" | "image" | "image_placeholder" | "video_task" | "fallback" | "thinking" | "intent_confirmation" | "operation" | "automation_task";
  content?: string;
  cost?: string;
  originalCost?: string;
  discount?: string;
  discountPercent?: number;
  newBalance?: string;
  message?: string;
  error?: string;
  imageUrl?: string;
  placeholderUrl?: string; // 低分辨率占位图URL
  prompt?: string;
  taskId?: number;
  status?: string;
  usedFallback?: boolean;
  fallbackReason?: string;
  step?: string;
  details?: string;
  timestamp?: number;
  // 意图确认相关
  intent?: 'image_generation' | 'video_generation' | 'document_processing' | 'general_chat';
  confidence?: number;
  reasoning?: string;
  // 操作状态相关
  action?: string;
  target?: string;
  operationStatus?: 'running' | 'completed';
  // 自动化任务相关
  taskName?: string;
  siteName?: string;
}

interface UseChatStreamOptions {
  onStart?: (data: { cost: string; originalCost: string; discount: string; discountPercent: number }) => void;
  onContent?: (content: string) => void;
  onImagePlaceholder?: (data: { placeholderUrl: string; prompt: string }) => void; // 占位图事件
  onImage?: (data: { imageUrl: string; placeholderUrl?: string; prompt: string }) => void;
  onVideoTask?: (data: { taskId: number; prompt: string; status: string }) => void;
  onFallback?: (data: { usedFallback: boolean; fallbackReason: string }) => void;
  onThinking?: (data: { step: string; details?: string; timestamp: number }) => void;
  onIntentConfirm?: (data: { intent: string; confidence: number; reasoning: string; imageUrl: string }) => void;
  onOperation?: (data: { action: string; target?: string; operationStatus: 'running' | 'completed'; timestamp: number }) => void;
  onAutomationTask?: (data: { taskId: number; taskName: string; siteName: string; status: string }) => void;
  onDone?: (data: { newBalance: string; message: string }) => void;
  onError?: (error: string) => void;
}

export function useChatStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [streamedContent, setStreamedContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (
      modelId: number,
      messages: Message[],
      conversationId: number | undefined,
      options: UseChatStreamOptions = {},
      packageId?: number,
      hasVisionContent?: boolean
    ) => {
      setIsStreaming(true);
      setStreamedContent("");
      setError(null);

      try {
        // 获取token（支持cookie和token两种模式）
        const token = localStorage.getItem("auth_token");
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers,
          credentials: "include", // 支持cookie模式
          body: JSON.stringify({
            modelId,
            messages,
            conversationId,
            packageId,
            hasVisionContent,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "请求失败");
        }

        if (!response.body) {
          throw new Error("Response body is null");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let shouldExit = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done || shouldExit) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            try {
              const jsonStr = trimmed.slice(6);
              const data: StreamResponse = JSON.parse(jsonStr);

              if (data.type === "start") {
                options.onStart?.({
                  cost: data.cost!,
                  originalCost: data.originalCost!,
                  discount: data.discount!,
                  discountPercent: data.discountPercent!,
                });
              } else if (data.type === "content") {
                // 直接传递content，由Chat.tsx中的onContent处理累积检测
                const content = data.content!;
                setStreamedContent((prev) => prev + content);
                options.onContent?.(content);
              } else if (data.type === "image_placeholder") {
                // 处理占位图事件
                options.onImagePlaceholder?.({
                  placeholderUrl: data.placeholderUrl!,
                  prompt: data.prompt!,
                });
              } else if (data.type === "image") {
                // 处理图片生成事件
                options.onImage?.({
                  imageUrl: data.imageUrl!,
                  placeholderUrl: data.placeholderUrl,
                  prompt: data.prompt!,
                });
              } else if (data.type === "video_task") {
                // 处理视频生成任务事件
                options.onVideoTask?.({
                  taskId: data.taskId!,
                  prompt: data.prompt!,
                  status: data.status!,
                });
              } else if (data.type === "fallback") {
                // 处理备用模型事件
                options.onFallback?.({
                  usedFallback: data.usedFallback!,
                  fallbackReason: data.fallbackReason!,
                });
              } else if (data.type === "thinking") {
                // 处理思考步骤事件
                options.onThinking?.({
                  step: data.step!,
                  details: data.details,
                  timestamp: data.timestamp!,
                });
              } else if (data.type === "operation") {
                // 处理操作状态事件
                options.onOperation?.({
                  action: data.action!,
                  target: data.target,
                  operationStatus: data.operationStatus!,
                  timestamp: data.timestamp!,
                });
              } else if (data.type === "automation_task") {
                // 处理自动化任务事件
                options.onAutomationTask?.({
                  taskId: data.taskId!,
                  taskName: data.taskName || '自动化任务',
                  siteName: data.siteName || '目标网站',
                  status: data.status || 'running',
                });
              } else if (data.type === "intent_confirmation") {
                // 处理意图确认事件
                options.onIntentConfirm?.({
                  intent: data.intent!,
                  confidence: data.confidence!,
                  reasoning: data.reasoning!,
                  imageUrl: data.imageUrl!,
                });
              } else if (data.type === "done") {
                options.onDone?.({
                  newBalance: data.newBalance!,
                  message: data.message!,
                });
                shouldExit = true; // 收到done事件后退出循环
              } else if (data.type === "error") {
                // 处理错误事件,调用onError回调
                const errorMsg = data.error || "AI调用失败";
                setError(errorMsg);
                options.onError?.(errorMsg);
                shouldExit = true; // 收到error事件后退出循环
              }
            } catch (e) {
              console.error("Failed to parse SSE line:", trimmed, e);
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // User aborted the stream, not an error
          console.log('[ChatStream] Stream aborted by user');
        } else {
          const errorMessage = err instanceof Error ? err.message : "未知错误";
          setError(errorMessage);
          options.onError?.(errorMessage);
        }
      } finally {
        setIsStreaming(false);
      }
    },
    []
  );

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);
  const reset = useCallback(() => {
    setStreamedContent("");
    setError(null);
    setIsStreaming(false);
  }, []);

  return {
    sendMessage,
    isStreaming,
    streamedContent,
    error,
    reset,
    abort,
  };
}
