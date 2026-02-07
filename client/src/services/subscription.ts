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
    const response: any = await apiClient.get("/api/v1/subscription/generate", {
      params: { user_id: userId, format },
    });
    return response?.data || response;
  },

  // 获取订阅链接
  getLink: async (userId: number, format: string) => {
    const response: any = await apiClient.get("/api/v1/subscription/link", {
      params: { user_id: userId, format },
    });
    return (response?.data || response) as SubscriptionLink;
  },

  // 获取订阅列表
  list: async (userId?: number) => {
    const response: any = await apiClient.get("/api/v1/subscription/list", {
      params: userId ? { user_id: userId } : {},
    });
    const data = response?.data || response;
    return Array.isArray(data) ? data : (data?.subscriptions || []) as Subscription[];
  },

  // 切换订阅状态
  toggle: async (id: number) => {
    const response: any = await apiClient.post(`/api/v1/subscription/${id}/toggle`);
    return response;
  },

  // 删除订阅
  delete: async (id: number) => {
    const response: any = await apiClient.delete(`/api/v1/subscription/${id}`);
    return response;
  },
};
