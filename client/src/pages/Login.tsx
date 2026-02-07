import { useState } from "react";
import { authService } from "@/services/auth";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Network, Lock, User } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      toast.error("请输入用户名和密码");
      return;
    }

    setLoading(true);
    
    try {
      const response = await authService.login({ username, password });
      localStorage.setItem("token", response.token);
      toast.success("登录成功!");
      setLocation("/dashboard");
    } catch (error: any) {
      // 错误已在 API 拦截器中处理
      console.error("Login error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl float-animation" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl float-animation" style={{ animationDelay: "1.5s" }} />
      </div>

      <Card className="w-full max-w-md glass-card border-white/20 p-8 relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-cyan-500/50">
            <Network className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold gradient-text mb-2">UniProxy Panel</h1>
          <p className="text-white/60 text-sm">统一代理管理面板</p>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-white/90">
              用户名
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                id="username"
                type="text"
                placeholder="请输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-cyan-400/50 focus:ring-cyan-400/20"
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-white/90">
              密码
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <Input
                id="password"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/40 focus:border-cyan-400/50 focus:ring-cyan-400/20"
                disabled={loading}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white font-medium shadow-lg shadow-cyan-500/30 transition-all duration-200 hover:shadow-xl hover:shadow-cyan-500/40"
            disabled={loading}
          >
            {loading ? "登录中..." : "登录"}
          </Button>
        </form>

        {/* Footer */}
        <div className="mt-8 space-y-3">
          <div className="text-center">
            <p className="text-white/60 text-sm">
              还没有账户?{" "}
              <Link href="/register">
                <span className="text-cyan-400 hover:text-cyan-300 cursor-pointer font-medium">
                  立即注册
                </span>
              </Link>
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-white/40">
              默认账号: admin / admin
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
