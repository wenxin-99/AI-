import api from "@/lib/api";

export interface TrafficStats {
  upload: number;
  download: number;
  total: number;
}

export interface UserTrafficStats extends TrafficStats {
  user_id: number;
  username: string;
  traffic_limit: number;
  percentage: number;
}

export interface InboundTrafficStats extends TrafficStats {
  inbound: string;
  protocol: string;
}

export interface SystemTrafficStats extends TrafficStats {
  total_users: number;
  active_users: number;
  total_inbounds: number;
}

export interface TrafficTrend {
  date: string;
  upload: number;
  download: number;
  total: number;
}

export const trafficService = {
  // 获取用户流量统计
  getUserTraffic: async (userId: number): Promise<UserTrafficStats> => {
    const response: any = await api.get(`/api/v1/traffic/user/${userId}`);
    return response?.data || response;
  },

  // 获取入站流量统计
  getInboundTraffic: async (inbound: string): Promise<InboundTrafficStats> => {
    const response: any = await api.get(`/api/v1/traffic/inbound/${inbound}`);
    return response?.data || response;
  },

  // 获取系统总流量统计
  getSystemTraffic: async (): Promise<SystemTrafficStats> => {
    const response: any = await api.get("/api/v1/traffic/system");
    return response?.data || response;
  },

  // 获取流量趋势
  getTrafficTrend: async (days: number = 7): Promise<TrafficTrend[]> => {
    const response: any = await api.get("/api/v1/traffic/trend", {
      params: { days },
    });
    const data = response?.data || response;
    return Array.isArray(data) ? data : [];
  },

  // 重置用户流量
  resetUserTraffic: async (userId: number): Promise<void> => {
    await api.post(`/api/v1/traffic/reset/${userId}`);
  },

  // 重置所有用户流量
  resetAllTraffic: async (): Promise<void> => {
    await api.post("/api/v1/traffic/reset-all");
  },

  // 清理旧流量日志
  cleanOldLogs: async (days: number = 30): Promise<void> => {
    await api.delete("/api/v1/traffic/clean", {
      params: { days },
    });
  },
};
