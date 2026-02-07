import DashboardLayout from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Play, Pause, Edit, Trash2, GitBranch } from "lucide-react";
import { toast } from "sonner";

const tunnels = [
  {
    id: 1,
    name: "HTTP 转发",
    protocol: "http",
    localPort: 8080,
    remoteAddr: "example.com:80",
    speedLimit: 100,
    enabled: true,
  },
  {
    id: 2,
    name: "SOCKS5 代理",
    protocol: "socks5",
    localPort: 1080,
    remoteAddr: "proxy.example.com:1080",
    speedLimit: 50,
    enabled: true,
  },
  {
    id: 3,
    name: "TCP 隧道",
    protocol: "tcp",
    localPort: 3306,
    remoteAddr: "db.example.com:3306",
    speedLimit: 0,
    enabled: false,
  },
];

export default function GostManage() {
  const handleAction = (action: string, id: number) => {
    toast.success(`${action} 操作已执行`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Gost 管理</h1>
            <p className="text-white/60">管理 Gost 隧道和转发规则</p>
          </div>
          <Button
            className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white shadow-lg shadow-cyan-500/30"
            onClick={() => toast.info("创建隧道功能开发中")}
          >
            <Plus className="w-4 h-4 mr-2" />
            创建隧道
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="glass-card border-white/20 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm mb-1">总隧道数</p>
                <p className="text-3xl font-bold text-white">3</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                <GitBranch className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>
          <Card className="glass-card border-white/20 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm mb-1">活跃隧道</p>
                <p className="text-3xl font-bold text-white">2</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-cyan-500 flex items-center justify-center">
                <Play className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>
          <Card className="glass-card border-white/20 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm mb-1">平均速率</p>
                <p className="text-3xl font-bold text-white">45 MB/s</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                <Play className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>
        </div>

        {/* Tunnels table */}
        <Card className="glass-card border-white/20 overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-bold text-white">隧道列表</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-white/5">
                <TableHead className="text-white/70">名称</TableHead>
                <TableHead className="text-white/70">协议</TableHead>
                <TableHead className="text-white/70">本地端口</TableHead>
                <TableHead className="text-white/70">远程地址</TableHead>
                <TableHead className="text-white/70">限速</TableHead>
                <TableHead className="text-white/70">状态</TableHead>
                <TableHead className="text-white/70 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tunnels.map((tunnel) => (
                <TableRow
                  key={tunnel.id}
                  className="border-white/10 hover:bg-white/5 transition-colors"
                >
                  <TableCell className="font-medium text-white">
                    {tunnel.name}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-purple-400/50 text-purple-400 bg-purple-400/10"
                    >
                      {tunnel.protocol.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-white/70 font-mono">
                    {tunnel.localPort}
                  </TableCell>
                  <TableCell className="text-white/70 font-mono text-sm">
                    {tunnel.remoteAddr}
                  </TableCell>
                  <TableCell className="text-white/70">
                    {tunnel.speedLimit > 0 ? `${tunnel.speedLimit} MB/s` : "无限制"}
                  </TableCell>
                  <TableCell>
                    {tunnel.enabled ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-400/50">
                        运行中
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-500/20 text-gray-400 border-gray-400/50">
                        已停止
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white/70 hover:text-white hover:bg-white/10"
                        onClick={() => handleAction("编辑", tunnel.id)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white/70 hover:text-white hover:bg-white/10"
                        onClick={() => handleAction(tunnel.enabled ? "停止" : "启动", tunnel.id)}
                      >
                        {tunnel.enabled ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => handleAction("删除", tunnel.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </DashboardLayout>
  );
}
