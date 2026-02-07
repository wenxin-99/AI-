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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Plus, Play, Pause, Edit, Trash2, Users, RefreshCw, Shield } from "lucide-react";
import { toast } from "sonner";
import { xrayService, XrayInbound } from "@/services/xray";
import api from "@/lib/api";

interface Certificate {
  id: number;
  name: string;
  domain: string;
  status: string;
}

export default function XrayManage() {
  const [inbounds, setInbounds] = useState<XrayInbound[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedInbound, setSelectedInbound] = useState<XrayInbound | null>(null);
  
  // 基础表单状态
  const [formData, setFormData] = useState({
    remark: "",
    port: "",
    protocol: "vmess",
    listen: "0.0.0.0",
  });

  // 传输层配置
  const [streamSettings, setStreamSettings] = useState({
    network: "tcp",
    security: "none",
    certificate_id: "",
    // TCP配置
    tcp_header_type: "none",
    // WebSocket配置
    ws_path: "/",
    ws_host: "",
    // HTTP/2配置
    http_path: "/",
    http_host: "",
    // gRPC配置
    grpc_service_name: "",
    // TLS配置
    tls_server_name: "",
    tls_alpn: "h2,http/1.1",
  });

  // Sniffing配置
  const [sniffingEnabled, setSniffingEnabled] = useState(true);

  useEffect(() => {
    fetchInbounds();
    fetchCertificates();
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

  const fetchCertificates = async () => {
    try {
      const response = await api.get('/certificates');
      setCertificates(response.data.certificates || []);
    } catch (error) {
      console.error("Failed to fetch certificates:", error);
    }
  };

  const handleCreate = async () => {
    if (!formData.remark || !formData.port) {
      toast.error("请填写完整信息");
      return;
    }

    try {
      // 构建StreamSettings JSON
      const streamSettingsJson = buildStreamSettings();
      
      // 构建Sniffing JSON
      const sniffingJson = JSON.stringify({
        enabled: sniffingEnabled,
        destOverride: ["http", "tls", "quic"],
        metadataOnly: false,
      });

      await xrayService.createInbound({
        remark: formData.remark,
        port: parseInt(formData.port),
        protocol: formData.protocol,
        listen: formData.listen,
        stream_settings: streamSettingsJson,
        sniffing: sniffingJson,
      });
      toast.success("入站创建成功");
      setCreateDialogOpen(false);
      resetForm();
      fetchInbounds();
    } catch (error) {
      console.error("Failed to create inbound:", error);
      toast.error("创建入站失败");
    }
  };

  const buildStreamSettings = () => {
    const settings: any = {
      network: streamSettings.network,
      security: streamSettings.security,
    };

    // TCP配置
    if (streamSettings.network === "tcp" && streamSettings.tcp_header_type !== "none") {
      settings.tcpSettings = {
        header: {
          type: streamSettings.tcp_header_type,
        },
      };
    }

    // WebSocket配置
    if (streamSettings.network === "ws") {
      settings.wsSettings = {
        path: streamSettings.ws_path,
        headers: streamSettings.ws_host ? { Host: streamSettings.ws_host } : {},
      };
    }

    // HTTP/2配置
    if (streamSettings.network === "http") {
      settings.httpSettings = {
        path: streamSettings.http_path,
        host: streamSettings.http_host ? [streamSettings.http_host] : [],
      };
    }

    // gRPC配置
    if (streamSettings.network === "grpc") {
      settings.grpcSettings = {
        serviceName: streamSettings.grpc_service_name,
      };
    }

    // TLS配置
    if (streamSettings.security === "tls") {
      const selectedCert = certificates.find(c => c.id.toString() === streamSettings.certificate_id);
      settings.tlsSettings = {
        serverName: streamSettings.tls_server_name || selectedCert?.domain || "",
        alpn: streamSettings.tls_alpn.split(",").map(s => s.trim()),
      };
    }

    return JSON.stringify(settings);
  };

  const resetForm = () => {
    setFormData({ remark: "", port: "", protocol: "vmess", listen: "0.0.0.0" });
    setStreamSettings({
      network: "tcp",
      security: "none",
      certificate_id: "",
      tcp_header_type: "none",
      ws_path: "/",
      ws_host: "",
      http_path: "/",
      http_host: "",
      grpc_service_name: "",
      tls_server_name: "",
      tls_alpn: "h2,http/1.1",
    });
    setSniffingEnabled(true);
  };

  const handleEdit = async () => {
    if (!selectedInbound) return;

    try {
      const streamSettingsJson = buildStreamSettings();
      const sniffingJson = JSON.stringify({
        enabled: sniffingEnabled,
        destOverride: ["http", "tls", "quic"],
        metadataOnly: false,
      });

      await xrayService.updateInbound(selectedInbound.id, {
        remark: formData.remark,
        port: parseInt(formData.port),
        protocol: formData.protocol,
        listen: formData.listen,
        stream_settings: streamSettingsJson,
        sniffing: sniffingJson,
      });
      toast.success("入站更新成功");
      setEditDialogOpen(false);
      resetForm();
      fetchInbounds();
    } catch (error) {
      console.error("Failed to update inbound:", error);
      toast.error("更新入站失败");
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
      toast.error("删除入站失败");
    }
  };

  const handleToggle = async (id: number, currentStatus: boolean) => {
    try {
      await xrayService.updateInbound(id, { enabled: !currentStatus });
      toast.success(currentStatus ? "入站已停止" : "入站已启动");
      fetchInbounds();
    } catch (error) {
      console.error("Failed to toggle inbound:", error);
      toast.error("操作失败");
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
    
    // 解析StreamSettings
    if (inbound.stream_settings) {
      try {
        const parsed = JSON.parse(inbound.stream_settings);
        setStreamSettings({
          network: parsed.network || "tcp",
          security: parsed.security || "none",
          certificate_id: "",
          tcp_header_type: parsed.tcpSettings?.header?.type || "none",
          ws_path: parsed.wsSettings?.path || "/",
          ws_host: parsed.wsSettings?.headers?.Host || "",
          http_path: parsed.httpSettings?.path || "/",
          http_host: parsed.httpSettings?.host?.[0] || "",
          grpc_service_name: parsed.grpcSettings?.serviceName || "",
          tls_server_name: parsed.tlsSettings?.serverName || "",
          tls_alpn: parsed.tlsSettings?.alpn?.join(",") || "h2,http/1.1",
        });
      } catch (e) {
        console.error("Failed to parse stream settings:", e);
      }
    }
    
    // 解析Sniffing
    if (inbound.sniffing) {
      try {
        const parsed = JSON.parse(inbound.sniffing);
        setSniffingEnabled(parsed.enabled || false);
      } catch (e) {
        console.error("Failed to parse sniffing:", e);
      }
    }
    
    setEditDialogOpen(true);
  };

  const totalInbounds = inbounds.length;
  const enabledCount = inbounds.filter((i) => i.enabled).length;
  const totalClients = inbounds.reduce((sum, i) => sum + (i.clients?.length || 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 页头 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              Xray 管理
            </h1>
            <p className="text-muted-foreground mt-1">管理 Xray 入站配置和客户端</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchInbounds}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              创建入站
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">总入站</p>
                <p className="text-3xl font-bold">{totalInbounds}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-white" />
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
                    <TableHead className="text-white/80">传输</TableHead>
                    <TableHead className="text-white/80">安全</TableHead>
                    <TableHead className="text-white/80">状态</TableHead>
                    <TableHead className="text-white/80 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inbounds.map((inbound) => {
                    let network = "tcp";
                    let security = "none";
                    try {
                      const stream = JSON.parse(inbound.stream_settings || "{}");
                      network = stream.network || "tcp";
                      security = stream.security || "none";
                    } catch (e) {}
                    
                    return (
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
                        <TableCell>
                          <Badge variant="secondary">{network.toUpperCase()}</Badge>
                        </TableCell>
                        <TableCell>
                          {security === "tls" ? (
                            <Badge variant="outline" className="gap-1 border-green-500/50 text-green-400">
                              <Shield className="h-3 w-3" />
                              TLS
                            </Badge>
                          ) : (
                            <Badge variant="secondary">无</Badge>
                          )}
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
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>

        {/* Create Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10 max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>创建入站</DialogTitle>
              <DialogDescription>
                配置新的 Xray 入站连接
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">基础配置</TabsTrigger>
                <TabsTrigger value="transport">传输层</TabsTrigger>
                <TabsTrigger value="advanced">高级选项</TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="space-y-4">
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
              </TabsContent>
              
              <TabsContent value="transport" className="space-y-4">
                <div className="space-y-2">
                  <Label>传输协议</Label>
                  <Select
                    value={streamSettings.network}
                    onValueChange={(value) => setStreamSettings({ ...streamSettings, network: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="ws">WebSocket</SelectItem>
                      <SelectItem value="http">HTTP/2</SelectItem>
                      <SelectItem value="grpc">gRPC</SelectItem>
                      <SelectItem value="quic">QUIC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {streamSettings.network === "tcp" && (
                  <div className="space-y-2">
                    <Label>TCP伪装类型</Label>
                    <Select
                      value={streamSettings.tcp_header_type}
                      onValueChange={(value) => setStreamSettings({ ...streamSettings, tcp_header_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">无</SelectItem>
                        <SelectItem value="http">HTTP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {streamSettings.network === "ws" && (
                  <>
                    <div className="space-y-2">
                      <Label>WebSocket路径</Label>
                      <Input
                        placeholder="/"
                        value={streamSettings.ws_path}
                        onChange={(e) => setStreamSettings({ ...streamSettings, ws_path: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Host (可选)</Label>
                      <Input
                        placeholder="example.com"
                        value={streamSettings.ws_host}
                        onChange={(e) => setStreamSettings({ ...streamSettings, ws_host: e.target.value })}
                      />
                    </div>
                  </>
                )}

                {streamSettings.network === "http" && (
                  <>
                    <div className="space-y-2">
                      <Label>HTTP路径</Label>
                      <Input
                        placeholder="/"
                        value={streamSettings.http_path}
                        onChange={(e) => setStreamSettings({ ...streamSettings, http_path: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Host</Label>
                      <Input
                        placeholder="example.com"
                        value={streamSettings.http_host}
                        onChange={(e) => setStreamSettings({ ...streamSettings, http_host: e.target.value })}
                      />
                    </div>
                  </>
                )}

                {streamSettings.network === "grpc" && (
                  <div className="space-y-2">
                    <Label>gRPC服务名</Label>
                    <Input
                      placeholder="GunService"
                      value={streamSettings.grpc_service_name}
                      onChange={(e) => setStreamSettings({ ...streamSettings, grpc_service_name: e.target.value })}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>安全传输</Label>
                  <Select
                    value={streamSettings.security}
                    onValueChange={(value) => setStreamSettings({ ...streamSettings, security: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">无</SelectItem>
                      <SelectItem value="tls">TLS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {streamSettings.security === "tls" && (
                  <>
                    <div className="space-y-2">
                      <Label>选择证书</Label>
                      <Select
                        value={streamSettings.certificate_id}
                        onValueChange={(value) => setStreamSettings({ ...streamSettings, certificate_id: value })}
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
                      <Label>Server Name (可选)</Label>
                      <Input
                        placeholder="自动使用证书域名"
                        value={streamSettings.tls_server_name}
                        onChange={(e) => setStreamSettings({ ...streamSettings, tls_server_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>ALPN</Label>
                      <Input
                        placeholder="h2,http/1.1"
                        value={streamSettings.tls_alpn}
                        onChange={(e) => setStreamSettings({ ...streamSettings, tls_alpn: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </TabsContent>
              
              <TabsContent value="advanced" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>流量探测 (Sniffing)</Label>
                    <p className="text-sm text-muted-foreground">
                      自动识别HTTP/TLS流量并路由
                    </p>
                  </div>
                  <Switch
                    checked={sniffingEnabled}
                    onCheckedChange={setSniffingEnabled}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setCreateDialogOpen(false);
                resetForm();
              }}>
                取消
              </Button>
              <Button onClick={handleCreate}>创建</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog - Similar structure to Create Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10 max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>编辑入站</DialogTitle>
              <DialogDescription>
                修改入站配置
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">基础配置</TabsTrigger>
                <TabsTrigger value="transport">传输层</TabsTrigger>
                <TabsTrigger value="advanced">高级选项</TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="space-y-4">
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
              </TabsContent>
              
              <TabsContent value="transport" className="space-y-4">
                {/* Same transport configuration as Create Dialog */}
                <div className="space-y-2">
                  <Label>传输协议</Label>
                  <Select
                    value={streamSettings.network}
                    onValueChange={(value) => setStreamSettings({ ...streamSettings, network: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="ws">WebSocket</SelectItem>
                      <SelectItem value="http">HTTP/2</SelectItem>
                      <SelectItem value="grpc">gRPC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>安全传输</Label>
                  <Select
                    value={streamSettings.security}
                    onValueChange={(value) => setStreamSettings({ ...streamSettings, security: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">无</SelectItem>
                      <SelectItem value="tls">TLS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {streamSettings.security === "tls" && (
                  <div className="space-y-2">
                    <Label>选择证书</Label>
                    <Select
                      value={streamSettings.certificate_id}
                      onValueChange={(value) => setStreamSettings({ ...streamSettings, certificate_id: value })}
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
                )}
              </TabsContent>
              
              <TabsContent value="advanced" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>流量探测 (Sniffing)</Label>
                    <p className="text-sm text-muted-foreground">
                      自动识别HTTP/TLS流量并路由
                    </p>
                  </div>
                  <Switch
                    checked={sniffingEnabled}
                    onCheckedChange={setSniffingEnabled}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setEditDialogOpen(false);
                resetForm();
              }}>
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
