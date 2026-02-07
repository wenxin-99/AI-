import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUp, ArrowDown, Activity } from "lucide-react";

const dailyTraffic = [
  { date: "01-01", upload: 120, download: 380 },
  { date: "01-02", upload: 150, download: 420 },
  { date: "01-03", upload: 180, download: 480 },
  { date: "01-04", upload: 140, download: 390 },
  { date: "01-05", upload: 200, download: 520 },
  { date: "01-06", upload: 170, download: 460 },
  { date: "01-07", upload: 190, download: 500 },
];

const topUsers = [
  { name: "user001", upload: 45.2, download: 128.5, total: 173.7 },
  { name: "user002", upload: 38.6, download: 112.3, total: 150.9 },
  { name: "user003", upload: 32.1, download: 98.7, total: 130.8 },
  { name: "user004", upload: 28.4, download: 85.2, total: 113.6 },
  { name: "user005", upload: 24.7, download: 76.8, total: 101.5 },
];

const inboundTraffic = [
  { name: "VMess 主节点", traffic: 1200 },
  { name: "VLESS Reality", traffic: 856 },
  { name: "Trojan TLS", traffic: 542 },
];

export default function TrafficStats() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">流量统计</h1>
          <p className="text-white/60">查看系统流量使用情况和趋势分析</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="glass-card border-white/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                <ArrowUp className="w-6 h-6 text-white" />
              </div>
              <span className="text-green-400 text-sm">+12%</span>
            </div>
            <p className="text-white/60 text-sm mb-1">总上传</p>
            <p className="text-3xl font-bold text-white">1.2 TB</p>
          </Card>
          <Card className="glass-card border-white/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                <ArrowDown className="w-6 h-6 text-white" />
              </div>
              <span className="text-green-400 text-sm">+18%</span>
            </div>
            <p className="text-white/60 text-sm mb-1">总下载</p>
            <p className="text-3xl font-bold text-white">3.4 TB</p>
          </Card>
          <Card className="glass-card border-white/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-cyan-500 flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <span className="text-green-400 text-sm">+15%</span>
            </div>
            <p className="text-white/60 text-sm mb-1">总流量</p>
            <p className="text-3xl font-bold text-white">4.6 TB</p>
          </Card>
        </div>

        {/* Daily traffic trend */}
        <Card className="glass-card border-white/20 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white mb-2">每日流量趋势</h2>
            <p className="text-white/60 text-sm">过去7天的流量统计</p>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTraffic}>
                <XAxis
                  dataKey="date"
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
                  strokeWidth={3}
                  dot={{ fill: "#06b6d4", r: 4 }}
                  name="上传 (GB)"
                />
                <Line
                  type="monotone"
                  dataKey="download"
                  stroke="#8b5cf6"
                  strokeWidth={3}
                  dot={{ fill: "#8b5cf6", r: 4 }}
                  name="下载 (GB)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top users */}
          <Card className="glass-card border-white/20 p-6">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white mb-2">流量 TOP 5 用户</h2>
              <p className="text-white/60 text-sm">本月流量使用排行</p>
            </div>
            <div className="space-y-4">
              {topUsers.map((user, index) => (
                <div key={user.name} className="flex items-center space-x-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-medium">{user.name}</span>
                      <span className="text-white/70 text-sm">{user.total.toFixed(1)} GB</span>
                    </div>
                    <div className="flex items-center space-x-2 text-xs text-white/50">
                      <span>↑ {user.upload.toFixed(1)} GB</span>
                      <span>↓ {user.download.toFixed(1)} GB</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Inbound traffic distribution */}
          <Card className="glass-card border-white/20 p-6">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white mb-2">入站流量分布</h2>
              <p className="text-white/60 text-sm">各入站流量使用情况</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inboundTraffic}>
                  <XAxis
                    dataKey="name"
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
                  <Bar
                    dataKey="traffic"
                    fill="url(#colorGradient)"
                    radius={[8, 8, 0, 0]}
                    name="流量 (GB)"
                  />
                  <defs>
                    <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
