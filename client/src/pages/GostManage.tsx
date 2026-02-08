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
import {
  Plus,
  Edit,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Eye,
  Power,
  Network,
  Layers,
  ArrowRight,
  X,
  Copy,
  ArrowRightLeft,
  MonitorSmartphone,
  Globe,
  Server,
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

// 内联转发规则
interface InlineForwardRule {
  id?: number;
  name: string;
  in_port: number;
  out_port: number;
  remote_addr: string;
  remark: string;
  isNew?: boolean;
}

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
  const [inlineForwards, setInlineForwards] = useState<InlineForwardRule[]>([]);
  const [saving, setSaving] = useState(false);

  // 独立转发规则对话框
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [editingForward, setEditingForward] = useState<GostForward | null>(null);
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

  // ============ 工具函数 ============

  const getNodeName = (nodeId: number) => {
    const node = nodes.find((n) => n.id === nodeId);
    return node ? `${node.name} (${node.host})` : `节点 #${nodeId}`;
  };

  const getNodeHost = (nodeId: number) => {
    const node = nodes.find((n) => n.id === nodeId);
    return node?.host || "?.?.?.?";
  };

  const formatTraffic = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const toggleExpanded = (tunnelId: number) => {
    setExpandedTunnels((prev) => {
      const next = new Set(prev);
      if (next.has(tunnelId)) next.delete(tunnelId);
      else next.add(tunnelId);
      return next;
    });
  };

  // ============ 隧道对话框 ============

  const openCreateTunnel = () => {
    setEditingTunnel(null);
    setTunnelForm({ name: "", in_node_id: 0, out_node_id: 0, type: 2, protocol: "tls", remark: "" });
    setInlineForwards([{ name: "规则1", in_port: 0, out_port: 0, remote_addr: "", remark: "", isNew: true }]);
    setTunnelDialogOpen(true);
  };

  const openEditTunnel = (tunnel: GostTunnel) => {
    setEditingTunnel(tunnel);
    setTunnelForm({
      name: tunnel.name,
      in_node_id: tunnel.in_node_id,
      out_node_id: tunnel.out_node_id,
      type: Number(tunnel.type) || 2,
      protocol: tunnel.protocol,
      remark: tunnel.remark || "",
    });
    const existingForwards: InlineForwardRule[] = (tunnel.forwards || []).map((f) => ({
      id: f.id, name: f.name, in_port: f.in_port, out_port: f.out_port,
      remote_addr: f.remote_addr, remark: f.remark || "", isNew: false,
    }));
    setInlineForwards(
      existingForwards.length > 0
        ? existingForwards
        : [{ name: "规则1", in_port: 0, out_port: 0, remote_addr: "", remark: "", isNew: true }]
    );
    setTunnelDialogOpen(true);
  };

  const addInlineForward = () => {
    setInlineForwards((prev) => [
      ...prev,
      { name: `规则${prev.length + 1}`, in_port: 0, out_port: 0, remote_addr: "", remark: "", isNew: true },
    ]);
  };

  const removeInlineForward = (index: number) => {
    setInlineForwards((prev) => prev.filter((_, i) => i !== index));
  };

  const updateInlineForward = (index: number, field: keyof InlineForwardRule, value: string | number) => {
    setInlineForwards((prev) => prev.map((f, i) => (i === index ? { ...f, [field]: value } : f)));
  };

  const handleSaveTunnel = async () => {
    if (!tunnelForm.name) { toast.error("请输入隧道名称"); return; }
    if (!tunnelForm.in_node_id || !tunnelForm.out_node_id) { toast.error("请选择入口节点和出口节点"); return; }
    if (!nodes.find(n => n.id === tunnelForm.in_node_id)) { toast.error("入口节点已被删除，请重新选择"); return; }
    if (!nodes.find(n => n.id === tunnelForm.out_node_id)) { toast.error("出口节点已被删除，请重新选择"); return; }
    if (tunnelForm.in_node_id === tunnelForm.out_node_id) { toast.error("入口节点和出口节点不能相同"); return; }

    const validForwards = inlineForwards.filter((f) => f.in_port > 0 || f.remote_addr);
    for (const f of validForwards) {
      if (!f.in_port || f.in_port < 1 || f.in_port > 65535) { toast.error(`规则 "${f.name}": 入口端口无效`); return; }
      if (!f.out_port || f.out_port < 1 || f.out_port > 65535) { toast.error(`规则 "${f.name}": 中转端口无效`); return; }
      if (!f.remote_addr) { toast.error(`规则 "${f.name}": 请填写落地地址`); return; }
    }

    try {
      setSaving(true);
      let tunnelId: number;

      if (editingTunnel) {
        await gostService.updateTunnel(editingTunnel.id, { ...tunnelForm, enable: editingTunnel.enable });
        tunnelId = editingTunnel.id;
        toast.success("隧道更新成功");

        const existingIds = (editingTunnel.forwards || []).map((f) => f.id);
        const keepIds = inlineForwards.filter((f) => f.id).map((f) => f.id as number);
        for (const id of existingIds.filter((id) => !keepIds.includes(id))) {
          await gostService.deleteForward(id);
        }

        for (const f of validForwards) {
          if (f.id) {
            await gostService.updateForward(f.id, { tunnel_id: tunnelId, name: f.name, in_port: f.in_port, out_port: f.out_port, remote_addr: f.remote_addr, remark: f.remark });
          } else {
            await gostService.createForward({ tunnel_id: tunnelId, name: f.name, in_port: f.in_port, out_port: f.out_port, remote_addr: f.remote_addr, remark: f.remark });
          }
        }
      } else {
        const created = await gostService.createTunnel(tunnelForm);
        tunnelId = created.id;
        toast.success("隧道创建成功");
        for (const f of validForwards) {
          await gostService.createForward({ tunnel_id: tunnelId, name: f.name, in_port: f.in_port, out_port: f.out_port, remote_addr: f.remote_addr, remark: f.remark });
        }
      }

      if (validForwards.length > 0) toast.success(`已保存 ${validForwards.length} 条转发规则`);
      setTunnelDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error("Failed to save tunnel:", error);
      const msg = error?.response?.data?.message || (editingTunnel ? "更新隧道失败" : "创建隧道失败");
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTunnel = async (id: number) => {
    if (!confirm("确定要删除此隧道吗？关联的转发规则也会被删除。")) return;
    try { await gostService.deleteTunnel(id); toast.success("隧道删除成功"); fetchData(); }
    catch { toast.error("删除隧道失败"); }
  };

  const handleToggleTunnel = async (id: number) => {
    const tunnel = tunnels.find(t => t.id === id);
    if (!tunnel) return;
    try { await gostService.toggleTunnel(id, tunnel); toast.success("隧道状态已切换"); fetchData(); }
    catch { toast.error("切换隧道状态失败"); }
  };

  // ============ 独立转发规则 ============

  const openCreateForward = (tunnelId: number) => {
    setEditingForward(null);
    setForwardForm({ tunnel_id: tunnelId, name: "", in_port: 0, out_port: 0, remote_addr: "", remark: "" });
    setForwardDialogOpen(true);
  };

  const openEditForward = (forward: GostForward) => {
    setEditingForward(forward);
    setForwardForm({ tunnel_id: forward.tunnel_id, name: forward.name, in_port: forward.in_port, out_port: forward.out_port, remote_addr: forward.remote_addr, remark: forward.remark || "" });
    setForwardDialogOpen(true);
  };

  const handleSaveForward = async () => {
    if (!forwardForm.name) { toast.error("请输入规则名称"); return; }
    if (!forwardForm.in_port || forwardForm.in_port < 1 || forwardForm.in_port > 65535) { toast.error("入口端口无效"); return; }
    if (!forwardForm.out_port || forwardForm.out_port < 1 || forwardForm.out_port > 65535) { toast.error("中转端口无效"); return; }
    if (!forwardForm.remote_addr) { toast.error("请填写落地地址"); return; }

    try {
      if (editingForward) { await gostService.updateForward(editingForward.id, forwardForm); toast.success("转发规则更新成功"); }
      else { await gostService.createForward(forwardForm); toast.success("转发规则创建成功"); }
      setForwardDialogOpen(false);
      fetchData();
    } catch { toast.error(editingForward ? "更新失败" : "创建失败"); }
  };

  const handleDeleteForward = async (id: number) => {
    if (!confirm("确定要删除此转发规则吗？")) return;
    try { await gostService.deleteForward(id); toast.success("转发规则删除成功"); fetchData(); }
    catch { toast.error("删除转发规则失败"); }
  };

  const handleToggleForward = async (id: number, _currentEnable: boolean) => {
    // Find the full forward object from tunnels data
    let forward: GostForward | undefined;
    for (const t of tunnels) {
      forward = (t.forwards || []).find(f => f.id === id);
      if (forward) break;
    }
    if (!forward) { toast.error("找不到转发规则"); return; }
    try { await gostService.toggleForward(id, forward); toast.success("状态已切换"); fetchData(); }
    catch { toast.error("切换状态失败"); }
  };

  // ============ 配置预览 ============

  const handlePreviewConfig = async (_nodeId: number) => {
    toast.info("配置预览功能待后端支持");
  };

  // ============ 统计 ============

  const enabledTunnels = tunnels.filter((t) => t.enable).length;
  const totalForwards = tunnels.reduce((sum, t) => sum + (t.forwards?.length || 0), 0);

  // 获取入口/出口节点的显示名
  const inNodeName = tunnelForm.in_node_id ? getNodeName(tunnelForm.in_node_id) : "入口节点";
  const outNodeName = tunnelForm.out_node_id ? getNodeName(tunnelForm.out_node_id) : "出口节点";
  const inNodeHost = tunnelForm.in_node_id ? getNodeHost(tunnelForm.in_node_id) : "入口IP";
  const outNodeHost = tunnelForm.out_node_id ? getNodeHost(tunnelForm.out_node_id) : "出口IP";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Gost 隧道管理
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">管理多节点加密隧道和端口转发规则</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-white/10 hover:bg-white/5" onClick={fetchData}>
              <RefreshCw className="w-4 h-4 mr-1.5" />刷新
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white shadow-lg shadow-cyan-500/30" onClick={openCreateTunnel}>
              <Plus className="w-4 h-4 mr-1.5" />创建隧道
            </Button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-4 bg-white/[0.03] border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-cyan-500/15 flex items-center justify-center"><Network className="w-4.5 h-4.5 text-cyan-400" /></div>
              <div><p className="text-xs text-white/50">总隧道</p><p className="text-xl font-bold text-white">{tunnels.length}</p></div>
            </div>
          </Card>
          <Card className="p-4 bg-white/[0.03] border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-500/15 flex items-center justify-center"><Power className="w-4.5 h-4.5 text-green-400" /></div>
              <div><p className="text-xs text-white/50">已启用</p><p className="text-xl font-bold text-green-400">{enabledTunnels}</p></div>
            </div>
          </Card>
          <Card className="p-4 bg-white/[0.03] border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center"><Layers className="w-4.5 h-4.5 text-purple-400" /></div>
              <div><p className="text-xs text-white/50">转发规则</p><p className="text-xl font-bold text-white">{totalForwards}</p></div>
            </div>
          </Card>
          <Card className="p-4 bg-white/[0.03] border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center"><ArrowRightLeft className="w-4.5 h-4.5 text-amber-400" /></div>
              <div><p className="text-xs text-white/50">节点数</p><p className="text-xl font-bold text-white">{nodes.length}</p></div>
            </div>
          </Card>
        </div>

        {/* Tunnel list */}
        <Card className="bg-white/[0.02] border-white/5 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-white/40">加载中...</div>
          ) : tunnels.length === 0 ? (
            <div className="p-12 text-center">
              <Network className="w-12 h-12 mx-auto text-white/20 mb-3" />
              <p className="text-white/40">暂无隧道</p>
              <p className="text-white/30 text-sm mt-1">点击"创建隧道"开始配置</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {tunnels.map((tunnel) => {
                const isExpanded = expandedTunnels.has(tunnel.id);
                const forwards = tunnel.forwards || [];
                return (
                  <div key={tunnel.id}>
                    {/* Tunnel row */}
                    <div className="flex items-center gap-3 px-4 sm:px-6 py-4 hover:bg-white/[0.02] transition-colors">
                      <button className="text-white/40 hover:text-white/80 transition-colors shrink-0" onClick={() => toggleExpanded(tunnel.id)}>
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-white/90 truncate">{tunnel.name}</span>
                          <Badge variant="outline" className={String(tunnel.type) === "2" ? "text-cyan-400 border-cyan-500/30 text-xs" : "text-amber-400 border-amber-500/30 text-xs"}>
                            {String(tunnel.type) === "2" ? "加密隧道" : "直连"}
                          </Badge>
                          <Badge variant="outline" className="text-white/50 border-white/10 text-xs">{tunnel.protocol.toUpperCase()}</Badge>
                          <Badge className={tunnel.enable ? "bg-green-500/20 text-green-400 border-green-500/30 text-xs" : "bg-red-500/20 text-red-400 border-red-500/30 text-xs"}>
                            {tunnel.enable ? "启用" : "禁用"}
                          </Badge>
                        </div>
                        <div className="text-xs text-white/40 mt-1 flex items-center gap-1 flex-wrap">
                          <span className="text-cyan-400/70">{getNodeName(tunnel.in_node_id)}</span>
                          <ArrowRight className="w-3 h-3 text-white/30" />
                          <span className="text-purple-400/70">{getNodeName(tunnel.out_node_id)}</span>
                          <span className="text-white/30 ml-2">· {forwards.length} 条转发</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:text-white" onClick={() => handleToggleTunnel(tunnel.id)} title={tunnel.enable ? "禁用" : "启用"}><Power className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:text-white" onClick={() => openEditTunnel(tunnel)} title="编辑"><Edit className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400/60 hover:text-red-400" onClick={() => handleDeleteTunnel(tunnel.id)} title="删除"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>

                    {/* Expanded forwards */}
                    {isExpanded && (
                      <div className="bg-white/[0.02] border-t border-white/5">
                        <div className="px-6 sm:px-10 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                          <h3 className="text-sm font-medium text-white/80">转发规则</h3>
                          <div className="flex gap-2 flex-wrap">
                            <Button variant="outline" size="sm" className="h-7 text-xs border-white/10" onClick={() => handlePreviewConfig(tunnel.in_node_id)}>
                              <Eye className="w-3 h-3 mr-1" />入口配置
                            </Button>
                            <Button variant="outline" size="sm" className="h-7 text-xs border-white/10" onClick={() => handlePreviewConfig(tunnel.out_node_id)}>
                              <Eye className="w-3 h-3 mr-1" />出口配置
                            </Button>
                            <Button size="sm" className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700" onClick={() => openCreateForward(tunnel.id)}>
                              <Plus className="w-3 h-3 mr-1" />添加规则
                            </Button>
                          </div>
                        </div>
                        {forwards.length === 0 ? (
                          <div className="px-10 pb-4 text-sm text-white/40">暂无转发规则，点击"添加规则"或编辑隧道添加</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow className="border-white/5 hover:bg-transparent">
                                  <TableHead className="text-white/60 pl-10">名称</TableHead>
                                  <TableHead className="text-white/60">入口端口</TableHead>
                                  <TableHead className="text-white/60">中转端口</TableHead>
                                  <TableHead className="text-white/60">落地地址</TableHead>
                                  <TableHead className="text-white/60">流量</TableHead>
                                  <TableHead className="text-white/60">状态</TableHead>
                                  <TableHead className="text-white/60 text-right pr-6">操作</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {forwards.map((fwd) => (
                                  <TableRow key={fwd.id} className="border-white/5 hover:bg-white/5">
                                    <TableCell className="pl-10"><span className="text-white/90">{fwd.name}</span></TableCell>
                                    <TableCell>
                                      <code className="text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded text-xs">:{fwd.in_port}</code>
                                    </TableCell>
                                    <TableCell>
                                      <code className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded text-xs">:{fwd.out_port}</code>
                                    </TableCell>
                                    <TableCell>
                                      <code className="text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded text-xs">{fwd.remote_addr}</code>
                                    </TableCell>
                                    <TableCell>
                                      <span className="text-xs text-white/50">↑ {formatTraffic(fwd.traffic_up)} / ↓ {formatTraffic(fwd.traffic_down)}</span>
                                    </TableCell>
                                    <TableCell>
                                      <Badge className={fwd.enable ? "bg-green-500/20 text-green-400 border-green-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}>
                                        {fwd.enable ? "启用" : "禁用"}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right pr-6">
                                      <div className="flex items-center justify-end gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-white/60 hover:text-white" onClick={() => handleToggleForward(fwd.id, fwd.enable)}><Power className="w-3.5 h-3.5" /></Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-white/60 hover:text-white" onClick={() => openEditForward(fwd)}><Edit className="w-3.5 h-3.5" /></Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400/60 hover:text-red-400" onClick={() => handleDeleteForward(fwd.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ============ 隧道对话框（集成转发规则）============ */}
        <Dialog open={tunnelDialogOpen} onOpenChange={setTunnelDialogOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10 max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg">{editingTunnel ? "编辑隧道" : "创建隧道"}</DialogTitle>
              <DialogDescription>{editingTunnel ? "修改隧道配置和转发规则" : "配置加密隧道并设置转发规则"}</DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* 隧道基本配置 */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white/70">
                  <Network className="w-4 h-4 text-cyan-400" />
                  隧道配置
                </div>

                <div className="space-y-2">
                  <Label>隧道名称</Label>
                  <Input placeholder="例如: HK-US-TLS" value={tunnelForm.name} onChange={(e) => setTunnelForm({ ...tunnelForm, name: e.target.value })} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>入口节点</Label>
                    <Select value={tunnelForm.in_node_id ? tunnelForm.in_node_id.toString() : "placeholder"} onValueChange={(v) => v !== "placeholder" && setTunnelForm({ ...tunnelForm, in_node_id: parseInt(v) })}>
                      <SelectTrigger className={tunnelForm.in_node_id && !nodes.find(n => n.id === tunnelForm.in_node_id) ? "border-red-500/50" : ""}><SelectValue placeholder="选择入口节点" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="placeholder" disabled>选择入口节点</SelectItem>
                        {tunnelForm.in_node_id > 0 && !nodes.find(n => n.id === tunnelForm.in_node_id) && (
                          <SelectItem value={tunnelForm.in_node_id.toString()} disabled className="text-red-400">⚠ 已删除的节点 #{tunnelForm.in_node_id}（请重新选择）</SelectItem>
                        )}
                        {nodes.map((n) => (<SelectItem key={n.id} value={n.id.toString()}>{n.name} ({n.host})</SelectItem>))}
                      </SelectContent>
                    </Select>
                    {tunnelForm.in_node_id > 0 && !nodes.find(n => n.id === tunnelForm.in_node_id) && (
                      <p className="text-xs text-red-400">该节点已被删除，请重新选择入口节点</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>出口节点</Label>
                    <Select value={tunnelForm.out_node_id ? tunnelForm.out_node_id.toString() : "placeholder"} onValueChange={(v) => v !== "placeholder" && setTunnelForm({ ...tunnelForm, out_node_id: parseInt(v) })}>
                      <SelectTrigger className={tunnelForm.out_node_id && !nodes.find(n => n.id === tunnelForm.out_node_id) ? "border-red-500/50" : ""}><SelectValue placeholder="选择出口节点" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="placeholder" disabled>选择出口节点</SelectItem>
                        {tunnelForm.out_node_id > 0 && !nodes.find(n => n.id === tunnelForm.out_node_id) && (
                          <SelectItem value={tunnelForm.out_node_id.toString()} disabled className="text-red-400">⚠ 已删除的节点 #{tunnelForm.out_node_id}（请重新选择）</SelectItem>
                        )}
                        {nodes.map((n) => (<SelectItem key={n.id} value={n.id.toString()}>{n.name} ({n.host})</SelectItem>))}
                      </SelectContent>
                    </Select>
                    {tunnelForm.out_node_id > 0 && !nodes.find(n => n.id === tunnelForm.out_node_id) && (
                      <p className="text-xs text-red-400">该节点已被删除，请重新选择出口节点</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>隧道类型</Label>
                    <Select value={tunnelForm.type.toString()} onValueChange={(v) => setTunnelForm({ ...tunnelForm, type: parseInt(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">隧道转发（加密）</SelectItem>
                        <SelectItem value="1">端口转发（直连）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>传输协议</Label>
                    <Select value={tunnelForm.protocol} onValueChange={(v) => setTunnelForm({ ...tunnelForm, protocol: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <Input placeholder="隧道用途说明" value={tunnelForm.remark || ""} onChange={(e) => setTunnelForm({ ...tunnelForm, remark: e.target.value })} />
                </div>
              </div>

              {/* 分割线 */}
              <div className="border-t border-white/10" />

              {/* 转发规则 - 入口→中转→落地 三段式 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-white/70">
                    <ArrowRightLeft className="w-4 h-4 text-purple-400" />
                    转发规则
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs border-white/10" onClick={addInlineForward}>
                    <Plus className="w-3 h-3 mr-1" />添加规则
                  </Button>
                </div>

                {/* 全局流量路径说明 */}
                <div className="p-3 rounded-lg bg-white/[0.03] border border-white/8">
                  <div className="flex items-center gap-2 text-xs text-white/50 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <MonitorSmartphone className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-cyan-400 font-medium">入口</span>
                      <span className="text-white/30">用户连接的端口</span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-white/20" />
                    <div className="flex items-center gap-1.5">
                      <Server className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-amber-400 font-medium">中转</span>
                      <span className="text-white/30">{tunnelForm.protocol.toUpperCase()} 加密隧道端口</span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-white/20" />
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-purple-400 font-medium">落地</span>
                      <span className="text-white/30">最终目标地址</span>
                    </div>
                  </div>
                </div>

                {inlineForwards.length === 0 ? (
                  <div className="p-4 rounded-lg border border-dashed border-white/10 text-center">
                    <p className="text-sm text-white/30">暂无转发规则，点击"添加规则"</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {inlineForwards.map((fwd, index) => (
                      <div key={index} className="rounded-lg bg-white/[0.03] border border-white/8 overflow-hidden">
                        {/* 规则头部 */}
                        <div className="flex items-center justify-between px-4 py-2.5 bg-white/[0.02] border-b border-white/5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-white/40 bg-white/5 px-2 py-0.5 rounded">#{index + 1}</span>
                            <Input className="h-7 w-36 text-xs bg-transparent border-white/10" placeholder="规则名称" value={fwd.name} onChange={(e) => updateInlineForward(index, "name", e.target.value)} />
                          </div>
                          {inlineForwards.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-red-400/60 hover:text-red-400" onClick={() => removeInlineForward(index)}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>

                        {/* 三段式布局 */}
                        <div className="p-4 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* 入口 */}
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5">
                                <MonitorSmartphone className="w-3.5 h-3.5 text-cyan-400" />
                                <Label className="text-xs text-cyan-400 font-medium">入口端口</Label>
                              </div>
                              <Input
                                type="number"
                                placeholder="10000"
                                className="h-9 text-sm border-cyan-500/20 focus:border-cyan-500/50"
                                value={fwd.in_port || ""}
                                onChange={(e) => updateInlineForward(index, "in_port", parseInt(e.target.value) || 0)}
                              />
                              <p className="text-[11px] text-white/30 leading-tight">
                                用户连接 <span className="text-cyan-400/60">{inNodeHost}:{fwd.in_port || "端口"}</span> 来使用隧道
                              </p>
                            </div>

                            {/* 中转 */}
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5">
                                <Server className="w-3.5 h-3.5 text-amber-400" />
                                <Label className="text-xs text-amber-400 font-medium">中转端口</Label>
                              </div>
                              <Input
                                type="number"
                                placeholder="18000"
                                className="h-9 text-sm border-amber-500/20 focus:border-amber-500/50"
                                value={fwd.out_port || ""}
                                onChange={(e) => updateInlineForward(index, "out_port", parseInt(e.target.value) || 0)}
                              />
                              <p className="text-[11px] text-white/30 leading-tight">
                                出口节点 <span className="text-amber-400/60">{outNodeHost}:{fwd.out_port || "端口"}</span> 接收加密流量
                              </p>
                            </div>

                            {/* 落地 */}
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5">
                                <Globe className="w-3.5 h-3.5 text-purple-400" />
                                <Label className="text-xs text-purple-400 font-medium">落地地址</Label>
                              </div>
                              <Input
                                placeholder="127.0.0.1:8080"
                                className="h-9 text-sm border-purple-500/20 focus:border-purple-500/50"
                                value={fwd.remote_addr}
                                onChange={(e) => updateInlineForward(index, "remote_addr", e.target.value)}
                              />
                              <p className="text-[11px] text-white/30 leading-tight">
                                最终转发到的目标，格式: <span className="text-purple-400/60">地址:端口</span>
                              </p>
                            </div>
                          </div>

                          {/* 实时路径预览 */}
                          {(fwd.in_port > 0 || fwd.remote_addr) && (
                            <div className="p-2.5 rounded-md bg-black/20 border border-white/5">
                              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                                <span className="text-white/50">路径:</span>
                                <code className="text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded font-mono">
                                  {inNodeHost}:{fwd.in_port || "?"}
                                </code>
                                <ArrowRight className="w-3 h-3 text-white/30" />
                                <span className="text-amber-400/80 bg-amber-500/10 px-1.5 py-0.5 rounded text-[11px]">
                                  {tunnelForm.protocol.toUpperCase()} 加密
                                </span>
                                <ArrowRight className="w-3 h-3 text-white/30" />
                                <code className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded font-mono">
                                  {outNodeHost}:{fwd.out_port || "?"}
                                </code>
                                <ArrowRight className="w-3 h-3 text-white/30" />
                                <code className="text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded font-mono">
                                  {fwd.remote_addr || "落地地址"}
                                </code>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 模式提示 */}
              {tunnelForm.type === 1 && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-sm text-yellow-400">直连模式：流量不经过加密隧道，入口节点直接转发到目标地址。</p>
                </div>
              )}
              {tunnelForm.type === 2 && (
                <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <p className="text-sm text-cyan-400">
                    隧道模式：用户连接入口节点端口 → 通过 {tunnelForm.protocol.toUpperCase()} 加密传输到出口节点 → 出口节点转发到落地地址。
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setTunnelDialogOpen(false)} disabled={saving}>取消</Button>
              <Button onClick={handleSaveTunnel} disabled={saving}>
                {saving ? "保存中..." : editingTunnel ? "保存修改" : "创建隧道"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============ 独立转发规则对话框 ============ */}
        <Dialog open={forwardDialogOpen} onOpenChange={setForwardDialogOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10 max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingForward ? "编辑转发规则" : "添加转发规则"}</DialogTitle>
              <DialogDescription>配置转发路径：入口 → 中转 → 落地</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>规则名称</Label>
                <Input placeholder="例如: Web服务转发" value={forwardForm.name} onChange={(e) => setForwardForm({ ...forwardForm, name: e.target.value })} />
              </div>

              {/* 入口 */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <MonitorSmartphone className="w-3.5 h-3.5 text-cyan-400" />
                  <Label className="text-cyan-400">入口端口</Label>
                </div>
                <Input type="number" placeholder="10000" value={forwardForm.in_port || ""} onChange={(e) => setForwardForm({ ...forwardForm, in_port: parseInt(e.target.value) || 0 })} />
                <p className="text-xs text-white/40">入口节点上监听的端口，用户连接此端口来使用隧道</p>
              </div>

              {/* 中转 */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-amber-400" />
                  <Label className="text-amber-400">中转端口</Label>
                </div>
                <Input type="number" placeholder="18000" value={forwardForm.out_port || ""} onChange={(e) => setForwardForm({ ...forwardForm, out_port: parseInt(e.target.value) || 0 })} />
                <p className="text-xs text-white/40">出口节点上的加密隧道端口，接收来自入口节点的加密流量</p>
              </div>

              {/* 落地 */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-purple-400" />
                  <Label className="text-purple-400">落地地址</Label>
                </div>
                <Input placeholder="127.0.0.1:8080 或 example.com:443" value={forwardForm.remote_addr} onChange={(e) => setForwardForm({ ...forwardForm, remote_addr: e.target.value })} />
                <p className="text-xs text-white/40">出口节点最终转发到的目标地址，格式: 地址:端口</p>
              </div>

              <div className="space-y-2">
                <Label>备注（可选）</Label>
                <Input placeholder="转发用途说明" value={forwardForm.remark || ""} onChange={(e) => setForwardForm({ ...forwardForm, remark: e.target.value })} />
              </div>

              {/* 路径预览 */}
              <div className="p-3 rounded-lg bg-black/20 border border-white/10">
                <p className="text-xs text-white/50 mb-1.5">转发路径预览:</p>
                <div className="flex items-center gap-1.5 text-xs flex-wrap">
                  <code className="text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">入口:{forwardForm.in_port || "?"}</code>
                  <ArrowRight className="w-3 h-3 text-white/30" />
                  <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">加密隧道</span>
                  <ArrowRight className="w-3 h-3 text-white/30" />
                  <code className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">中转:{forwardForm.out_port || "?"}</code>
                  <ArrowRight className="w-3 h-3 text-white/30" />
                  <code className="text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">{forwardForm.remote_addr || "落地地址"}</code>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setForwardDialogOpen(false)}>取消</Button>
              <Button onClick={handleSaveForward}>{editingForward ? "保存" : "创建"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============ 配置预览对话框 ============ */}
        <Dialog open={configPreviewOpen} onOpenChange={setConfigPreviewOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10 max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Gost 配置预览</DialogTitle>
              <DialogDescription>节点: {configPreviewNodeName}</DialogDescription>
            </DialogHeader>
            <div className="overflow-auto max-h-[60vh]">
              <pre className="p-4 rounded-lg bg-black/40 text-sm text-green-400 font-mono whitespace-pre-wrap">{configPreviewContent}</pre>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { navigator.clipboard.writeText(configPreviewContent); toast.success("配置已复制到剪贴板"); }}>
                <Copy className="w-4 h-4 mr-1.5" />复制
              </Button>
              <Button variant="outline" onClick={() => setConfigPreviewOpen(false)}>关闭</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
