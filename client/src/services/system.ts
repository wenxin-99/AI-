import api from "@/lib/api";

export interface SystemInfo {
  hostname: string;
  platform: string;
  cpu_count: number;
  cpu_usage: number;
  memory_total: number;
  memory_used: number;
  memory_usage: number;
  disk_total: number;
  disk_used: number;
  disk_usage: number;
  uptime: number;
  xray_version: string;
  gost_version: string;
  panel_version: string;
}

export interface SystemStatus {
  xray_running: boolean;
  gost_running: boolean;
  database_connected: boolean;
  last_check: string;
}

export const systemService = {
  // 获取系统信息
  getInfo: async (): Promise<SystemInfo> => {
    const response: any = await api.get("/api/v1/system/info");
    return response?.data || response;
  },

  // 获取系统状态
  getStatus: async (): Promise<SystemStatus> => {
    const response: any = await api.get("/api/v1/system/status");
    return response?.data || response;
  },

  // 健康检查
  healthCheck: async (): Promise<{ status: string }> => {
    const response: any = await api.get("/health");
    return response?.data || response;
  },
};
