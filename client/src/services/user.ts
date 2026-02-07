import api from "@/lib/api";

export interface User {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  enabled: boolean;
  role: string;
  status: string;
  traffic_limit: number;
  traffic_used: number;
  expire_time: string | null;
  two_factor_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserListResponse {
  users: User[];
  total: number;
  page: number;
  page_size: number;
}

export interface UserStats {
  total_users: number;
  active_users: number;
  disabled_users: number;
  expired_users: number;
  today_new: number;
  total_traffic_used: number;
  total_traffic_limit: number;
}

export interface TopUser {
  id: number;
  username: string;
  traffic_used: number;
  traffic_limit: number;
  percentage: number;
  status: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  email?: string;
  role?: string;
  traffic_limit?: number;
  expire_time?: string;
}

export interface UpdateUserRequest {
  email?: string;
  password?: string;
  role?: string;
  status?: string;
  enabled?: boolean;
  traffic_limit?: number;
  expire_time?: string;
}

export const userService = {
  // 获取用户列表
  getUsers: async (params: {
    page?: number;
    page_size?: number;
    search?: string;
    status?: string;
    role?: string;
    sort_by?: string;
    sort_order?: string;
  }): Promise<UserListResponse> => {
    const response: any = await api.get("/api/v1/users", { params });
    return response?.data || response;
  },

  // 获取用户详情
  getUser: async (id: number): Promise<User> => {
    const response: any = await api.get(`/api/v1/users/${id}`);
    return response?.data || response;
  },

  // 创建用户
  createUser: async (data: CreateUserRequest): Promise<User> => {
    const response: any = await api.post("/api/v1/users", data);
    return response?.data || response;
  },

  // 更新用户
  updateUser: async (id: number, data: UpdateUserRequest): Promise<User> => {
    const response: any = await api.put(`/api/v1/users/${id}`, data);
    return response?.data || response;
  },

  // 删除用户
  deleteUser: async (id: number): Promise<void> => {
    await api.delete(`/api/v1/users/${id}`);
  },

  // 切换用户启用/禁用
  toggleUser: async (id: number): Promise<User> => {
    const response: any = await api.put(`/api/v1/users/${id}/toggle`);
    return response?.data || response;
  },

  // 获取用户流量
  getUserTraffic: async (id: number): Promise<any> => {
    const response: any = await api.get(`/api/v1/users/${id}/traffic`);
    return response?.data || response;
  },

  // 重置用户流量
  resetTraffic: async (id: number): Promise<void> => {
    await api.post(`/api/v1/users/${id}/reset`);
  },

  // 获取用户统计
  getStats: async (): Promise<UserStats> => {
    const response: any = await api.get("/api/v1/users/stats");
    return response?.data || response;
  },

  // 获取TOP用户
  getTopUsers: async (limit: number = 10): Promise<TopUser[]> => {
    const response: any = await api.get("/api/v1/users/top", {
      params: { limit },
    });
    const data = response?.data || response;
    return Array.isArray(data) ? data : [];
  },

  // 批量删除
  batchDelete: async (ids: number[]): Promise<void> => {
    await api.post("/api/v1/users/batch-delete", { ids });
  },

  // 批量重置流量
  batchResetTraffic: async (ids: number[]): Promise<void> => {
    await api.post("/api/v1/users/batch-reset", { ids });
  },
};
