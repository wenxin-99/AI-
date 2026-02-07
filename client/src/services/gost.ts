import api from "@/lib/api";

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
  enable: boolean;
  enabled?: boolean;
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
  enable_tls?: boolean;
  certificate_id?: number;
  tls_server_name?: string;
  skip_verify?: boolean;
  enable?: boolean;
}

export interface GostStats {
  total_tunnels: number;
  active_tunnels: number;
  total_traffic: number;
  average_speed: number;
}

// 规范化隧道数据
function normalizeTunnel(tunnel: any): GostTunnel {
  return {
    ...tunnel,
    enable: tunnel.enable ?? tunnel.enabled ?? true,
    enabled: tunnel.enable ?? tunnel.enabled ?? true,
  };
}

// 辅助函数：执行写操作（创建/更新/删除）
// 后端在这些操作后会调用 Restart() 重启 Gost，可能导致请求超时
async function executeWriteOperation<T>(
  operation: () => Promise<T>,
  timeoutMs: number = 15000
): Promise<{ success: boolean; data?: T; timedOut?: boolean }> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error: any) {
    // 检查是否是超时或网络错误（后端 Restart 导致连接断开）
    if (
      error.code === 'ECONNABORTED' ||
      error.code === 'ERR_NETWORK' ||
      error.message?.includes('timeout') ||
      error.message?.includes('Network Error') ||
      error.message?.includes('aborted') ||
      !error.response
    ) {
      console.warn('Write operation may have succeeded but response timed out (backend restart)');
      return { success: true, timedOut: true };
    }
    throw error;
  }
}

export const gostService = {
  // 获取所有隧道
  getTunnels: async (): Promise<GostTunnel[]> => {
    const response: any = await api.get("/api/v1/gost/tunnels");
    const tunnels = response?.data?.tunnels || response?.tunnels || [];
    return Array.isArray(tunnels) ? tunnels.map(normalizeTunnel) : [];
  },

  // 获取单个隧道
  getTunnel: async (id: number): Promise<GostTunnel> => {
    const response: any = await api.get(`/api/v1/gost/tunnels/${id}`);
    return normalizeTunnel(response?.data || response);
  },

  // 创建隧道
  createTunnel: async (data: CreateTunnelRequest): Promise<{ timedOut?: boolean }> => {
    const result = await executeWriteOperation(
      () => api.post("/api/v1/gost/tunnels", data)
    );
    return { timedOut: result.timedOut };
  },

  // 更新隧道
  updateTunnel: async (id: number, data: CreateTunnelRequest): Promise<{ timedOut?: boolean }> => {
    const result = await executeWriteOperation(
      () => api.put(`/api/v1/gost/tunnels/${id}`, data)
    );
    return { timedOut: result.timedOut };
  },

  // 删除隧道
  deleteTunnel: async (id: number): Promise<{ timedOut?: boolean }> => {
    const result = await executeWriteOperation(
      () => api.delete(`/api/v1/gost/tunnels/${id}`)
    );
    return { timedOut: result.timedOut };
  },

  // 切换隧道状态
  toggleTunnel: async (id: number, enabled: boolean): Promise<{ timedOut?: boolean }> => {
    const result = await executeWriteOperation(
      () => api.put(`/api/v1/gost/tunnels/${id}`, { enable: enabled })
    );
    return { timedOut: result.timedOut };
  },

  // 获取 Gost 状态
  getStatus: async (): Promise<any> => {
    const response: any = await api.get("/api/v1/gost/status");
    return response?.data || response;
  },

  // 重启 Gost 服务
  restart: async (): Promise<void> => {
    await executeWriteOperation(
      () => api.post("/api/v1/gost/restart")
    );
  },
};
