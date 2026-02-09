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
import TrafficSummary from "@/components/TrafficSummary";
import { copyToClipboard } from "@/lib/shareLink";
import {
  Activity,
  Clock,
  Code,
  Copy,
  Cpu,
  Download,
  HardDrive,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Terminal,
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
  const [installScriptOpen, setInstallScriptOpen] = useState(false);
  const [installScript, setInstallScript] = useState("");
  const [installOneLiner, setInstallOneLiner] = useState("");
  const [loadingScript, setLoadingScript] = useState(false);
  const [installNodeId, setInstallNodeId] = useState<number | null>(null);
  const [installNodeName, setInstallNodeName] = useState("");
  const [batchConfigOpen, setBatchConfigOpen] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<number[]>([]);
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
    // 每30秒自动刷新节点状态
    const interval = setInterval(loadNodes, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadInstallScript = async (nodeId?: number) => {
    try {
      setLoadingScript(true);
      setInstallScript("");
      setInstallOneLiner("");
      const params: { node_id?: number; node_type?: string } = {};
      if (nodeId) {
        params.node_id = nodeId;
      } else {
        params.node_type = "both";
      }
      const response: any = await nodeService.generateInstallScript(params);
      let script = response?.data?.script || response?.script || "";
      let oneLiner = response?.data?.one_liner || response?.one_liner || "";
      // 后端不检测 X-Forwarded-Proto，可能生成 http:// 的 PANEL_URL
      // 如果当前页面是 HTTPS，则替换脚本中的 URL 为 HTTPS
      if (window.location.protocol === 'https:') {
        script = script.replace(/PANEL_URL="http:\/\//g, 'PANEL_URL="https://');
        oneLiner = oneLiner.replace(/http:\/\//g, 'https://');
      }
      setInstallScript(script);
      setInstallOneLiner(oneLiner);
    } catch (error) {
      console.error("加载安装脚本失败:", error);
      toast.error("加载安装脚本失败");
    } finally {
      setLoadingScript(false);
    }
  };

  const openInstallScript = (node?: Node) => {
    if (node) {
      setInstallNodeId(node.id);
      setInstallNodeName(node.name);
    } else {
      setInstallNodeId(null);
      setInstallNodeName("");
    }
    setInstallScript("");
    setInstallOneLiner("");
    setInstallScriptOpen(true);
  };

  useEffect(() => {
    if (installScriptOpen) {
      loadInstallScript(installNodeId || undefined);
    }
  }, [installScriptOpen, installNodeId]);

  const loadNodes = async () => {
    try {
      setLoading(true);
      const response: any = await nodeService.list();
      const nodeList = response?.data?.nodes || response?.nodes || [];
      setNodes(Array.isArray(nodeList) ? nodeList : []);
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
      console.log('提交表单数据:', formData);
      if (editingNode) {
        const response = await nodeService.update(editingNode.id, formData);
        console.log('更新响应:', response);
        toast.success("节点更新成功");
      } else {
        const response = await nodeService.create(formData);
        console.log('创建响应:', response);
        toast.success("节点创建成功");
      }
      setDialogOpen(false);
      loadNodes();
    } catch (error: any) {
      console.error("保存节点失败:", error);
      console.error("错误详情:", error.response?.data || error.message);
      toast.error(error.response?.data?.message || "保存节点失败");
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

  const formatHeartbeat = (heartbeat: string | null) => {
    if (!heartbeat) return "从未连接";
    try {
      const date = new Date(heartbeat);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return `${diffSec}秒前`;
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}分钟前`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour}小时前`;
      const diffDay = Math.floor(diffHour / 24);
      return `${diffDay}天前`;
    } catch {
      return "未知";
    }
  };

  const isNodeAlive = (heartbeat: string | null) => {
    if (!heartbeat) return false;
    try {
      const date = new Date(heartbeat);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      return diffMs < 90000; // 90秒内有心跳视为在线
    } catch {
      return false;
    }
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
          <div className="flex gap-2">
            <Button
              onClick={() => openInstallScript()}
              variant="outline"
              className="border-white/20 hover:bg-cyan-500/20 hover:border-cyan-400/50"
            >
              <Code className="w-4 h-4 mr-2" />
              通用安装脚本
            </Button>
            <Button
              onClick={() => setBatchConfigOpen(true)}
              variant="outline"
              className="border-white/20 hover:bg-purple-500/20 hover:border-purple-400/50"
              disabled={selectedNodes.length === 0}
            >
              <Settings className="w-4 h-4 mr-2" />
              批量配置 ({selectedNodes.length})
            </Button>
            <Button
              onClick={handleCreate}
              className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600"
            >
              <Plus className="w-4 h-4 mr-2" />
              添加节点
            </Button>
          </div>
        </div>

        {/* 流量统计汇总 */}
        {!loading && nodes.length > 0 && <TrafficSummary nodes={nodes} />}

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
            {nodes.map((node) => {
              const alive = isNodeAlive(node.last_heartbeat);
              return (
              <Card
                key={node.id}
                className={`glass-card border-white/20 p-6 hover:border-cyan-400/30 transition-all duration-300 ${
                  selectedNodes.includes(node.id) ? 'ring-2 ring-cyan-400' : ''
                }`}
                onClick={() => {
                  if (selectedNodes.includes(node.id)) {
                    setSelectedNodes(selectedNodes.filter(id => id !== node.id));
                  } else {
                    setSelectedNodes([...selectedNodes, node.id]);
                  }
                }}
              >
                {/* 节点头部 */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-white">
                        {node.name}
                      </h3>
                      <div
                        className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${
                          alive ? 'text-green-400 bg-green-500/20' : 'text-gray-400 bg-gray-500/20'
                        }`}
                      >
                        {alive ? (
                          <>
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                            </span>
                            在线
                          </>
                        ) : (
                          <>
                            <WifiOff className="w-3 h-3" />
                            离线
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className={`inline-block px-3 py-1 rounded-full bg-gradient-to-r ${getTypeColor(
                          node.type
                        )} text-white text-xs font-medium`}
                      >
                        {node.type.toUpperCase()}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-white/40">
                        <Clock className="w-3 h-3" />
                        <span>{formatHeartbeat(node.last_heartbeat)}</span>
                      </div>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); handleEdit(node); }}
                    className="flex-1 border-white/20 hover:bg-cyan-500/20 hover:border-cyan-400/50"
                  >
                    编辑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); openInstallScript(node); }}
                    className="flex-1 border-white/20 hover:bg-green-500/20 hover:border-green-400/50"
                    title="生成此节点的安装脚本"
                  >
                    <Terminal className="w-4 h-4 mr-1" />
                    安装
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); handleSync(node.id); }}
                    className="border-white/20 hover:bg-purple-500/20 hover:border-purple-400/50"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => { e.stopPropagation(); handleDelete(node.id); }}
                    className="border-white/20 hover:bg-red-500/20 hover:border-red-400/50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </Card>
              );
            })}
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
                placeholder="节点API认证令牌（留空自动生成）"
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

      {/* 安装脚本对话框 */}
      <Dialog open={installScriptOpen} onOpenChange={setInstallScriptOpen}>
        <DialogContent className="glass-card border-white/20 max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="gradient-text flex items-center gap-2">
              <Code className="w-5 h-5" />
              {installNodeName ? `节点安装脚本 - ${installNodeName}` : '通用安装脚本'}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              {installNodeName
                ? `为节点「${installNodeName}」生成的专属安装脚本，Token 已自动匹配`
                : '在远程服务器上运行以下命令自动安装节点（将生成新 Token）'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
            {/* 提示信息 */}
            {installNodeId && (
              <div className="bg-green-500/10 border border-green-400/30 rounded-lg p-3 text-sm text-green-200">
                <p>此脚本使用节点「{installNodeName}」的 API Token，安装后 Agent 将自动与面板建立心跳连接。</p>
              </div>
            )}
            {!installNodeId && (
              <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-lg p-3 text-sm text-yellow-200">
                <p>建议先在面板中创建节点，然后点击节点卡片上的"安装"按钮生成专属脚本，以确保 Token 匹配。</p>
              </div>
            )}

            {/* 一键安装命令 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-white/90">一键安装命令（推荐）</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loadingScript || !installOneLiner}
                  onClick={async () => {
                    if (!installOneLiner) {
                      toast.error('安装命令未加载');
                      return;
                    }
                    const success = await copyToClipboard(installOneLiner);
                    if (success) {
                      toast.success('一键安装命令已复制');
                    } else {
                      toast.error('复制失败');
                    }
                  }}
                >
                  <Copy className="w-3 h-3 mr-1" />
                  复制
                </Button>
              </div>
              <div 
                className="bg-black/40 border border-cyan-500/30 rounded-lg p-4 font-mono text-sm text-cyan-400 overflow-x-auto cursor-pointer hover:border-cyan-500/50 transition-colors relative group"
                onClick={async () => {
                  if (!installOneLiner) {
                    toast.error('安装命令未加载');
                    return;
                  }
                  const success = await copyToClipboard(installOneLiner);
                  if (success) {
                    toast.success('一键安装命令已复制');
                  } else {
                    toast.error('复制失败');
                  }
                }}
                title="点击复制"
              >
                {loadingScript ? (
                  <div className="flex items-center justify-center py-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-400 mr-2" />
                    <span>加载中...</span>
                  </div>
                ) : (
                  <code className="break-all">{installOneLiner || "加载失败"}</code>
                )}
              </div>
              <p className="text-xs text-white/50">复制上方命令，在服务器上以 root 用户运行即可自动安装</p>
            </div>

            {/* 完整脚本（可展开） */}
            <details className="group">
              <summary className="cursor-pointer text-white/70 hover:text-white/90 text-sm flex items-center gap-2 py-2">
                <Code className="w-4 h-4" />
                查看完整脚本内容
              </summary>
              <div className="mt-2 bg-black/40 border border-white/10 rounded-lg p-4 font-mono text-xs text-green-400 overflow-x-auto max-h-[40vh] overflow-y-auto">
                <pre className="whitespace-pre-wrap break-all">{installScript || "加载失败"}</pre>
              </div>
            </details>

            <div className="space-y-2">
              <Label className="text-white/90">使用说明</Label>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2 text-sm text-white/70">
                <p>1. 复制上方"一键安装命令"，粘贴到服务器终端运行</p>
                <p>2. 脚本会自动安装 Xray/Gost 并注册到面板</p>
                <p>3. <strong className="text-cyan-400">国内VPS自动使用镜像加速</strong>，无需手动配置</p>
                <p>4. 支持的系统: Ubuntu, Debian, CentOS, RHEL | 架构: x86_64, aarch64</p>
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0 pt-4 border-t border-white/10">
            <Button
              onClick={async () => {
                if (!installOneLiner) {
                  toast.error('安装命令未加载');
                  return;
                }
                const success = await copyToClipboard(installOneLiner);
                if (success) {
                  toast.success('一键安装命令已复制');
                } else {
                  toast.error('复制失败');
                }
              }}
              disabled={loadingScript || !installOneLiner}
              variant="outline"
              className="flex-1 border-cyan-400/30 hover:bg-cyan-500/20 text-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Copy className="w-4 h-4 mr-2" />
              复制安装命令
            </Button>
            <Button
              onClick={async () => {
                if (!installScript) {
                  toast.error('脚本未加载');
                  return;
                }
                const blob = new Blob([installScript], { type: 'text/x-sh' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = installNodeName ? `install-${installNodeName}.sh` : 'node-install.sh';
                a.click();
                URL.revokeObjectURL(url);
                toast.success('脚本已下载');
              }}
              variant="outline"
              className="flex-1 border-white/20 hover:bg-purple-500/20"
            >
              <Download className="w-4 h-4 mr-2" />
              下载脚本
            </Button>
            <Button
              onClick={() => setInstallScriptOpen(false)}
              className="flex-1 bg-gradient-to-r from-cyan-500 to-purple-500"
            >
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 批量配置对话框 */}
      <Dialog open={batchConfigOpen} onOpenChange={setBatchConfigOpen}>
        <DialogContent className="glass-card border-white/20 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="gradient-text flex items-center gap-2">
              <Settings className="w-5 h-5" />
              批量配置节点
            </DialogTitle>
            <DialogDescription className="text-white/60">
              为选中的 {selectedNodes.length} 个节点统一下发配置
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <h4 className="text-white font-medium mb-2">选中的节点:</h4>
              <div className="flex flex-wrap gap-2">
                {selectedNodes.map(id => {
                  const node = nodes.find(n => n.id === id);
                  return node ? (
                    <div key={id} className="bg-cyan-500/20 border border-cyan-400/30 rounded px-3 py-1 text-sm text-white">
                      {node.name}
                    </div>
                  ) : null;
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-white/90">配置操作</Label>
              <Select defaultValue="sync_xray">
                <SelectTrigger className="bg-white/5 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sync_xray">同步Xray配置</SelectItem>
                  <SelectItem value="sync_gost">同步Gost配置</SelectItem>
                  <SelectItem value="sync_all">同步所有配置</SelectItem>
                  <SelectItem value="restart_xray">重启Xray服务</SelectItem>
                  <SelectItem value="restart_gost">重启Gost服务</SelectItem>
                  <SelectItem value="restart_all">重启所有服务</SelectItem>
                  <SelectItem value="update_agent">更新Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-lg p-4 text-sm text-yellow-200">
              <p className="font-medium mb-1">注意事项</p>
              <ul className="list-disc list-inside space-y-1 text-yellow-200/80">
                <li>批量操作将同时应用到所有选中的节点</li>
                <li>重启服务可能导致短暂的连接中断</li>
                <li>请确保在低峰时段执行批量操作</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setBatchConfigOpen(false)}
              className="border-white/20"
            >
              取消
            </Button>
            <Button
              onClick={async () => {
                try {
                  // TODO: 实现批量配置API调用
                  toast.success('批量配置已下发');
                  setBatchConfigOpen(false);
                  setSelectedNodes([]);
                } catch (error) {
                  toast.error('批量配置失败');
                }
              }}
              className="bg-gradient-to-r from-cyan-500 to-purple-500"
            >
              执行配置
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
