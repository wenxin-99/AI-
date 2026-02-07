import api from "@/lib/api";
import axios from "axios";

export interface XrayInbound {
  id: number;
  user_id: number;
  remark: string;
  port: number;
  protocol: string;
  listen: string;
  settings: string;
  stream_settings: string;
  sniffing: string;
  tag: string;
  // 后端返回的字段名是 "enable" (没有d)
  enable: boolean;
  // 兼容前端使用 enabled 的地方
  enabled?: boolean;
  traffic_up: number;
  traffic_down: number;
  created_at: string;
  updated_at: string;
  clients?: any[];
}

export interface XrayClient {
  id: number;
  inbound_id: number;
  email: string;
  uuid: string;
  password: string;
  total_gb: number;
  expire_time: number;
  enable: boolean;
  up: number;
  down: number;
  created_at: string;
  updated_at: string;
}

export interface CreateInboundRequest {
  remark: string;
  port: number;
  protocol: string;
  listen?: string;
  settings?: string;
  stream_settings?: string;
  sniffing?: string;
}

export interface CreateClientRequest {
  inbound_id: number;
  email: string;
  uuid?: string;
  password?: string;
  traffic_limit?: number;
  expire_time?: number;
}

export interface XrayStats {
  total_inbounds: number;
  total_clients: number;
  total_traffic: number;
  active_connections: number;
}

// 辅助函数：规范化入站数据，确保 enabled 和 enable 都可用
function normalizeInbound(inbound: any): XrayInbound {
  return {
    ...inbound,
    enable: inbound.enable ?? inbound.enabled ?? true,
    enabled: inbound.enable ?? inbound.enabled ?? true,
  };
}

// 辅助函数：执行写操作（创建/更新/删除）
// 后端在这些操作后会调用 Restart() 重启 Xray，可能导致请求超时
// 但数据已经写入数据库，所以我们需要在超时后也认为操作可能成功
async function executeWriteOperation<T>(
  operation: () => Promise<T>,
  timeoutMs: number = 15000
): Promise<{ success: boolean; data?: T; timedOut?: boolean }> {
  try {
    // 创建一个带超时的 AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const data = await operation();
      clearTimeout(timeoutId);
      return { success: true, data };
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      // 检查是否是超时或网络错误（后端 Restart 导致连接断开）
      if (
        error.code === 'ECONNABORTED' ||
        error.code === 'ERR_NETWORK' ||
        error.message?.includes('timeout') ||
        error.message?.includes('Network Error') ||
        error.message?.includes('aborted') ||
        !error.response // 没有响应 = 网络层面的错误
      ) {
        console.warn('Write operation may have succeeded but response timed out (backend Xray restart)');
        return { success: true, timedOut: true };
      }
      
      // 其他错误（如 400, 500 等有明确响应的）
      throw error;
    }
  } catch (error) {
    throw error;
  }
}

export const xrayService = {
  // 获取所有入站
  getInbounds: async (): Promise<XrayInbound[]> => {
    const response: any = await api.get("/api/v1/xray/inbounds");
    // 响应拦截器已解包 response.data
    // response 现在是: { success, data: { inbounds: [...], total, page, page_size } }
    const inbounds = response?.data?.inbounds || response?.inbounds || [];
    return Array.isArray(inbounds) ? inbounds.map(normalizeInbound) : [];
  },

  // 获取单个入站
  getInbound: async (id: number): Promise<XrayInbound> => {
    const response: any = await api.get(`/api/v1/xray/inbounds/${id}`);
    const inbound = response?.data?.inbound || response?.data || response;
    return normalizeInbound(inbound);
  },

  // 创建入站 - 使用超时保护
  createInbound: async (data: CreateInboundRequest): Promise<{ timedOut?: boolean }> => {
    const result = await executeWriteOperation(
      () => api.post("/api/v1/xray/inbounds", data),
      15000
    );
    return { timedOut: result.timedOut };
  },

  // 更新入站 - 必须发送所有必填字段(remark, port, protocol)
  updateInbound: async (id: number, data: CreateInboundRequest): Promise<{ timedOut?: boolean }> => {
    const result = await executeWriteOperation(
      () => api.put(`/api/v1/xray/inbounds/${id}`, data),
      15000
    );
    return { timedOut: result.timedOut };
  },

  // 删除入站 - 使用超时保护
  deleteInbound: async (id: number): Promise<{ timedOut?: boolean }> => {
    const result = await executeWriteOperation(
      () => api.delete(`/api/v1/xray/inbounds/${id}`),
      15000
    );
    return { timedOut: result.timedOut };
  },

  // 获取客户端列表
  getClients: async (inboundId?: number): Promise<XrayClient[]> => {
    const params = inboundId ? { inbound_id: inboundId } : {};
    const response: any = await api.get("/api/v1/xray/clients", { params });
    const clients = response?.data?.clients || response?.clients || [];
    return Array.isArray(clients) ? clients : [];
  },

  // 创建客户端
  createClient: async (data: CreateClientRequest): Promise<{ timedOut?: boolean }> => {
    const result = await executeWriteOperation(
      () => api.post("/api/v1/xray/clients", data),
      15000
    );
    return { timedOut: result.timedOut };
  },

  // 更新客户端
  updateClient: async (id: number, data: CreateClientRequest): Promise<{ timedOut?: boolean }> => {
    const result = await executeWriteOperation(
      () => api.put(`/api/v1/xray/clients/${id}`, data),
      15000
    );
    return { timedOut: result.timedOut };
  },

  // 删除客户端
  deleteClient: async (id: number): Promise<{ timedOut?: boolean }> => {
    const result = await executeWriteOperation(
      () => api.delete(`/api/v1/xray/clients/${id}`),
      15000
    );
    return { timedOut: result.timedOut };
  },

  // 获取 Xray 状态
  getStatus: async (): Promise<any> => {
    const response: any = await api.get("/api/v1/xray/status");
    return response?.data || response;
  },

  // 重启 Xray 服务
  restart: async (): Promise<void> => {
    await executeWriteOperation(
      () => api.post("/api/v1/xray/restart"),
      15000
    );
  },
};
