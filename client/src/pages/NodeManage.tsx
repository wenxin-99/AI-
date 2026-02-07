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
import {
  Activity,
  Code,
  Copy,
  Cpu,
  Download,
  HardDrive,
  Plus,
  RefreshCw,
  Server,
  Settings,
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
              onClick={() => setInstallScriptOpen(true)}
              variant="outline"
              className="border-white/20 hover:bg-cyan-500/20 hover:border-cyan-400/50"
            >
              <Code className="w-4 h-4 mr-2" />
              安装脚本
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
            {nodes.map((node) => (
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

      {/* 安装脚本对话框 */}
      <Dialog open={installScriptOpen} onOpenChange={setInstallScriptOpen}>
        <DialogContent className="glass-card border-white/20 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="gradient-text flex items-center gap-2">
              <Code className="w-5 h-5" />
              节点安装脚本
            </DialogTitle>
            <DialogDescription className="text-white/60">
              在远程服务器上运行以下命令自动安装节点
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-white/90">安装命令</Label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const script = `PANEL_URL=${window.location.origin} API_TOKEN=your-token bash <(curl -fsSL ${window.location.origin}/node-install.sh)`;
                    try {
                      // 尝试使用Clipboard API
                      await navigator.clipboard.writeText(script);
                      toast.success('已复制到剪贴板');
                    } catch (err) {
                      // Fallback: 使用传统方法
                      const textarea = document.createElement('textarea');
                      textarea.value = script;
                      textarea.style.position = 'fixed';
                      textarea.style.opacity = '0';
                      document.body.appendChild(textarea);
                      textarea.select();
                      try {
                        document.execCommand('copy');
                        toast.success('已复制到剪贴板');
                      } catch (e) {
                        toast.error('复制失败,请手动复制');
                      }
                      document.body.removeChild(textarea);
                    }
                  }}
                  className="border-white/20 hover:bg-cyan-500/20"
                >
                  <Copy className="w-4 h-4 mr-1" />
                  复制
                </Button>
              </div>
              <div className="bg-black/40 border border-white/10 rounded-lg p-4 font-mono text-sm text-cyan-400 overflow-x-auto">
                <pre className="whitespace-pre-wrap break-all">
PANEL_URL={window.location.origin} API_TOKEN=your-token bash &lt;(curl -fsSL {window.location.origin}/node-install.sh)
                </pre>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-white/90">使用说明</Label>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2 text-sm text-white/70">
                <p>1. 将 <code className="bg-black/40 px-2 py-0.5 rounded text-cyan-400">your-token</code> 替换为实际的API Token</p>
                <p>2. 在远程服务器上以root用户运行该命令</p>
                <p>3. 脚本会自动安装Xray/Gost并注册到面板</p>
                <p>4. 支持的系统: Ubuntu, Debian, CentOS, RHEL</p>
                <p>5. 支持的架构: x86_64, aarch64</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-white/90">环境变量</Label>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2 text-sm font-mono text-white/70">
                <div className="flex justify-between">
                  <span className="text-cyan-400">PANEL_URL</span>
                  <span>面板地址 (必需)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cyan-400">API_TOKEN</span>
                  <span>API认证令牌 (必需)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cyan-400">NODE_NAME</span>
                  <span>节点名称 (可选,默认为主机名)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cyan-400">NODE_TYPE</span>
                  <span>节点类型 (可选: xray, gost, both,默认both)</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  window.open(`${window.location.origin}/node-install.sh`, '_blank');
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
              <p className="font-medium mb-1">⚠️ 注意事项</p>
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
