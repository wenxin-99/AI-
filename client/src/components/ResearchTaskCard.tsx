/**
 * ResearchTaskCard - 对话中内嵌的研究任务进度卡片
 * 
 * 类似 VideoTaskCard 的模式，通过 taskId 自动查询状态并轮询更新。
 * 在对话气泡中展示研究任务的实时进度、步骤和最终报告。
 */
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SafeMarkdown } from "@/components/SafeMarkdown";
import {
  Brain,
  Search,
  Eye,
  Lightbulb,
  BookOpen,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Maximize2,
} from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { useSandboxSocket } from "@/hooks/useSandboxSocket";

interface ResearchTaskCardProps {
  taskId: number;
  prompt: string;
  onOpenSandbox?: (taskId: number) => void;
}

// 步骤类型对应的图标、颜色和标签
const STEP_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  thought: { icon: Lightbulb, color: "text-yellow-500", label: "思考" },
  thinking: { icon: Lightbulb, color: "text-yellow-500", label: "思考" },
  action: { icon: Search, color: "text-blue-500", label: "操作" },
  observation: { icon: Eye, color: "text-green-500", label: "观察" },
  summary: { icon: BookOpen, color: "text-purple-500", label: "总结" },
};

function mapStatus(dbStatus: string): string {
  if (dbStatus === "processing") return "running";
  return dbStatus;
}

export function ResearchTaskCard({ taskId, prompt, onOpenSandbox }: ResearchTaskCardProps) {
  const { t } = useTranslation();
  const [showSteps, setShowSteps] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  const { data: taskData } = trpc.research.getTaskDetails.useQuery(
    { taskId },
    {
      refetchInterval: (query) => {
        const rawStatus = query?.state?.data?.status;
        if (rawStatus === "completed" || rawStatus === "failed") return false;
        return 3000;
      },
    }
  );

  const sandbox = useSandboxSocket(taskId);

  const status = mapStatus(taskData?.status || "pending");
  const steps = taskData?.steps || [];
  const report = taskData?.reportContent || "";

  const progressPercent = useMemo(() => {
    if (status === "completed") return 100;
    if (status === "failed") return 0;
    if (status === "pending") return 5;
    if (taskData?.progress && taskData.progress > 0) {
      return taskData.progress;
    }
    const stepProgress = Math.min(steps.length / 30, 0.9) * 100;
    return Math.max(10, Math.round(stepProgress));
  }, [status, steps.length, taskData?.progress]);

  useEffect(() => {
    if (status === "running" && onOpenSandbox) {
      onOpenSandbox(taskId);
    }
  }, [status, taskId, onOpenSandbox]);

  // 任务完成后：自动展开报告，自动收起步骤
  useEffect(() => {
    if (status === "completed" && report) {
      setShowReport(true);
      setShowSteps(false);
    }
  }, [status, report]);

  // 运行中自动滚动到最新步骤
  useEffect(() => {
    if (status === "running" && stepsEndRef.current) {
      stepsEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [steps.length, status]);

  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }> = {
    pending: { label: t("chat.research.status.pending", "排队中"), variant: "secondary", icon: Clock },
    running: { label: t("chat.research.status.running", "研究中"), variant: "default", icon: Loader2 },
    completed: { label: t("chat.research.status.completed", "已完成"), variant: "outline", icon: CheckCircle2 },
    failed: { label: t("chat.research.status.failed", "失败"), variant: "destructive", icon: XCircle },
  };

  const currentStatus = statusConfig[status] || statusConfig.pending;
  const StatusIcon = currentStatus.icon;

  return (
    <Card className="w-full overflow-hidden border-2 border-blue-100 dark:border-blue-900/30 bg-gradient-to-br from-blue-50/50 to-purple-50/30 dark:from-blue-950/20 dark:to-purple-950/10">
      {/* 头部 */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Brain className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="font-semibold text-sm">{t("chat.research.title", "深度研究")}</span>
            <Badge variant={currentStatus.variant} className="text-xs h-5">
              <StatusIcon className={`h-3 w-3 mr-1 ${status === "running" ? "animate-spin" : ""}`} />
              {currentStatus.label}
            </Badge>
          </div>
          <div className="flex items-center gap-1">
            {onOpenSandbox && (status === "running" || status === "completed") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onOpenSandbox(taskId)}
                title={t("chat.research.viewInSandbox", "在沙箱中查看")}
              >
                <Maximize2 className="h-3 w-3 mr-1" />
                {t("chat.research.sandbox", "研究沙箱")}
              </Button>
            )}
          </div>
        </div>

        {/* 研究指令 */}
        <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{prompt}</p>

        {/* 进度条 */}
        {(status === "pending" || status === "running") && (
          <div className="space-y-1">
            <Progress value={progressPercent} className="h-1.5" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("chat.research.stepsCount", { count: steps.length, defaultValue: `${steps.length} 个步骤` })}</span>
              <span>{progressPercent}%</span>
            </div>
          </div>
        )}
      </div>

      {/* 完成统计 - 移到报告/步骤之前，确保始终可见 */}
      {status === "completed" && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-blue-100 dark:border-blue-900/20 pt-2">
            {taskData?.totalSteps && taskData.totalSteps > 0 && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
                共 {taskData.totalSteps} 步
              </span>
            )}
            {taskData?.totalSearches && taskData.totalSearches > 0 && (
              <span className="flex items-center gap-1">
                <Search className="h-3 w-3 text-blue-500" />
                搜索 {taskData.totalSearches} 次
              </span>
            )}
            {taskData?.modelUsed && (
              <span>模型: {taskData.modelUsed}</span>
            )}
          </div>
        </div>
      )}

      {/* 步骤列表 - 可折叠，使用固定高度 + overflow */}
      {steps.length > 0 && (
        <div className="px-4 pb-2">
          {/* 步骤列表标题栏 - 点击可折叠/展开 */}
          <button
            className="flex items-center justify-between w-full py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowSteps(!showSteps)}
          >
            <span className="font-medium">
              {showSteps ? "收起思考过程" : `展开思考过程 (${steps.length} 步)`}
            </span>
            {showSteps ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showSteps && (
            <div
              className="overflow-y-auto border rounded-lg bg-white/40 dark:bg-black/10"
              style={{ maxHeight: "300px" }}
            >
              <div className="space-y-1 p-2">
                {steps.map((step: any, index: number) => {
                  const config = STEP_CONFIG[step.type] || STEP_CONFIG.thought;
                  const StepIcon = config.icon;
                  return (
                    <div
                      key={step.id || index}
                      className="flex items-start gap-2 py-1.5 px-2 rounded-md hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        <StepIcon className={`h-3.5 w-3.5 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-xs font-medium ${config.color}`}>
                            {config.label}
                          </span>
                          {step.toolName && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1">
                              {step.toolName}
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            #{index + 1}
                          </span>
                        </div>
                        <p className="text-xs text-foreground/80 line-clamp-2">
                          {step.content?.substring(0, 200)}
                          {step.content?.length > 200 ? "..." : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {status === "running" && (
                  <div className="flex items-center gap-2 py-2 px-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                    <span className="text-xs text-muted-foreground">{t("chat.research.researching", "正在深度研究...")}</span>
                  </div>
                )}
                <div ref={stepsEndRef} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 研究报告 */}
      {status === "completed" && report && (
        <div className="px-4 pb-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full mb-2 text-xs h-8 bg-white/60 dark:bg-gray-800/60"
            onClick={() => setShowReport(!showReport)}
          >
            <BookOpen className="h-3 w-3 mr-1.5" />
            {showReport ? t("chat.research.collapseReport", "收起报告") : t("chat.research.viewReport", "查看报告")}
            {showReport ? <ChevronUp className="h-3 w-3 ml-1.5" /> : <ChevronDown className="h-3 w-3 ml-1.5" />}
          </Button>
          {showReport && (
            <div className="rounded-lg border bg-white/80 dark:bg-gray-900/50 p-4 max-h-[70vh] overflow-y-auto">
              <SafeMarkdown>{report}</SafeMarkdown>
            </div>
          )}
        </div>
      )}

      {/* 失败信息 */}
      {status === "failed" && (
        <div className="px-4 pb-4">
          <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 p-3">
            <p className="text-xs text-red-600 dark:text-red-400">
              {taskData?.errorMessage || t("chat.research.failedRefund", "研究任务失败，🐟币已退还。")}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
