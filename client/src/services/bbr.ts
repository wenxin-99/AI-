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
    const response = await apiClient.get("/bbr/status");
    return response.data.data as BBRStatus;
  },

  // 启用BBR
  enable: async (algorithm: string = "bbr") => {
    const response = await apiClient.post("/bbr/enable", { algorithm });
    return response.data;
  },

  // 禁用BBR
  disable: async () => {
    const response = await apiClient.post("/bbr/disable");
    return response.data;
  },

  // 优化协议
  optimizeProtocol: async (protocol: string, tunnelType?: string) => {
    const response = await apiClient.post("/bbr/optimize-protocol", {
      protocol,
      tunnel_type: tunnelType,
    });
    return response.data;
  },

  // 获取网络指标
  getMetrics: async () => {
    const response = await apiClient.get("/bbr/metrics");
    return response.data.data as NetworkMetrics;
  },

  // 自动优化
  autoOptimize: async () => {
    const response = await apiClient.post("/bbr/auto-optimize");
    return response.data;
  },
};
