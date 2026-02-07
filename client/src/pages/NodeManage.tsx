/*
 * Design: Gradient Fluid dark theme
 * - Glass cards with backdrop blur
 * - Cyan/purple gradient accents
 * - Table format for node listing
 * - Simplified add node & one-click install script
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Server,
  Plus,
  Terminal,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Edit,
  Power,
  Cpu,
  HardDrive,
  ArrowUp,
  ArrowDown,
  Globe,
  Clock,
  ChevronDown,
  ChevronUp,
  Wifi,
  WifiOff,
  Download,
} from "lucide-react";
import { nodeService, type Node } from "@/services/node";

// 格式化流量
function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// 格式化时间
function formatTime(time: string | null): string {
  if (!time) return "从未";
  const d = new Date(time);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return `${diff}秒前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

export default function NodeManage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNodes, setSelectedNodes] = useState<number[]>([]);

  // Dialogs
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    host: "",
    port: 10001,
    type: "both",
    api_token: "",
  });
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [deletingNode, setDeletingNode] = useState<Node | null>(null);

  // Install script state
  const [installNodeName, setInstallNodeName] = useState("");
  const [installNodeType, setInstallNodeType] = useState("both");
  const [installScript, setInstallScript] = useState<any>(null);
  const [installLoading, setInstallLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // 加载节点列表
  const loadNodes = useCallback(async () => {
    try {
      setLoading(true);
      const res: any = await nodeService.list(1, 100);
      const list = res?.data?.nodes || res?.nodes || [];
      setNodes(Array.isArray(list) ? list : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNodes();
    const interval = setInterval(loadNodes, 30000);
    return () => clearInterval(interval);
  }, [loadNodes]);

  // 统计
  const totalNodes = nodes.length;
  const onlineNodes = nodes.filter((n) => n.status === "online").length;
  const totalUp = nodes.reduce((s, n) => s + (n.traffic_up || 0), 0);
  const totalDown = nodes.reduce((s, n) => s + (n.traffic_down || 0), 0);

  // 添加节点
  const handleAddNode = async () => {
    if (!formData.name.trim()) {
      toast.error("请输入节点名称");
      return;
    }
    if (!formData.host.trim()) {
      toast.error("请输入节点地址");
      return;
    }
    try {
      await nodeService.create(formData);
      toast.success("节点添加成功");
      setAddDialogOpen(false);
      setFormData({ name: "", host: "", port: 10001, type: "both", api_token: "" });
      loadNodes();
    } catch {
      toast.error("添加失败");
    }
  };

  // 编辑节点
  const handleEditNode = async () => {
    if (!editingNode) return;
    try {
      await nodeService.update(editingNode.id, {
        name: editingNode.name,
        host: editingNode.host,
        port: editingNode.port,
        type: editingNode.type,
      });
      toast.success("节点更新成功");
      setEditDialogOpen(false);
      setEditingNode(null);
      loadNodes();
    } catch {
      toast.error("更新失败");
    }
  };

  // 删除节点
  const handleDeleteNode = async () => {
    if (!deletingNode) return;
    try {
      await nodeService.delete(deletingNode.id);
      toast.success("节点已删除");
      setDeleteDialogOpen(false);
      setDeletingNode(null);
      loadNodes();
    } catch {
      toast.error("删除失败");
    }
  };

  // 切换节点状态
  const handleToggle = async (node: Node) => {
    try {
      await nodeService.toggle(node.id);
      toast.success(node.status === "online" ? "节点已停用" : "节点已启用");
      loadNodes();
    } catch {
      toast.error("操作失败");
    }
  };

  // 同步配置
  const handleSync = async (node: Node) => {
    try {
      await nodeService.sync(node.id);
      toast.success(`${node.name} 配置已同步`);
    } catch {
      toast.error("同步失败");
    }
  };

  // 生成安装脚本
  const handleGenerateScript = async () => {
    setInstallLoading(true);
    try {
      const result = await nodeService.generateInstallScript(installNodeName, installNodeType);
      setInstallScript(result);
    } catch {
      toast.error("生成安装脚本失败");
    } finally {
      setInstallLoading(false);
    }
  };

  // 生成 Token
  const handleGenerateToken = async () => {
    try {
      const token = await nodeService.generateToken();
      if (token) {
        setFormData((prev) => ({ ...prev, api_token: token }));
        toast.success("Token 已生成");
      }
    } catch {
      toast.error("生成 Token 失败");
    }
  };

  // 复制到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // fallback
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // 批量同步
  const handleBatchSync = async () => {
    if (selectedNodes.length === 0) {
      toast.error("请先选择节点");
      return;
    }
    try {
      await nodeService.batchSync(selectedNodes);
      toast.success(`已同步 ${selectedNodes.length} 个节点`);
      setSelectedNodes([]);
    } catch {
      toast.error("批量同步失败");
    }
  };

  // 展开/收起行
  const toggleExpand = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 节点类型标签
  const TypeBadge = ({ type }: { type: string }) => {
    const colors: Record<string, string> = {
      xray: "bg-blue-500/20 text-blue-400 border-blue-400/30",
      gost: "bg-green-500/20 text-green-400 border-green-400/30",
      both: "bg-purple-500/20 text-purple-400 border-purple-400/30",
    };
    const labels: Record<string, string> = {
      xray: "Xray",
      gost: "Gost",
      both: "全部",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[type] || colors.both}`}>
        {labels[type] || type}
      </span>
    );
  };

  // 状态标签
  const StatusBadge = ({ status }: { status: string }) => {
    if (status === "online") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-400/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          在线
        </span>
      );
    }
    if (status === "disabled") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-500/15 text-gray-400 border border-gray-400/20">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
          已停用
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400 border border-red-400/20">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        离线
      </span>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 页头 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              节点管理
            </h1>
            <p className="text-white/50 text-sm mt-1">管理分布式代理节点，支持一键安装和自动配置下发</p>
          </div>
          <div className="flex gap-2">
            {selectedNodes.length > 0 && (
              <Button
                onClick={handleBatchSync}
                variant="outline"
                size="sm"
                className="border-white/20 hover:bg-cyan-500/20 text-white/80"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" />
                批量同步 ({selectedNodes.length})
              </Button>
            )}
            <Button
              onClick={() => {
                setInstallScript(null);
                setInstallNodeName("");
                setInstallNodeType("both");
                setInstallDialogOpen(true);
              }}
              variant="outline"
              size="sm"
              className="border-cyan-400/30 text-cyan-400 hover:bg-cyan-500/20"
            >
              <Terminal className="w-4 h-4 mr-1.5" />
              一键安装
            </Button>
            <Button
              onClick={() => {
                setFormData({ name: "", host: "", port: 10001, type: "both", api_token: "" });
                setAddDialogOpen(true);
              }}
              size="sm"
              className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              添加节点
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "总节点数", value: totalNodes, icon: Server, color: "cyan" },
            { label: "在线节点", value: onlineNodes, icon: Wifi, color: "emerald" },
            { label: "总上传", value: formatBytes(totalUp), icon: ArrowUp, color: "blue" },
            { label: "总下载", value: formatBytes(totalDown), icon: ArrowDown, color: "purple" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white/[0.03] backdrop-blur border border-white/10 rounded-xl p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/50 text-xs">{stat.label}</p>
                  <p className="text-xl font-bold text-white mt-1">{stat.value}</p>
                </div>
                <div className={`w-9 h-9 rounded-lg bg-${stat.color}-500/15 flex items-center justify-center`}>
                  <stat.icon className={`w-4.5 h-4.5 text-${stat.color}-400`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 节点表格 */}
        <div className="bg-white/[0.03] backdrop-blur border border-white/10 rounded-xl overflow-hidden">
          {/* 表头 */}
          <div className="grid grid-cols-[auto_2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-4 py-3 border-b border-white/10 text-xs text-white/40 font-medium">
            <div className="w-8 flex items-center">
              <input
                type="checkbox"
                className="rounded border-white/20 bg-white/5"
                checked={selectedNodes.length === nodes.length && nodes.length > 0}
                onChange={(e) => {
                  if (e.target.checked) setSelectedNodes(nodes.map((n) => n.id));
                  else setSelectedNodes([]);
                }}
              />
            </div>
            <div>节点名称</div>
            <div>地址</div>
            <div>类型</div>
            <div>状态</div>
            <div>资源</div>
            <div>心跳</div>
            <div className="text-right">操作</div>
          </div>

          {/* 表内容 */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-white/40">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
              加载中...
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-white/40">
              <Server className="w-10 h-10 mb-3 opacity-30" />
              <p>暂无节点</p>
              <p className="text-xs mt-1">点击"一键安装"或"添加节点"开始</p>
            </div>
          ) : (
            nodes.map((node) => (
              <div key={node.id}>
                {/* 主行 */}
                <div
                  className={`grid grid-cols-[auto_2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-4 py-3 border-b border-white/5 hover:bg-white/[0.02] transition-colors items-center text-sm ${
                    selectedNodes.includes(node.id) ? "bg-cyan-500/5" : ""
                  }`}
                >
                  <div className="w-8">
                    <input
                      type="checkbox"
                      className="rounded border-white/20 bg-white/5"
                      checked={selectedNodes.includes(node.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedNodes([...selectedNodes, node.id]);
                        else setSelectedNodes(selectedNodes.filter((id) => id !== node.id));
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      onClick={() => toggleExpand(node.id)}
                      className="text-white/30 hover:text-white/60 transition-colors shrink-0"
                    >
                      {expandedRows.has(node.id) ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    <span className="text-white font-medium truncate">{node.name}</span>
                  </div>
                  <div className="text-white/60 text-xs font-mono truncate">
                    {node.host}:{node.port}
                  </div>
                  <div>
                    <TypeBadge type={node.type} />
                  </div>
                  <div>
                    <StatusBadge status={node.status} />
                  </div>
                  <div className="text-xs text-white/50">
                    <div className="flex items-center gap-1">
                      <Cpu className="w-3 h-3" />
                      {(node.cpu_usage || 0).toFixed(1)}%
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <HardDrive className="w-3 h-3" />
                      {(node.memory_usage || 0).toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-xs text-white/40 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(node.last_heartbeat)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-white/40 hover:text-cyan-400 hover:bg-cyan-500/10"
                      onClick={() => handleSync(node)}
                      title="同步配置"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-white/40 hover:text-blue-400 hover:bg-blue-500/10"
                      onClick={() => {
                        setEditingNode({ ...node });
                        setEditDialogOpen(true);
                      }}
                      title="编辑"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-7 w-7 p-0 ${
                        node.status === "online"
                          ? "text-white/40 hover:text-amber-400 hover:bg-amber-500/10"
                          : "text-white/40 hover:text-emerald-400 hover:bg-emerald-500/10"
                      }`}
                      onClick={() => handleToggle(node)}
                      title={node.status === "online" ? "停用" : "启用"}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-white/40 hover:text-red-400 hover:bg-red-500/10"
                      onClick={() => {
                        setDeletingNode(node);
                        setDeleteDialogOpen(true);
                      }}
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* 展开详情 */}
                {expandedRows.has(node.id) && (
                  <div className="px-4 py-3 border-b border-white/5 bg-white/[0.01]">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-white/40">上传流量</span>
                        <p className="text-white font-medium mt-0.5 flex items-center gap-1">
                          <ArrowUp className="w-3 h-3 text-cyan-400" />
                          {formatBytes(node.traffic_up)}
                        </p>
                      </div>
                      <div>
                        <span className="text-white/40">下载流量</span>
                        <p className="text-white font-medium mt-0.5 flex items-center gap-1">
                          <ArrowDown className="w-3 h-3 text-purple-400" />
                          {formatBytes(node.traffic_down)}
                        </p>
                      </div>
                      <div>
                        <span className="text-white/40">API Token</span>
                        <p className="text-white/60 font-mono mt-0.5 truncate" title={node.api_token}>
                          {node.api_token ? node.api_token.slice(0, 12) + "..." : "未设置"}
                        </p>
                      </div>
                      <div>
                        <span className="text-white/40">创建时间</span>
                        <p className="text-white/60 mt-0.5">
                          {node.created_at ? new Date(node.created_at).toLocaleDateString() : "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ===== 添加节点对话框 ===== */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="bg-[#1a1a2e] border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-cyan-400" />
              添加节点
            </DialogTitle>
            <DialogDescription className="text-white/50">
              手动添加节点信息。推荐使用"一键安装"自动注册。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-white/80">节点名称 <span className="text-red-400">*</span></Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="如：HK-01 香港节点"
                className="bg-white/5 border-white/15 text-white placeholder:text-white/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-white/80">节点地址 <span className="text-red-400">*</span></Label>
                <Input
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                  placeholder="IP 或域名"
                  className="bg-white/5 border-white/15 text-white placeholder:text-white/30"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white/80">端口</Label>
                <Input
                  type="number"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 10001 })}
                  className="bg-white/5 border-white/15 text-white"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">节点类型</Label>
              <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                <SelectTrigger className="bg-white/5 border-white/15 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">全部 (Xray + Gost)</SelectItem>
                  <SelectItem value="xray">仅 Xray</SelectItem>
                  <SelectItem value="gost">仅 Gost</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-white/80">API Token</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.api_token}
                  onChange={(e) => setFormData({ ...formData, api_token: e.target.value })}
                  placeholder="留空将自动生成"
                  className="bg-white/5 border-white/15 text-white placeholder:text-white/30 font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateToken}
                  className="border-white/15 text-white/60 hover:text-cyan-400 hover:bg-cyan-500/10 shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-xs text-white/30">用于节点与面板通信的认证令牌</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} className="border-white/15 text-white/60">
              取消
            </Button>
            <Button onClick={handleAddNode} className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white">
              添加节点
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 编辑节点对话框 ===== */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-[#1a1a2e] border-white/10 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Edit className="w-5 h-5 text-blue-400" />
              编辑节点
            </DialogTitle>
          </DialogHeader>
          {editingNode && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-white/80">节点名称</Label>
                <Input
                  value={editingNode.name}
                  onChange={(e) => setEditingNode({ ...editingNode, name: e.target.value })}
                  className="bg-white/5 border-white/15 text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-white/80">节点地址</Label>
                  <Input
                    value={editingNode.host}
                    onChange={(e) => setEditingNode({ ...editingNode, host: e.target.value })}
                    className="bg-white/5 border-white/15 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-white/80">端口</Label>
                  <Input
                    type="number"
                    value={editingNode.port}
                    onChange={(e) => setEditingNode({ ...editingNode, port: parseInt(e.target.value) || 10001 })}
                    className="bg-white/5 border-white/15 text-white"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-white/80">节点类型</Label>
                <Select value={editingNode.type} onValueChange={(v) => setEditingNode({ ...editingNode, type: v })}>
                  <SelectTrigger className="bg-white/5 border-white/15 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">全部 (Xray + Gost)</SelectItem>
                    <SelectItem value="xray">仅 Xray</SelectItem>
                    <SelectItem value="gost">仅 Gost</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="border-white/15 text-white/60">
              取消
            </Button>
            <Button onClick={handleEditNode} className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white">
              保存修改
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 删除确认对话框 ===== */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-[#1a1a2e] border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white">确认删除</DialogTitle>
            <DialogDescription className="text-white/50">
              确定要删除节点 <span className="text-red-400 font-medium">{deletingNode?.name}</span> 吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} className="border-white/15 text-white/60">
              取消
            </Button>
            <Button onClick={handleDeleteNode} className="bg-red-500/80 hover:bg-red-500 text-white">
              确认删除
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 一键安装脚本对话框 ===== */}
      <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
        <DialogContent className="bg-[#1a1a2e] border-white/10 max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Terminal className="w-5 h-5 text-cyan-400" />
              一键安装节点
            </DialogTitle>
            <DialogDescription className="text-white/50">
              生成安装命令，在 VPS 上运行即可自动安装并注册到面板
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* 步骤1: 选择配置 */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">1</span>
                <span className="text-white font-medium text-sm">选择节点配置</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pl-8">
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs">节点名称（可选）</Label>
                  <Input
                    value={installNodeName}
                    onChange={(e) => setInstallNodeName(e.target.value)}
                    placeholder="留空使用主机名"
                    className="bg-white/5 border-white/15 text-white placeholder:text-white/25 h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-white/60 text-xs">节点类型</Label>
                  <Select value={installNodeType} onValueChange={setInstallNodeType}>
                    <SelectTrigger className="bg-white/5 border-white/15 text-white h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">全部 (Xray + Gost)</SelectItem>
                      <SelectItem value="xray">仅 Xray</SelectItem>
                      <SelectItem value="gost">仅 Gost (隧道转发)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pl-8">
                <Button
                  onClick={handleGenerateScript}
                  disabled={installLoading}
                  className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white h-9 text-sm"
                >
                  {installLoading ? (
                    <RefreshCw className="w-4 h-4 mr-1.5 animate-spin" />
                  ) : (
                    <Terminal className="w-4 h-4 mr-1.5" />
                  )}
                  生成安装命令
                </Button>
              </div>
            </div>

            {/* 步骤2: 安装命令 */}
            {installScript && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">2</span>
                    <span className="text-white font-medium text-sm">复制安装命令</span>
                  </div>

                  <div className="pl-8 space-y-3">
                    {/* 一行命令 */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-white/60 text-xs">一行安装命令（推荐）</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-cyan-400 hover:bg-cyan-500/10"
                          onClick={() => copyToClipboard(installScript.one_liner)}
                        >
                          {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                          {copied ? "已复制" : "复制"}
                        </Button>
                      </div>
                      <div
                        className="bg-black/40 border border-cyan-400/20 rounded-lg p-3 cursor-pointer hover:border-cyan-400/40 transition-colors group"
                        onClick={() => copyToClipboard(installScript.one_liner)}
                      >
                        <code className="text-cyan-300 text-xs font-mono break-all leading-relaxed">
                          {installScript.one_liner}
                        </code>
                      </div>
                    </div>

                    {/* Token 信息 */}
                    <div className="bg-white/[0.03] border border-white/10 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">API Token</span>
                        <button
                          className="text-white/60 font-mono hover:text-cyan-400 transition-colors flex items-center gap-1"
                          onClick={() => copyToClipboard(installScript.api_token)}
                        >
                          {installScript.api_token}
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">面板地址</span>
                        <span className="text-white/60 font-mono">{installScript.panel_url}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-white/40">节点类型</span>
                        <TypeBadge type={installScript.node_type} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 步骤3: 在 VPS 上运行 */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center">3</span>
                    <span className="text-white font-medium text-sm">在 VPS 上运行</span>
                  </div>

                  <div className="pl-8">
                    <div className="bg-emerald-500/5 border border-emerald-400/20 rounded-lg p-3 space-y-2 text-xs text-white/60">
                      <p className="flex items-center gap-1.5">
                        <span className="text-emerald-400">1.</span>
                        以 <code className="bg-black/30 px-1.5 py-0.5 rounded text-white/80">root</code> 用户 SSH 登录到你的 VPS
                      </p>
                      <p className="flex items-center gap-1.5">
                        <span className="text-emerald-400">2.</span>
                        粘贴上面的安装命令并回车执行
                      </p>
                      <p className="flex items-center gap-1.5">
                        <span className="text-emerald-400">3.</span>
                        等待安装完成，节点将自动注册到面板
                      </p>
                      <p className="flex items-center gap-1.5">
                        <span className="text-emerald-400">4.</span>
                        安装后节点每 30 秒自动同步配置，无需手动操作
                      </p>
                    </div>
                  </div>
                </div>

                {/* 支持信息 */}
                <div className="pl-8">
                  <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 text-xs text-white/40 space-y-1">
                    <p>支持系统: Ubuntu, Debian, CentOS, RHEL</p>
                    <p>支持架构: x86_64 (amd64), aarch64 (arm64)</p>
                    <p>安装目录: /opt/uniproxy-node/</p>
                    <p>Agent 服务: systemctl status uniproxy-agent</p>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            {installScript && (
              <Button
                variant="outline"
                onClick={() => {
                  const blob = new Blob([installScript.script], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "install-node.sh";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="border-white/15 text-white/60 hover:text-white"
              >
                <Download className="w-4 h-4 mr-1.5" />
                下载脚本
              </Button>
            )}
            <Button
              onClick={() => setInstallDialogOpen(false)}
              className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white"
            >
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
