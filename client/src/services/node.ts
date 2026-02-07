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

export interface InstallScriptResponse {
  api_token: string;
  node_type: string;
  node_name: string;
  panel_url: string;
  script: string;
  one_liner: string;
}

// Backend routes use /api/v1/node/ (singular)
const BASE = "/api/v1/node";

export const nodeService = {
  // 创建节点
  create: async (data: Partial<Node>) => {
    const response = await apiClient.post(BASE, data);
    return response;
  },

  // 更新节点
  update: async (id: number, data: Partial<Node>) => {
    const response = await apiClient.put(`${BASE}/${id}`, data);
    return response;
  },

  // 删除节点
  delete: async (id: number) => {
    const response = await apiClient.delete(`${BASE}/${id}`);
    return response;
  },

  // 获取节点
  get: async (id: number) => {
    const response = await apiClient.get(`${BASE}/${id}`);
    return response.data as Node;
  },

  // 获取节点列表（分页）
  list: async (page: number = 1, pageSize: number = 10) => {
    const response: any = await apiClient.get(`${BASE}/list`, {
      params: { page, page_size: pageSize },
    });
    return response;
  },

  // 获取所有节点（不分页）
  getAll: async (): Promise<Node[]> => {
    const response: any = await apiClient.get(`${BASE}/list`, {
      params: { page: 1, page_size: 100 },
    });
    const nodes = response?.data?.nodes || response?.nodes || [];
    return Array.isArray(nodes) ? nodes : [];
  },

  // 切换节点状态
  toggle: async (id: number) => {
    const response = await apiClient.post(`${BASE}/${id}/toggle`);
    return response;
  },

  // 同步节点配置
  sync: async (id: number) => {
    const response = await apiClient.post(`${BASE}/${id}/sync`);
    return response;
  },

  // 获取节点统计
  getStats: async (id: number) => {
    const response = await apiClient.get(`${BASE}/${id}/stats`);
    return response.data as NodeStats;
  },

  // 检查节点健康
  checkHealth: async (id: number) => {
    const response = await apiClient.get(`${BASE}/${id}/health`);
    return response.data;
  },

  // 批量同步节点
  batchSync: async (nodeIds: number[]) => {
    const response = await apiClient.post(`${BASE}/batch-sync`, {
      node_ids: nodeIds,
    });
    return response;
  },

  // 生成安装脚本
  generateInstallScript: async (nodeName: string, nodeType: string): Promise<InstallScriptResponse> => {
    const response: any = await apiClient.post(`${BASE}/install-script`, {
      node_name: nodeName,
      node_type: nodeType,
    });
    return response?.data || response;
  },

  // 生成 API Token
  generateToken: async (): Promise<string> => {
    const response: any = await apiClient.get(`${BASE}/generate-token`);
    return response?.data?.api_token || response?.api_token || "";
  },
};
