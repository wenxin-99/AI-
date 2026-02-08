import api from "@/lib/api";

// ============ 类型定义 ============

export interface GostForward {
  id: number;
  tunnel_id: number;
  name: string;
  in_port: number;
  out_port: number;
  remote_addr: string;
  enable: boolean;
  remark: string;
  traffic_up: number;
  traffic_down: number;
  created_at: string;
  updated_at: string;
}

export interface GostTunnel {
  id: number;
  name: string;
  in_node_id: number;
  out_node_id: number;
  type: number; // 1=直连, 2=隧道
  protocol: string; // tcp, tls, ws, wss, quic
  enable: boolean;
  remark: string;
  forwards: GostForward[];
  created_at: string;
  updated_at: string;
}

export interface CreateTunnelRequest {
  name: string;
  in_node_id: number;
  out_node_id: number;
  type: number;
  protocol: string;
  remark?: string;
}

export interface CreateForwardRequest {
  tunnel_id: number;
  name: string;
  in_port: number;
  out_port: number;
  remote_addr: string;
  remark?: string;
}

// ============ 服务 ============

export const gostService = {
  // 获取隧道列表
  getTunnels: async (page = 1, pageSize = 50): Promise<{ tunnels: GostTunnel[]; total: number }> => {
    const response: any = await api.get("/api/v1/gost/tunnels", {
      params: { page, page_size: pageSize },
    });
    const data = response?.data || response;
    return {
      tunnels: Array.isArray(data?.tunnels) ? data.tunnels : [],
      total: data?.total || 0,
    };
  },

  // 获取单个隧道
  getTunnel: async (id: number): Promise<GostTunnel> => {
    const response: any = await api.get(`/api/v1/gost/tunnels/${id}`);
    return response?.data || response;
  },

  // 创建隧道
  createTunnel: async (data: CreateTunnelRequest): Promise<GostTunnel> => {
    const response: any = await api.post("/api/v1/gost/tunnels", data);
    return response?.data || response;
  },

  // 更新隧道
  updateTunnel: async (id: number, data: CreateTunnelRequest): Promise<GostTunnel> => {
    const response: any = await api.put(`/api/v1/gost/tunnels/${id}`, data);
    return response?.data || response;
  },

  // 删除隧道
  deleteTunnel: async (id: number): Promise<void> => {
    await api.delete(`/api/v1/gost/tunnels/${id}`);
  },

  // 切换隧道状态
  toggleTunnel: async (id: number): Promise<GostTunnel> => {
    const response: any = await api.post(`/api/v1/gost/tunnels/${id}/toggle`);
    return response?.data || response;
  },

  // 获取转发规则列表
  getForwards: async (tunnelId: number): Promise<GostForward[]> => {
    const response: any = await api.get(`/api/v1/gost/tunnels/${tunnelId}/forwards`);
    const data = response?.data || response;
    return Array.isArray(data) ? data : [];
  },

  // 创建转发规则
  createForward: async (data: CreateForwardRequest): Promise<GostForward> => {
    const response: any = await api.post("/api/v1/gost/forwards", data);
    return response?.data || response;
  },

  // 更新转发规则
  updateForward: async (id: number, data: CreateForwardRequest): Promise<GostForward> => {
    const response: any = await api.put(`/api/v1/gost/forwards/${id}`, data);
    return response?.data || response;
  },

  // 删除转发规则
  deleteForward: async (id: number): Promise<void> => {
    await api.delete(`/api/v1/gost/forwards/${id}`);
  },

  // 切换转发规则状态
  toggleForward: async (id: number): Promise<GostForward> => {
    const response: any = await api.post(`/api/v1/gost/forwards/${id}/toggle`);
    return response?.data || response;
  },

  // 预览节点 Gost 配置
  previewConfig: async (nodeId: number): Promise<string> => {
    const response: any = await api.get(`/api/v1/gost/config/preview/${nodeId}`);
    return response?.data || response || "";
  },
};
