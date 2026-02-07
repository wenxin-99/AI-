/**
 * Design Philosophy: Gradient Fluid
 * - Deep purple to blue gradient background
 * - Frosted glass effect cards
 * - Smooth animations and micro-interactions
 */

import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { nodeService, type Node } from "@/services/node";
import {
  Activity,
  Cpu,
  HardDrive,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function NodeManage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    host: "",
    port: 2053,
    api_token: "",
    type: "both",
  });

  useEffect(() => {
    loadNodes();
  }, []);

  const loadNodes = async () => {
    try {
      setLoading(true);
      const data = await nodeService.list();
      setNodes(data.nodes || []);
    } catch (error) {
      console.error("加载节点列表失败:", error);
      toast.error("加载节点列表失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingNode(null);
    setFormData({
      name: "",
      host: "",
      port: 2053,
      api_token: "",
      type: "both",
    });
    setDialogOpen(true);
  };

  const handleEdit = (node: Node) => {
    setEditingNode(node);
    setFormData({
      name: node.name,
      host: node.host,
      port: node.port,
      api_token: node.api_token,
      type: node.type,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingNode) {
        await nodeService.update(editingNode.id, formData);
        toast.success("节点更新成功");
      } else {
        await nodeService.create(formData);
        toast.success("节点创建成功");
      }
      setDialogOpen(false);
      loadNodes();
    } catch (error) {
      console.error("保存节点失败:", error);
      toast.error("保存节点失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这个节点吗?")) return;

    try {
      await nodeService.delete(id);
      toast.success("节点已删除");
      loadNodes();
    } catch (error) {
      console.error("删除节点失败:", error);
      toast.error("删除节点失败");
    }
  };

  const handleToggle = async (id: number) => {
    try {
      await nodeService.toggle(id);
      toast.success("节点状态已更新");
      loadNodes();
    } catch (error) {
      console.error("切换节点状态失败:", error);
      toast.error("切换节点状态失败");
    }
  };

  const handleSync = async (id: number) => {
    try {
      await nodeService.sync(id);
      toast.success("节点配置同步成功");
    } catch (error) {
      console.error("同步节点配置失败:", error);
      toast.error("同步节点配置失败");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "text-green-400 bg-green-500/20";
      case "offline":
        return "text-gray-400 bg-gray-500/20";
      case "error":
        return "text-red-400 bg-red-500/20";
      default:
        return "text-gray-400 bg-gray-500/20";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "xray":
        return "from-blue-500 to-cyan-500";
      case "gost":
        return "from-purple-500 to-pink-500";
      case "both":
        return "from-orange-500 to-red-500";
      default:
        return "from-gray-500 to-gray-600";
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text">节点管理</h1>
            <p className="text-white/60 mt-1">管理分布式代理节点</p>
          </div>
          <Button
            onClick={handleCreate}
            className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            添加节点
          </Button>
        </div>

        {/* 节点列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
          </div>
        ) : nodes.length === 0 ? (
          <Card className="glass-card border-white/20 p-12 text-center">
            <Server className="w-16 h-16 mx-auto mb-4 text-white/40" />
            <p className="text-white/60 text-lg">暂无节点</p>
            <p className="text-white/40 text-sm mt-2">点击右上角"添加节点"按钮开始</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {nodes.map((node) => (
              <Card
                key={node.id}
                className="glass-card border-white/20 p-6 hover:border-cyan-400/30 transition-all duration-300"
              >
                {/* 节点头部 */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">
                        {node.name}
                      </h3>
                      <div
                        className={`px-2 py-0.5 rounded text-xs ${getStatusColor(
                          node.status
                        )}`}
                      >
                        {node.status === "online" && <Wifi className="w-3 h-3 inline mr-1" />}
                        {node.status === "offline" && <WifiOff className="w-3 h-3 inline mr-1" />}
                        {node.status}
                      </div>
                    </div>
                    <div
                      className={`inline-block px-3 py-1 rounded-full bg-gradient-to-r ${getTypeColor(
                        node.type
                      )} text-white text-xs font-medium`}
                    >
                      {node.type.toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* 节点信息 */}
                <div className="space-y-2 mb-4">
                  <p className="text-white/60 text-sm">
                    <span className="text-white/40">地址:</span> {node.host}:{node.port}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 text-white/60">
                      <Cpu className="w-4 h-4 text-cyan-400" />
                      <span>CPU: {node.cpu_usage.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/60">
                      <HardDrive className="w-4 h-4 text-purple-400" />
                      <span>内存: {node.memory_usage.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/60">
                      <Activity className="w-4 h-4 text-green-400" />
                      <span>↑ {formatBytes(node.traffic_up)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-white/60">
                      <Activity className="w-4 h-4 text-orange-400" />
                      <span>↓ {formatBytes(node.traffic_down)}</span>
                    </div>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(node)}
                    className="flex-1 border-white/20 hover:bg-cyan-500/20 hover:border-cyan-400/50"
                  >
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSync(node.id)}
                    className="flex-1 border-white/20 hover:bg-purple-500/20 hover:border-purple-400/50"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    同步
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggle(node.id)}
                    className="border-white/20 hover:bg-orange-500/20 hover:border-orange-400/50"
                  >
                    {node.status === "online" ? "停用" : "启用"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(node.id)}
                    className="border-white/20 hover:bg-red-500/20 hover:border-red-400/50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 添加/编辑节点对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass-card border-white/20">
          <DialogHeader>
            <DialogTitle className="gradient-text">
              {editingNode ? "编辑节点" : "添加节点"}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              配置远程节点信息
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white/90">节点名称</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="bg-white/5 border-white/20 text-white"
                placeholder="例如: 香港节点-01"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-white/90">主机地址</Label>
                <Input
                  value={formData.host}
                  onChange={(e) =>
                    setFormData({ ...formData, host: e.target.value })
                  }
                  className="bg-white/5 border-white/20 text-white"
                  placeholder="192.168.1.100"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/90">端口</Label>
                <Input
                  type="number"
                  value={formData.port}
                  onChange={(e) =>
                    setFormData({ ...formData, port: parseInt(e.target.value) })
                  }
                  className="bg-white/5 border-white/20 text-white"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-white/90">API Token</Label>
              <Input
                value={formData.api_token}
                onChange={(e) =>
                  setFormData({ ...formData, api_token: e.target.value })
                }
                className="bg-white/5 border-white/20 text-white"
                placeholder="节点API认证令牌"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-white/90">节点类型</Label>
              <Select
                value={formData.type}
                onValueChange={(value) =>
                  setFormData({ ...formData, type: value })
                }
              >
                <SelectTrigger className="bg-white/5 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xray">Xray</SelectItem>
                  <SelectItem value="gost">Gost</SelectItem>
                  <SelectItem value="both">Both (Xray + Gost)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              className="border-white/20"
            >
              取消
            </Button>
            <Button
              onClick={handleSubmit}
              className="bg-gradient-to-r from-cyan-500 to-purple-500"
            >
              {editingNode ? "更新" : "创建"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
