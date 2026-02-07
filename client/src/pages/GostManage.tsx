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
import { Plus, Play, Pause, Edit, Trash2, GitBranch, RefreshCw, Shield } from "lucide-react";
import { toast } from "sonner";
import { gostService, GostTunnel } from "@/services/gost";
import { Switch } from "@/components/ui/switch";
import api from "@/lib/api";

interface Certificate {
  id: number;
  name: string;
  domain: string;
  status: string;
}

export default function GostManage() {
  const [tunnels, setTunnels] = useState<GostTunnel[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedTunnel, setSelectedTunnel] = useState<GostTunnel | null>(null);

  // 表单状态
  const [formData, setFormData] = useState({
    name: "",
    protocol: "tcp",
    local_port: "",
    remote_addr: "",
    username: "",
    password: "",
    speed_limit_upload: "",
    speed_limit_download: "",
    enable_tls: false,
    certificate_id: "",
    tls_server_name: "",
    skip_verify: false,
  });

  useEffect(() => {
    fetchTunnels();
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    try {
      const response = await api.get('/certificates');
      const certs = response?.data?.certificates || response?.data || [];
      setCertificates(Array.isArray(certs) ? certs : []);
    } catch (error) {
      console.error("Failed to fetch certificates:", error);
    }
  };

  const fetchTunnels = async () => {
    try {
      setLoading(true);
      const data = await gostService.getTunnels();
      setTunnels(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch tunnels:", error);
      toast.error("获取隧道列表失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.local_port || !formData.remote_addr) {
      toast.error("请填写完整信息");
      return;
    }

    try {
      await gostService.createTunnel({
        name: formData.name,
        protocol: formData.protocol,
        local_port: parseInt(formData.local_port),
        remote_addr: formData.remote_addr,
        username: formData.username || undefined,
        password: formData.password || undefined,
        speed_limit_upload: formData.speed_limit_upload ? parseInt(formData.speed_limit_upload) : undefined,
        speed_limit_download: formData.speed_limit_download ? parseInt(formData.speed_limit_download) : undefined,
        enable_tls: formData.enable_tls,
        certificate_id: formData.certificate_id ? parseInt(formData.certificate_id) : undefined,
        tls_server_name: formData.tls_server_name || undefined,
        skip_verify: formData.skip_verify,
      });
      toast.success("隧道创建成功");
      setCreateDialogOpen(false);
      resetForm();
      fetchTunnels();
    } catch (error) {
      console.error("Failed to create tunnel:", error);
    }
  };

  const handleEdit = async () => {
    if (!selectedTunnel) return;

    try {
      await gostService.updateTunnel(selectedTunnel.id, {
        name: formData.name,
        protocol: formData.protocol,
        local_port: parseInt(formData.local_port),
        remote_addr: formData.remote_addr,
        username: formData.username || undefined,
        password: formData.password || undefined,
        speed_limit_upload: formData.speed_limit_upload ? parseInt(formData.speed_limit_upload) : undefined,
        speed_limit_download: formData.speed_limit_download ? parseInt(formData.speed_limit_download) : undefined,
        enable_tls: formData.enable_tls,
        certificate_id: formData.certificate_id ? parseInt(formData.certificate_id) : undefined,
        tls_server_name: formData.tls_server_name || undefined,
        skip_verify: formData.skip_verify,
      });
      toast.success("隧道更新成功");
      setEditDialogOpen(false);
      setSelectedTunnel(null);
      fetchTunnels();
    } catch (error) {
      console.error("Failed to update tunnel:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此隧道吗?")) return;

    try {
      await gostService.deleteTunnel(id);
      toast.success("隧道删除成功");
      fetchTunnels();
    } catch (error) {
      console.error("Failed to delete tunnel:", error);
    }
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await gostService.toggleTunnel(id, !enabled);
      toast.success(enabled ? "隧道已禁用" : "隧道已启用");
      fetchTunnels();
    } catch (error) {
      console.error("Failed to toggle tunnel:", error);
    }
  };

  const handleRestart = async () => {
    try {
      await gostService.restart();
      toast.success("Gost 服务重启成功");
    } catch (error) {
      console.error("Failed to restart Gost:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      protocol: "tcp",
      local_port: "",
      remote_addr: "",
      username: "",
      password: "",
      speed_limit_upload: "",
      speed_limit_download: "",
      enable_tls: false,
      certificate_id: "",
      tls_server_name: "",
      skip_verify: false,
    });
  };

  const openEditDialog = (tunnel: GostTunnel) => {
    setSelectedTunnel(tunnel);
    setFormData({
      name: tunnel.name,
      protocol: tunnel.protocol,
      local_port: tunnel.local_port.toString(),
      remote_addr: tunnel.remote_addr,
      username: tunnel.username || "",
      password: tunnel.password || "",
      speed_limit_upload: tunnel.speed_limit_upload?.toString() || "",
      speed_limit_download: tunnel.speed_limit_download?.toString() || "",
      enable_tls: (tunnel as any).enable_tls || false,
      certificate_id: (tunnel as any).certificate_id?.toString() || "",
      tls_server_name: (tunnel as any).tls_server_name || "",
      skip_verify: (tunnel as any).skip_verify || false,
    });
    setEditDialogOpen(true);
  };

  const enabledCount = tunnels.filter(t => t.enabled).length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
              Gost 管理
            </h1>
            <p className="text-muted-foreground mt-2">
              管理 Gost 隧道和转发规则
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
              创建隧道
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">总隧道数</p>
                <p className="text-3xl font-bold">{tunnels.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                <GitBranch className="w-6 h-6 text-white" />
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
                <p className="text-sm text-muted-foreground mb-1">已停止</p>
                <p className="text-3xl font-bold">{tunnels.length - enabledCount}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center">
                <Pause className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>
        </div>

        {/* Tunnels Table */}
        <Card className="bg-card/40 backdrop-blur-xl border-white/10">
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-4">隧道列表</h2>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">加载中...</div>
            ) : tunnels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无隧道配置,点击"创建隧道"开始
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-white/5">
                    <TableHead className="text-white/80">名称</TableHead>
                    <TableHead className="text-white/80">协议</TableHead>
                    <TableHead className="text-white/80">本地端口</TableHead>
                    <TableHead className="text-white/80">远程地址</TableHead>
                    <TableHead className="text-white/80">限速</TableHead>
                    <TableHead className="text-white/80">状态</TableHead>
                    <TableHead className="text-white/80 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tunnels.map((tunnel) => (
                    <TableRow
                      key={tunnel.id}
                      className="border-white/10 hover:bg-white/5"
                    >
                      <TableCell className="font-medium">{tunnel.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="border-purple-500/50 bg-purple-500/10 text-purple-400"
                        >
                          {tunnel.protocol.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>{tunnel.local_port}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-sm">
                        {tunnel.remote_addr}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {tunnel.speed_limit_upload || tunnel.speed_limit_download
                          ? `↑${tunnel.speed_limit_upload || 0} ↓${tunnel.speed_limit_download || 0} MB/s`
                          : "无限制"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={tunnel.enabled ? "default" : "secondary"}
                          className={
                            tunnel.enabled
                              ? "bg-green-500/20 text-green-400 border-green-500/50"
                              : "bg-gray-500/20 text-gray-400 border-gray-500/50"
                          }
                        >
                          {tunnel.enabled ? "运行中" : "已停止"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggle(tunnel.id, tunnel.enabled)}
                          >
                            {tunnel.enabled ? (
                              <Pause className="w-4 h-4" />
                            ) : (
                              <Play className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(tunnel)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(tunnel.id)}
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
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10 max-w-2xl">
            <DialogHeader>
              <DialogTitle>创建隧道</DialogTitle>
              <DialogDescription>
                配置新的 Gost 转发隧道
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">名称</Label>
                <Input
                  id="name"
                  placeholder="例如: HTTP 转发"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="udp">UDP</SelectItem>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="https">HTTPS</SelectItem>
                    <SelectItem value="socks5">SOCKS5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="local_port">本地端口</Label>
                <Input
                  id="local_port"
                  type="number"
                  placeholder="例如: 8080"
                  value={formData.local_port}
                  onChange={(e) => setFormData({ ...formData, local_port: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="remote_addr">远程地址</Label>
                <Input
                  id="remote_addr"
                  placeholder="例如: example.com:80"
                  value={formData.remote_addr}
                  onChange={(e) => setFormData({ ...formData, remote_addr: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">用户名 (可选)</Label>
                <Input
                  id="username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码 (可选)</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="upload">上传限速 (MB/s, 可选)</Label>
                <Input
                  id="upload"
                  type="number"
                  placeholder="0 = 无限制"
                  value={formData.speed_limit_upload}
                  onChange={(e) => setFormData({ ...formData, speed_limit_upload: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="download">下载限速 (MB/s, 可选)</Label>
                <Input
                  id="download"
                  type="number"
                  placeholder="0 = 无限制"
                  value={formData.speed_limit_download}
                  onChange={(e) => setFormData({ ...formData, speed_limit_download: e.target.value })}
                />
              </div>
              
              {/* TLS配置 */}
              <div className="col-span-2 border-t border-white/10 pt-4 mt-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="space-y-0.5">
                    <Label className="text-base">TLS加密</Label>
                    <p className="text-sm text-muted-foreground">
                      为隧道启用TLS/SSL加密传输
                    </p>
                  </div>
                  <Switch
                    checked={formData.enable_tls}
                    onCheckedChange={(checked) => setFormData({ ...formData, enable_tls: checked })}
                  />
                </div>
                
                {formData.enable_tls && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>选择证书</Label>
                      <Select
                        value={formData.certificate_id}
                        onValueChange={(value) => setFormData({ ...formData, certificate_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择已上传的证书" />
                        </SelectTrigger>
                        <SelectContent>
                          {certificates.filter(c => c.status === 'active').map((cert) => (
                            <SelectItem key={cert.id} value={cert.id.toString()}>
                              {cert.name} ({cert.domain})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>TLS服务器名称 (可选)</Label>
                      <Input
                        placeholder="自动使用证书域名"
                        value={formData.tls_server_name}
                        onChange={(e) => setFormData({ ...formData, tls_server_name: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.skip_verify}
                          onCheckedChange={(checked) => setFormData({ ...formData, skip_verify: checked })}
                        />
                        <Label className="text-sm font-normal">
                          跳过证书验证 (不推荐,仅用于测试)
                        </Label>
                      </div>
                    </div>
                  </div>
                )}
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
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10 max-w-2xl">
            <DialogHeader>
              <DialogTitle>编辑隧道</DialogTitle>
              <DialogDescription>
                修改隧道配置
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label>名称</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>本地端口</Label>
                <Input
                  type="number"
                  value={formData.local_port}
                  onChange={(e) => setFormData({ ...formData, local_port: e.target.value })}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>远程地址</Label>
                <Input
                  value={formData.remote_addr}
                  onChange={(e) => setFormData({ ...formData, remote_addr: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>上传限速 (MB/s)</Label>
                <Input
                  type="number"
                  value={formData.speed_limit_upload}
                  onChange={(e) => setFormData({ ...formData, speed_limit_upload: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>下载限速 (MB/s)</Label>
                <Input
                  type="number"
                  value={formData.speed_limit_download}
                  onChange={(e) => setFormData({ ...formData, speed_limit_download: e.target.value })}
                />
              </div>
              
              {/* TLS配置 */}
              <div className="col-span-2 border-t border-white/10 pt-4 mt-2">
                <div className="flex items-center justify-between mb-4">
                  <div className="space-y-0.5">
                    <Label className="text-base">TLS加密</Label>
                    <p className="text-sm text-muted-foreground">
                      为隧道启用TLS/SSL加密传输
                    </p>
                  </div>
                  <Switch
                    checked={formData.enable_tls}
                    onCheckedChange={(checked) => setFormData({ ...formData, enable_tls: checked })}
                  />
                </div>
                
                {formData.enable_tls && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>选择证书</Label>
                      <Select
                        value={formData.certificate_id}
                        onValueChange={(value) => setFormData({ ...formData, certificate_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择已上传的证书" />
                        </SelectTrigger>
                        <SelectContent>
                          {certificates.filter(c => c.status === 'active').map((cert) => (
                            <SelectItem key={cert.id} value={cert.id.toString()}>
                              {cert.name} ({cert.domain})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>TLS服务器名称 (可选)</Label>
                      <Input
                        placeholder="自动使用证书域名"
                        value={formData.tls_server_name}
                        onChange={(e) => setFormData({ ...formData, tls_server_name: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={formData.skip_verify}
                          onCheckedChange={(checked) => setFormData({ ...formData, skip_verify: checked })}
                        />
                        <Label className="text-sm font-normal">
                          跳过证书验证 (不推荐,仅用于测试)
                        </Label>
                      </div>
                    </div>
                  </div>
                )}
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
