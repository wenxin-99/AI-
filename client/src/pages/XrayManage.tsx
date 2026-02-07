import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Play, Pause, Edit, Trash2, Users, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { xrayService, XrayInbound } from "@/services/xray";

export default function XrayManage() {
  const [inbounds, setInbounds] = useState<XrayInbound[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedInbound, setSelectedInbound] = useState<XrayInbound | null>(null);
  
  // 表单状态
  const [formData, setFormData] = useState({
    remark: "",
    port: "",
    protocol: "vmess",
    listen: "0.0.0.0",
  });

  useEffect(() => {
    fetchInbounds();
  }, []);

  const fetchInbounds = async () => {
    try {
      setLoading(true);
      const data = await xrayService.getInbounds();
      setInbounds(data);
    } catch (error) {
      console.error("Failed to fetch inbounds:", error);
      toast.error("获取入站列表失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.remark || !formData.port) {
      toast.error("请填写完整信息");
      return;
    }

    try {
      await xrayService.createInbound({
        remark: formData.remark,
        port: parseInt(formData.port),
        protocol: formData.protocol,
        listen: formData.listen,
      });
      toast.success("入站创建成功");
      setCreateDialogOpen(false);
      setFormData({ remark: "", port: "", protocol: "vmess", listen: "0.0.0.0" });
      fetchInbounds();
    } catch (error) {
      console.error("Failed to create inbound:", error);
    }
  };

  const handleEdit = async () => {
    if (!selectedInbound) return;

    try {
      await xrayService.updateInbound(selectedInbound.id, {
        remark: formData.remark,
        port: parseInt(formData.port),
        protocol: formData.protocol,
        listen: formData.listen,
      });
      toast.success("入站更新成功");
      setEditDialogOpen(false);
      setSelectedInbound(null);
      fetchInbounds();
    } catch (error) {
      console.error("Failed to update inbound:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此入站吗?")) return;

    try {
      await xrayService.deleteInbound(id);
      toast.success("入站删除成功");
      fetchInbounds();
    } catch (error) {
      console.error("Failed to delete inbound:", error);
    }
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await xrayService.toggleInbound(id, !enabled);
      toast.success(enabled ? "入站已禁用" : "入站已启用");
      fetchInbounds();
    } catch (error) {
      console.error("Failed to toggle inbound:", error);
    }
  };

  const handleRestart = async () => {
    try {
      await xrayService.restart();
      toast.success("Xray 服务重启成功");
    } catch (error) {
      console.error("Failed to restart Xray:", error);
    }
  };

  const openEditDialog = (inbound: XrayInbound) => {
    setSelectedInbound(inbound);
    setFormData({
      remark: inbound.remark,
      port: inbound.port.toString(),
      protocol: inbound.protocol,
      listen: inbound.listen || "0.0.0.0",
    });
    setEditDialogOpen(true);
  };

  const enabledCount = inbounds.filter(i => i.enabled).length;
  const totalClients = 0; // TODO: 从客户端API获取

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Xray 管理
            </h1>
            <p className="text-muted-foreground mt-2">
              管理 Xray 入站和客户端配置
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="border-white/10 hover:bg-white/5"
              onClick={handleRestart}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              重启服务
            </Button>
            <Button
              className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white shadow-lg shadow-cyan-500/30"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              创建入站
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">总入站数</p>
                <p className="text-3xl font-bold">{inbounds.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                <Play className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">运行中</p>
                <p className="text-3xl font-bold">{enabledCount}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-cyan-500 flex items-center justify-center">
                <Play className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">总客户端</p>
                <p className="text-3xl font-bold">{totalClients}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>
        </div>

        {/* Inbounds Table */}
        <Card className="bg-card/40 backdrop-blur-xl border-white/10">
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">入站列表</h2>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : inbounds.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无入站配置,点击"创建入站"开始
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-white/5">
                    <TableHead className="text-white/80">备注</TableHead>
                    <TableHead className="text-white/80">协议</TableHead>
                    <TableHead className="text-white/80">端口</TableHead>
                    <TableHead className="text-white/80">监听地址</TableHead>
                    <TableHead className="text-white/80">状态</TableHead>
                    <TableHead className="text-white/80 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inbounds.map((inbound) => (
                    <TableRow
                      key={inbound.id}
                      className="border-white/10 hover:bg-white/5"
                    >
                      <TableCell className="font-medium">{inbound.remark}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="border-cyan-500/50 bg-cyan-500/10 text-cyan-400"
                        >
                          {inbound.protocol.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>{inbound.port}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {inbound.listen || "0.0.0.0"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={inbound.enabled ? "default" : "secondary"}
                          className={
                            inbound.enabled
                              ? "bg-green-500/20 text-green-400 border-green-500/50"
                              : "bg-gray-500/20 text-gray-400 border-gray-500/50"
                          }
                        >
                          {inbound.enabled ? "运行中" : "已停止"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggle(inbound.id, inbound.enabled)}
                          >
                            {inbound.enabled ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(inbound)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(inbound.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>

        {/* Create Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10">
            <DialogHeader>
              <DialogTitle>创建入站</DialogTitle>
              <DialogDescription>
                配置新的 Xray 入站连接
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="remark">备注</Label>
                <Input
                  id="remark"
                  placeholder="例如: VMess 主节点"
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="protocol">协议</Label>
                <Select
                  value={formData.protocol}
                  onValueChange={(value) => setFormData({ ...formData, protocol: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vmess">VMess</SelectItem>
                    <SelectItem value="vless">VLESS</SelectItem>
                    <SelectItem value="trojan">Trojan</SelectItem>
                    <SelectItem value="shadowsocks">Shadowsocks</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="port">端口</Label>
                <Input
                  id="port"
                  type="number"
                  placeholder="例如: 10086"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="listen">监听地址</Label>
                <Input
                  id="listen"
                  placeholder="0.0.0.0"
                  value={formData.listen}
                  onChange={(e) => setFormData({ ...formData, listen: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleCreate}>创建</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10">
            <DialogHeader>
              <DialogTitle>编辑入站</DialogTitle>
              <DialogDescription>
                修改入站配置
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-remark">备注</Label>
                <Input
                  id="edit-remark"
                  value={formData.remark}
                  onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-port">端口</Label>
                <Input
                  id="edit-port"
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-listen">监听地址</Label>
                <Input
                  id="edit-listen"
                  value={formData.listen}
                  onChange={(e) => setFormData({ ...formData, listen: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleEdit}>保存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
