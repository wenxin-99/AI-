/*
 * BBR Performance Optimization Page
 * Design: Dark glassmorphism with gradient accents, consistent with UniProxy panel style
 * Features: Status overview, preset optimization, protocol tuning, real-time metrics, TCP params
 */
import { useState, useEffect, useCallback, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Activity,
  Zap,
  Network,
  TrendingUp,
  Settings,
  RefreshCw,
  ArrowLeft,
  Cpu,
  HardDrive,
  Clock,
  Gauge,
  ArrowDownToLine,
  ArrowUpFromLine,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Rocket,
  Flame,
  Server,
  Wifi,
  Timer,
  BarChart3,
} from "lucide-react";
import { bbrService, type BBRStatus, type NetworkMetrics, type OptimizePreset } from "@/services/bbr";
import { Link } from "wouter";

// 格式化字节数
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i];
}

// 格式化运行时间
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}天 ${hours}小时 ${mins}分`;
  if (hours > 0) return `${hours}小时 ${mins}分`;
  return `${mins}分`;
}

// 优化级别配置
const levelConfig: Record<string, { label: string; color: string; icon: React.ReactNode; gradient: string }> = {
  none: { label: "未优化", color: "text-zinc-400", icon: <AlertTriangle className="w-5 h-5" />, gradient: "from-zinc-500/20 to-zinc-600/20" },
  basic: { label: "基础优化", color: "text-emerald-400", icon: <Shield className="w-5 h-5" />, gradient: "from-emerald-500/20 to-teal-500/20" },
  advanced: { label: "高级优化", color: "text-cyan-400", icon: <Rocket className="w-5 h-5" />, gradient: "from-cyan-500/20 to-blue-500/20" },
  aggressive: { label: "激进优化", color: "text-orange-400", icon: <Flame className="w-5 h-5" />, gradient: "from-orange-500/20 to-red-500/20" },
};

// 协议列表
const protocols = [
  { key: "vmess", label: "VMess", desc: "高带宽低延迟" },
  { key: "vless", label: "VLESS", desc: "高带宽低延迟" },
  { key: "trojan", label: "Trojan", desc: "TLS加密优化" },
  { key: "shadowsocks", label: "Shadowsocks", desc: "UDP优化" },
  { key: "websocket", label: "WebSocket", desc: "长连接优化" },
  { key: "grpc", label: "gRPC", desc: "HTTP/2优化" },
  { key: "tls", label: "TLS", desc: "加密隧道优化" },
  { key: "socks5", label: "SOCKS5", desc: "代理连接优化" },
];

export default function BBROptimize() {
  const [status, setStatus] = useState<BBRStatus | null>(null);
  const [metrics, setMetrics] = useState<NetworkMetrics | null>(null);
  const [presets, setPresets] = useState<Record<string, OptimizePreset>>({});
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState<string | null>(null);
  const [optimizingProtocol, setOptimizingProtocol] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [statusData, metricsData, presetsData] = await Promise.all([
        bbrService.getStatus(),
        bbrService.getMetrics().catch(() => null),
        bbrService.getPresets().catch(() => ({})),
      ]);
      setStatus(statusData);
      if (metricsData) setMetrics(metricsData);
      setPresets(presetsData);
    } catch (error) {
      console.error("加载数据失败:", error);
      if (!silent) toast.error("加载数据失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // 每30秒自动刷新指标
    autoRefreshRef.current = setInterval(() => loadData(true), 30000);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData(true);
    toast.success("数据已刷新");
  };

  const handleToggleBBR = async (enabled: boolean) => {
    try {
      if (enabled) {
        await bbrService.enable("bbr");
        toast.success("BBR 已启用");
      } else {
        await bbrService.disable();
        toast.success("BBR 已禁用");
      }
      await loadData(true);
    } catch (error) {
      toast.error("操作失败");
    }
  };

  const handleAutoOptimize = async () => {
    setOptimizing(true);
    try {
      await bbrService.autoOptimize();
      toast.success("自动优化完成");
      await loadData(true);
    } catch (error) {
      toast.error("自动优化失败");
    } finally {
      setOptimizing(false);
    }
  };

  const handleApplyPreset = async (presetKey: string) => {
    setApplyingPreset(presetKey);
    try {
      await bbrService.applyPreset(presetKey);
      toast.success(`${presets[presetKey]?.name || presetKey} 已应用`);
      await loadData(true);
    } catch (error) {
      toast.error("应用预设失败");
    } finally {
      setApplyingPreset(null);
    }
  };

  const handleOptimizeProtocol = async (protocol: string) => {
    setOptimizingProtocol(protocol);
    try {
      await bbrService.optimizeProtocol(protocol);
      toast.success(`${protocol.toUpperCase()} 协议优化完成`);
    } catch (error) {
      toast.error("协议优化失败");
    } finally {
      setOptimizingProtocol(null);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
            <p className="text-muted-foreground text-sm">加载 BBR 状态...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const level = status?.optimize_level || "none";
  const levelInfo = levelConfig[level] || levelConfig.none;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* 页面标题 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon" className="shrink-0">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
                BBR 性能优化
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                动态调整 TCP 参数，为代理和隧道提供最佳网络性能
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="self-start sm:self-auto"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            刷新
          </Button>
        </div>

        {/* 状态概览 - 顶部卡片行 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* BBR 开关卡片 */}
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg bg-gradient-to-br ${status?.enabled ? "from-emerald-500/20 to-green-500/20" : "from-zinc-500/20 to-zinc-600/20"}`}>
                    <Zap className={`w-4 h-4 ${status?.enabled ? "text-emerald-400" : "text-zinc-400"}`} />
                  </div>
                  <span className="text-sm font-medium">BBR 状态</span>
                </div>
                <Switch
                  checked={status?.enabled || false}
                  onCheckedChange={handleToggleBBR}
                />
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={status?.enabled ? "default" : "secondary"} className={status?.enabled ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : ""}>
                  {status?.enabled ? "已启用" : "已禁用"}
                </Badge>
                <span className="text-xs text-muted-foreground">{status?.current_algo || "N/A"}</span>
              </div>
            </CardContent>
          </Card>

          {/* 优化级别 */}
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className={`p-2 rounded-lg bg-gradient-to-br ${levelInfo.gradient}`}>
                  <span className={levelInfo.color}>{levelInfo.icon}</span>
                </div>
                <span className="text-sm font-medium">优化级别</span>
              </div>
              <p className={`text-lg font-bold ${levelInfo.color}`}>{levelInfo.label}</p>
            </CardContent>
          </Card>

          {/* 内核版本 */}
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-indigo-500/20">
                  <Server className="w-4 h-4 text-blue-400" />
                </div>
                <span className="text-sm font-medium">内核版本</span>
              </div>
              <p className="text-sm font-mono text-foreground truncate">{status?.kernel_version || "N/A"}</p>
              <Badge variant={status?.supports_bbr ? "default" : "destructive"} className={`mt-1 text-xs ${status?.supports_bbr ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : ""}`}>
                {status?.supports_bbr ? "支持 BBR" : "不支持"}
              </Badge>
            </CardContent>
          </Card>

          {/* 系统信息 */}
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                  <Cpu className="w-4 h-4 text-purple-400" />
                </div>
                <span className="text-sm font-medium">系统信息</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CPU</span>
                  <span>{status?.system_info?.cpu_cores || 0} 核</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">内存</span>
                  <span>{formatBytes(status?.system_info?.total_memory || 0, 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">运行</span>
                  <span>{formatUptime(status?.system_info?.uptime_seconds || 0)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 主要内容区域 - Tabs */}
        <Tabs defaultValue="optimize" className="space-y-4">
          <TabsList className="bg-card/50 border border-border/50 w-full sm:w-auto flex flex-wrap">
            <TabsTrigger value="optimize" className="flex-1 sm:flex-initial text-xs sm:text-sm">
              <Rocket className="w-4 h-4 mr-1.5" />
              优化方案
            </TabsTrigger>
            <TabsTrigger value="metrics" className="flex-1 sm:flex-initial text-xs sm:text-sm">
              <Activity className="w-4 h-4 mr-1.5" />
              网络指标
            </TabsTrigger>
            <TabsTrigger value="protocol" className="flex-1 sm:flex-initial text-xs sm:text-sm">
              <Network className="w-4 h-4 mr-1.5" />
              协议优化
            </TabsTrigger>
            <TabsTrigger value="params" className="flex-1 sm:flex-initial text-xs sm:text-sm">
              <Settings className="w-4 h-4 mr-1.5" />
              TCP 参数
            </TabsTrigger>
          </TabsList>

          {/* 优化方案 Tab */}
          <TabsContent value="optimize" className="space-y-4">
            {/* 一键自动优化 */}
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 overflow-hidden">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5" />
                <CardHeader className="relative">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="w-5 h-5 text-cyan-400" />
                    智能自动优化
                  </CardTitle>
                  <CardDescription>
                    检测当前网络状况，自动启用 BBR 并动态调整 TCP 缓冲区、连接参数
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative">
                  <Button
                    onClick={handleAutoOptimize}
                    disabled={optimizing}
                    size="lg"
                    className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white shadow-lg shadow-cyan-500/20"
                  >
                    {optimizing ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        正在优化...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-2" />
                        立即自动优化
                      </>
                    )}
                  </Button>
                </CardContent>
              </div>
            </Card>

            {/* 预设方案 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(["basic", "advanced", "aggressive"] as const).map((key) => {
                const preset = presets[key];
                const config = levelConfig[key];
                const isActive = level === key;
                const isApplying = applyingPreset === key;

                return (
                  <Card
                    key={key}
                    className={`bg-card/50 backdrop-blur-sm border-border/50 transition-all duration-300 ${isActive ? "ring-1 ring-cyan-500/50" : "hover:border-border"}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-lg bg-gradient-to-br ${config.gradient}`}>
                            <span className={config.color}>{config.icon}</span>
                          </div>
                          <div>
                            <CardTitle className="text-base">{preset?.name || config.label}</CardTitle>
                          </div>
                        </div>
                        {isActive && (
                          <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-xs">当前</Badge>
                        )}
                      </div>
                      <CardDescription className="text-xs mt-2">
                        {preset?.description || "加载中..."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-xs text-muted-foreground mb-3">
                        {preset ? `${Object.keys(preset.parameters).length} 项参数调整` : ""}
                      </div>
                      <Button
                        variant={isActive ? "secondary" : "outline"}
                        size="sm"
                        className="w-full"
                        disabled={isApplying || isActive}
                        onClick={() => handleApplyPreset(key)}
                      >
                        {isApplying ? (
                          <>
                            <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" />
                            应用中...
                          </>
                        ) : isActive ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 mr-1.5" />
                            已应用
                          </>
                        ) : (
                          "应用方案"
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* 可用拥塞算法 */}
            {status?.available_algos && status.available_algos.length > 0 && (
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-blue-400" />
                    可用拥塞控制算法
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {status.available_algos.map((algo) => (
                      <Badge
                        key={algo}
                        variant={algo === status.current_algo ? "default" : "outline"}
                        className={algo === status.current_algo
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                          : "text-muted-foreground"
                        }
                      >
                        {algo}
                        {algo === status.current_algo && " (当前)"}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 网络指标 Tab */}
          <TabsContent value="metrics" className="space-y-4">
            {/* 核心指标 */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <MetricCard
                label="实时带宽"
                value={`${metrics?.bandwidth?.toFixed(1) || "0"}`}
                unit="Mbps"
                icon={<Wifi className="w-4 h-4" />}
                gradient="from-blue-500/15 to-cyan-500/15"
                borderColor="border-blue-500/20"
                textColor="text-blue-400"
              />
              <MetricCard
                label="平均延迟"
                value={`${metrics?.rtt?.toFixed(1) || "0"}`}
                unit="ms"
                icon={<Timer className="w-4 h-4" />}
                gradient="from-emerald-500/15 to-green-500/15"
                borderColor="border-emerald-500/20"
                textColor="text-emerald-400"
                warning={metrics?.rtt ? metrics.rtt > 100 : false}
              />
              <MetricCard
                label="丢包率"
                value={`${metrics?.packet_loss?.toFixed(2) || "0"}`}
                unit="%"
                icon={<AlertTriangle className="w-4 h-4" />}
                gradient="from-orange-500/15 to-amber-500/15"
                borderColor="border-orange-500/20"
                textColor="text-orange-400"
                warning={metrics?.packet_loss ? metrics.packet_loss > 1 : false}
              />
              <MetricCard
                label="重传率"
                value={`${metrics?.retrans_rate?.toFixed(2) || "0"}`}
                unit="%"
                icon={<RefreshCw className="w-4 h-4" />}
                gradient="from-red-500/15 to-rose-500/15"
                borderColor="border-red-500/20"
                textColor="text-red-400"
                warning={metrics?.retrans_rate ? metrics.retrans_rate > 5 : false}
              />
              <MetricCard
                label="拥塞度"
                value={`${metrics?.congestion?.toFixed(1) || "0"}`}
                unit="%"
                icon={<BarChart3 className="w-4 h-4" />}
                gradient="from-purple-500/15 to-pink-500/15"
                borderColor="border-purple-500/20"
                textColor="text-purple-400"
                warning={metrics?.congestion ? metrics.congestion > 50 : false}
              />
            </div>

            {/* TCP 连接统计 */}
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Network className="w-4 h-4 text-cyan-400" />
                  TCP 连接统计
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-lg bg-white/5">
                    <p className="text-2xl font-bold text-foreground">{metrics?.connections || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">总连接数</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-white/5">
                    <p className="text-2xl font-bold text-emerald-400">{metrics?.tcp_estab || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">已建立</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-white/5">
                    <p className="text-2xl font-bold text-amber-400">{metrics?.tcp_time_wait || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">TIME_WAIT</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-white/5">
                    <p className="text-2xl font-bold text-red-400">{metrics?.tcp_close_wait || 0}</p>
                    <p className="text-xs text-muted-foreground mt-1">CLOSE_WAIT</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 流量统计 */}
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-green-400" />
                  流量统计
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ArrowDownToLine className="w-3.5 h-3.5 text-cyan-400" />
                      接收
                    </div>
                    <p className="text-lg font-bold">{formatBytes(metrics?.rx_bytes || 0)}</p>
                    <p className="text-xs text-muted-foreground">{(metrics?.rx_packets || 0).toLocaleString()} 包</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ArrowUpFromLine className="w-3.5 h-3.5 text-purple-400" />
                      发送
                    </div>
                    <p className="text-lg font-bold">{formatBytes(metrics?.tx_bytes || 0)}</p>
                    <p className="text-xs text-muted-foreground">{(metrics?.tx_packets || 0).toLocaleString()} 包</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                      错误
                    </div>
                    <p className="text-lg font-bold text-red-400">{((metrics?.rx_errors || 0) + (metrics?.tx_errors || 0)).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">RX: {metrics?.rx_errors || 0} / TX: {metrics?.tx_errors || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 网络接口详情 */}
            {metrics?.interface_stats && Object.keys(metrics.interface_stats).length > 0 && (
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-indigo-400" />
                    网络接口
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto -mx-6 px-6">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left py-2 text-muted-foreground font-medium text-xs">接口</th>
                          <th className="text-right py-2 text-muted-foreground font-medium text-xs">接收</th>
                          <th className="text-right py-2 text-muted-foreground font-medium text-xs">发送</th>
                          <th className="text-right py-2 text-muted-foreground font-medium text-xs hidden sm:table-cell">丢包</th>
                          <th className="text-right py-2 text-muted-foreground font-medium text-xs hidden sm:table-cell">速率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(metrics.interface_stats).map((iface) => (
                          <tr key={iface.name} className="border-b border-border/10">
                            <td className="py-2.5 font-mono text-xs">{iface.name}</td>
                            <td className="py-2.5 text-right text-xs">{formatBytes(iface.rx_bytes)}</td>
                            <td className="py-2.5 text-right text-xs">{formatBytes(iface.tx_bytes)}</td>
                            <td className="py-2.5 text-right text-xs hidden sm:table-cell">
                              <span className={iface.rx_drop + iface.tx_drop > 0 ? "text-red-400" : "text-muted-foreground"}>
                                {iface.rx_drop + iface.tx_drop}
                              </span>
                            </td>
                            <td className="py-2.5 text-right text-xs hidden sm:table-cell">
                              {iface.speed > 0 ? `${iface.speed} Mbps` : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 协议优化 Tab */}
          <TabsContent value="protocol" className="space-y-4">
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Network className="w-5 h-5 text-purple-400" />
                  协议专项优化
                </CardTitle>
                <CardDescription>
                  针对不同代理协议和传输方式，应用专门的 TCP 参数调优
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {protocols.map((p) => {
                    const isOptimizing = optimizingProtocol === p.key;
                    return (
                      <button
                        key={p.key}
                        onClick={() => handleOptimizeProtocol(p.key)}
                        disabled={isOptimizing}
                        className="group relative p-4 rounded-lg border border-border/30 bg-white/5 hover:bg-white/10 transition-all duration-200 text-left disabled:opacity-50"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm">{p.label}</span>
                          {isOptimizing ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                          ) : (
                            <Zap className="w-3.5 h-3.5 text-muted-foreground group-hover:text-cyan-400 transition-colors" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{p.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TCP 参数 Tab */}
          <TabsContent value="params" className="space-y-4">
            <Card className="bg-card/50 backdrop-blur-sm border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Settings className="w-5 h-5 text-zinc-400" />
                  当前 TCP 内核参数
                </CardTitle>
                <CardDescription>
                  系统当前生效的 sysctl 网络参数
                </CardDescription>
              </CardHeader>
              <CardContent>
                {status?.tcp_parameters && Object.keys(status.tcp_parameters).length > 0 ? (
                  <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                    {Object.entries(status.tcp_parameters)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([key, value]) => (
                        <div
                          key={key}
                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2.5 rounded-md bg-white/5 hover:bg-white/8 transition-colors"
                        >
                          <span className="text-xs font-mono text-muted-foreground break-all">{key}</span>
                          <span className="text-xs font-mono font-semibold text-foreground sm:text-right break-all">{value}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">无参数数据</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// 指标卡片组件
function MetricCard({
  label,
  value,
  unit,
  icon,
  gradient,
  borderColor,
  textColor,
  warning = false,
}: {
  label: string;
  value: string;
  unit: string;
  icon: React.ReactNode;
  gradient: string;
  borderColor: string;
  textColor: string;
  warning?: boolean;
}) {
  return (
    <div className={`p-3 rounded-lg bg-gradient-to-br ${gradient} border ${borderColor} transition-all`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={textColor}>{icon}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
        {warning && <AlertTriangle className="w-3 h-3 text-amber-400 ml-auto" />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl sm:text-2xl font-bold ${textColor}`}>{value}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}
