import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { trafficService } from "@/services/traffic";
import { systemService } from "@/services/system";
import { toast } from "sonner";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  Activity,
  Users,
  Server,
  TrendingUp,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [trafficTrend, setTrafficTrend] = useState<any[]>([]);
  const [realtimeStats, setRealtimeStats] = useState<any>(null);

  // WebSocket 实时流量
  const wsUrl = `ws://${window.location.hostname}:2053/ws/realtime-traffic`;
  const { isConnected, lastMessage } = useWebSocket({
    url: wsUrl,
    onMessage: (data) => {
      setRealtimeStats(data);
    },
    onError: (error) => {
      console.error('WebSocket 错误:', error);
    },
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [sysTraffic, trend] = await Promise.all([
        trafficService.getSystemTraffic(),
        trafficService.getTrafficTrend(7),
      ]);
      setSystemStats(sysTraffic);
      setTrafficTrend(Array.isArray(trend) ? trend : []);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      // 使用模拟数据作为后备
      setSystemStats({
        total_users: 0,
        active_users: 0,
        total_inbounds: 0,
        total: 0,
      });
      setTrafficTrend([]);
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

  // 计算实时总流量
  const realtimeTotal = realtimeStats
    ? Object.values(realtimeStats).reduce(
        (sum: number, stat: any) => sum + (stat.upload || 0) + (stat.download || 0),
        0
      )
    : 0;

  const stats = [
    {
      name: "总用户数",
      value: systemStats?.total_users?.toString() || "0",
      change: "+12%",
      trend: "up",
      icon: Users,
      color: "from-cyan-400 to-blue-500",
    },
    {
      name: "活跃用户",
      value: systemStats?.active_users?.toString() || "0",
      change: "+5%",
      trend: "up",
      icon: Activity,
      color: "from-purple-400 to-pink-500",
    },
    {
      name: "在线节点",
      value: systemStats?.total_inbounds?.toString() || "0",
      change: "0%",
      trend: "neutral",
      icon: Server,
      color: "from-green-400 to-cyan-500",
    },
    {
      name: "总流量",
      value: formatBytes(systemStats?.total || 0),
      change: "+18%",
      trend: "up",
      icon: TrendingUp,
      color: "from-orange-400 to-red-500",
    },
  ];

  // 转换流量趋势数据
  const chartData = trafficTrend.map((item) => ({
    time: new Date(item.date).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }),
    upload: Math.round(item.upload / 1024 / 1024), // 转换为MB
    download: Math.round(item.download / 1024 / 1024),
  }));

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
            仪表板
          </h1>
          <p className="text-muted-foreground mt-2">
            欢迎回来,这是您的系统概览
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card
                key={index}
                className="p-6 bg-card/40 backdrop-blur-xl border-white/10 hover:bg-card/60 transition-all duration-300 hover:scale-105"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.name}</p>
                    <p className="text-3xl font-bold mt-2 bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                      {stat.value}
                    </p>
                    <div className="flex items-center mt-2 text-sm">
                      {stat.trend === "up" && (
                        <>
                          <ArrowUp className="w-4 h-4 text-green-400 mr-1" />
                          <span className="text-green-400">{stat.change}</span>
                        </>
                      )}
                      {stat.trend === "down" && (
                        <>
                          <ArrowDown className="w-4 h-4 text-red-400 mr-1" />
                          <span className="text-red-400">{stat.change}</span>
                        </>
                      )}
                      {stat.trend === "neutral" && (
                        <span className="text-muted-foreground">{stat.change}</span>
                      )}
                    </div>
                  </div>
                  <div
                    className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}
                  >
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Traffic Chart */}
        <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">流量趋势</h2>
            <p className="text-sm text-muted-foreground mt-1">
              最近7天的流量使用情况
            </p>
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <XAxis
                  dataKey="time"
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

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10 hover:bg-card/60 transition-all cursor-pointer">
            <h3 className="font-semibold mb-2">Xray 管理</h3>
            <p className="text-sm text-muted-foreground">
              管理 Xray 入站和客户端配置
            </p>
          </Card>
          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10 hover:bg-card/60 transition-all cursor-pointer">
            <h3 className="font-semibold mb-2">Gost 管理</h3>
            <p className="text-sm text-muted-foreground">
              管理 Gost 隧道和转发规则
            </p>
          </Card>
          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10 hover:bg-card/60 transition-all cursor-pointer">
            <h3 className="font-semibold mb-2">流量统计</h3>
            <p className="text-sm text-muted-foreground">
              查看详细的流量使用统计
            </p>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
