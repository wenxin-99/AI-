import api, { ApiResponse } from "@/lib/api";

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
    const response = await api.get<any, ApiResponse<SystemInfo>>(
      "/api/v1/system/info"
    );
    return response.data;
  },

  // 获取系统状态
  getStatus: async (): Promise<SystemStatus> => {
    const response = await api.get<any, ApiResponse<SystemStatus>>(
      "/api/v1/system/status"
    );
    return response.data;
  },

  // 健康检查
  healthCheck: async (): Promise<{ status: string }> => {
    const response = await api.get<any, ApiResponse<{ status: string }>>(
      "/api/v1/system/health"
    );
    return response.data;
  },
};
