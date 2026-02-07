import api, { ApiResponse, PaginatedResponse } from "@/lib/api";

export interface XrayInbound {
  id: number;
  remark: string;
  port: number;
  protocol: string;
  listen: string;
  settings: any;
  stream_settings: any;
  sniffing: any;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface XrayClient {
  id: number;
  inbound_id: number;
  email: string;
  uuid: string;
  password: string;
  traffic_limit: number;
  traffic_used: number;
  expire_time: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateInboundRequest {
  remark: string;
  port: number;
  protocol: string;
  listen?: string;
  settings?: any;
  stream_settings?: any;
  sniffing?: any;
}

export interface CreateClientRequest {
  inbound_id: number;
  email: string;
  uuid?: string;
  password?: string;
  traffic_limit?: number;
  expire_time?: string;
}

export interface XrayStats {
  total_inbounds: number;
  total_clients: number;
  total_traffic: number;
  active_connections: number;
}

export const xrayService = {
  // 获取所有入站
  getInbounds: async (): Promise<XrayInbound[]> => {
    const response = await api.get<any, ApiResponse<XrayInbound[]>>(
      "/api/v1/xray/inbounds"
    );
    return response.data;
  },

  // 获取单个入站
  getInbound: async (id: number): Promise<XrayInbound> => {
    const response = await api.get<any, ApiResponse<XrayInbound>>(
      `/api/v1/xray/inbounds/${id}`
    );
    return response.data;
  },

  // 创建入站
  createInbound: async (data: CreateInboundRequest): Promise<XrayInbound> => {
    const response = await api.post<any, ApiResponse<XrayInbound>>(
      "/api/v1/xray/inbounds",
      data
    );
    return response.data;
  },

  // 更新入站
  updateInbound: async (id: number, data: Partial<CreateInboundRequest>): Promise<XrayInbound> => {
    const response = await api.put<any, ApiResponse<XrayInbound>>(
      `/api/v1/xray/inbounds/${id}`,
      data
    );
    return response.data;
  },

  // 删除入站
  deleteInbound: async (id: number): Promise<void> => {
    await api.delete(`/api/v1/xray/inbounds/${id}`);
  },

  // 启用/禁用入站
  toggleInbound: async (id: number, enabled: boolean): Promise<void> => {
    await api.post(`/api/v1/xray/inbounds/${id}/toggle`, { enabled });
  },

  // 获取入站的客户端列表
  getClients: async (inboundId: number): Promise<XrayClient[]> => {
    const response = await api.get<any, ApiResponse<XrayClient[]>>(
      `/api/v1/xray/inbounds/${inboundId}/clients`
    );
    return response.data;
  },

  // 创建客户端
  createClient: async (data: CreateClientRequest): Promise<XrayClient> => {
    const response = await api.post<any, ApiResponse<XrayClient>>(
      "/api/v1/xray/clients",
      data
    );
    return response.data;
  },

  // 更新客户端
  updateClient: async (id: number, data: Partial<CreateClientRequest>): Promise<XrayClient> => {
    const response = await api.put<any, ApiResponse<XrayClient>>(
      `/api/v1/xray/clients/${id}`,
      data
    );
    return response.data;
  },

  // 删除客户端
  deleteClient: async (id: number): Promise<void> => {
    await api.delete(`/api/v1/xray/clients/${id}`);
  },

  // 重置客户端流量
  resetClientTraffic: async (id: number): Promise<void> => {
    await api.post(`/api/v1/xray/clients/${id}/reset-traffic`);
  },

  // 获取统计信息
  getStats: async (): Promise<XrayStats> => {
    const response = await api.get<any, ApiResponse<XrayStats>>(
      "/api/v1/xray/stats"
    );
    return response.data;
  },

  // 重启 Xray 服务
  restart: async (): Promise<void> => {
    await api.post("/api/v1/xray/restart");
  },
};
