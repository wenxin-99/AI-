import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, AlertTriangle, CheckCircle, XCircle, RefreshCw, Settings, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";

interface NodeMonitor {
  id: number;
  node_id: number;
  status: string;
  xray_status: boolean;
  gost_status: boolean;
  ports_listening: number[];
  latency: number;
  jitter: number;
  packet_loss: number;
  error_message?: string;
  created_at: string;
}

interface Node {
  id: number;
  name: string;
  host: string;
  port: number;
  type: string;
  status: string;
}

export default function NodeMonitor() {
  const params = useParams();
  const nodeId = params.id;
  
  const [node, setNode] = useState<Node | null>(null);
  const [currentStatus, setCurrentStatus] = useState<NodeMonitor | null>(null);
  const [history, setHistory] = useState<NodeMonitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (nodeId) {
      loadNodeData();
      loadMonitorData();
      
      // 每30秒刷新一次
      const interval = setInterval(loadMonitorData, 30000);
      return () => clearInterval(interval);
    }
  }, [nodeId]);

  const loadNodeData = async () => {
    try {
      const response = await apiClient.get(`/api/v1/node/${nodeId}`);
      setNode(response.data);
    } catch (error) {
      console.error("加载节点信息失败:", error);
      toast.error("加载节点信息失败");
    }
  };

  const loadMonitorData = async () => {
    try {
      setLoading(true);
      
      // 加载当前状态
      const statusResponse = await apiClient.get(`/api/v1/node/${nodeId}/monitor/status`);
      setCurrentStatus(statusResponse.data);
      
      // 加载历史数据（最近24小时）
      const historyResponse = await apiClient.get(`/api/v1/node/${nodeId}/monitor/history?hours=24`);
      setHistory(historyResponse.data || []);
    } catch (error) {
      console.error("加载监控数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckNow = async () => {
    try {
      setChecking(true);
      await apiClient.post(`/api/v1/node/${nodeId}/monitor/check`);
      toast.success("已触发节点检查，请稍后刷新查看结果");
      
      // 3秒后刷新数据
      setTimeout(loadMonitorData, 3000);
    } catch (error) {
      console.error("触发检查失败:", error);
      toast.error("触发检查失败");
    } finally {
      setChecking(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "online":
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />在线</Badge>;
      case "offline":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />离线</Badge>;
      case "degraded":
        return <Badge variant="secondary"><AlertTriangle className="w-3 h-3 mr-1" />降级</Badge>;
      default:
        return <Badge variant="outline">未知</Badge>;
    }
  };

  const getServiceStatusBadge = (running: boolean) => {
    return running ? (
      <Badge className="bg-green-500">运行中</Badge>
    ) : (
      <Badge variant="destructive">已停止</Badge>
    );
  };

  const formatLatency = (latency: number) => {
    if (latency < 50) return <span className="text-green-600 font-semibold">{latency.toFixed(2)}ms</span>;
    if (latency < 150) return <span className="text-yellow-600 font-semibold">{latency.toFixed(2)}ms</span>;
    return <span className="text-red-600 font-semibold">{latency.toFixed(2)}ms</span>;
  };

  const formatPacketLoss = (loss: number) => {
    if (loss < 1) return <span className="text-green-600 font-semibold">{loss.toFixed(2)}%</span>;
    if (loss < 5) return <span className="text-yellow-600 font-semibold">{loss.toFixed(2)}%</span>;
    return <span className="text-red-600 font-semibold">{loss.toFixed(2)}%</span>;
  };

  if (loading && !currentStatus) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">节点监控</h1>
          <p className="text-muted-foreground mt-1">
            {node?.name} ({node?.host})
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={loadMonitorData}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button
            onClick={handleCheckNow}
            disabled={checking}
          >
            <Activity className="w-4 h-4 mr-2" />
            立即检查
          </Button>
          <Link href={`/nodes/${nodeId}/monitor/config`}>
            <Button variant="outline">
              <Settings className="w-4 h-4 mr-2" />
              监控配置
            </Button>
          </Link>
        </div>
      </div>

      {/* 当前状态概览 */}
      {currentStatus && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">节点状态</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                {getStatusBadge(currentStatus.status)}
                <span className="text-xs text-muted-foreground">
                  {new Date(currentStatus.created_at).toLocaleString()}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">服务状态</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Xray</span>
                {getServiceStatusBadge(currentStatus.xray_status)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Gost</span>
                {getServiceStatusBadge(currentStatus.gost_status)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">网络延迟</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatLatency(currentStatus.latency)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                抖动: {currentStatus.jitter.toFixed(2)}ms
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">丢包率</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatPacketLoss(currentStatus.packet_loss)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {currentStatus.packet_loss < 1 ? '网络质量优秀' : 
                 currentStatus.packet_loss < 5 ? '网络质量良好' : '网络质量较差'}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 详细信息 */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="history">历史记录</TabsTrigger>
          <TabsTrigger value="ports">端口监听</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {currentStatus?.error_message && (
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="text-red-700 flex items-center">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  错误信息
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-red-600">{currentStatus.error_message}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>线路质量趋势</CardTitle>
              <CardDescription>最近24小时的网络质量变化</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length > 0 ? (
                <div className="space-y-4">
                  <div className="h-64 flex items-end justify-between gap-1">
                    {history.slice(0, 48).reverse().map((record, index) => {
                      const maxLatency = Math.max(...history.map(r => r.latency));
                      const height = (record.latency / maxLatency) * 100;
                      const color = record.latency < 50 ? 'bg-green-500' : 
                                   record.latency < 150 ? 'bg-yellow-500' : 'bg-red-500';
                      
                      return (
                        <div
                          key={index}
                          className={`flex-1 ${color} rounded-t transition-all hover:opacity-80`}
                          style={{ height: `${height}%`, minHeight: '2px' }}
                          title={`${record.latency.toFixed(2)}ms - ${new Date(record.created_at).toLocaleTimeString()}`}
                        />
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">平均延迟</p>
                      <p className="text-lg font-semibold">
                        {(history.reduce((sum, r) => sum + r.latency, 0) / history.length).toFixed(2)}ms
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">平均抖动</p>
                      <p className="text-lg font-semibold">
                        {(history.reduce((sum, r) => sum + r.jitter, 0) / history.length).toFixed(2)}ms
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">平均丢包率</p>
                      <p className="text-lg font-semibold">
                        {(history.reduce((sum, r) => sum + r.packet_loss, 0) / history.length).toFixed(2)}%
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">暂无历史数据</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>监控历史</CardTitle>
              <CardDescription>最近的监控检查记录</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.slice(0, 20).map((record) => (
                  <div
                    key={record.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent"
                  >
                    <div className="flex items-center gap-4">
                      {getStatusBadge(record.status)}
                      <div className="text-sm">
                        <p className="font-medium">
                          {new Date(record.created_at).toLocaleString()}
                        </p>
                        {record.error_message && (
                          <p className="text-red-600 text-xs mt-1">{record.error_message}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-6 text-sm">
                      <div>
                        <span className="text-muted-foreground">延迟: </span>
                        {formatLatency(record.latency)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">丢包: </span>
                        {formatPacketLoss(record.packet_loss)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>端口监听状态</CardTitle>
              <CardDescription>当前节点正在监听的端口列表</CardDescription>
            </CardHeader>
            <CardContent>
              {currentStatus?.ports_listening && currentStatus.ports_listening.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {currentStatus.ports_listening.map((port) => (
                    <Badge key={port} variant="outline" className="text-sm">
                      {port}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">暂无端口监听数据</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
