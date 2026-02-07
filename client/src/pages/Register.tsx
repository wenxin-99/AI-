/**
 * Design Philosophy: Gradient Fluid
 * - Deep purple to blue gradient background
 * - Frosted glass effect cards
 * - Smooth animations and micro-interactions
 */

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authService } from "@/services";
import { ArrowLeft, Mail, Network, User } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

export default function Register() {
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 验证密码
    if (formData.password !== formData.confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("密码长度至少为6位");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("http://localhost:2053/api/v1/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("注册成功!请登录");
        setTimeout(() => {
          setLocation("/login");
        }, 1500);
      } else {
        toast.error(data.message || "注册失败");
      }
    } catch (error) {
      console.error("注册错误:", error);
      toast.error("注册失败,请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-blue-900 to-purple-800 p-4">
      {/* 返回按钮 */}
      <Link href="/">
        <Button
          variant="ghost"
          className="absolute top-4 left-4 text-white/80 hover:text-white hover:bg-white/10"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回首页
        </Button>
      </Link>

      <Card className="w-full max-w-md p-8 bg-white/10 backdrop-blur-xl border-white/20 shadow-2xl">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-500 flex items-center justify-center shadow-lg">
            <Network className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
            创建账户
          </h1>
          <p className="text-white/60">加入 UniProxy Panel</p>
        </div>

        {/* 注册表单 */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 用户名 */}
          <div className="space-y-2">
            <Label htmlFor="username" className="text-white/90">
              用户名
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                id="username"
                name="username"
                type="text"
                placeholder="请输入用户名"
                value={formData.username}
                onChange={handleChange}
                required
                minLength={3}
                maxLength={20}
                className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-cyan-400/50 focus:ring-cyan-400/20"
              />
            </div>
          </div>

          {/* 邮箱 */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-white/90">
              邮箱
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="请输入邮箱"
                value={formData.email}
                onChange={handleChange}
                required
                className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-cyan-400/50 focus:ring-cyan-400/20"
              />
            </div>
          </div>

          {/* 密码 */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-white/90">
              密码
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="请输入密码 (至少6位)"
              value={formData.password}
              onChange={handleChange}
              required
              minLength={6}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-cyan-400/50 focus:ring-cyan-400/20"
            />
          </div>

          {/* 确认密码 */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-white/90">
              确认密码
            </Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="请再次输入密码"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              minLength={6}
              className="bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-cyan-400/50 focus:ring-cyan-400/20"
            />
          </div>

          {/* 注册按钮 */}
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600 text-white font-medium py-6 shadow-lg shadow-cyan-500/30 transition-all duration-300"
          >
            {loading ? "注册中..." : "注册"}
          </Button>
        </form>

        {/* 登录链接 */}
        <div className="mt-6 text-center">
          <p className="text-white/60 text-sm">
            已有账户?{" "}
            <Link href="/login">
              <span className="text-cyan-400 hover:text-cyan-300 cursor-pointer font-medium">
                立即登录
              </span>
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
