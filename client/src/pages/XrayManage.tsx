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
import { Plus, Play, Pause, Edit, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

const inbounds = [
  {
    id: 1,
    remark: "VMess 主节点",
    protocol: "vmess",
    port: 10086,
    clients: 45,
    traffic: "1.2 TB",
    enabled: true,
  },
  {
    id: 2,
    remark: "VLESS Reality",
    protocol: "vless",
    port: 443,
    clients: 32,
    traffic: "856 GB",
    enabled: true,
  },
  {
    id: 3,
    remark: "Trojan TLS",
    protocol: "trojan",
    port: 8443,
    clients: 18,
    traffic: "542 GB",
    enabled: false,
  },
];

export default function XrayManage() {
  const handleAction = (action: string, id: number) => {
    toast.success(`${action} 操作已执行`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Xray 管理</h1>
            <p className="text-white/60">管理 Xray 入站和客户端配置</p>
          </div>
          <Button
            className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white shadow-lg shadow-cyan-500/30"
            onClick={() => toast.info("创建入站功能开发中")}
          >
            <Plus className="w-4 h-4 mr-2" />
            创建入站
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="glass-card border-white/20 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm mb-1">总入站数</p>
                <p className="text-3xl font-bold text-white">3</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                <Play className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>
          <Card className="glass-card border-white/20 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm mb-1">总客户端</p>
                <p className="text-3xl font-bold text-white">95</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>
          <Card className="glass-card border-white/20 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/60 text-sm mb-1">总流量</p>
                <p className="text-3xl font-bold text-white">2.6 TB</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-cyan-500 flex items-center justify-center">
                <Play className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>
        </div>

        {/* Inbounds table */}
        <Card className="glass-card border-white/20 overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-bold text-white">入站列表</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-white/5">
                <TableHead className="text-white/70">备注</TableHead>
                <TableHead className="text-white/70">协议</TableHead>
                <TableHead className="text-white/70">端口</TableHead>
                <TableHead className="text-white/70">客户端</TableHead>
                <TableHead className="text-white/70">流量</TableHead>
                <TableHead className="text-white/70">状态</TableHead>
                <TableHead className="text-white/70 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inbounds.map((inbound) => (
                <TableRow
                  key={inbound.id}
                  className="border-white/10 hover:bg-white/5 transition-colors"
                >
                  <TableCell className="font-medium text-white">
                    {inbound.remark}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-cyan-400/50 text-cyan-400 bg-cyan-400/10"
                    >
                      {inbound.protocol.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-white/70 font-mono">
                    {inbound.port}
                  </TableCell>
                  <TableCell className="text-white/70">
                    {inbound.clients}
                  </TableCell>
                  <TableCell className="text-white/70">
                    {inbound.traffic}
                  </TableCell>
                  <TableCell>
                    {inbound.enabled ? (
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
                        onClick={() => handleAction("编辑", inbound.id)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white/70 hover:text-white hover:bg-white/10"
                        onClick={() => handleAction(inbound.enabled ? "停止" : "启动", inbound.id)}
                      >
                        {inbound.enabled ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => handleAction("删除", inbound.id)}
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
