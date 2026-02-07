/*
 * Design: Glassmorphism dark theme with cyan-purple gradient accents.
 * Layout: Flat structure - summary cards → trend chart → top users + inbound distribution.
 * Typography: Outfit headings, Inter body.
 */
import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Line,
  LineChart,
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ArrowUp,
  ArrowDown,
  Activity,
  TrendingUp,
  Users,
  RefreshCw,
  Trash2,
  HardDrive,
} from "lucide-react";
import { trafficService, TrafficTrend } from "@/services/traffic";
import { userService, TopUser, UserStats } from "@/services/user";
import { toast } from "sonner";

// 格式化流量
function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

// 格式化为MB/GB用于图表
function formatChartBytes(bytes: number): string {
  if (bytes === 0) return "0";
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + " GB";
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

export default function TrafficStats() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [systemTraffic, setSystemTraffic] = useState<any>(null);
  const [trafficTrend, setTrafficTrend] = useState<TrafficTrend[]>([]);
  const [topUsers, setTopUsers] = useState<TopUser[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  const fetchTrafficData = useCallback(async () => {
    try {
      setLoading(true);
      const [sysTraffic, trend, top, stats] = await Promise.all([
        trafficService.getSystemTraffic(),
        trafficService.getTrafficTrend(days),
        userService.getTopUsers(10),
        userService.getStats(),
      ]);
      setSystemTraffic(sysTraffic);
      setTrafficTrend(trend);
      setTopUsers(top);
      setUserStats(stats);
    } catch (error) {
      console.error("Failed to fetch traffic data:", error);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchTrafficData();
  }, [fetchTrafficData]);

  // 转换趋势数据为图表格式
  const chartData = trafficTrend.map((item) => ({
    date: new Date(item.date).toLocaleDateString("zh-CN", {
      month: "numeric",
      day: "numeric",
    }),
    upload: item.upload,
    download: item.download,
    total: item.total,
  }));

  // 计算总流量百分比
  const totalUsed = userStats?.total_traffic_used || 0;
  const totalLimit = userStats?.total_traffic_limit || 0;
  const totalPct = totalLimit > 0 ? Math.min((totalUsed / totalLimit) * 100, 100) : 0;

  // 自定义 Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
      <div className="bg-black/90 border border-white/10 rounded-lg p-3 shadow-xl">
        <p className="text-white/80 text-xs mb-2">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-white/60">{entry.name}:</span>
            <span className="text-white font-medium">{formatChartBytes(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              流量统计
            </h1>
            <p className="text-muted-foreground mt-1">
              系统流量使用情况和趋势分析
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={days.toString()}
              onValueChange={(v) => setDays(parseInt(v))}
            >
              <SelectTrigger className="w-32 bg-white/5 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">最近 7 天</SelectItem>
                <SelectItem value="14">最近 14 天</SelectItem>
                <SelectItem value="30">最近 30 天</SelectItem>
                <SelectItem value="90">最近 90 天</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchTrafficData}
              className="border-white/10"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-5 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400/20 to-blue-500/20 flex items-center justify-center">
                <ArrowUp className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-1">总上传</p>
            <p className="text-2xl font-bold text-white">
              {formatBytes(systemTraffic?.total_upload || 0)}
            </p>
          </Card>

          <Card className="p-5 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-400/20 to-pink-500/20 flex items-center justify-center">
                <ArrowDown className="w-5 h-5 text-purple-400" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-1">总下载</p>
            <p className="text-2xl font-bold text-white">
              {formatBytes(systemTraffic?.total_download || 0)}
            </p>
          </Card>

          <Card className="p-5 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-400/20 to-cyan-500/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-green-400" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-1">总流量</p>
            <p className="text-2xl font-bold text-white">
              {formatBytes(systemTraffic?.total || (systemTraffic?.total_upload || 0) + (systemTraffic?.total_download || 0))}
            </p>
          </Card>

          <Card className="p-5 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400/20 to-orange-500/20 flex items-center justify-center">
                <HardDrive className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-1">总配额使用</p>
            <div>
              <p className="text-2xl font-bold text-white">
                {totalLimit > 0 ? `${totalPct.toFixed(1)}%` : "无限制"}
              </p>
              {totalLimit > 0 && (
                <Progress value={totalPct} className="h-1.5 mt-2 bg-white/10" />
              )}
            </div>
          </Card>
        </div>

        {/* Traffic trend chart */}
        <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold text-white">流量趋势</h2>
              <p className="text-sm text-muted-foreground mt-1">
                最近 {days} 天的每日流量变化
              </p>
            </div>
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
          </div>
          {loading ? (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              加载中...
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="uploadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="downloadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  stroke="rgba(255,255,255,0.3)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.3)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatChartBytes(v)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="upload"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fill="url(#uploadFill)"
                  name="上传"
                />
                <Area
                  type="monotone"
                  dataKey="download"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fill="url(#downloadFill)"
                  name="下载"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              暂无流量数据
            </div>
          )}
        </Card>

        {/* Bottom section: Top users + quick actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top users table */}
          <Card className="lg:col-span-2 bg-card/40 backdrop-blur-xl border-white/10 overflow-hidden">
            <div className="p-6 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">用户流量排行</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    流量使用最多的 TOP 10 用户
                  </p>
                </div>
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>用户名</TableHead>
                    <TableHead>已用流量</TableHead>
                    <TableHead>流量限制</TableHead>
                    <TableHead>使用率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topUsers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-8 text-muted-foreground"
                      >
                        暂无用户数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    topUsers.map((user, index) => (
                      <TableRow
                        key={user.id}
                        className="border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <TableCell className="text-center">
                          {index < 3 ? (
                            <div
                              className={`w-7 h-7 rounded-full mx-auto flex items-center justify-center text-xs font-bold text-white ${
                                index === 0
                                  ? "bg-gradient-to-br from-amber-400 to-amber-600"
                                  : index === 1
                                  ? "bg-gradient-to-br from-slate-300 to-slate-500"
                                  : "bg-gradient-to-br from-orange-400 to-orange-600"
                              }`}
                            >
                              {index + 1}
                            </div>
                          ) : (
                            <span className="text-white/40 text-sm">{index + 1}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400/30 to-purple-500/30 flex items-center justify-center text-xs font-bold text-white/80">
                              {user.username.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-white text-sm">
                              {user.username}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-white/80">
                          {formatBytes(user.traffic_used)}
                        </TableCell>
                        <TableCell className="text-sm text-white/50">
                          {user.traffic_limit > 0
                            ? formatBytes(user.traffic_limit)
                            : "无限制"}
                        </TableCell>
                        <TableCell>
                          {user.traffic_limit > 0 ? (
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <Progress
                                value={Math.min(user.percentage, 100)}
                                className="h-1.5 flex-1 bg-white/10"
                              />
                              <span className="text-xs text-white/50 w-10 text-right">
                                {user.percentage.toFixed(0)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-white/30">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {/* Quick actions & info */}
          <div className="space-y-4">
            <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
              <h3 className="text-lg font-semibold text-white mb-4">快捷操作</h3>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start border-white/10 text-white/70 hover:text-white"
                  onClick={async () => {
                    try {
                      await trafficService.resetAllTraffic();
                      toast.success("所有用户流量已重置");
                      fetchTrafficData();
                    } catch {
                      toast.error("重置失败");
                    }
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-3" />
                  重置所有用户流量
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start border-white/10 text-white/70 hover:text-white"
                  onClick={async () => {
                    try {
                      await trafficService.cleanOldLogs(30);
                      toast.success("30天前的日志已清理");
                    } catch {
                      toast.error("清理失败");
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-3" />
                  清理 30 天前日志
                </Button>
              </div>
            </Card>

            <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
              <h3 className="text-lg font-semibold text-white mb-4">用户概览</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">总用户数</span>
                  <span className="text-sm font-medium text-white">
                    {userStats?.total_users ?? 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">活跃用户</span>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                    {userStats?.active_users ?? 0}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">已禁用</span>
                  <Badge variant="destructive" className="text-xs">
                    {userStats?.disabled_users ?? 0}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">已过期</span>
                  <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-400">
                    {userStats?.expired_users ?? 0}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-white/60">今日新增</span>
                  <span className="text-sm font-medium text-cyan-400">
                    +{userStats?.today_new ?? 0}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
