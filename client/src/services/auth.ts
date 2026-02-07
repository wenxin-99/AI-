import api, { ApiResponse } from "@/lib/api";

export interface LoginRequest {
  username: string;
  password: string;
  two_factor_code?: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
    is_admin: boolean;
  };
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  traffic_limit: number;
  traffic_used: number;
  expire_time: string;
  two_factor_enabled: boolean;
}

export interface Enable2FAResponse {
  secret: string;
  qr_code: string;
}

export const authService = {
  // 用户登录
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post<any, ApiResponse<LoginResponse>>(
      "/api/v1/auth/login",
      data
    );
    return response.data;
  },

  // 用户登出
  logout: async (): Promise<void> => {
    await api.post("/api/v1/auth/logout");
    localStorage.removeItem("token");
  },

  // 刷新令牌
  refreshToken: async (): Promise<{ token: string }> => {
    const response = await api.post<any, ApiResponse<{ token: string }>>(
      "/api/v1/auth/refresh"
    );
    return response.data;
  },

  // 获取用户信息
  getProfile: async (): Promise<UserProfile> => {
    const response = await api.get<any, ApiResponse<UserProfile>>(
      "/api/v1/auth/profile"
    );
    return response.data;
  },

  // 启用双因素认证
  enable2FA: async (): Promise<Enable2FAResponse> => {
    const response = await api.post<any, ApiResponse<Enable2FAResponse>>(
      "/api/v1/auth/2fa/enable"
    );
    return response.data;
  },

  // 验证双因素认证
  verify2FA: async (code: string): Promise<void> => {
    await api.post("/api/v1/auth/2fa/verify", { code });
  },

  // 禁用双因素认证
  disable2FA: async (code: string): Promise<void> => {
    await api.post("/api/v1/auth/2fa/disable", { code });
  },
};
