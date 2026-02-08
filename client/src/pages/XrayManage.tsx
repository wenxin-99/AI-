import DashboardLayout from "@/components/DashboardLayout";
import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Plus, Play, Pause, Edit, Trash2, Users, RefreshCw, Shield, AlertCircle, Copy, QrCode, Key, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { xrayService, type XrayInbound } from "@/services/xray";
import { nodeService, type Node } from "@/services/node";
import api from "@/lib/api";
import LogViewer from "@/components/LogViewer";
import { generateShareLink, copyToClipboard } from "@/lib/shareLink";
import QRCode from "qrcode";

interface Certificate {
  id: number;
  name: string;
  domain: string;
  status: string;
  cert_type: string;
}

// ============ 协议默认设置 ============
const FINGERPRINTS = [
  "chrome", "firefox", "safari", "ios", "android", "edge", "360", "qq", "random", "randomized"
];

const SS_METHODS = [
  "aes-128-gcm", "aes-256-gcm", "chacha20-poly1305",
  "2022-blake3-aes-128-gcm", "2022-blake3-aes-256-gcm", "2022-blake3-chacha20-poly1305",
];

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateShortId(): string {
  const chars = '0123456789abcdef';
  let result = '';
  const len = [2, 4, 8, 16][Math.floor(Math.random() * 4)];
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// 生成 Shadowsocks 2022 密码（32字节 Base64）
function generateSS2022Password(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode.apply(null, Array.from(bytes)));
}

// 验证 Base64 格式
function isValidBase64(str: string): boolean {
  try {
    const decoded = atob(str);
    return decoded.length === 32;
  } catch {
    return false;
  }
}

// 检查是否为 SS2022 加密方法
function isSS2022Method(method: string): boolean {
  return method.startsWith('2022-blake3-');
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
    protocol: "vless",
    listen: "0.0.0.0",
  });

  // 协议设置
  const [protocolSettings, setProtocolSettings] = useState({
    // VLESS/VMess
    uuid: generateUUID(),
    flow: "", // xtls-rprx-vision
    // VMess
    alterId: "0",
    vmessSecurity: "auto",
    // Trojan
    trojanPassword: generateUUID(),
    // Shadowsocks
    ssMethod: "aes-256-gcm",
    ssPassword: generateUUID(),
  });

  // 传输层配置
  const [streamSettings, setStreamSettings] = useState({
    network: "tcp",
    security: "reality",
    certificate_id: "",
    // TCP配置
    tcp_header_type: "none",
    tcp_request_path: "/",
    tcp_request_host: "",
    // WebSocket配置
    ws_path: "/",
    ws_host: "",
    // HTTP/2配置
    http_path: "/",
    http_host: "",
    // gRPC配置
    grpc_service_name: "",
    grpc_multi_mode: false,
    // TLS配置
    tls_server_name: "",
    tls_alpn: "h2,http/1.1",
    tls_fingerprint: "chrome",
    tls_allow_insecure: false,
    // Reality配置
    reality_dest: "www.yahoo.com:443",
    reality_server_names: "www.yahoo.com",
    reality_private_key: "",
    reality_public_key: "",
    reality_short_ids: "",
    reality_fingerprint: "chrome",
    reality_spider_x: "/",
  });

  // Sniffing配置
  const [sniffingEnabled, setSniffingEnabled] = useState(true);

  // 自签名证书对话框
  const [selfSignedDialogOpen, setSelfSignedDialogOpen] = useState(false);
  const [selfSignedForm, setSelfSignedForm] = useState({ name: "", domain: "" });

  // 分享链接对话框
  const [shareLinkDialogOpen, setShareLinkDialogOpen] = useState(false);
  const [selectedShareInbound, setSelectedShareInbound] = useState<XrayInbound | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");

  // 显示/隐藏密钥
  const [showKeys, setShowKeys] = useState(false);

  const fetchNodes = useCallback(async () => {
    try {
      const nodeList = await nodeService.getAll();
      setAllNodes(nodeList);
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

  // ============ 构建 Settings JSON ============
  const buildSettings = (): string => {
    const protocol = formData.protocol;
    
    switch (protocol) {
      case "vless": {
        const settings: any = {
          decryption: "none",
          clients: [{
            id: protocolSettings.uuid,
            flow: protocolSettings.flow || "",
          }],
        };
        return JSON.stringify(settings);
      }
      case "vmess": {
        const settings: any = {
          clients: [{
            id: protocolSettings.uuid,
            alterId: parseInt(protocolSettings.alterId) || 0,
            security: protocolSettings.vmessSecurity || "auto",
          }],
        };
        return JSON.stringify(settings);
      }
      case "trojan": {
        const settings: any = {
          clients: [{
            password: protocolSettings.trojanPassword,
          }],
        };
        return JSON.stringify(settings);
      }
      case "shadowsocks": {
        const settings: any = {
          method: protocolSettings.ssMethod,
          password: protocolSettings.ssPassword,
          network: "tcp,udp",
        };
        return JSON.stringify(settings);
      }
      default:
        return "{}";
    }
  };

  // ============ 构建 StreamSettings JSON ============
  const buildStreamSettings = (): string => {
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
      if (streamSettings.tcp_header_type === "http") {
        settings.tcpSettings.header.request = {
          path: streamSettings.tcp_request_path ? streamSettings.tcp_request_path.split(",") : ["/"],
          headers: {
            Host: streamSettings.tcp_request_host ? [streamSettings.tcp_request_host] : [],
          },
        };
      }
    }

    // WebSocket配置
    if (streamSettings.network === "ws") {
      settings.wsSettings = {
        path: streamSettings.ws_path || "/",
        headers: streamSettings.ws_host ? { Host: streamSettings.ws_host } : {},
      };
      if (streamSettings.ws_host) {
        settings.wsSettings.host = streamSettings.ws_host;
      }
    }

    // HTTP/2配置
    if (streamSettings.network === "http") {
      settings.httpSettings = {
        path: streamSettings.http_path || "/",
        host: streamSettings.http_host ? [streamSettings.http_host] : [],
      };
    }

    // gRPC配置
    if (streamSettings.network === "grpc") {
      settings.grpcSettings = {
        serviceName: streamSettings.grpc_service_name || "",
        multiMode: streamSettings.grpc_multi_mode || false,
      };
    }

    // TLS配置
    if (streamSettings.security === "tls") {
      const selectedCert = certificates.find(c => c.id.toString() === streamSettings.certificate_id);
      settings.tlsSettings = {
        serverName: streamSettings.tls_server_name || selectedCert?.domain || "",
        alpn: streamSettings.tls_alpn ? streamSettings.tls_alpn.split(",").map(s => s.trim()) : ["h2", "http/1.1"],
        settings: {
          fingerprint: streamSettings.tls_fingerprint || "chrome",
          allowInsecure: streamSettings.tls_allow_insecure || false,
        },
      };
    }

    // Reality配置 - 完整结构，参考3x-ui
    if (streamSettings.security === "reality") {
      const shortIds = streamSettings.reality_short_ids
        ? streamSettings.reality_short_ids.split(",").map(s => s.trim())
        : [""];
      const serverNames = streamSettings.reality_server_names
        ? streamSettings.reality_server_names.split(",").map(s => s.trim())
        : ["www.yahoo.com"];
      
      settings.realitySettings = {
        show: false,
        dest: streamSettings.reality_dest || "www.yahoo.com:443",
        xver: 0,
        serverNames: serverNames,
        privateKey: streamSettings.reality_private_key,
        shortIds: shortIds,
        // settings子对象 - 客户端需要的参数
        settings: {
          publicKey: streamSettings.reality_public_key,
          fingerprint: streamSettings.reality_fingerprint || "chrome",
          spiderX: streamSettings.reality_spider_x || "/",
        },
      };
    }

    return JSON.stringify(settings);
  };

  // ============ 创建入站 ============
  const handleCreate = async () => {
    if (!selectedNodeId) {
      toast.error("请选择一个节点");
      return;
    }

    if (!formData.remark || !formData.port) {
      toast.error("请填写完整信息");
      return;
    }

    const port = parseInt(formData.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      toast.error("端口号必须在 1-65535 之间");
      return;
    }

    if (inbounds.some(inbound => inbound.port === port)) {
      toast.error(`端口 ${port} 已被其他入站使用`);
      return;
    }

    // Reality验证
    if (streamSettings.security === "reality") {
      if (!streamSettings.reality_private_key || !streamSettings.reality_public_key) {
        toast.error("Reality 协议需要填写私钥和公钥（使用 xray x25519 命令生成）");
        return;
      }
    }

    // TLS验证
    if (streamSettings.security === "tls" && !streamSettings.certificate_id) {
      toast.error("启用 TLS 加密时必须选择证书");
      return;
    }

    // SS2022 密码验证
    if (formData.protocol === "shadowsocks" && isSS2022Method(protocolSettings.ssMethod)) {
      if (!isValidBase64(protocolSettings.ssPassword)) {
        toast.error("Shadowsocks 2022 密码必须是 32 字节 Base64 编码格式，请点击“生成密码”按钮");
        return;
      }
    }

    try {
      const settingsJson = buildSettings();
      const streamSettingsJson = buildStreamSettings();
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
        node_id: parseInt(selectedNodeId),
        settings: settingsJson,
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
      setTimeout(() => fetchInbounds(), 1000);
    } catch (error) {
      console.error("Failed to create inbound:", error);
      toast.error("创建入站失败");
      setTimeout(() => fetchInbounds(), 1000);
    }
  };

  const resetForm = () => {
    setFormData({ remark: "", port: "", protocol: "vless", listen: "0.0.0.0" });
    setProtocolSettings({
      uuid: generateUUID(),
      flow: "",
      alterId: "0",
      vmessSecurity: "auto",
      trojanPassword: generateUUID(),
      ssMethod: "aes-256-gcm",
      ssPassword: generateUUID(),
    });
    setStreamSettings({
      network: "tcp",
      security: "reality",
      certificate_id: "",
      tcp_header_type: "none",
      tcp_request_path: "/",
      tcp_request_host: "",
      ws_path: "/",
      ws_host: "",
      http_path: "/",
      http_host: "",
      grpc_service_name: "",
      grpc_multi_mode: false,
      tls_server_name: "",
      tls_alpn: "h2,http/1.1",
      tls_fingerprint: "chrome",
      tls_allow_insecure: false,
      reality_dest: "www.yahoo.com:443",
      reality_server_names: "www.yahoo.com",
      reality_private_key: "",
      reality_public_key: "",
      reality_short_ids: "",
      reality_fingerprint: "chrome",
      reality_spider_x: "/",
    });
    setSniffingEnabled(true);
    setSelectedNodeId("");
    setShowKeys(false);
  };

  // ============ 编辑入站 ============
  const handleEdit = async () => {
    if (!selectedInbound) return;

    if (!formData.remark || !formData.port) {
      toast.error("请填写完整信息");
      return;
    }

    // 验证 SS2022 密码格式
    if (formData.protocol === "shadowsocks" && isSS2022Method(protocolSettings.ssMethod)) {
      if (!isValidBase64(protocolSettings.ssPassword)) {
        toast.error("Shadowsocks 2022 密码必须是 32 字节 Base64 编码格式，请点击“生成密码”按钮");
        return;
      }
    }

    try {
      const settingsJson = buildSettings();
      const streamSettingsJson = buildStreamSettings();
      const sniffingJson = JSON.stringify({
        enabled: sniffingEnabled,
        destOverride: ["http", "tls", "quic"],
        metadataOnly: false,
      });

      const result = await xrayService.updateInbound(selectedInbound.id, {
        remark: formData.remark,
        port: parseInt(formData.port),
        protocol: formData.protocol,
        listen: formData.listen,
        node_id: selectedNodeId ? parseInt(selectedNodeId) : undefined,
        settings: settingsJson,
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
      setTimeout(() => fetchInbounds(), 1000);
    } catch (error) {
      console.error("Failed to update inbound:", error);
      toast.error("更新入站失败");
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
      setTimeout(() => fetchInbounds(), 1000);
    } catch (error) {
      console.error("Failed to delete inbound:", error);
      toast.error("删除入站失败");
      setTimeout(() => fetchInbounds(), 1000);
    }
  };

  const handleToggle = async (inbound: XrayInbound) => {
    setToggling(inbound.id);
    try {
      let streamSettingsStr = inbound.stream_settings || '{"network":"tcp","security":"none"}';
      let sniffingStr = inbound.sniffing || '{"enabled":true,"destOverride":["http","tls","quic"],"metadataOnly":false}';

      const result = await xrayService.updateInbound(inbound.id, {
        remark: inbound.remark,
        port: inbound.port,
        protocol: inbound.protocol,
        listen: inbound.listen || "0.0.0.0",
        settings: inbound.settings || "{}",
        stream_settings: streamSettingsStr,
        sniffing: sniffingStr,
      });

      if (result.timedOut) {
        toast.success("入站配置已更新（后端正在重启Xray服务）");
      } else {
        toast.success("入站配置已更新");
      }
      setTimeout(() => fetchInbounds(), 1000);
    } catch (error) {
      console.error("Failed to toggle inbound:", error);
      toast.error("操作失败");
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
    
    // 解析Settings
    if (inbound.settings) {
      try {
        const parsed = typeof inbound.settings === 'string' 
          ? JSON.parse(inbound.settings) 
          : inbound.settings;
        
        const protocol = inbound.protocol.toLowerCase();
        if (protocol === "vless" || protocol === "vmess") {
          const client = parsed.clients?.[0] || {};
          setProtocolSettings(prev => ({
            ...prev,
            uuid: client.id || client.uuid || generateUUID(),
            flow: client.flow || "",
            alterId: (client.alterId || 0).toString(),
            vmessSecurity: client.security || "auto",
          }));
        } else if (protocol === "trojan") {
          const client = parsed.clients?.[0] || {};
          setProtocolSettings(prev => ({
            ...prev,
            trojanPassword: client.password || parsed.password || generateUUID(),
          }));
        } else if (protocol === "shadowsocks") {
          setProtocolSettings(prev => ({
            ...prev,
            ssMethod: parsed.method || "aes-256-gcm",
            ssPassword: parsed.password || generateUUID(),
          }));
        }
      } catch (e) {
        console.error("Failed to parse settings:", e);
      }
    }
    
    // 解析StreamSettings
    if (inbound.stream_settings) {
      try {
        const parsed = typeof inbound.stream_settings === 'string' 
          ? JSON.parse(inbound.stream_settings) 
          : inbound.stream_settings;
        
        const newStreamSettings: any = {
          network: parsed.network || "tcp",
          security: parsed.security || "none",
          certificate_id: "",
          tcp_header_type: parsed.tcpSettings?.header?.type || "none",
          tcp_request_path: "/",
          tcp_request_host: "",
          ws_path: parsed.wsSettings?.path || "/",
          ws_host: parsed.wsSettings?.host || parsed.wsSettings?.headers?.Host || "",
          http_path: parsed.httpSettings?.path || "/",
          http_host: parsed.httpSettings?.host?.[0] || "",
          grpc_service_name: parsed.grpcSettings?.serviceName || "",
          grpc_multi_mode: parsed.grpcSettings?.multiMode || false,
          tls_server_name: parsed.tlsSettings?.serverName || "",
          tls_alpn: parsed.tlsSettings?.alpn?.join(",") || "h2,http/1.1",
          tls_fingerprint: parsed.tlsSettings?.settings?.fingerprint || parsed.tlsSettings?.fingerprint || "chrome",
          tls_allow_insecure: parsed.tlsSettings?.settings?.allowInsecure || false,
          reality_dest: parsed.realitySettings?.dest || "www.yahoo.com:443",
          reality_server_names: Array.isArray(parsed.realitySettings?.serverNames) 
            ? parsed.realitySettings.serverNames.join(",") 
            : (parsed.realitySettings?.serverNames || "www.yahoo.com"),
          reality_private_key: parsed.realitySettings?.privateKey || "",
          reality_public_key: parsed.realitySettings?.settings?.publicKey || parsed.realitySettings?.publicKey || "",
          reality_short_ids: Array.isArray(parsed.realitySettings?.shortIds)
            ? parsed.realitySettings.shortIds.join(",")
            : (parsed.realitySettings?.shortIds || ""),
          reality_fingerprint: parsed.realitySettings?.settings?.fingerprint || parsed.realitySettings?.fingerprint || "chrome",
          reality_spider_x: parsed.realitySettings?.settings?.spiderX || "/",
        };
        
        // TCP HTTP伪装的path和host
        if (parsed.tcpSettings?.header?.type === "http") {
          const request = parsed.tcpSettings.header.request;
          if (request?.path) {
            newStreamSettings.tcp_request_path = Array.isArray(request.path) ? request.path.join(",") : request.path;
          }
          if (request?.headers?.Host) {
            newStreamSettings.tcp_request_host = Array.isArray(request.headers.Host) 
              ? request.headers.Host[0] : request.headers.Host;
          }
        }
        
        setStreamSettings(newStreamSettings);
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
    
    // 设置节点关联
    setSelectedNodeId(inbound.node_id ? inbound.node_id.toString() : "");
    
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

  // 查找节点的辅助函数
  const findNodeForInbound = useCallback((inbound: XrayInbound): Node | undefined => {
    // 优先通过node_id匹配
    if (inbound.node_id && inbound.node_id > 0) {
      const node = allNodes.find(n => n.id === inbound.node_id);
      if (node) return node;
    }
    // fallback: 通过listen地址匹配（只有匹配到才返回，否则继续往下）
    if (inbound.listen && inbound.listen !== "0.0.0.0") {
      const node = allNodes.find(n => n.host === inbound.listen);
      if (node) return node;
    }
    // 如果只有一个节点，默认使用它
    if (allNodes.length === 1) return allNodes[0];
    return undefined;
  }, [allNodes]);

  // 打开分享链接对话框
  const handleOpenShareLink = async (inbound: XrayInbound) => {
    setSelectedShareInbound(inbound);
    
    const node = findNodeForInbound(inbound);
    const shareLink = node ? generateShareLink(inbound, node) : '';
    
    if (!shareLink) {
      toast.error("无法生成分享链接，请检查节点配置（确保入站关联了节点）");
      return;
    }
    
    try {
      const qrUrl = await QRCode.toDataURL(shareLink, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrCodeUrl(qrUrl);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      toast.error('生成二维码失败');
    }
    
    setShareLinkDialogOpen(true);
  };

  // 复制分享链接
  const handleCopyShareLink = async () => {
    if (!selectedShareInbound) return;
    
    const node = findNodeForInbound(selectedShareInbound);
    const shareLink = node ? generateShareLink(selectedShareInbound, node) : '';
    
    if (!shareLink) {
      toast.error("无法生成分享链接");
      return;
    }
    
    const success = await copyToClipboard(shareLink);
    if (success) {
      toast.success("分享链接已复制到剪贴板");
    } else {
      toast.error("复制失败，请手动复制");
    }
  };

  const totalInbounds = inbounds.length;
  const enabledCount = inbounds.filter((i) => i.enable || i.enabled).length;
  const totalClients = inbounds.reduce((sum, i) => sum + (i.clients?.length || 0), 0);

  // ============ 协议设置表单 ============
  const renderProtocolForm = () => {
    const protocol = formData.protocol;
    
    return (
      <div className="space-y-4">
        {(protocol === "vless" || protocol === "vmess") && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>UUID / ID</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProtocolSettings({ ...protocolSettings, uuid: generateUUID() })}
                  className="h-6 text-xs"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  重新生成
                </Button>
              </div>
              <Input
                value={protocolSettings.uuid}
                onChange={(e) => setProtocolSettings({ ...protocolSettings, uuid: e.target.value })}
                className="font-mono text-sm"
              />
            </div>
            
            {protocol === "vless" && streamSettings.security === "reality" && (
              <div className="space-y-2">
                <Label>Flow</Label>
                <Select
                  value={protocolSettings.flow}
                  onValueChange={(value) => setProtocolSettings({ ...protocolSettings, flow: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择Flow（可选）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无</SelectItem>
                    <SelectItem value="xtls-rprx-vision">xtls-rprx-vision</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Reality + TCP 推荐使用 xtls-rprx-vision</p>
              </div>
            )}

            {protocol === "vmess" && (
              <>
                <div className="space-y-2">
                  <Label>AlterID</Label>
                  <Input
                    type="number"
                    value={protocolSettings.alterId}
                    onChange={(e) => setProtocolSettings({ ...protocolSettings, alterId: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">推荐设为 0</p>
                </div>
                <div className="space-y-2">
                  <Label>加密方式</Label>
                  <Select
                    value={protocolSettings.vmessSecurity}
                    onValueChange={(value) => setProtocolSettings({ ...protocolSettings, vmessSecurity: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">auto</SelectItem>
                      <SelectItem value="aes-128-gcm">aes-128-gcm</SelectItem>
                      <SelectItem value="chacha20-poly1305">chacha20-poly1305</SelectItem>
                      <SelectItem value="none">none</SelectItem>
                      <SelectItem value="zero">zero</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </>
        )}

        {protocol === "trojan" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>密码</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setProtocolSettings({ ...protocolSettings, trojanPassword: generateUUID() })}
                className="h-6 text-xs"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                重新生成
              </Button>
            </div>
            <Input
              value={protocolSettings.trojanPassword}
              onChange={(e) => setProtocolSettings({ ...protocolSettings, trojanPassword: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
        )}

        {protocol === "shadowsocks" && (
          <>
            <div className="space-y-2">
              <Label>加密方式</Label>
              <Select
                value={protocolSettings.ssMethod}
                onValueChange={(value) => {
                  const newSettings = { ...protocolSettings, ssMethod: value };
                  // 如果切换到 SS2022 且当前密码不是有效的 Base64，自动生成新密码
                  if (isSS2022Method(value) && !isValidBase64(protocolSettings.ssPassword)) {
                    newSettings.ssPassword = generateSS2022Password();
                  }
                  setProtocolSettings(newSettings);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SS_METHODS.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>密码</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newPassword = isSS2022Method(protocolSettings.ssMethod)
                      ? generateSS2022Password()
                      : generateUUID();
                    setProtocolSettings({ ...protocolSettings, ssPassword: newPassword });
                  }}
                  className="h-6 text-xs"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  生成密码
                </Button>
              </div>
              <Input
                value={protocolSettings.ssPassword}
                onChange={(e) => setProtocolSettings({ ...protocolSettings, ssPassword: e.target.value })}
                className="font-mono text-sm"
              />
              {isSS2022Method(protocolSettings.ssMethod) && (
                <p className="text-xs text-muted-foreground">
                  Shadowsocks 2022 需要 32 字节 Base64 编码的密码
                  {!isValidBase64(protocolSettings.ssPassword) && (
                    <span className="text-destructive ml-1">（当前密码格式不正确）</span>
                  )}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  // ============ 传输层配置表单 ============
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
        <>
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
          {streamSettings.tcp_header_type === "http" && (
            <>
              <div className="space-y-2">
                <Label>HTTP请求路径</Label>
                <Input
                  placeholder="/"
                  value={streamSettings.tcp_request_path}
                  onChange={(e) => setStreamSettings({ ...streamSettings, tcp_request_path: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>HTTP请求Host</Label>
                <Input
                  placeholder="example.com"
                  value={streamSettings.tcp_request_host}
                  onChange={(e) => setStreamSettings({ ...streamSettings, tcp_request_host: e.target.value })}
                />
              </div>
            </>
          )}
        </>
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
        <>
          <div className="space-y-2">
            <Label>gRPC服务名</Label>
            <Input
              placeholder="GunService"
              value={streamSettings.grpc_service_name}
              onChange={(e) => setStreamSettings({ ...streamSettings, grpc_service_name: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Multi Mode</Label>
            <Switch
              checked={streamSettings.grpc_multi_mode}
              onCheckedChange={(checked) => setStreamSettings({ ...streamSettings, grpc_multi_mode: checked })}
            />
          </div>
        </>
      )}

      {/* 安全传输 */}
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

      {/* TLS配置 */}
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
            <Label>Server Name (SNI)</Label>
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
          <div className="space-y-2">
            <Label>浏览器指纹 (uTLS)</Label>
            <Select
              value={streamSettings.tls_fingerprint}
              onValueChange={(value) => setStreamSettings({ ...streamSettings, tls_fingerprint: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FINGERPRINTS.map(fp => (
                  <SelectItem key={fp} value={fp}>{fp}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label>允许不安全连接</Label>
            <Switch
              checked={streamSettings.tls_allow_insecure}
              onCheckedChange={(checked) => setStreamSettings({ ...streamSettings, tls_allow_insecure: checked })}
            />
          </div>
        </>
      )}

      {/* Reality配置 */}
      {streamSettings.security === "reality" && (
        <>
          <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <p className="text-xs text-purple-300">
              Reality 是一种先进的传输安全协议，无需证书即可实现加密。需要使用 <code className="bg-purple-500/20 px-1 rounded">xray x25519</code> 命令在服务器上生成密钥对。
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>目标地址 (Dest)</Label>
            <Input
              placeholder="www.yahoo.com:443"
              value={streamSettings.reality_dest}
              onChange={(e) => setStreamSettings({ ...streamSettings, reality_dest: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">伪装目标网站，建议使用支持TLS1.3和H2的大型网站</p>
          </div>
          <div className="space-y-2">
            <Label>服务器名 (Server Names / SNI)</Label>
            <Input
              placeholder="www.yahoo.com"
              value={streamSettings.reality_server_names}
              onChange={(e) => setStreamSettings({ ...streamSettings, reality_server_names: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">多个域名用逗号分隔，需与Dest域名匹配</p>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>私钥 (Private Key) - 服务端</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const keypair = await xrayService.generateKeypair();
                      setStreamSettings({
                        ...streamSettings,
                        reality_private_key: keypair.private_key,
                        reality_public_key: keypair.public_key,
                      });
                      toast.success("密钥对生成成功");
                    } catch (error) {
                      console.error("生成密钥对失败:", error);
                      toast.error("生成密钥对失败");
                    }
                  }}
                  className="h-6 text-xs"
                >
                  <Key className="w-3 h-3 mr-1" />
                  生成
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowKeys(!showKeys)}
                  className="h-6 text-xs"
                >
                  {showKeys ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                  {showKeys ? "隐藏" : "显示"}
                </Button>
              </div>
            </div>
            <Input
              type={showKeys ? "text" : "password"}
              placeholder="点击上方'生成'按钮自动生成"
              value={streamSettings.reality_private_key}
              onChange={(e) => setStreamSettings({ ...streamSettings, reality_private_key: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>公钥 (Public Key) - 客户端</Label>
            <Input
              type={showKeys ? "text" : "password"}
              placeholder="点击上方'生成'按钮自动生成"
              value={streamSettings.reality_public_key}
              onChange={(e) => setStreamSettings({ ...streamSettings, reality_public_key: e.target.value })}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">公钥会包含在分享链接中，客户端需要此密钥连接</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>短 ID (Short IDs)</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStreamSettings({ 
                  ...streamSettings, 
                  reality_short_ids: generateShortId() 
                })}
                className="h-6 text-xs"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                随机生成
              </Button>
            </div>
            <Input
              placeholder="留空或 0-16位十六进制，多个用逗号分隔"
              value={streamSettings.reality_short_ids}
              onChange={(e) => setStreamSettings({ ...streamSettings, reality_short_ids: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label>浏览器指纹 (Fingerprint)</Label>
            <Select
              value={streamSettings.reality_fingerprint}
              onValueChange={(value) => setStreamSettings({ ...streamSettings, reality_fingerprint: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FINGERPRINTS.map(fp => (
                  <SelectItem key={fp} value={fp}>{fp}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>SpiderX</Label>
            <Input
              placeholder="/"
              value={streamSettings.reality_spider_x}
              onChange={(e) => setStreamSettings({ ...streamSettings, reality_spider_x: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">爬虫路径，用于主动探测防御</p>
          </div>
        </>
      )}
    </div>
  );

  // ============ 入站创建/编辑对话框内容 ============
  const renderFormDialogContent = (isEdit: boolean) => (
    <Tabs defaultValue="basic" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="basic">基础配置</TabsTrigger>
        <TabsTrigger value="protocol">协议设置</TabsTrigger>
        <TabsTrigger value="transport">传输层</TabsTrigger>
        <TabsTrigger value="advanced">高级选项</TabsTrigger>
      </TabsList>
      
      <TabsContent value="basic" className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="node">{isEdit ? "关联节点" : "选择节点"}</Label>
          <Select
            value={selectedNodeId}
            onValueChange={(value) => setSelectedNodeId(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择一个节点" />
            </SelectTrigger>
            <SelectContent>
              {allNodes.length === 0 ? (
                <SelectItem value="none" disabled>
                  暂无节点
                </SelectItem>
              ) : (
                allNodes.map((node) => (
                  <SelectItem key={node.id} value={String(node.id)}>
                    {node.name} ({node.host}:{node.port}) - {node.type} {node.status === 'online' ? '✅' : '⚠️离线'}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {!isEdit && nodes.length === 0 && allNodes.length > 0 && (
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
            placeholder="例如: VLESS Reality 日本"
            value={formData.remark}
            onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="protocol">协议</Label>
          <Select
            value={formData.protocol}
            onValueChange={(value) => {
              setFormData({ ...formData, protocol: value });
              // 切换协议时自动调整安全设置
              if (value === "vless") {
                setStreamSettings(prev => ({ ...prev, security: "reality" }));
              } else if (value === "trojan") {
                setStreamSettings(prev => ({ ...prev, security: "tls" }));
              } else {
                setStreamSettings(prev => ({ ...prev, security: "none" }));
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vless">VLESS</SelectItem>
              <SelectItem value="vmess">VMess</SelectItem>
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
            placeholder="例如: 443"
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
          <p className="text-xs text-muted-foreground">默认 0.0.0.0 监听所有地址</p>
        </div>
      </TabsContent>
      
      <TabsContent value="protocol">
        {renderProtocolForm()}
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
            <Button onClick={() => { fetchNodes(); resetForm(); setCreateDialogOpen(true); }}>
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
                <Key className="w-6 h-6 text-white" />
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
                    <TableHead className="text-white/80">节点</TableHead>
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
                    const associatedNode = findNodeForInbound(inbound);
                    
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
                          {associatedNode ? (
                            <Badge variant="outline" className="border-blue-500/50 text-blue-400">
                              {associatedNode.name}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-yellow-400">未关联</Badge>
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
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenShareLink(inbound)}
                              title="分享链接"
                            >
                              <QrCode className="w-4 h-4" />
                            </Button>
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
            
            {renderFormDialogContent(false)}

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
            
            {renderFormDialogContent(true)}

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

        {/* 分享链接对话框 */}
        <Dialog open={shareLinkDialogOpen} onOpenChange={setShareLinkDialogOpen}>
          <DialogContent className="bg-card/95 backdrop-blur-xl border-white/10 max-w-lg">
            <DialogHeader>
              <DialogTitle>分享链接</DialogTitle>
              <DialogDescription>
                扫描二维码或复制链接导入到客户端
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {qrCodeUrl && (
                <div className="flex justify-center">
                  <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64 border-2 border-white/10 rounded-lg" />
                </div>
              )}
              <div className="space-y-2">
                <Label>分享链接</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={useMemo(() => {
                      if (!selectedShareInbound) return "";
                      const node = findNodeForInbound(selectedShareInbound);
                      return node ? generateShareLink(selectedShareInbound, node) : "";
                    }, [selectedShareInbound, allNodes, findNodeForInbound])}
                    className="font-mono text-xs"
                  />
                  <Button onClick={handleCopyShareLink} size="icon" className="shrink-0">
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              {/* 显示关键配置信息 */}
              {selectedShareInbound && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">配置详情</Label>
                  <div className="bg-black/20 rounded-lg p-3 text-xs font-mono space-y-1">
                    <div><span className="text-muted-foreground">协议:</span> {selectedShareInbound.protocol.toUpperCase()}</div>
                    <div><span className="text-muted-foreground">端口:</span> {selectedShareInbound.port}</div>
                    {(() => {
                      const node = findNodeForInbound(selectedShareInbound);
                      return node ? <div><span className="text-muted-foreground">节点:</span> {node.name} ({node.host})</div> : null;
                    })()}
                    {(() => {
                      try {
                        const stream = typeof selectedShareInbound.stream_settings === 'string'
                          ? JSON.parse(selectedShareInbound.stream_settings)
                          : selectedShareInbound.stream_settings;
                        return (
                          <>
                            <div><span className="text-muted-foreground">传输:</span> {stream?.network || "tcp"}</div>
                            <div><span className="text-muted-foreground">安全:</span> {stream?.security || "none"}</div>
                          </>
                        );
                      } catch { return null; }
                    })()}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => setShareLinkDialogOpen(false)}>关闭</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
