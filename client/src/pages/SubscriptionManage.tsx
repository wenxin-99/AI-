/**
 * Design Philosophy: Gradient Fluid
 * - Deep purple to blue gradient background
 * - Frosted glass effect cards
 * - Smooth animations and micro-interactions
 */

import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { subscriptionService } from "@/services/subscription";
import { Copy, Link2, Plus, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Subscription {
  id: number;
  user_id: number;
  token: string;
  format: string;
  enabled: boolean;
  created_at: string;
}

export default function SubscriptionManage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<string>("v2ray");
  const [currentLink, setCurrentLink] = useState<string>("");

  useEffect(() => {
    loadSubscriptions();
  }, []);

  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      const data = await subscriptionService.list();
      setSubscriptions(data || []);
    } catch (error) {
      console.error("加载订阅列表失败:", error);
      toast.error("加载订阅列表失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      // 获取当前用户ID (这里简化处理,实际应从登录状态获取)
      const userId = 1;
      await subscriptionService.generate(userId, selectedFormat);
      toast.success("订阅创建成功");
      setCreateDialogOpen(false);
      loadSubscriptions();
    } catch (error) {
      console.error("创建订阅失败:", error);
      toast.error("创建订阅失败");
    }
  };

  const handleGetLink = async (userId: number, format: string) => {
    try {
      const linkData = await subscriptionService.getLink(userId, format);
      setCurrentLink(linkData.url);
      setLinkDialogOpen(true);
    } catch (error) {
      console.error("获取订阅链接失败:", error);
      toast.error("获取订阅链接失败");
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentLink);
    toast.success("链接已复制到剪贴板");
  };

  const handleToggle = async (id: number) => {
    try {
      await subscriptionService.toggle(id);
      toast.success("订阅状态已更新");
      loadSubscriptions();
    } catch (error) {
      console.error("切换订阅状态失败:", error);
      toast.error("切换订阅状态失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除这个订阅吗?")) return;

    try {
      await subscriptionService.delete(id);
      toast.success("订阅已删除");
      loadSubscriptions();
    } catch (error) {
      console.error("删除订阅失败:", error);
      toast.error("删除订阅失败");
    }
  };

  const getFormatBadge = (format: string) => {
    const colors = {
      v2ray: "from-blue-500 to-cyan-500",
      clash: "from-purple-500 to-pink-500",
      surge: "from-orange-500 to-red-500",
    };
    return colors[format as keyof typeof colors] || "from-gray-500 to-gray-600";
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 页面标题 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text">订阅管理</h1>
            <p className="text-white/60 mt-1">管理 V2Ray、Clash、Surge 订阅链接</p>
          </div>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="bg-gradient-to-r from-cyan-500 to-purple-500 hover:from-cyan-600 hover:to-purple-600"
          >
            <Plus className="w-4 h-4 mr-2" />
            创建订阅
          </Button>
        </div>

        {/* 订阅列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
          </div>
        ) : subscriptions.length === 0 ? (
          <Card className="glass-card border-white/20 p-12 text-center">
            <QrCode className="w-16 h-16 mx-auto mb-4 text-white/40" />
            <p className="text-white/60 text-lg">暂无订阅</p>
            <p className="text-white/40 text-sm mt-2">点击右上角"创建订阅"按钮开始</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {subscriptions.map((sub) => (
              <Card
                key={sub.id}
                className="glass-card border-white/20 p-6 hover:border-cyan-400/30 transition-all duration-300"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className={`px-3 py-1 rounded-full bg-gradient-to-r ${getFormatBadge(
                          sub.format
                        )} text-white text-sm font-medium`}
                      >
                        {sub.format.toUpperCase()}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          sub.enabled
                            ? "bg-green-500/20 text-green-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {sub.enabled ? "已启用" : "已禁用"}
                      </span>
                    </div>
                    <p className="text-white/60 text-sm font-mono">
                      Token: {sub.token}
                    </p>
                    <p className="text-white/40 text-xs mt-1">
                      创建时间: {new Date(sub.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleGetLink(sub.user_id, sub.format)}
                      className="border-white/20 hover:bg-cyan-500/20 hover:border-cyan-400/50"
                    >
                      <Link2 className="w-4 h-4 mr-1" />
                      获取链接
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggle(sub.id)}
                      className="border-white/20 hover:bg-purple-500/20 hover:border-purple-400/50"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(sub.id)}
                      className="border-white/20 hover:bg-red-500/20 hover:border-red-400/50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 创建订阅对话框 */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="glass-card border-white/20">
          <DialogHeader>
            <DialogTitle className="gradient-text">创建订阅</DialogTitle>
            <DialogDescription className="text-white/60">
              选择订阅格式并创建新的订阅链接
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-white/90">订阅格式</Label>
              <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                <SelectTrigger className="bg-white/5 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="v2ray">V2Ray</SelectItem>
                  <SelectItem value="clash">Clash</SelectItem>
                  <SelectItem value="surge">Surge</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              className="border-white/20"
            >
              取消
            </Button>
            <Button
              onClick={handleCreate}
              className="bg-gradient-to-r from-cyan-500 to-purple-500"
            >
              创建
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 订阅链接对话框 */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="glass-card border-white/20">
          <DialogHeader>
            <DialogTitle className="gradient-text">订阅链接</DialogTitle>
            <DialogDescription className="text-white/60">
              复制下面的链接到客户端使用
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-white/80 text-sm font-mono break-all">
                {currentLink}
              </p>
            </div>
            <Button
              onClick={handleCopyLink}
              className="w-full bg-gradient-to-r from-cyan-500 to-purple-500"
            >
              <Copy className="w-4 h-4 mr-2" />
              复制链接
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
