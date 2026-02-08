import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Pause, Trash2, Download } from "lucide-react";

interface LogViewerProps {
  title: string;
  logEndpoint: string;
  autoScroll?: boolean;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export default function LogViewer({ title, logEndpoint, autoScroll = true }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [maxLines, setMaxLines] = useState(500);
  const scrollRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLogs = async () => {
    try {
      const response = await fetch(logEndpoint, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.success && data.data) {
        setLogs(data.data.slice(-maxLines));
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  const startPolling = () => {
    setIsRunning(true);
    fetchLogs();
    intervalRef.current = setInterval(fetchLogs, 2000);
  };

  const stopPolling = () => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const downloadLogs = () => {
    const logText = logs.map(log => `[${log.timestamp}] [${log.level}] ${log.message}`).join('\n');
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return 'destructive';
      case 'warn':
      case 'warning':
        return 'outline';
      case 'info':
        return 'default';
      case 'debug':
        return 'secondary';
      default:
        return 'default';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className="flex gap-2">
            {isRunning ? (
              <Button size="sm" variant="outline" onClick={stopPolling}>
                <Pause className="h-4 w-4 mr-1" />
                暂停
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={startPolling}>
                <Play className="h-4 w-4 mr-1" />
                开始
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={clearLogs}>
              <Trash2 className="h-4 w-4 mr-1" />
              清空
            </Button>
            <Button size="sm" variant="outline" onClick={downloadLogs}>
              <Download className="h-4 w-4 mr-1" />
              下载
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full rounded-md border bg-slate-950 p-4" ref={scrollRef}>
          <div className="font-mono text-xs space-y-1">
            {logs.length === 0 ? (
              <div className="text-slate-500 text-center py-8">
                暂无日志,点击"开始"按钮查看实时日志
              </div>
            ) : (
              logs.map((log, index) => (
                <div key={index} className="flex gap-2 text-slate-300">
                  <span className="text-slate-500">{log.timestamp}</span>
                  <Badge variant={getLevelColor(log.level)} className="h-5">
                    {log.level}
                  </Badge>
                  <span className="flex-1">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="mt-2 text-xs text-slate-500">
          总计 {logs.length} 条日志 {isRunning && <span className="text-green-500">● 实时更新中</span>}
        </div>
      </CardContent>
    </Card>
  );
}
