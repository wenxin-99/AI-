import axios, { AxiosInstance, AxiosError } from "axios";
import { toast } from "sonner";

// API base URL - 根据环境自动选择
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:2053";

// 创建 axios 实例
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// 请求拦截器 - 添加 JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 统一错误处理
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error: AxiosError<any>) => {
    // 处理网络错误
    if (!error.response) {
      toast.error("网络连接失败,请检查网络设置");
      return Promise.reject(error);
    }

    // 处理 HTTP 错误
    const { status, data } = error.response;

    switch (status) {
      case 401:
        // 未授权 - 清除 token 并跳转到登录页
        localStorage.removeItem("token");
        window.location.href = "/login";
        toast.error("登录已过期,请重新登录");
        break;
      case 403:
        toast.error("没有权限执行此操作");
        break;
      case 404:
        toast.error("请求的资源不存在");
        break;
      case 500:
        toast.error("服务器内部错误");
        break;
      default:
        toast.error(data?.message || "请求失败,请稍后重试");
    }

    return Promise.reject(error);
  }
);

export default api;

// API 响应类型
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

// 分页响应类型
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}
