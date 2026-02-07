import type { XrayInbound } from "@/services/xray";
import type { Node } from "@/services/node";

/**
 * 生成Xray入站的分享链接
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
  
  console.log("Generating share link:", { protocol, address, port, node, inbound });

  try {
    // 解析stream_settings获取传输层配置
    let streamSettings: any = {};
    if (inbound.stream_settings) {
      try {
        streamSettings = JSON.parse(inbound.stream_settings);
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
        settings = JSON.parse(inbound.settings);
      } catch (e) {
        console.error("Failed to parse settings:", e);
      }
    }

    console.log('Protocol:', protocol);
    console.log('Settings object:', settings);
    console.log('Stream settings object:', streamSettings);

    switch (protocol) {
      case "vmess": {
        const vmessConfig = {
          v: "2",
          ps: inbound.remark || `${node.name}-${inbound.port}`,
          add: address,
          port: port.toString(),
          id: settings.uuid || settings.id || "00000000-0000-0000-0000-000000000000",
          aid: "0",
          scy: "auto",
          net: network,
          type: streamSettings.tcp_header_type || "none",
          host: streamSettings.ws_host || streamSettings.http_host || "",
          path: streamSettings.ws_path || streamSettings.http_path || "/",
          tls: security === "tls" ? "tls" : "",
          sni: streamSettings.tls_server_name || "",
          alpn: streamSettings.tls_alpn || "",
        };
        const base64 = btoa(JSON.stringify(vmessConfig));
        return `vmess://${base64}`;
      }

      case "vless": {
        const uuid = settings.uuid || settings.id || "00000000-0000-0000-0000-000000000000";
        console.log('VLESS UUID:', uuid);
        const params = new URLSearchParams();
        params.set("type", network);
        params.set("security", security);
        
        if (network === "ws") {
          params.set("path", streamSettings.ws_path || "/");
          if (streamSettings.ws_host) params.set("host", streamSettings.ws_host);
        } else if (network === "grpc") {
          params.set("serviceName", streamSettings.grpc_service_name || "");
        } else if (network === "h2") {
          params.set("path", streamSettings.http_path || "/");
          if (streamSettings.http_host) params.set("host", streamSettings.http_host);
        }

        if (security === "tls") {
          if (streamSettings.tls_server_name) params.set("sni", streamSettings.tls_server_name);
          if (streamSettings.tls_alpn) params.set("alpn", streamSettings.tls_alpn);
        } else if (security === "reality") {
          const realitySettings = streamSettings.realitySettings || {};
          if (realitySettings.publicKey) params.set("pbk", realitySettings.publicKey);
          if (realitySettings.fingerprint) params.set("fp", realitySettings.fingerprint);
          if (realitySettings.serverNames && realitySettings.serverNames.length > 0) {
            params.set("sni", realitySettings.serverNames[0]);
          }
          if (realitySettings.shortIds && realitySettings.shortIds.length > 0) {
            params.set("sid", realitySettings.shortIds[0]);
          }
          if (realitySettings.spiderX) params.set("spx", realitySettings.spiderX);
        }

        const remark = encodeURIComponent(inbound.remark || `${node.name}-${inbound.port}`);
        const link = `vless://${uuid}@${address}:${port}?${params.toString()}#${remark}`;
        console.log('Generated VLESS link:', link);
        return link;
      }

      case "trojan": {
        const password = settings.password || "password";
        const params = new URLSearchParams();
        params.set("type", network);
        params.set("security", security);

        if (network === "ws") {
          params.set("path", streamSettings.ws_path || "/");
          if (streamSettings.ws_host) params.set("host", streamSettings.ws_host);
        } else if (network === "grpc") {
          params.set("serviceName", streamSettings.grpc_service_name || "");
        }

        if (security === "tls") {
          if (streamSettings.tls_server_name) params.set("sni", streamSettings.tls_server_name);
          if (streamSettings.tls_alpn) params.set("alpn", streamSettings.tls_alpn);
        } else if (security === "reality") {
          const realitySettings = streamSettings.realitySettings || {};
          if (realitySettings.publicKey) params.set("pbk", realitySettings.publicKey);
          if (realitySettings.fingerprint) params.set("fp", realitySettings.fingerprint);
          if (realitySettings.serverNames && realitySettings.serverNames.length > 0) {
            params.set("sni", realitySettings.serverNames[0]);
          }
          if (realitySettings.shortIds && realitySettings.shortIds.length > 0) {
            params.set("sid", realitySettings.shortIds[0]);
          }
          if (realitySettings.spiderX) params.set("spx", realitySettings.spiderX);
        }

        const remark = encodeURIComponent(inbound.remark || `${node.name}-${inbound.port}`);
        return `trojan://${password}@${address}:${port}?${params.toString()}#${remark}`;
      }

      case "shadowsocks": {
        const method = settings.method || "aes-256-gcm";
        const password = settings.password || "password";
        const userInfo = `${method}:${password}`;
        const base64 = btoa(userInfo);
        const remark = encodeURIComponent(inbound.remark || `${node.name}-${inbound.port}`);
        return `ss://${base64}@${address}:${port}#${remark}`;
      }

      default:
        return "";
    }
  } catch (error) {
    console.error("Failed to generate share link:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack');
    return "";
  }
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
