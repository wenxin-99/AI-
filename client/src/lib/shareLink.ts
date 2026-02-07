import type { XrayInbound } from "@/services/xray";
import type { Node } from "@/services/node";

/**
 * 生成Xray入站的分享链接
 * 参考 3x-ui 的实现逻辑，支持完整的协议参数
 */
export function generateShareLink(inbound: XrayInbound, node: Node | undefined): string {
  if (!node || !node.id || node.id === 0) {
    console.error("generateShareLink: invalid node", node);
    return "";
  }

  const protocol = inbound.protocol.toLowerCase();
  const address = node.host;
  const port = inbound.port;
  
  if (!address) {
    console.error("generateShareLink: node.host is empty", node);
    return "";
  }

  try {
    // 解析stream_settings获取传输层配置
    let streamSettings: any = {};
    if (inbound.stream_settings) {
      try {
        streamSettings = typeof inbound.stream_settings === 'string' 
          ? JSON.parse(inbound.stream_settings) 
          : inbound.stream_settings;
      } catch (e) {
        console.error("Failed to parse stream_settings:", e);
      }
    }

    const network = streamSettings.network || "tcp";
    const security = streamSettings.security || "none";

    // 解析settings获取UUID/密码
    let settings: any = {};
    if (inbound.settings) {
      try {
        settings = typeof inbound.settings === 'string'
          ? JSON.parse(inbound.settings)
          : inbound.settings;
      } catch (e) {
        console.error("Failed to parse settings:", e);
      }
    }

    const remark = inbound.remark || `${node.name}-${inbound.port}`;

    switch (protocol) {
      case "vmess":
        return genVmessLink(address, port, remark, settings, streamSettings, network, security);
      case "vless":
        return genVlessLink(address, port, remark, settings, streamSettings, network, security);
      case "trojan":
        return genTrojanLink(address, port, remark, settings, streamSettings, network, security);
      case "shadowsocks":
        return genShadowsocksLink(address, port, remark, settings, streamSettings, network, security);
      default:
        return "";
    }
  } catch (error) {
    console.error("Failed to generate share link:", error);
    return "";
  }
}

/**
 * 构建传输层参数 (所有协议共用)
 * 参考 3x-ui: genVLESSLink / genTrojanLink 中的 network switch
 */
function buildTransportParams(params: URLSearchParams, streamSettings: any, network: string) {
  params.set("type", network);

  switch (network) {
    case "tcp": {
      const tcp = streamSettings.tcpSettings;
      if (tcp?.header?.type === "http") {
        params.set("headerType", "http");
        const request = tcp.header?.request;
        if (request?.path) {
          const path = Array.isArray(request.path) ? request.path.join(",") : request.path;
          if (path) params.set("path", path);
        }
        if (request?.headers) {
          // 查找Host header
          if (Array.isArray(request.headers)) {
            const hostHeader = request.headers.find((h: any) => 
              h.name?.toLowerCase() === "host"
            );
            if (hostHeader?.value) params.set("host", hostHeader.value);
          } else if (request.headers.Host) {
            const host = Array.isArray(request.headers.Host) 
              ? request.headers.Host[0] 
              : request.headers.Host;
            if (host) params.set("host", host);
          }
        }
      }
      break;
    }
    case "ws": {
      const ws = streamSettings.wsSettings;
      if (ws) {
        if (ws.path) params.set("path", ws.path);
        const host = ws.host || ws.headers?.Host || "";
        if (host) params.set("host", host);
      }
      break;
    }
    case "http":
    case "h2": {
      const http = streamSettings.httpSettings;
      if (http) {
        if (http.path) params.set("path", http.path);
        if (http.host && http.host.length > 0) {
          params.set("host", Array.isArray(http.host) ? http.host[0] : http.host);
        }
      }
      break;
    }
    case "grpc": {
      const grpc = streamSettings.grpcSettings;
      if (grpc) {
        if (grpc.serviceName) params.set("serviceName", grpc.serviceName);
        if (grpc.authority) params.set("authority", grpc.authority);
        if (grpc.multiMode) params.set("mode", "multi");
      }
      break;
    }
    case "httpupgrade": {
      const httpupgrade = streamSettings.httpupgradeSettings;
      if (httpupgrade) {
        if (httpupgrade.path) params.set("path", httpupgrade.path);
        const host = httpupgrade.host || httpupgrade.headers?.Host || "";
        if (host) params.set("host", host);
      }
      break;
    }
    case "quic": {
      const quic = streamSettings.quicSettings;
      if (quic) {
        if (quic.security) params.set("quicSecurity", quic.security);
        if (quic.key) params.set("key", quic.key);
        if (quic.header?.type) params.set("headerType", quic.header.type);
      }
      break;
    }
  }
}

/**
 * 构建安全参数 (TLS/Reality)
 * 参考 3x-ui: genVLESSLink 中的 security 处理
 */
function buildSecurityParams(params: URLSearchParams, streamSettings: any, security: string) {
  if (security === "tls") {
    params.set("security", "tls");
    const tls = streamSettings.tlsSettings;
    if (tls) {
      if (tls.fingerprint) params.set("fp", tls.fingerprint);
      if (tls.settings?.fingerprint) params.set("fp", tls.settings.fingerprint);
      if (tls.serverName) params.set("sni", tls.serverName);
      if (tls.alpn) {
        const alpn = Array.isArray(tls.alpn) ? tls.alpn.join(",") : tls.alpn;
        if (alpn) params.set("alpn", alpn);
      }
      if (tls.settings?.allowInsecure) params.set("allowInsecure", "1");
    }
  } else if (security === "reality") {
    params.set("security", "reality");
    const reality = streamSettings.realitySettings;
    if (reality) {
      // publicKey - 客户端需要的公钥
      const pbk = reality.settings?.publicKey || reality.publicKey || "";
      if (pbk) params.set("pbk", pbk);
      
      // fingerprint - 浏览器指纹
      const fp = reality.settings?.fingerprint || reality.fingerprint || "chrome";
      if (fp) params.set("fp", fp);
      
      // serverNames -> sni (取第一个)
      if (reality.serverNames) {
        const sni = Array.isArray(reality.serverNames) 
          ? reality.serverNames[0] 
          : reality.serverNames.split(",")[0];
        if (sni) params.set("sni", sni);
      }
      
      // shortIds -> sid (取第一个)
      if (reality.shortIds) {
        const sid = Array.isArray(reality.shortIds)
          ? reality.shortIds[0]
          : reality.shortIds.split(",")[0];
        if (sid) params.set("sid", sid);
      }
      
      // spiderX
      const spx = reality.settings?.spiderX || reality.spiderX || "";
      if (spx) params.set("spx", spx);
    }
  } else {
    params.set("security", "none");
  }
}

/**
 * 生成 VMess 分享链接
 * 格式: vmess://base64(JSON)
 * 参考 3x-ui: genVmessLink
 */
function genVmessLink(
  address: string, port: number, remark: string,
  settings: any, streamSettings: any, network: string, security: string
): string {
  // 获取客户端UUID - 支持多种数据结构
  const clientId = getClientId(settings, "vmess");
  
  const obj: any = {
    v: "2",
    ps: remark,
    add: address,
    port: port,
    id: clientId,
    aid: settings.alterId?.toString() || "0",
    scy: settings.security || "auto",
    net: network,
    type: "none",
    host: "",
    path: "",
    tls: security === "tls" ? "tls" : "",
  };

  // 传输层配置
  switch (network) {
    case "tcp": {
      const tcp = streamSettings.tcpSettings;
      if (tcp?.header?.type) obj.type = tcp.header.type;
      if (tcp?.header?.type === "http") {
        const request = tcp.header?.request;
        if (request?.path) {
          obj.path = Array.isArray(request.path) ? request.path.join(",") : request.path;
        }
        if (request?.headers?.Host) {
          obj.host = Array.isArray(request.headers.Host) 
            ? request.headers.Host[0] : request.headers.Host;
        }
      }
      break;
    }
    case "ws": {
      const ws = streamSettings.wsSettings;
      if (ws) {
        obj.path = ws.path || "/";
        obj.host = ws.host || ws.headers?.Host || "";
      }
      break;
    }
    case "http":
    case "h2": {
      const http = streamSettings.httpSettings;
      if (http) {
        obj.path = http.path || "/";
        if (http.host?.length > 0) {
          obj.host = Array.isArray(http.host) ? http.host[0] : http.host;
        }
      }
      break;
    }
    case "grpc": {
      const grpc = streamSettings.grpcSettings;
      if (grpc) {
        obj.path = grpc.serviceName || "";
        if (grpc.authority) obj.authority = grpc.authority;
        if (grpc.multiMode) obj.type = "multi";
      }
      break;
    }
    case "httpupgrade": {
      const httpupgrade = streamSettings.httpupgradeSettings;
      if (httpupgrade) {
        obj.path = httpupgrade.path || "/";
        obj.host = httpupgrade.host || httpupgrade.headers?.Host || "";
      }
      break;
    }
  }

  // TLS配置
  if (security === "tls") {
    const tls = streamSettings.tlsSettings;
    if (tls) {
      if (tls.serverName) obj.sni = tls.serverName;
      const fp = tls.settings?.fingerprint || tls.fingerprint || "";
      if (fp) obj.fp = fp;
      if (tls.alpn) {
        obj.alpn = Array.isArray(tls.alpn) ? tls.alpn.join(",") : tls.alpn;
      }
      if (tls.settings?.allowInsecure) obj.allowInsecure = true;
    }
  }

  return "vmess://" + btoa(JSON.stringify(obj, null, 2));
}

/**
 * 生成 VLESS 分享链接
 * 格式: vless://uuid@address:port?params#remark
 * 参考 3x-ui: genVLESSLink
 */
function genVlessLink(
  address: string, port: number, remark: string,
  settings: any, streamSettings: any, network: string, security: string
): string {
  const uuid = getClientId(settings, "vless");
  const flow = getClientFlow(settings);
  
  const params = new URLSearchParams();
  
  // 传输层参数
  buildTransportParams(params, streamSettings, network);
  
  // 安全参数
  buildSecurityParams(params, streamSettings, security);
  
  // Flow (VLESS特有，用于xtls-rprx-vision等)
  if (flow) params.set("flow", flow);

  const encodedRemark = encodeURIComponent(remark);
  return `vless://${uuid}@${address}:${port}?${params.toString()}#${encodedRemark}`;
}

/**
 * 生成 Trojan 分享链接
 * 格式: trojan://password@address:port?params#remark
 * 参考 3x-ui: genTrojanLink
 */
function genTrojanLink(
  address: string, port: number, remark: string,
  settings: any, streamSettings: any, network: string, security: string
): string {
  const password = getClientPassword(settings, "trojan");
  
  const params = new URLSearchParams();
  
  // 传输层参数
  buildTransportParams(params, streamSettings, network);
  
  // 安全参数
  buildSecurityParams(params, streamSettings, security);

  const encodedRemark = encodeURIComponent(remark);
  return `trojan://${password}@${address}:${port}?${params.toString()}#${encodedRemark}`;
}

/**
 * 生成 Shadowsocks 分享链接
 * 格式: ss://base64(method:password)@address:port#remark
 * 参考 3x-ui: genSSLink
 */
function genShadowsocksLink(
  address: string, port: number, remark: string,
  settings: any, streamSettings: any, network: string, security: string
): string {
  const method = settings.method || "aes-256-gcm";
  const password = getClientPassword(settings, "shadowsocks");
  
  // SS2022 多用户支持：服务端密码:客户端密码
  const passwords: string[] = [];
  if (settings.password) passwords.push(settings.password);
  // 如果有客户端密码且不同于服务端密码
  const clientPwd = settings.clients?.[0]?.password;
  if (clientPwd && clientPwd !== settings.password) passwords.push(clientPwd);
  
  const finalPassword = passwords.length > 0 ? passwords.join(":") : password;
  
  // 基本链接
  const userInfo = btoa(`${method}:${finalPassword}`);
  
  // 如果有传输层配置（非默认TCP），需要添加参数
  if (network !== "tcp" || security !== "none") {
    const params = new URLSearchParams();
    buildTransportParams(params, streamSettings, network);
    if (security === "tls") {
      buildSecurityParams(params, streamSettings, security);
    }
    const encodedRemark = encodeURIComponent(remark);
    return `ss://${userInfo}@${address}:${port}?${params.toString()}#${encodedRemark}`;
  }
  
  const encodedRemark = encodeURIComponent(remark);
  return `ss://${userInfo}@${address}:${port}#${encodedRemark}`;
}

/**
 * 从settings中获取客户端ID (UUID)
 * 支持多种数据结构格式
 */
function getClientId(settings: any, protocol: string): string {
  // 直接在settings顶层
  if (settings.uuid) return settings.uuid;
  if (settings.id) return settings.id;
  
  // 在clients数组中 (3x-ui格式)
  if (settings.clients?.length > 0) {
    const client = settings.clients[0];
    return client.id || client.uuid || "";
  }
  
  // 在decryption/fallbacks等嵌套结构中
  if (settings.decryption !== undefined && settings.clients) {
    return settings.clients[0]?.id || "";
  }
  
  return "00000000-0000-0000-0000-000000000000";
}

/**
 * 从settings中获取客户端Flow
 */
function getClientFlow(settings: any): string {
  if (settings.flow) return settings.flow;
  if (settings.clients?.length > 0) {
    return settings.clients[0].flow || "";
  }
  return "";
}

/**
 * 从settings中获取客户端密码
 */
function getClientPassword(settings: any, protocol: string): string {
  // 直接在settings顶层
  if (settings.password) return settings.password;
  
  // 在clients数组中
  if (settings.clients?.length > 0) {
    const client = settings.clients[0];
    return client.password || "";
  }
  
  return "password";
}

/**
 * 复制文本到剪贴板
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    // 降级方案：使用旧的API
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      return true;
    } catch (e) {
      console.error("Failed to copy to clipboard:", e);
      return false;
    }
  }
}
