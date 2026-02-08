import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Area, AreaChart } from "recharts";
import { ArrowUp, ArrowDown, Activity, Users, RefreshCw, Trash2, Database } from "lucide-react";
import { trafficService } from "@/services/traffic";
import api from "@/lib/api";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface UserTrafficItem {
  id: number;
  username: string;
  traffic_used: number;
  traffic_limit: number;
}

export default function TrafficStats() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [systemTraffic, setSystemTraffic] = useState<any>(null);
  const [trafficTrend, setTrafficTrend] = useState<any[]>([]);
  const [users, setUsers] = useState<UserTrafficItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchTrafficData();
  }, [days]);

  const fetchTrafficData = async () => {
    try {
      setLoading(true);
      const [sysTraffic, trend] = await Promise.all([
        trafficService.getSystemTraffic(),
        trafficService.getTrafficTrend(days),
      ]);
      setSystemTraffic(sysTraffic);
      setTrafficTrend(trend);

      // 获取用户列表（含流量信息）
      try {
        const usersRes: any = await api.get("/api/v1/users?page=1&page_size=100");
        const userList = usersRes?.users || usersRes?.data?.users || [];
        setUsers(userList);
      } catch {
        // 非管理员可能无权限
      }
    } catch (error) {
      console.error("Failed to fetch traffic data:", error);
      toast.error("获取流量数据失败");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTrafficData();
    setRefreshing(false);
    toast.success("数据已刷新");
  };

  // 格式化流量数据
  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
  };

  // 转换趋势数据为图表格式
  const chartData = useMemo(() => trafficTrend.map((item) => ({
    date: new Date(item.date).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }),
    upload: +(item.upload / 1024 / 1024).toFixed(2), // MB
    download: +(item.download / 1024 / 1024).toFixed(2), // MB
    total: +((item.upload + item.download) / 1024 / 1024).toFixed(2),
  })), [trafficTrend]);

  // 从 API 返回的数据中提取正确的字段
  const totalUpload = systemTraffic?.total_upload || systemTraffic?.upload || 0;
  const totalDownload = systemTraffic?.total_download || systemTraffic?.download || 0;
  const totalTraffic = systemTraffic?.total || (totalUpload + totalDownload);
  const inboundCount = systemTraffic?.inbound_count || 0;
  const inboundTraffic = systemTraffic?.inbound_traffic || {};

  // 入站流量分布数据
  const inboundChartData = useMemo(() => {
    return Object.entries(inboundTraffic).map(([name, bytes]: [string, any]) => ({
      name: name || "未知",
      traffic: +(bytes / 1024 / 1024 / 1024).toFixed(2), // GB
    }));
  }, [inboundTraffic]);

  // 用户流量排行
  const topUsers = useMemo(() => {
    return [...users]
      .filter(u => u.traffic_used > 0)
      .sort((a, b) => b.traffic_used - a.traffic_used)
      .slice(0, 10);
  }, [users]);

  // 计算今日与昨日的变化百分比
  const getTrendPercent = (field: "upload" | "download" | "total") => {
    if (trafficTrend.length < 2) return null;
    const today = trafficTrend[trafficTrend.length - 1];
    const yesterday = trafficTrend[trafficTrend.length - 2];
    const todayVal = field === "total" ? (today.upload + today.download) : today[field];
    const yesterdayVal = field === "total" ? (yesterday.upload + yesterday.download) : yesterday[field];
    if (yesterdayVal === 0) return todayVal > 0 ? 100 : 0;
    return Math.round(((todayVal - yesterdayVal) / yesterdayVal) * 100);
  };

  const renderTrendBadge = (field: "upload" | "download" | "total") => {
    const pct = getTrendPercent(field);
    if (pct === null) return <span className="text-xs text-muted-foreground">暂无趋势</span>;
    if (pct === 0) return <span className="text-xs text-muted-foreground">持平</span>;
    const isUp = pct > 0;
    return (
      <span className={`text-sm font-medium ${isUp ? "text-green-400" : "text-red-400"}`}>
        {isUp ? "+" : ""}{pct}%
      </span>
    );
  };

  const handleResetAllTraffic = async () => {
    if (!confirm("确定要重置所有用户的流量统计吗？此操作不可撤销。")) return;
    try {
      await trafficService.resetAllTraffic();
      toast.success("所有用户流量已重置");
      fetchTrafficData();
    } catch {
      toast.error("重置失败");
    }
  };

  const handleCleanLogs = async () => {
    if (!confirm(`确定要清理 ${days} 天前的流量日志吗？`)) return;
    try {
      await trafficService.cleanOldLogs(days);
      toast.success("旧日志已清理");
      fetchTrafficData();
    } catch {
      toast.error("清理失败");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              流量统计
            </h1>
            <p className="text-muted-foreground mt-2">
              查看系统流量使用情况和趋势分析
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              刷新
            </Button>
            <Select value={days.toString()} onValueChange={(v) => setDays(parseInt(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">最近7天</SelectItem>
                <SelectItem value="30">最近30天</SelectItem>
                <SelectItem value="90">最近90天</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                <ArrowUp className="w-6 h-6 text-white" />
              </div>
              {renderTrendBadge("upload")}
            </div>
            <p className="text-sm text-muted-foreground mb-1">总上传</p>
            {loading ? (
              <Skeleton className="h-9 w-32" />
            ) : (
              <p className="text-3xl font-bold">{formatBytes(totalUpload)}</p>
            )}
          </Card>

          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                <ArrowDown className="w-6 h-6 text-white" />
              </div>
              {renderTrendBadge("download")}
            </div>
            <p className="text-sm text-muted-foreground mb-1">总下载</p>
            {loading ? (
              <Skeleton className="h-9 w-32" />
            ) : (
              <p className="text-3xl font-bold">{formatBytes(totalDownload)}</p>
            )}
          </Card>

          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-cyan-500 flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              {renderTrendBadge("total")}
            </div>
            <p className="text-sm text-muted-foreground mb-1">总流量</p>
            {loading ? (
              <Skeleton className="h-9 w-32" />
            ) : (
              <p className="text-3xl font-bold">{formatBytes(totalTraffic)}</p>
            )}
          </Card>
        </div>

        {/* Daily traffic chart */}
        <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">每日流量趋势</h2>
            <p className="text-sm text-muted-foreground mt-1">
              最近{days}天的流量使用情况 (单位: MB)
            </p>
          </div>
          {loading ? (
            <div className="h-[300px] flex items-center justify-center">
              <Skeleton className="w-full h-full rounded-lg" />
            </div>
          ) : chartData.some(d => d.upload > 0 || d.download > 0) ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="uploadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="downloadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="date"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}MB`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(0, 0, 0, 0.85)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "8px",
                    padding: "12px",
                  }}
                  labelStyle={{ color: "#fff", marginBottom: "4px" }}
                  formatter={(value: number, name: string) => [
                    `${value.toFixed(2)} MB`,
                    name === "upload" ? "上传" : "下载"
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="upload"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  fill="url(#uploadFill)"
                  name="upload"
                />
                <Area
                  type="monotone"
                  dataKey="download"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fill="url(#downloadFill)"
                  name="download"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground gap-3">
              <Database className="w-12 h-12 opacity-30" />
              <p>暂无流量数据</p>
              <p className="text-xs">流量数据将在用户使用代理后自动记录</p>
            </div>
          )}
        </Card>

        {/* Top users */}
        <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold">用户流量排行</h2>
              <p className="text-sm text-muted-foreground mt-1">
                按已用流量排序的用户列表
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleResetAllTraffic} className="gap-1 text-red-400 hover:text-red-300">
                <Trash2 className="h-3.5 w-3.5" />
                重置全部
              </Button>
            </div>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : topUsers.length > 0 ? (
            <div className="space-y-3">
              {topUsers.map((user, index) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                      index === 0 ? "bg-gradient-to-br from-yellow-400 to-orange-500" :
                      index === 1 ? "bg-gradient-to-br from-gray-300 to-gray-500" :
                      index === 2 ? "bg-gradient-to-br from-amber-600 to-amber-800" :
                      "bg-gradient-to-br from-cyan-400/50 to-purple-500/50"
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{user.username}</p>
                      {user.traffic_limit > 0 && (
                        <div className="mt-1">
                          <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full"
                              style={{ width: `${Math.min((user.traffic_used / user.traffic_limit) * 100, 100)}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatBytes(user.traffic_used)} / {formatBytes(user.traffic_limit)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold">{formatBytes(user.traffic_used)}</p>
                    <p className="text-sm text-muted-foreground">已用流量</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <Users className="w-12 h-12 mx-auto opacity-30 mb-3" />
              <p>暂无用户流量数据</p>
            </div>
          )}
        </Card>

        {/* Inbound traffic distribution */}
        {inboundChartData.length > 0 && (
          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="mb-6">
              <h2 className="text-xl font-semibold">入站流量分布</h2>
              <p className="text-sm text-muted-foreground mt-1">
                各入站节点的流量使用情况 (单位: GB)
              </p>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={inboundChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="name"
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}GB`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(0, 0, 0, 0.85)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#fff" }}
                  formatter={(value: number) => [`${value.toFixed(2)} GB`, "流量"]}
                />
                <Bar dataKey="traffic" fill="url(#barGradient)" radius={[8, 8, 0, 0]} />
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Actions */}
        <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">数据管理</h2>
              <p className="text-sm text-muted-foreground mt-1">清理旧的流量日志以释放存储空间</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleCleanLogs} className="gap-2">
              <Trash2 className="h-4 w-4" />
              清理 {days} 天前的日志
            </Button>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
