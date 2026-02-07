import api from "@/lib/api";

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
    role: string;
    is_admin: boolean;
  };
}

export interface UserProfile {
  id: number;
  username: string;
  email: string;
  role: string;
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
    const response: any = await api.post("/api/v1/auth/login", data);
    // 响应拦截器已解包，response 是: { success, data: { token, user }, message }
    return response?.data || response;
  },

  // 用户登出
  logout: async (): Promise<void> => {
    try {
      await api.post("/api/v1/auth/logout");
    } catch (e) {
      // 忽略登出错误
    }
    localStorage.removeItem("token");
  },

  // 刷新令牌
  refreshToken: async (): Promise<{ token: string }> => {
    const response: any = await api.post("/api/v1/auth/refresh");
    return response?.data || response;
  },

  // 获取用户信息
  getProfile: async (): Promise<UserProfile> => {
    const response: any = await api.get("/api/v1/auth/profile");
    return response?.data || response;
  },

  // 启用双因素认证
  enable2FA: async (): Promise<Enable2FAResponse> => {
    const response: any = await api.post("/api/v1/auth/2fa/enable");
    return response?.data || response;
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
