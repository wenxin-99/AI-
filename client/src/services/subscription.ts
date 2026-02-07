import apiClient from "@/lib/api";

export interface Subscription {
  id: number;
  user_id: number;
  token: string;
  format: string; // v2ray, clash, surge
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionLink {
  token: string;
  url: string;
  qrcode: string;
}

export const subscriptionService = {
  // 生成订阅
  generate: async (userId: number, format: string) => {
    const response = await apiClient.get("/subscription/generate", {
      params: { user_id: userId, format },
    });
    return response.data.data;
  },

  // 获取订阅链接
  getLink: async (userId: number, format: string) => {
    const response = await apiClient.get("/subscription/link", {
      params: { user_id: userId, format },
    });
    return response.data.data as SubscriptionLink;
  },

  // 获取订阅列表
  list: async (userId?: number) => {
    const response = await apiClient.get("/subscription/list", {
      params: userId ? { user_id: userId } : {},
    });
    return response.data.data as Subscription[];
  },

  // 切换订阅状态
  toggle: async (id: number) => {
    const response = await apiClient.post(`/subscription/${id}/toggle`);
    return response.data;
  },

  // 删除订阅
  delete: async (id: number) => {
    const response = await apiClient.delete(`/subscription/${id}`);
    return response.data;
  },
};
