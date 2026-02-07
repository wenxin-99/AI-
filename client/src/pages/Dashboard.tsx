import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import {
  Activity,
  Users,
  Server,
  TrendingUp,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const stats = [
  {
    name: "总用户数",
    value: "156",
    change: "+12%",
    trend: "up",
    icon: Users,
    color: "from-cyan-400 to-blue-500",
  },
  {
    name: "活跃连接",
    value: "89",
    change: "+5%",
    trend: "up",
    icon: Activity,
    color: "from-purple-400 to-pink-500",
  },
  {
    name: "在线节点",
    value: "24",
    change: "0%",
    trend: "neutral",
    icon: Server,
    color: "from-green-400 to-cyan-500",
  },
  {
    name: "今日流量",
    value: "2.4 TB",
    change: "+18%",
    trend: "up",
    icon: TrendingUp,
    color: "from-orange-400 to-red-500",
  },
];

const trafficData = [
  { time: "00:00", upload: 120, download: 280 },
  { time: "04:00", upload: 98, download: 210 },
  { time: "08:00", upload: 180, download: 420 },
  { time: "12:00", upload: 240, download: 580 },
  { time: "16:00", upload: 310, download: 720 },
  { time: "20:00", upload: 280, download: 650 },
  { time: "24:00", upload: 190, download: 480 },
];

export default function Dashboard() {
  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Page header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">仪表板</h1>
          <p className="text-white/60">系统运行状态总览</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <Card
              key={stat.name}
              className="glass-card border-white/20 p-6 hover:border-white/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-cyan-500/10"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
                <div className={`flex items-center space-x-1 text-sm ${
                  stat.trend === "up" ? "text-green-400" : stat.trend === "down" ? "text-red-400" : "text-white/60"
                }`}>
                  {stat.trend === "up" && <ArrowUp className="w-4 h-4" />}
                  {stat.trend === "down" && <ArrowDown className="w-4 h-4" />}
                  <span>{stat.change}</span>
                </div>
              </div>
              <div>
                <p className="text-white/60 text-sm mb-1">{stat.name}</p>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Traffic chart */}
        <Card className="glass-card border-white/20 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white mb-2">流量趋势</h2>
            <p className="text-white/60 text-sm">过去24小时流量统计</p>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trafficData}>
                <XAxis
                  dataKey="time"
                  stroke="rgba(255,255,255,0.3)"
                  tick={{ fill: "rgba(255,255,255,0.6)" }}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.3)"
                  tick={{ fill: "rgba(255,255,255,0.6)" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(15, 23, 42, 0.9)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: "0.5rem",
                    color: "#fff",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="upload"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={false}
                  name="上传 (MB/s)"
                />
                <Line
                  type="monotone"
                  dataKey="download"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                  name="下载 (MB/s)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="glass-card border-white/20 p-6">
            <h3 className="text-lg font-bold text-white mb-4">系统状态</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-white/70">Xray 引擎</span>
                <span className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-400 text-sm">运行中</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">Gost 引擎</span>
                <span className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-green-400 text-sm">运行中</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">系统负载</span>
                <span className="text-white text-sm">23%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/70">内存使用</span>
                <span className="text-white text-sm">4.2 GB / 16 GB</span>
              </div>
            </div>
          </Card>

          <Card className="glass-card border-white/20 p-6">
            <h3 className="text-lg font-bold text-white mb-4">最近活动</h3>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 rounded-full bg-cyan-400 mt-2" />
                <div className="flex-1">
                  <p className="text-white text-sm">新用户注册</p>
                  <p className="text-white/50 text-xs">2分钟前</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 rounded-full bg-purple-400 mt-2" />
                <div className="flex-1">
                  <p className="text-white text-sm">配置更新</p>
                  <p className="text-white/50 text-xs">15分钟前</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-2 h-2 rounded-full bg-green-400 mt-2" />
                <div className="flex-1">
                  <p className="text-white text-sm">系统备份完成</p>
                  <p className="text-white/50 text-xs">1小时前</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
