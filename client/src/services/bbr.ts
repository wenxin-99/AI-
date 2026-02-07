import apiClient from "@/lib/api";

export interface SystemNetInfo {
  total_memory: number;
  avail_memory: number;
  cpu_cores: number;
  network_devices: string[];
  uptime_seconds: number;
}

export interface BBRStatus {
  enabled: boolean;
  current_algo: string;
  available_algos: string[];
  kernel_version: string;
  supports_bbr: boolean;
  tcp_parameters: Record<string, string>;
  auto_optimize: boolean;
  last_optimized: string | null;
  optimize_level: string; // none, basic, advanced, aggressive
  system_info: SystemNetInfo | null;
}

export interface InterfaceStat {
  name: string;
  rx_bytes: number;
  tx_bytes: number;
  rx_packets: number;
  tx_packets: number;
  rx_errors: number;
  tx_errors: number;
  rx_drop: number;
  tx_drop: number;
  speed: number;
}

export interface NetworkMetrics {
  bandwidth: number;
  rtt: number;
  packet_loss: number;
  congestion: number;
  connections: number;
  tcp_estab: number;
  tcp_time_wait: number;
  tcp_close_wait: number;
  rx_bytes: number;
  tx_bytes: number;
  rx_packets: number;
  tx_packets: number;
  rx_errors: number;
  tx_errors: number;
  retrans_rate: number;
  interface_stats: Record<string, InterfaceStat>;
}

export interface OptimizePreset {
  name: string;
  description: string;
  level: string;
  algorithm: string;
  qdisc: string;
  parameters: Record<string, string>;
}

export const bbrService = {
  getStatus: async () => {
    const response: any = await apiClient.get("/api/v1/bbr/status");
    return (response?.data || response) as BBRStatus;
  },

  enable: async (algorithm: string = "bbr") => {
    const response: any = await apiClient.post("/api/v1/bbr/enable", { algorithm });
    return response;
  },

  disable: async () => {
    const response: any = await apiClient.post("/api/v1/bbr/disable");
    return response;
  },

  optimizeProtocol: async (protocol: string, tunnelType?: string) => {
    const response: any = await apiClient.post("/api/v1/bbr/optimize-protocol", {
      protocol,
      tunnel_type: tunnelType,
    });
    return response;
  },

  getMetrics: async () => {
    const response: any = await apiClient.get("/api/v1/bbr/metrics");
    return (response?.data || response) as NetworkMetrics;
  },

  autoOptimize: async () => {
    const response: any = await apiClient.post("/api/v1/bbr/auto-optimize");
    return response;
  },

  getPresets: async () => {
    const response: any = await apiClient.get("/api/v1/bbr/presets");
    return (response?.data || response) as Record<string, OptimizePreset>;
  },

  applyPreset: async (preset: string) => {
    const response: any = await apiClient.post("/api/v1/bbr/apply-preset", { preset });
    return response;
  },
};
