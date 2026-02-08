import apiClient from "@/lib/api";

export interface Node {
  id: number;
  name: string;
  host: string;
  port: number;
  api_token: string;
  type: string; // xray, gost, both
  status: string; // online, offline, error
  cpu_usage: number;
  memory_usage: number;
  traffic_up: number;
  traffic_down: number;
  last_heartbeat: string | null;
  created_at: string;
  updated_at: string;
}

export interface NodeStats {
  node_id: number;
  name: string;
  type: string;
  status: string;
  inbound_count: number;
  traffic_up: number;
  traffic_down: number;
  cpu_usage: number;
  memory_usage: number;
}

export const nodeService = {
  // 创建节点
  create: async (data: Partial<Node>) => {
    const response = await apiClient.post("/api/v1/node", data);
    return response;
  },

  // 更新节点
  update: async (id: number, data: Partial<Node>) => {
    const response = await apiClient.put(`/api/v1/node/${id}`, data);
    return response;
  },

  // 删除节点
  delete: async (id: number) => {
    const response = await apiClient.delete(`/api/v1/node/${id}`);
    return response;
  },

  // 获取节点
  get: async (id: number) => {
    const response = await apiClient.get(`/api/v1/node/${id}`);
    return response.data as Node;
  },

  // 获取节点列表（分页）
  list: async (page: number = 1, pageSize: number = 10) => {
    const response: any = await apiClient.get("/api/v1/node/list", {
      params: { page, page_size: pageSize },
    });
    return response;
  },

  // 获取所有节点（不分页，获取足够多的节点）
  getAll: async (): Promise<Node[]> => {
    const response: any = await apiClient.get("/api/v1/node/list", {
      params: { page: 1, page_size: 100 },
    });
    const nodes = response?.data?.nodes || response?.nodes || [];
    return Array.isArray(nodes) ? nodes : [];
  },

  // 切换节点状态
  toggle: async (id: number) => {
    const response = await apiClient.post(`/api/v1/node/${id}/toggle`);
    return response;
  },

  // 同步节点配置
  sync: async (id: number) => {
    const response = await apiClient.post(`/api/v1/node/${id}/sync`);
    return response;
  },

  // 获取节点统计
  getStats: async (id: number) => {
    const response = await apiClient.get(`/api/v1/node/${id}/stats`);
    return response.data as NodeStats;
  },

  // 检查节点健康
  checkHealth: async (id: number) => {
    const response = await apiClient.get(`/api/v1/node/${id}/health`);
    return response.data;
  },

  // 批量同步节点
  batchSync: async (nodeIds: number[]) => {
    const response = await apiClient.post("/api/v1/node/batch-sync", {
      node_ids: nodeIds,
    });
    return response;
  },

  // 生成安装脚本（POST 到新路由，避免 Gin 路由冲突）
  generateInstallScript: async (params: { node_id?: number; node_type?: string }) => {
    const response = await apiClient.post("/api/v1/node-script/generate", params);
    return response;
  },
};
