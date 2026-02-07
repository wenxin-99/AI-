import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUp, ArrowDown, Activity } from "lucide-react";
import { trafficService } from "@/services/traffic";
import { toast } from "sonner";

export default function TrafficStats() {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);
  const [systemTraffic, setSystemTraffic] = useState<any>(null);
  const [trafficTrend, setTrafficTrend] = useState<any[]>([]);

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
    } catch (error) {
      console.error("Failed to fetch traffic data:", error);
      toast.error("获取流量数据失败");
    } finally {
      setLoading(false);
    }
  };

  // 格式化流量数据
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  // 转换趋势数据为图表格式
  const chartData = trafficTrend.map((item) => ({
    date: new Date(item.date).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }),
    upload: Math.round(item.upload / 1024 / 1024), // MB
    download: Math.round(item.download / 1024 / 1024), // MB
  }));

  // 模拟TOP用户数据 (TODO: 从API获取)
  const topUsers = [
    { name: "user001", upload: 45.2, download: 128.5, total: 173.7 },
    { name: "user002", upload: 38.6, download: 112.3, total: 150.9 },
    { name: "user003", upload: 32.1, download: 98.7, total: 130.8 },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              流量统计
            </h1>
            <p className="text-muted-foreground mt-2">
              查看系统流量使用情况和趋势分析
            </p>
          </div>
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

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                <ArrowUp className="w-6 h-6 text-white" />
              </div>
              <span className="text-green-400 text-sm">+12%</span>
            </div>
            <p className="text-sm text-muted-foreground mb-1">总上传</p>
            <p className="text-3xl font-bold">
              {formatBytes(systemTraffic?.upload || 0)}
            </p>
          </Card>

          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                <ArrowDown className="w-6 h-6 text-white" />
              </div>
              <span className="text-green-400 text-sm">+18%</span>
            </div>
            <p className="text-sm text-muted-foreground mb-1">总下载</p>
            <p className="text-3xl font-bold">
              {formatBytes(systemTraffic?.download || 0)}
            </p>
          </Card>

          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-cyan-500 flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <span className="text-green-400 text-sm">+15%</span>
            </div>
            <p className="text-sm text-muted-foreground mb-1">总流量</p>
            <p className="text-3xl font-bold">
              {formatBytes(systemTraffic?.total || 0)}
            </p>
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
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              加载中...
            </div>
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
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
                    backgroundColor: "rgba(0, 0, 0, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#fff" }}
                />
                <Line
                  type="monotone"
                  dataKey="upload"
                  stroke="url(#uploadGradient)"
                  strokeWidth={3}
                  dot={false}
                  name="上传"
                />
                <Line
                  type="monotone"
                  dataKey="download"
                  stroke="url(#downloadGradient)"
                  strokeWidth={3}
                  dot={false}
                  name="下载"
                />
                <defs>
                  <linearGradient id="uploadGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#3b82f6" />
                  </linearGradient>
                  <linearGradient id="downloadGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#ec4899" />
                  </linearGradient>
                </defs>
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              暂无流量数据
            </div>
          )}
        </Card>

        {/* Top users */}
        <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">TOP 用户流量</h2>
            <p className="text-sm text-muted-foreground mt-1">
              流量使用最多的用户排行 (单位: GB)
            </p>
          </div>
          <div className="space-y-4">
            {topUsers.map((user, index) => (
              <div
                key={user.name}
                className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center font-bold text-white">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-muted-foreground">
                      ↑ {user.upload} GB · ↓ {user.download} GB
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold">{user.total} GB</p>
                  <p className="text-sm text-muted-foreground">总流量</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Inbound traffic distribution */}
        <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">入站流量分布</h2>
            <p className="text-sm text-muted-foreground mt-1">
              各入站节点的流量使用情况 (单位: GB)
            </p>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={[
                { name: "VMess 主节点", traffic: 1200 },
                { name: "VLESS Reality", traffic: 856 },
                { name: "Trojan TLS", traffic: 542 },
              ]}
            >
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
                  backgroundColor: "rgba(0, 0, 0, 0.8)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "#fff" }}
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
      </div>
    </DashboardLayout>
  );
}
