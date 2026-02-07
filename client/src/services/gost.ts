import api, { ApiResponse } from "@/lib/api";

export interface GostTunnel {
  id: number;
  name: string;
  protocol: string;
  local_port: number;
  remote_addr: string;
  username: string;
  password: string;
  speed_limit_upload: number;
  speed_limit_download: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTunnelRequest {
  name: string;
  protocol: string;
  local_port: number;
  remote_addr: string;
  username?: string;
  password?: string;
  speed_limit_upload?: number;
  speed_limit_download?: number;
}

export interface GostStats {
  total_tunnels: number;
  active_tunnels: number;
  total_traffic: number;
  average_speed: number;
}

export const gostService = {
  // 获取所有隧道
  getTunnels: async (): Promise<GostTunnel[]> => {
    const response = await api.get<any, ApiResponse<GostTunnel[]>>(
      "/api/v1/gost/tunnels"
    );
    return response.data;
  },

  // 获取单个隧道
  getTunnel: async (id: number): Promise<GostTunnel> => {
    const response = await api.get<any, ApiResponse<GostTunnel>>(
      `/api/v1/gost/tunnels/${id}`
    );
    return response.data;
  },

  // 创建隧道
  createTunnel: async (data: CreateTunnelRequest): Promise<GostTunnel> => {
    const response = await api.post<any, ApiResponse<GostTunnel>>(
      "/api/v1/gost/tunnels",
      data
    );
    return response.data;
  },

  // 更新隧道
  updateTunnel: async (id: number, data: Partial<CreateTunnelRequest>): Promise<GostTunnel> => {
    const response = await api.put<any, ApiResponse<GostTunnel>>(
      `/api/v1/gost/tunnels/${id}`,
      data
    );
    return response.data;
  },

  // 删除隧道
  deleteTunnel: async (id: number): Promise<void> => {
    await api.delete(`/api/v1/gost/tunnels/${id}`);
  },

  // 启用/禁用隧道
  toggleTunnel: async (id: number, enabled: boolean): Promise<void> => {
    await api.post(`/api/v1/gost/tunnels/${id}/toggle`, { enabled });
  },

  // 获取统计信息
  getStats: async (): Promise<GostStats> => {
    const response = await api.get<any, ApiResponse<GostStats>>(
      "/api/v1/gost/stats"
    );
    return response.data;
  },

  // 重启 Gost 服务
  restart: async (): Promise<void> => {
    await api.post("/api/v1/gost/restart");
  },
};
