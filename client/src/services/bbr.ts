import apiClient from "@/lib/api";

export interface BBRStatus {
  enabled: boolean;
  current_algo: string;
  available_algos: string[];
  kernel_version: string;
  supports_bbr: boolean;
  tcp_parameters: Record<string, string>;
  auto_optimize: boolean;
  last_optimized: string | null;
}

export interface NetworkMetrics {
  bandwidth: number;    // Mbps
  rtt: number;          // ms
  packet_loss: number;  // %
  congestion: number;   // %
  connections: number;
}

export const bbrService = {
  // 获取BBR状态
  getStatus: async () => {
    const response: any = await apiClient.get("/api/v1/bbr/status");
    return (response?.data || response) as BBRStatus;
  },

  // 启用BBR
  enable: async (algorithm: string = "bbr") => {
    const response: any = await apiClient.post("/api/v1/bbr/enable", { algorithm });
    return response;
  },

  // 禁用BBR
  disable: async () => {
    const response: any = await apiClient.post("/api/v1/bbr/disable");
    return response;
  },

  // 优化协议
  optimizeProtocol: async (protocol: string, tunnelType?: string) => {
    const response: any = await apiClient.post("/api/v1/bbr/optimize-protocol", {
      protocol,
      tunnel_type: tunnelType,
    });
    return response;
  },

  // 获取网络指标
  getMetrics: async () => {
    const response: any = await apiClient.get("/api/v1/bbr/metrics");
    return (response?.data || response) as NetworkMetrics;
  },

  // 自动优化
  autoOptimize: async () => {
    const response: any = await apiClient.post("/api/v1/bbr/auto-optimize");
    return response;
  },
};
