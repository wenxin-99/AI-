import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Video, Download, Loader2, CheckCircle2, XCircle, Clock, Share2 } from "lucide-react";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { formatRelativeTime } from "@/lib/timeUtils";

interface VideoTaskCardProps {
  taskId: number;
  prompt: string;
  initialStatus?: string;
}

export function VideoTaskCard({ taskId, prompt, initialStatus = "pending" }: VideoTaskCardProps) {
  const [status, setStatus] = useState(initialStatus);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isCreatingShare, setIsCreatingShare] = useState(false);

  // 创建分享链接
  const createShareMutation = trpc.videos.createShare.useMutation();

  // 查询任务状态
  const { data: taskData, refetch } = trpc.videos.getTaskStatus.useQuery(
    { taskId },
    {
      enabled: status === "pending" || status === "processing",
      refetchInterval: status === "pending" || status === "processing" ? 5000 : false, // 每5秒轮询一次
    }
  );

  useEffect(() => {
    if (taskData) {
      setStatus(taskData.status);
      if (taskData.videoUrl) {
        setVideoUrl(taskData.videoUrl);
      }
      if (taskData.errorMessage) {
        setError(taskData.errorMessage);
      }
      
      // 使用后端返回的实际进度
      if (taskData.progress !== undefined && taskData.progress !== null) {
        setProgress(taskData.progress);
        
        // 计算预估剩余时间
        if (taskData.status === "pending" || taskData.status === "processing") {
          // 平均生成时间：5秒视频约60秒，10秒视频约120秒
          const avgTime = taskData.duration === 10 ? 120 : 60;
          const remainingProgress = 100 - taskData.progress;
          const estimated = Math.ceil((remainingProgress / 100) * avgTime);
          setEstimatedTime(estimated > 0 ? estimated : null);
        } else {
          setEstimatedTime(null);
        }
      } else {
        // 如果后端没有返回progress，使用默认值
        if (taskData.status === "pending") {
          setProgress(10);
          setEstimatedTime(taskData.duration === 10 ? 108 : 54); // 90%的时间
        } else if (taskData.status === "processing") {
          setProgress(50);
          setEstimatedTime(taskData.duration === 10 ? 60 : 30); // 50%的时间
        } else if (taskData.status === "completed") {
          setProgress(100);
          setEstimatedTime(null);
        } else if (taskData.status === "failed") {
          setProgress(0);
          setEstimatedTime(null);
        }
      }
    }
  }, [taskData]);

  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    if (!videoUrl || isDownloading) return;
    
    setIsDownloading(true);
    const toastId = toast.loading("正在下载视频...");
    
    try {
      // 通过fetch下载视频（使用no-cors模式或代理）
      const response = await fetch(videoUrl, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video_${taskId}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("视频下载成功", { id: toastId });
    } catch (fetchError) {
      console.warn("Fetch download failed, opening in new tab:", fetchError);
      // 备用方案：在新标签页打开视频URL
      window.open(videoUrl, '_blank');
      toast.success("已在新标签页打开视频，请右键另存为下载", { id: toastId });
    } finally {
      setIsDownloading(false);
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "pending":
        return <Clock className="h-5 w-5 text-yellow-600" />;
      case "processing":
        return <Loader2 className="h-5 w-5 text-blue-600 animate-spin" />;
      case "completed":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Video className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "pending":
        return "等待生成";
      case "processing":
        return "生成中";
      case "completed":
        return "生成完成";
      case "failed":
        return "生成失败";
      default:
        return "未知状态";
    }
  };

  return (
    <Card className="p-4 space-y-3 max-w-md">
      {/* 标题和状态 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">
          {getStatusIcon()}
          <div className="flex-1">
            <div className="font-medium text-sm">视频生成任务 #{taskId}</div>
            <div className="text-xs text-muted-foreground">{getStatusText()}</div>
          </div>
        </div>
      </div>

      {/* 视频描述 */}
      <div className="text-sm text-muted-foreground line-clamp-2">
        {prompt}
      </div>

      {/* 进度条 */}
      {(status === "pending" || status === "processing") && (
        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>{progress}%</span>
            {estimatedTime !== null && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                预计还需 {estimatedTime} 秒
              </span>
            )}
          </div>
        </div>
      )}

      {/* 错误信息 */}
      {status === "failed" && error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {/* 视频预览 */}
      {status === "completed" && videoUrl && (
        <div className="space-y-2">
          <video
            src={videoUrl}
            controls
            className="w-full rounded-md bg-black"
            style={{ maxHeight: "300px" }}
          >
            您的浏览器不支持视频播放
          </video>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isDownloading ? "下载中..." : "下载视频"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={async () => {
                if (shareUrl) {
                  // 已有分享链接，直接复制
                  await navigator.clipboard.writeText(shareUrl);
                  toast.success("分享链接已复制到剪贴板");
                  return;
                }

                // 创建新的分享链接
                setIsCreatingShare(true);
                try {
                  const result = await createShareMutation.mutateAsync({
                    videoId: taskId,
                    expiresInDays: 30, // 30天后过期
                  });
                  setShareUrl(result.shareUrl);
                  await navigator.clipboard.writeText(result.shareUrl);
                  toast.success("分享链接已生成并复制到剪贴板");
                } catch (error: any) {
                  toast.error(error.message || "生成分享链接失败");
                } finally {
                  setIsCreatingShare(false);
                }
              }}
              disabled={isCreatingShare}
            >
              {isCreatingShare ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="mr-2 h-4 w-4" />
              )}
              {shareUrl ? "复制链接" : "分享视频"}
            </Button>
          </div>
        </div>
      )}

      {/* 任务信息 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {taskData?.duration && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {taskData.duration}秒
            </span>
          )}
          {taskData?.createdAt && (
            <span>
              {formatRelativeTime(new Date(taskData.createdAt).getTime())}
            </span>
          )}
        </div>
        <span>ID: {taskId}</span>
      </div>
    </Card>
  );
}
