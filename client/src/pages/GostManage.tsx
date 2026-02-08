import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useCallback } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Edit,
  Trash2,
  GitBranch,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
  Eye,
  Power,
  Network,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import {
  gostService,
  type GostTunnel,
  type GostForward,
  type CreateTunnelRequest,
  type CreateForwardRequest,
} from "@/services/gost";
import { nodeService, type Node } from "@/services/node";
import { Textarea } from "@/components/ui/textarea";

export default function GostManage() {
  const [tunnels, setTunnels] = useState<GostTunnel[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTunnels, setExpandedTunnels] = useState<Set<number>>(new Set());

  // 隧道对话框
  const [tunnelDialogOpen, setTunnelDialogOpen] = useState(false);
  const [editingTunnel, setEditingTunnel] = useState<GostTunnel | null>(null);
  const [tunnelForm, setTunnelForm] = useState<CreateTunnelRequest>({
    name: "",
    in_node_id: 0,
    out_node_id: 0,
    type: 2,
    protocol: "tls",
    remark: "",
  });

  // 转发规则对话框
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [editingForward, setEditingForward] = useState<GostForward | null>(null);
  const [forwardTunnelId, setForwardTunnelId] = useState<number>(0);
  const [forwardForm, setForwardForm] = useState<CreateForwardRequest>({
    tunnel_id: 0,
    name: "",
    in_port: 0,
    out_port: 0,
    remote_addr: "",
    remark: "",
  });

  // 配置预览
  const [configPreviewOpen, setConfigPreviewOpen] = useState(false);
  const [configPreviewContent, setConfigPreviewContent] = useState("");
  const [configPreviewNodeName, setConfigPreviewNodeName] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [tunnelData, nodeList] = await Promise.all([
        gostService.getTunnels(),
        nodeService.getAll(),
      ]);
      setTunnels(tunnelData.tunnels);
      setNodes(nodeList);
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("获取数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============ 隧道操作 ============

  const getNodeName = (nodeId: number) => {
    const node = nodes.find((n) => n.id === nodeId);
    return node ? `${node.name} (${node.host})` : `节点 #${nodeId}`;
  };

  const toggleExpanded = (tunnelId: number) => {
    setExpandedTunnels((prev) => {
      const next = new Set(prev);
      if (next.has(tunnelId)) {
        next.delete(tunnelId);
      } else {
        next.add(tunnelId);
      }
      return next;
    });
  };

  const openCreateTunnel = () => {
    setEditingTunnel(null);
    setTunnelForm({
      name: "",
      in_node_id: 0,
      out_node_id: 0,
      type: 2,
      protocol: "tls",
      remark: "",
    });
    setTunnelDialogOpen(true);
  };

  const openEditTunnel = (tunnel: GostTunnel) => {
    setEditingTunnel(tunnel);
    setTunnelForm({
      name: tunnel.name,
      in_node_id: tunnel.in_node_id,
      out_node_id: tunnel.out_node_id,
      type: tunnel.type,
      protocol: tunnel.protocol,
      remark: tunnel.remark || "",
    });
    setTunnelDialogOpen(true);
  };

  const handleSaveTunnel = async () => {
    if (!tunnelForm.name) {
      toast.error("请输入隧道名称");
      return;
    }
    if (!tunnelForm.in_node_id || !tunnelForm.out_node_id) {
      toast.error("请选择入口节点和出口节点");
      return;
    }
    if (tunnelForm.in_node_id === tunnelForm.out_node_id) {
      toast.error("入口节点和出口节点不能相同");
      return;
    }

    try {
      if (editingTunnel) {
        await gostService.updateTunnel(editingTunnel.id, tunnelForm);
        toast.success("隧道更新成功");
      } else {
        await gostService.createTunnel(tunnelForm);
        toast.success("隧道创建成功");
      }
      setTunnelDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error("Failed to save tunnel:", error);
      toast.error(editingTunnel ? "更新隧道失败" : "创建隧道失败");
    }
  };

  const handleDeleteTunnel = async (id: number) => {
    if (!confirm("确定要删除此隧道吗？关联的转发规则也会被删除。")) return;
    try {
      await gostService.deleteTunnel(id);
      toast.success("隧道删除成功");
      fetchData();
    } catch (error) {
      console.error("Failed to delete tunnel:", error);
      toast.error("删除隧道失败");
    }
  };

  const handleToggleTunnel = async (id: number) => {
    try {
      await gostService.toggleTunnel(id);
      toast.success("隧道状态已切换");
      fetchData();
    } catch (error) {
      console.error("Failed to toggle tunnel:", error);
      toast.error("切换隧道状态失败");
    }
  };

  // ============ 转发规则操作 ============

  const openCreateForward = (tunnelId: number) => {
    setEditingForward(null);
    setForwardTunnelId(tunnelId);
    setForwardForm({
      tunnel_id: tunnelId,
      name: "",
      in_port: 0,
      out_port: 0,
      remote_addr: "",
      remark: "",
    });
    setForwardDialogOpen(true);
  };

  const openEditForward = (forward: GostForward) => {
    setEditingForward(forward);
    setForwardTunnelId(forward.tunnel_id);
    setForwardForm({
      tunnel_id: forward.tunnel_id,
      name: forward.name,
      in_port: forward.in_port,
      out_port: forward.out_port,
      remote_addr: forward.remote_addr,
      remark: forward.remark || "",
    });
    setForwardDialogOpen(true);
  };

  const handleSaveForward = async () => {
    if (!forwardForm.name) {
      toast.error("请输入转发名称");
      return;
    }
    if (!forwardForm.in_port || forwardForm.in_port < 1 || forwardForm.in_port > 65535) {
      toast.error("入口端口必须在 1-65535 之间");
      return;
    }
    if (!forwardForm.out_port || forwardForm.out_port < 1 || forwardForm.out_port > 65535) {
      toast.error("出口端口必须在 1-65535 之间");
      return;
    }
    if (!forwardForm.remote_addr) {
      toast.error("请输入目标地址");
      return;
    }

    try {
      if (editingForward) {
        await gostService.updateForward(editingForward.id, forwardForm);
        toast.success("转发规则更新成功");
      } else {
        await gostService.createForward(forwardForm);
        toast.success("转发规则创建成功");
      }
      setForwardDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error("Failed to save forward:", error);
      toast.error(editingForward ? "更新转发规则失败" : "创建转发规则失败");
    }
  };

  const handleDeleteForward = async (id: number) => {
    if (!confirm("确定要删除此转发规则吗？")) return;
    try {
      await gostService.deleteForward(id);
      toast.success("转发规则删除成功");
      fetchData();
    } catch (error) {
      console.error("Failed to delete forward:", error);
      toast.error("删除转发规则失败");
    }
  };

  const handleToggleForward = async (id: number) => {
    try {
      await gostService.toggleForward(id);
      toast.success("转发规则状态已切换");
      fetchData();
    } catch (error) {
      console.error("Failed to toggle forward:", error);
      toast.error("切换转发规则状态失败");
    }
  };

  // ============ 配置预览 ============

  const handlePreviewConfig = async (nodeId: number) => {
    try {
      const config = await gostService.previewConfig(nodeId);
      setConfigPreviewContent(config || "# 该节点没有 Gost 配置");
      setConfigPreviewNodeName(getNodeName(nodeId));
      setConfigPreviewOpen(true);
    } catch (error) {
      console.error("Failed to preview config:", error);
      toast.error("获取配置预览失败");
    }
  };

  // ============ 统计 ============

  const enabledTunnels = tunnels.filter((t) => t.enable).length;
  const totalForwards = tunnels.reduce(
    (sum, t) => sum + (t.forwards?.length || 0),
    0
  );

  const formatTraffic = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Gost 隧道管理
            </h1>
            <p className="text-muted-foreground mt-2">
              管理多节点加密隧道和端口转发规则
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="border-white/10 hover:bg-white/5"
              onClick={fetchData}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
            </Button>
            <Button
              className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white shadow-lg shadow-cyan-500/30"
              onClick={openCreateTunnel}
            >
              <Plus className="w-4 h-4 mr-2" />
              创建隧道
            </Button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="glass-card border-white/10 p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-cyan-500/20">
                <GitBranch className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm text-white/60">隧道总数</p>
                <p className="text-2xl font-bold text-white">{tunnels.length}</p>
              </div>
            </div>
          </Card>
          <Card className="glass-card border-white/10 p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Power className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-sm text-white/60">已启用</p>
                <p className="text-2xl font-bold text-white">{enabledTunnels}</p>
              </div>
            </div>
          </Card>
          <Card className="glass-card border-white/10 p-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-purple-500/20">
                <ArrowRightLeft className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-white/60">转发规则</p>
                <p className="text-2xl font-bold text-white">{totalForwards}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tunnel list */}
        <Card className="glass-card border-white/10">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-lg font-semibold text-white">隧道列表</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-white/60">加载中...</div>
          ) : tunnels.length === 0 ? (
            <div className="p-8 text-center text-white/60">
              <GitBranch className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>暂无隧道</p>
              <p className="text-sm mt-2">点击"创建隧道"开始配置</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {tunnels.map((tunnel) => {
                const isExpanded = expandedTunnels.has(tunnel.id);
                const forwards = tunnel.forwards || [];

                return (
                  <div key={tunnel.id}>
                    {/* Tunnel row */}
                    <div className="flex items-center p-4 hover:bg-white/5 transition-colors">
                      <button
                        className="mr-3 text-white/60 hover:text-white"
                        onClick={() => toggleExpanded(tunnel.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5" />
                        ) : (
                          <ChevronRight className="w-5 h-5" />
                        )}
                      </button>

                      <div className="flex-1 grid grid-cols-6 gap-4 items-center">
                        <div>
                          <p className="font-medium text-white">{tunnel.name}</p>
                          <p className="text-xs text-white/50">ID: {tunnel.id}</p>
                        </div>
                        <div>
                          <p className="text-sm text-white/70">
                            {getNodeName(tunnel.in_node_id)}
                          </p>
                          <p className="text-xs text-white/40">入口节点</p>
                        </div>
                        <div className="flex items-center justify-center">
                          <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div>
                          <p className="text-sm text-white/70">
                            {getNodeName(tunnel.out_node_id)}
                          </p>
                          <p className="text-xs text-white/40">出口节点</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={
                              tunnel.type === 1
                                ? "border-yellow-500/50 text-yellow-400"
                                : "border-cyan-500/50 text-cyan-400"
                            }
                          >
                            {tunnel.type === 1 ? "直连" : "隧道"}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="border-white/20 text-white/70"
                          >
                            {tunnel.protocol.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              tunnel.enable
                                ? "bg-green-500/20 text-green-400 border-green-500/30"
                                : "bg-red-500/20 text-red-400 border-red-500/30"
                            }
                          >
                            {tunnel.enable ? "启用" : "禁用"}
                          </Badge>
                          <span className="text-xs text-white/40">
                            {forwards.length} 条规则
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 ml-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white/60 hover:text-white"
                          onClick={() => handleToggleTunnel(tunnel.id)}
                          title={tunnel.enable ? "禁用" : "启用"}
                        >
                          <Power className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-white/60 hover:text-white"
                          onClick={() => openEditTunnel(tunnel)}
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-400/60 hover:text-red-400"
                          onClick={() => handleDeleteTunnel(tunnel.id)}
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded forwards section */}
                    {isExpanded && (
                      <div className="bg-white/[0.02] border-t border-white/5">
                        <div className="px-12 py-3 flex items-center justify-between">
                          <h3 className="text-sm font-medium text-white/80">
                            转发规则
                          </h3>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs border-white/10"
                              onClick={() => handlePreviewConfig(tunnel.in_node_id)}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              入口配置
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs border-white/10"
                              onClick={() => handlePreviewConfig(tunnel.out_node_id)}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              出口配置
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700"
                              onClick={() => openCreateForward(tunnel.id)}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              添加规则
                            </Button>
                          </div>
                        </div>

                        {forwards.length === 0 ? (
                          <div className="px-12 pb-4 text-sm text-white/40">
                            暂无转发规则，点击"添加规则"创建
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow className="border-white/5 hover:bg-transparent">
                                <TableHead className="text-white/60 pl-12">
                                  名称
                                </TableHead>
                                <TableHead className="text-white/60">
                                  入口端口
                                </TableHead>
                                <TableHead className="text-white/60">
                                  出口端口
                                </TableHead>
                                <TableHead className="text-white/60">
                                  目标地址
                                </TableHead>
                                <TableHead className="text-white/60">
                                  流量
                                </TableHead>
                                <TableHead className="text-white/60">
                                  状态
                                </TableHead>
                                <TableHead className="text-white/60 text-right">
                                  操作
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {forwards.map((fwd) => (
                                <TableRow
                                  key={fwd.id}
                                  className="border-white/5 hover:bg-white/5"
                                >
                                  <TableCell className="pl-12">
                                    <span className="text-white/90">
                                      {fwd.name}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <code className="text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded text-xs">
                                      :{fwd.in_port}
                                    </code>
                                  </TableCell>
                                  <TableCell>
                                    <code className="text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded text-xs">
                                      :{fwd.out_port}
                                    </code>
                                  </TableCell>
                                  <TableCell>
                                    <code className="text-white/70 text-xs">
                                      {fwd.remote_addr}
                                    </code>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-xs text-white/50">
                                      ↑ {formatTraffic(fwd.traffic_up)} / ↓{" "}
                                      {formatTraffic(fwd.traffic_down)}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <Badge
                                      className={
                                        fwd.enable
                                          ? "bg-green-500/20 text-green-400 border-green-500/30"
                                          : "bg-red-500/20 text-red-400 border-red-500/30"
                                      }
                                    >
                                      {fwd.enable ? "启用" : "禁用"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-white/60 hover:text-white"
                                        onClick={() =>
                                          handleToggleForward(fwd.id)
                                        }
                                      >
                                        <Power className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-white/60 hover:text-white"
                                        onClick={() => openEditForward(fwd)}
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-red-400/60 hover:text-red-400"
                                        onClick={() =>
                                          handleDeleteForward(fwd.id)
                                        }
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ============ 隧道对话框 ============ */}
        <Dialog open={tunnelDialogOpen} onOpenChange={setTunnelDialogOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10 max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingTunnel ? "编辑隧道" : "创建隧道"}
              </DialogTitle>
              <DialogDescription>
                {editingTunnel
                  ? "修改隧道配置"
                  : "配置入口节点和出口节点之间的加密隧道"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>隧道名称</Label>
                <Input
                  placeholder="例如: HK-US 隧道"
                  value={tunnelForm.name}
                  onChange={(e) =>
                    setTunnelForm({ ...tunnelForm, name: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>入口节点</Label>
                  <Select
                    value={tunnelForm.in_node_id ? tunnelForm.in_node_id.toString() : "placeholder"}
                    onValueChange={(value) =>
                      value !== "placeholder" && setTunnelForm({
                        ...tunnelForm,
                        in_node_id: parseInt(value),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择入口节点" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="placeholder" disabled>选择入口节点</SelectItem>
                      {nodes.map((node) => (
                        <SelectItem key={node.id} value={node.id.toString()}>
                          {node.name} ({node.host})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>出口节点</Label>
                  <Select
                    value={tunnelForm.out_node_id ? tunnelForm.out_node_id.toString() : "placeholder"}
                    onValueChange={(value) =>
                      value !== "placeholder" && setTunnelForm({
                        ...tunnelForm,
                        out_node_id: parseInt(value),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择出口节点" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="placeholder" disabled>选择出口节点</SelectItem>
                      {nodes.map((node) => (
                        <SelectItem key={node.id} value={node.id.toString()}>
                          {node.name} ({node.host})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>隧道类型</Label>
                  <Select
                    value={tunnelForm.type.toString()}
                    onValueChange={(value) =>
                      setTunnelForm({ ...tunnelForm, type: parseInt(value) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">隧道转发（加密）</SelectItem>
                      <SelectItem value="1">端口转发（直连）</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>传输协议</Label>
                  <Select
                    value={tunnelForm.protocol}
                    onValueChange={(value) =>
                      setTunnelForm({ ...tunnelForm, protocol: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="tls">TLS</SelectItem>
                      <SelectItem value="ws">WebSocket</SelectItem>
                      <SelectItem value="wss">WSS (WebSocket + TLS)</SelectItem>
                      <SelectItem value="quic">QUIC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>备注（可选）</Label>
                <Input
                  placeholder="隧道用途说明"
                  value={tunnelForm.remark || ""}
                  onChange={(e) =>
                    setTunnelForm({ ...tunnelForm, remark: e.target.value })
                  }
                />
              </div>

              {tunnelForm.type === 1 && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-sm text-yellow-400">
                    直连模式：流量不经过加密隧道，入口节点直接转发到目标地址。适合不需要加密的场景。
                  </p>
                </div>
              )}
              {tunnelForm.type === 2 && (
                <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <p className="text-sm text-cyan-400">
                    隧道模式：入口节点通过 {tunnelForm.protocol.toUpperCase()} 加密连接到出口节点，出口节点再转发到目标地址。
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setTunnelDialogOpen(false)}
              >
                取消
              </Button>
              <Button onClick={handleSaveTunnel}>
                {editingTunnel ? "保存" : "创建"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============ 转发规则对话框 ============ */}
        <Dialog open={forwardDialogOpen} onOpenChange={setForwardDialogOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10 max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingForward ? "编辑转发规则" : "添加转发规则"}
              </DialogTitle>
              <DialogDescription>
                配置端口映射：入口端口 → 出口端口 → 目标地址
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>规则名称</Label>
                <Input
                  placeholder="例如: Web服务转发"
                  value={forwardForm.name}
                  onChange={(e) =>
                    setForwardForm({ ...forwardForm, name: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>入口端口</Label>
                  <Input
                    type="number"
                    placeholder="入口节点监听端口"
                    value={forwardForm.in_port || ""}
                    onChange={(e) =>
                      setForwardForm({
                        ...forwardForm,
                        in_port: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-white/40">入口节点上监听的端口</p>
                </div>
                <div className="space-y-2">
                  <Label>出口端口</Label>
                  <Input
                    type="number"
                    placeholder="出口节点监听端口"
                    value={forwardForm.out_port || ""}
                    onChange={(e) =>
                      setForwardForm({
                        ...forwardForm,
                        out_port: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-white/40">
                    出口节点上的 relay 端口
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>目标地址</Label>
                <Input
                  placeholder="例如: 127.0.0.1:8080 或 google.com:443"
                  value={forwardForm.remote_addr}
                  onChange={(e) =>
                    setForwardForm({
                      ...forwardForm,
                      remote_addr: e.target.value,
                    })
                  }
                />
                <p className="text-xs text-white/40">
                  最终转发的目标地址（host:port 格式）
                </p>
              </div>

              <div className="space-y-2">
                <Label>备注（可选）</Label>
                <Input
                  placeholder="转发用途说明"
                  value={forwardForm.remark || ""}
                  onChange={(e) =>
                    setForwardForm({ ...forwardForm, remark: e.target.value })
                  }
                />
              </div>

              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <p className="text-sm text-white/60">
                  流量路径：客户端 → 入口节点:{forwardForm.in_port || "?"} →
                  {" "}加密隧道 → 出口节点:{forwardForm.out_port || "?"} →{" "}
                  {forwardForm.remote_addr || "目标地址"}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setForwardDialogOpen(false)}
              >
                取消
              </Button>
              <Button onClick={handleSaveForward}>
                {editingForward ? "保存" : "创建"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============ 配置预览对话框 ============ */}
        <Dialog open={configPreviewOpen} onOpenChange={setConfigPreviewOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10 max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Gost 配置预览</DialogTitle>
              <DialogDescription>
                节点: {configPreviewNodeName}
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-auto max-h-[60vh]">
              <pre className="p-4 rounded-lg bg-black/40 text-sm text-green-400 font-mono whitespace-pre-wrap">
                {configPreviewContent}
              </pre>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfigPreviewOpen(false)}
              >
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
