import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Activity, Zap, Network, TrendingUp, Settings, RefreshCw } from "lucide-react";
import { bbrService, type BBRStatus, type NetworkMetrics } from "@/services/bbr";

export default function BBROptimize() {
  const [status, setStatus] = useState<BBRStatus | null>(null);
  const [metrics, setMetrics] = useState<NetworkMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statusData, metricsData] = await Promise.all([
        bbrService.getStatus(),
        bbrService.getMetrics(),
      ]);
      setStatus(statusData);
      setMetrics(metricsData);
    } catch (error) {
      console.error("加载数据失败:", error);
      toast.error("加载数据失败");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBBR = async (enabled: boolean) => {
    try {
      if (enabled) {
        await bbrService.enable("bbr");
        toast.success("BBR已启用");
      } else {
        await bbrService.disable();
        toast.success("BBR已禁用");
      }
      loadData();
    } catch (error) {
      toast.error("操作失败");
    }
  };

  const handleAutoOptimize = async () => {
    setOptimizing(true);
    try {
      await bbrService.autoOptimize();
      toast.success("自动优化完成");
      loadData();
    } catch (error) {
      toast.error("自动优化失败");
    } finally {
      setOptimizing(false);
    }
  };

  const handleOptimizeProtocol = async (protocol: string) => {
    try {
      await bbrService.optimizeProtocol(protocol);
      toast.success(`${protocol.toUpperCase()} 协议优化完成`);
    } catch (error) {
      toast.error("协议优化失败");
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
            BBR 性能优化
          </h1>
          <p className="text-muted-foreground mt-2">
            自动动态调整 TCP 参数,为所有协议和隧道提供最佳性能
          </p>
        </div>

        {/* BBR 状态卡片 */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-500" />
                  BBR 状态
                </CardTitle>
                <CardDescription>拥塞控制算法和系统信息</CardDescription>
              </div>
              <Switch
                checked={status?.enabled || false}
                onCheckedChange={handleToggleBBR}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">当前算法</p>
                <p className="text-lg font-semibold">
                  {status?.current_algo || "N/A"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">内核版本</p>
                <p className="text-lg font-semibold">
                  {status?.kernel_version || "N/A"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">BBR 支持</p>
                <Badge variant={status?.supports_bbr ? "default" : "destructive"}>
                  {status?.supports_bbr ? "支持" : "不支持"}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">可用算法</p>
                <p className="text-sm">
                  {status?.available_algos?.join(", ") || "N/A"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 网络性能指标 */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-500" />
              网络性能指标
            </CardTitle>
            <CardDescription>实时网络性能监控</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 p-4 rounded-lg border border-blue-500/20">
                <p className="text-sm text-muted-foreground mb-1">带宽</p>
                <p className="text-2xl font-bold text-blue-400">
                  {metrics?.bandwidth.toFixed(1)} Mbps
                </p>
              </div>
              <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 p-4 rounded-lg border border-green-500/20">
                <p className="text-sm text-muted-foreground mb-1">延迟 (RTT)</p>
                <p className="text-2xl font-bold text-green-400">
                  {metrics?.rtt.toFixed(1)} ms
                </p>
              </div>
              <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 p-4 rounded-lg border border-orange-500/20">
                <p className="text-sm text-muted-foreground mb-1">丢包率</p>
                <p className="text-2xl font-bold text-orange-400">
                  {metrics?.packet_loss.toFixed(2)}%
                </p>
              </div>
              <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 p-4 rounded-lg border border-purple-500/20">
                <p className="text-sm text-muted-foreground mb-1">拥塞度</p>
                <p className="text-2xl font-bold text-purple-400">
                  {metrics?.congestion.toFixed(1)}%
                </p>
              </div>
              <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 p-4 rounded-lg border border-cyan-500/20">
                <p className="text-sm text-muted-foreground mb-1">连接数</p>
                <p className="text-2xl font-bold text-cyan-400">
                  {metrics?.connections}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 自动优化 */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-cyan-500" />
              自动优化
            </CardTitle>
            <CardDescription>
              一键启用 BBR 并根据网络状况自动调整参数
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleAutoOptimize}
              disabled={optimizing}
              className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600"
            >
              {optimizing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  优化中...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  立即优化
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 协议优化 */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="w-5 h-5 text-purple-500" />
              协议优化
            </CardTitle>
            <CardDescription>
              为特定协议应用专门的优化参数
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {["vmess", "vless", "trojan", "shadowsocks", "http", "websocket", "grpc", "socks5"].map((protocol) => (
                <Button
                  key={protocol}
                  variant="outline"
                  onClick={() => handleOptimizeProtocol(protocol)}
                  className="bg-card/30 hover:bg-card/50 border-border/50"
                >
                  {protocol.toUpperCase()}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* TCP 参数 */}
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-500" />
              TCP 参数
            </CardTitle>
            <CardDescription>当前系统 TCP 配置</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
              {status?.tcp_parameters && Object.entries(status.tcp_parameters).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center p-2 bg-card/30 rounded border border-border/30">
                  <span className="text-sm text-muted-foreground font-mono">{key}</span>
                  <span className="text-sm font-semibold">{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
