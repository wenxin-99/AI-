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
import { Switch } from "@/components/ui/switch";
import { Plus, Play, Pause, Edit, Trash2, Users, RefreshCw, Shield, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { xrayService, type XrayInbound } from "@/services/xray";
import { nodeService, type Node } from "@/services/node";
import api from "@/lib/api";
import LogViewer from "@/components/LogViewer";

interface Certificate {
  id: number;
  name: string;
  domain: string;
  status: string;
  cert_type: string;
}

export default function XrayManage() {
  const [inbounds, setInbounds] = useState<XrayInbound[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedInbound, setSelectedInbound] = useState<XrayInbound | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string>("");
  const [toggling, setToggling] = useState<number | null>(null);
  
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

  // 自签名证书对话框
  const [selfSignedDialogOpen, setSelfSignedDialogOpen] = useState(false);
  const [selfSignedForm, setSelfSignedForm] = useState({ name: "", domain: "" });

  const fetchNodes = useCallback(async () => {
    try {
      const nodeList = await nodeService.getAll();
      setAllNodes(nodeList);
      // 只显示在线节点用于选择
      setNodes(nodeList.filter((node: Node) => node.status === 'online'));
    } catch (error) {
      console.error('Failed to fetch nodes:', error);
    }
  }, []);

  const fetchInbounds = useCallback(async () => {
    try {
      setLoading(true);
      const data = await xrayService.getInbounds();
      setInbounds(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch inbounds:", error);
      toast.error("获取入站列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCertificates = useCallback(async () => {
    try {
      const response: any = await api.get('/api/v1/certificates');
      // 响应拦截器已解包，response 可能是 { certificates: [...], total } 或 { data: { certificates } }
      const certs = response?.certificates || response?.data?.certificates || [];
      setCertificates(Array.isArray(certs) ? certs : []);
    } catch (error) {
      console.error("Failed to fetch certificates:", error);
    }
  }, []);

  useEffect(() => {
    fetchInbounds();
    fetchCertificates();
    fetchNodes();
  }, [fetchInbounds, fetchCertificates, fetchNodes]);

  const handleCreate = async () => {
    // 节点选择验证
    if (!selectedNodeId) {
      toast.error("请选择一个节点");
      return;
    }

    // 基本验证
    if (!formData.remark || !formData.port) {
      toast.error("请填写完整信息");
      return;
    }

    // 端口验证
    const port = parseInt(formData.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      toast.error("端口号必须在 1-65535 之间");
      return;
    }

    // 检查端口是否已被使用
    if (inbounds.some(inbound => inbound.port === port)) {
      toast.error(`端口 ${port} 已被其他入站使用`);
      return;
    }

    // WebSocket配置验证
    if (streamSettings.network === 'ws') {
      if (!streamSettings.ws_path || !streamSettings.ws_path.startsWith('/')) {
        toast.error('WebSocket 路径必须以 / 开头');
        return;
      }
    }

    // gRPC配置验证
    if (streamSettings.network === 'grpc' && !streamSettings.grpc_service_name) {
      toast.error('请填写 gRPC 服务名称');
      return;
    }

    // TLS配置验证
    if (streamSettings.security === 'tls' && !streamSettings.certificate_id) {
      toast.error('启用 TLS 加密时必须选择证书');
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

      const result = await xrayService.createInbound({
        remark: formData.remark,
        port: parseInt(formData.port),
        protocol: formData.protocol,
        listen: formData.listen,
        stream_settings: streamSettingsJson,
        sniffing: sniffingJson,
      });
      if (result.timedOut) {
        toast.success("入站创建成功（后端正在重启Xray服务）");
      } else {
        toast.success("入站创建成功");
      }
      setCreateDialogOpen(false);
      resetForm();
      // 延迟一下再刷新列表，给后端时间完成数据库写入
      setTimeout(() => fetchInbounds(), 1000);
    } catch (error) {
      console.error("Failed to create inbound:", error);
      toast.error("创建入站失败");
      // 即使失败也尝试刷新列表（可能数据已写入但Restart超时）
      setTimeout(() => fetchInbounds(), 1000);
    }
  };

  const buildStreamSettings = () => {
    const settings: any = {
      network: streamSettings.network,
      security: streamSettings.security,
    };

    // TCP配置
    if (streamSettings.network === "tcp") {
      settings.tcpSettings = {
        header: {
          type: streamSettings.tcp_header_type || "none",
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
    setSelectedNodeId("");
  };

  const handleEdit = async () => {
    if (!selectedInbound) return;

    if (!formData.remark || !formData.port) {
      toast.error("请填写完整信息");
      return;
    }

    try {
      const streamSettingsJson = buildStreamSettings();
      const sniffingJson = JSON.stringify({
        enabled: sniffingEnabled,
        destOverride: ["http", "tls", "quic"],
        metadataOnly: false,
      });

      // 必须发送所有必填字段: remark, port, protocol
      const result = await xrayService.updateInbound(selectedInbound.id, {
        remark: formData.remark,
        port: parseInt(formData.port),
        protocol: formData.protocol,
        listen: formData.listen,
        stream_settings: streamSettingsJson,
        sniffing: sniffingJson,
      });
      if (result.timedOut) {
        toast.success("入站更新成功（后端正在重启Xray服务）");
      } else {
        toast.success("入站更新成功");
      }
      setEditDialogOpen(false);
      resetForm();
      // 延迟刷新列表
      setTimeout(() => fetchInbounds(), 1000);
    } catch (error) {
      console.error("Failed to update inbound:", error);
      toast.error("更新入站失败");
      // 即使失败也刷新
      setTimeout(() => fetchInbounds(), 1000);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此入站吗?")) return;

    try {
      const result = await xrayService.deleteInbound(id);
      if (result.timedOut) {
        toast.success("入站删除成功（后端正在重启Xray服务）");
      } else {
        toast.success("入站删除成功");
      }
      // 延迟刷新列表
      setTimeout(() => fetchInbounds(), 1000);
    } catch (error) {
      console.error("Failed to delete inbound:", error);
      toast.error("删除入站失败");
      // 即使失败也刷新（数据可能已删除）
      setTimeout(() => fetchInbounds(), 1000);
    }
  };

  // 修复 handleToggle - 必须发送完整的入站数据
  const handleToggle = async (inbound: XrayInbound) => {
    setToggling(inbound.id);
    try {
      const currentEnabled = inbound.enable ?? inbound.enabled ?? true;
      
      // 解析现有的stream_settings和sniffing
      let streamSettingsStr = inbound.stream_settings || '{"network":"tcp","security":"none"}';
      let sniffingStr = inbound.sniffing || '{"enabled":true,"destOverride":["http","tls","quic"],"metadataOnly":false}';

      // 后端 UpdateInbound 使用 CreateInboundRequest 结构体
      // 必须发送所有 required 字段: remark, port, protocol
      const result = await xrayService.updateInbound(inbound.id, {
        remark: inbound.remark,
        port: inbound.port,
        protocol: inbound.protocol,
        listen: inbound.listen || "0.0.0.0",
        stream_settings: streamSettingsStr,
        sniffing: sniffingStr,
      });

      if (result.timedOut) {
        toast.success("入站配置已更新（后端正在重启Xray服务）");
      } else {
        toast.success("入站配置已更新");
      }
      // 延迟刷新列表
      setTimeout(() => fetchInbounds(), 1000);
    } catch (error) {
      console.error("Failed to toggle inbound:", error);
      toast.error("操作失败");
      // 即使失败也刷新
      setTimeout(() => fetchInbounds(), 1000);
    } finally {
      setToggling(null);
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
        const parsed = typeof inbound.stream_settings === 'string' 
          ? JSON.parse(inbound.stream_settings) 
          : inbound.stream_settings;
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
        console.error("Failed to parse stream_settings:", e);
      }
    }
    
    // 解析Sniffing
    if (inbound.sniffing) {
      try {
        const parsed = typeof inbound.sniffing === 'string'
          ? JSON.parse(inbound.sniffing)
          : inbound.sniffing;
        setSniffingEnabled(parsed.enabled || false);
      } catch (e) {
        console.error("Failed to parse sniffing:", e);
      }
    }
    
    setEditDialogOpen(true);
  };

  // 生成自签名证书
  const handleGenerateSelfSigned = async () => {
    if (!selfSignedForm.name || !selfSignedForm.domain) {
      toast.error("请填写证书名称和域名");
      return;
    }
    try {
      await api.post('/api/v1/certificates/generate', selfSignedForm);
      toast.success("自签名证书生成成功");
      setSelfSignedDialogOpen(false);
      setSelfSignedForm({ name: "", domain: "" });
      await fetchCertificates();
    } catch (error) {
      console.error("Failed to generate self-signed cert:", error);
      toast.error("生成自签名证书失败");
    }
  };

  const totalInbounds = inbounds.length;
  const enabledCount = inbounds.filter((i) => i.enable || i.enabled).length;
  const totalClients = inbounds.reduce((sum, i) => sum + (i.clients?.length || 0), 0);

  // 渲染传输层配置表单（创建和编辑共用）
  const renderTransportForm = () => (
    <div className="space-y-4">
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
            <SelectItem value="reality">Reality</SelectItem>
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
                {certificates.length === 0 ? (
                  <SelectItem value="none" disabled>暂无证书，请先在证书管理页面添加</SelectItem>
                ) : (
                  certificates.filter(c => c.status === 'active' || c.status === 'valid').map((cert) => (
                    <SelectItem key={cert.id} value={cert.id.toString()}>
                      {cert.name} ({cert.domain}) - {cert.cert_type === 'self_signed' ? '自签名' : '正式证书'}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <div className="flex gap-2 mt-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setSelfSignedDialogOpen(true)}
              >
                快速生成自签名证书
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.href = '/certificates'}
              >
                前往证书管理
              </Button>
            </div>
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
    </div>
  );

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
            <Button variant="outline" onClick={() => { fetchInbounds(); fetchNodes(); }}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
            </Button>
            <Button onClick={() => { fetchNodes(); setCreateDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              创建入站
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
                <p className="text-sm text-muted-foreground mb-1">在线节点</p>
                <p className="text-3xl font-bold">{nodes.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-yellow-500 flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-card/40 backdrop-blur-xl border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">证书数</p>
                <p className="text-3xl font-bold">{certificates.length}</p>
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
                暂无入站配置，点击"创建入站"开始
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
                      const stream = typeof inbound.stream_settings === 'string'
                        ? JSON.parse(inbound.stream_settings || "{}")
                        : (inbound.stream_settings || {});
                      network = stream.network || "tcp";
                      security = stream.security || "none";
                    } catch (e) {}
                    
                    const isEnabled = inbound.enable ?? inbound.enabled ?? true;
                    
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
                          ) : security === "reality" ? (
                            <Badge variant="outline" className="gap-1 border-purple-500/50 text-purple-400">
                              <Shield className="h-3 w-3" />
                              Reality
                            </Badge>
                          ) : (
                            <Badge variant="secondary">无</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={isEnabled ? "default" : "secondary"}
                            className={
                              isEnabled
                                ? "bg-green-500/20 text-green-400 border-green-500/50"
                                : "bg-gray-500/20 text-gray-400 border-gray-500/50"
                            }
                          >
                            {isEnabled ? "运行中" : "已停止"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={toggling === inbound.id}
                              onClick={() => handleToggle(inbound)}
                              title={isEnabled ? "暂停" : "启动"}
                            >
                              {toggling === inbound.id ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : isEnabled ? (
                                <Pause className="w-4 h-4" />
                              ) : (
                                <Play className="w-4 h-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(inbound)}
                              title="编辑"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(inbound.id)}
                              title="删除"
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

        {/* 日志查看器 */}
        <LogViewer 
          title="Xray 实时日志" 
          logEndpoint="/api/v1/xray/logs" 
        />

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
                  <Label htmlFor="node">选择节点</Label>
                  <Select
                    value={selectedNodeId}
                    onValueChange={(value) => setSelectedNodeId(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择一个在线节点" />
                    </SelectTrigger>
                    <SelectContent>
                      {nodes.length === 0 ? (
                        <SelectItem value="none" disabled>
                          暂无在线节点 (共{allNodes.length}个节点)
                        </SelectItem>
                      ) : (
                        nodes.map((node) => (
                          <SelectItem key={node.id} value={String(node.id)}>
                            {node.name} ({node.host}:{node.port}) - {node.type}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {nodes.length === 0 && allNodes.length > 0 && (
                    <p className="text-xs text-yellow-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      有 {allNodes.length} 个节点但均不在线，请检查节点状态
                    </p>
                  )}
                  {allNodes.length === 0 && (
                    <p className="text-xs text-yellow-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      尚未添加任何节点，请先在节点管理页面添加节点
                    </p>
                  )}
                </div>
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
              
              <TabsContent value="transport">
                {renderTransportForm()}
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

        {/* Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10 max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>编辑入站</DialogTitle>
              <DialogDescription>
                修改入站配置 - {selectedInbound?.remark}
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
                  <Label htmlFor="edit-protocol">协议</Label>
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
              
              <TabsContent value="transport">
                {renderTransportForm()}
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

        {/* 自签名证书生成对话框 */}
        <Dialog open={selfSignedDialogOpen} onOpenChange={setSelfSignedDialogOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10">
            <DialogHeader>
              <DialogTitle>生成自签名证书</DialogTitle>
              <DialogDescription>
                快速生成一个自签名TLS证书，适用于测试环境
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>证书名称</Label>
                <Input
                  placeholder="例如: 测试证书"
                  value={selfSignedForm.name}
                  onChange={(e) => setSelfSignedForm({ ...selfSignedForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>域名</Label>
                <Input
                  placeholder="例如: example.com"
                  value={selfSignedForm.domain}
                  onChange={(e) => setSelfSignedForm({ ...selfSignedForm, domain: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelfSignedDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleGenerateSelfSigned}>生成</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
