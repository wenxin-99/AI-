import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Network,
  GitBranch,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Link2,
  Server,
  Zap,
  Shield,
} from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: "仪表板", href: "/dashboard", icon: LayoutDashboard },
  { name: "Xray 管理", href: "/xray", icon: Network },
  { name: "Gost 管理", href: "/gost", icon: GitBranch },
  { name: "流量统计", href: "/traffic", icon: BarChart3 },
  { name: "订阅管理", href: "/subscription", icon: Link2 },
  { name: "节点管理", href: "/nodes", icon: Server },
  { name: "BBR 优化", href: "/bbr", icon: Zap },
  { name: "证书管理", href: "/certificates", icon: Shield },
  { name: "系统设置", href: "/settings", icon: Settings },
];

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 lg:translate-x-0 lg:static",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-full glass-card border-r border-white/10">
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="flex items-center justify-between h-16 px-6 border-b border-white/10">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center">
                  <Network className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-xl font-bold gradient-text">UniProxy</h1>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
              {navigation.map((item) => {
                const isActive = location === item.href || location.startsWith(item.href + "/");
                return (
                  <Link key={item.name} href={item.href}
                    className={cn(
                      "flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-gradient-to-r from-cyan-500/20 to-purple-600/20 text-white border border-white/20"
                        : "text-white/70 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.name}</span>
                  </Link>
                );
              })}
            </nav>

            {/* User section */}
            <div className="p-4 border-t border-white/10">
              <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-white/5">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center text-sm font-bold text-white">
                    A
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Admin</p>
                    <p className="text-xs text-white/50">管理员</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className="text-white/70 hover:text-white"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 glass-card border-b border-white/10 flex items-center justify-between px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden text-white"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </Button>
          <div className="flex-1" />
          <div className="flex items-center space-x-4">
            <div className="text-sm text-white/70">
              {new Date().toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
