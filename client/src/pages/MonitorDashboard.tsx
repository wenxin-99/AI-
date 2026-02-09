import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertTriangle, CheckCircle, Server, XCircle, Bell, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";

interface MonitorStats {
  total_nodes: number;
  online_nodes: number;
  offline_nodes: number;
  degraded_nodes: number;
  total_alerts: number;
  unresolved_alerts: number;
}

interface AlertLog {
  id: number;
  node_id: number;
  node_name: string;
  rule_name: string;
  alert_type: string;
  severity: string;
  message: string;
  metric_value: number;
  created_at: string;
  resolved_at?: string;
}

interface Node {
  id: number;
  name: string;
  host: string;
  status: string;
  last_heartbeat?: string;
}

export default function MonitorDashboard() {
  const [stats, setStats] = useState<MonitorStats | null>(null);
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    
    // 每30秒刷新一次
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // 加载统计数据
      const statsResponse = await apiClient.get("/api/v1/monitor/stats");
      setStats(statsResponse.data);
      
      // 加载未解决的告警
      const alertsResponse = await apiClient.get("/api/v1/monitor/alerts/logs?page_size=10");
      setAlerts(alertsResponse.data.data || []);
      
      // 加载节点列表
      const nodesResponse = await apiClient.get("/api/v1/node/list");
      setNodes(nodesResponse.data || []);
    } catch (error) {
      console.error("加载监控数据失败:", error);
      toast.error("加载监控数据失败");
    } finally {
      setLoading(false);
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Badge variant="destructive">严重</Badge>;
      case "warning":
        return <Badge variant="secondary">警告</Badge>;
      case "info":
        return <Badge variant="outline">信息</Badge>;
      default:
        return <Badge>{severity}</Badge>;
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

  const handleResolveAlert = async (alertId: number) => {
    try {
      await apiClient.post(`/api/v1/monitor/alerts/logs/${alertId}/resolve`);
      toast.success("已标记为已解决");
      loadData();
    } catch (error) {
      console.error("标记告警失败:", error);
      toast.error("标记告警失败");
    }
  };

  if (loading && !stats) {
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
          <h1 className="text-3xl font-bold">监控中心</h1>
          <p className="text-muted-foreground mt-1">节点状态监控和告警管理</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Link href="/monitor/alerts/rules">
            <Button variant="outline">
              <Bell className="w-4 h-4 mr-2" />
              告警规则
            </Button>
          </Link>
        </div>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <Server className="w-4 h-4 mr-2" />
                节点总数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total_nodes}</div>
              <div className="flex gap-4 mt-2 text-sm">
                <span className="text-green-600">在线: {stats.online_nodes}</span>
                <span className="text-red-600">离线: {stats.offline_nodes}</span>
                <span className="text-yellow-600">降级: {stats.degraded_nodes}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <AlertTriangle className="w-4 h-4 mr-2" />
                告警总数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total_alerts}</div>
              <p className="text-sm text-muted-foreground mt-2">
                未解决: <span className="text-red-600 font-semibold">{stats.unresolved_alerts}</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center">
                <Activity className="w-4 h-4 mr-2" />
                健康度
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {stats.total_nodes > 0 
                  ? Math.round((stats.online_nodes / stats.total_nodes) * 100)
                  : 0}%
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {stats.online_nodes} / {stats.total_nodes} 节点正常
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 节点状态列表 */}
      <Card>
        <CardHeader>
          <CardTitle>节点状态</CardTitle>
          <CardDescription>所有节点的实时状态</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {nodes.map((node) => (
              <Link key={node.id} href={`/nodes/${node.id}/monitor`}>
                <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent cursor-pointer">
                  <div className="flex items-center gap-4">
                    {getStatusBadge(node.status)}
                    <div>
                      <p className="font-medium">{node.name}</p>
                      <p className="text-sm text-muted-foreground">{node.host}</p>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {node.last_heartbeat 
                      ? `最后心跳: ${new Date(node.last_heartbeat).toLocaleString()}`
                      : '无心跳数据'}
                  </div>
                </div>
              </Link>
            ))}
            {nodes.length === 0 && (
              <p className="text-muted-foreground text-center py-8">暂无节点数据</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 最近告警 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>最近告警</CardTitle>
              <CardDescription>最新的告警事件</CardDescription>
            </div>
            <Link href="/monitor/alerts/logs">
              <Button variant="outline" size="sm">查看全部</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-4">
                  {getSeverityBadge(alert.severity)}
                  <div>
                    <p className="font-medium">{alert.node_name}</p>
                    <p className="text-sm text-muted-foreground">{alert.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(alert.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                {!alert.resolved_at && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResolveAlert(alert.id)}
                  >
                    标记已解决
                  </Button>
                )}
              </div>
            ))}
            {alerts.length === 0 && (
              <p className="text-muted-foreground text-center py-8">暂无告警记录</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
