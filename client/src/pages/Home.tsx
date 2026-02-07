import { Button } from "@/components/ui/button";
import { Network, ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem("token");
    if (token) {
      setLocation("/dashboard");
    }
  }, [setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl float-animation" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl float-animation" style={{ animationDelay: "1.5s" }} />
      </div>

      <div className="text-center relative z-10">
        <div className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center mb-8 shadow-2xl shadow-cyan-500/50 float-animation">
          <Network className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-6xl font-bold mb-4">
          <span className="gradient-text">UniProxy Panel</span>
        </h1>
        <p className="text-xl text-white/70 mb-12 max-w-2xl mx-auto">
          统一代理管理面板 - 整合 Xray 和 Gost 双引擎,提供强大的代理管理能力
        </p>
        <Button
          size="lg"
          className="bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white font-medium shadow-lg shadow-cyan-500/30 transition-all duration-200 hover:shadow-xl hover:shadow-cyan-500/40"
          onClick={() => setLocation("/login")}
        >
          开始使用
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}
