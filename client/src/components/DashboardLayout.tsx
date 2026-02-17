import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { LayoutDashboard, LogOut, Brain as BrainIcon, PanelLeft, Users, Bot, Ticket, MessageSquare, FileText, Image, Video, Mic, Coins, Settings, Bell, UserCircle, Wallet, HelpCircle, UserPlus, MessageCircle, Download, Gauge, Crown, Package, TrendingUp, Percent, Home, DollarSign, CreditCard, Receipt, ShoppingBag, Network, HardDrive, TestTube, Mic2, Terminal } from "lucide-react";
import { SettingsMenu } from "@/components/SettingsMenu";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { useTranslation } from "react-i18next";

// userMenuItems will be generated dynamically using t() in the component

// adminMenuItems will be generated dynamically using t() in the component

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  // 必须在组件最顶部调用useIsMobile，在所有条件语句和early return之前
  const isMobile = useIsMobile();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              {t('dashboard.signInToContinue')}
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              {t('dashboard.signInDescription')}
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      defaultOpen={false}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  
  // Generate menu items dynamically
  const userMenuItems = [
    { icon: LayoutDashboard, label: t('dashboard.menu.user.workspace'), path: "/dashboard" },
    { icon: MessageSquare, label: t('dashboard.menu.user.aiChat'), path: "/chat" },
    { icon: Image, label: t('dashboard.menu.user.imageHistory'), path: "/images" },
    { icon: Video, label: t('dashboard.menu.user.videoHistory'), path: "/video-history" },
    { icon: Coins, label: t('dashboard.menu.user.coinManagement'), path: "/transactions" },
    { icon: ShoppingBag, label: t('dashboard.menu.user.productPurchase'), path: "/pricing" },
    { icon: Receipt, label: t('dashboard.menu.user.orderHistory'), path: "/orders" },
    { icon: Crown, label: t('dashboard.menu.user.subscriptionManagement'), path: "/subscription" },
    { icon: UserPlus, label: t('dashboard.menu.user.inviteFriends'), path: "/invite" },
    { icon: MessageCircle, label: t('dashboard.menu.user.userFeedback'), path: "/feedback" },
    { icon: HelpCircle, label: t('dashboard.menu.user.helpCenter'), path: "/help" },
  ];
  
  const adminMenuItems = [
    { icon: LayoutDashboard, label: t('dashboard.menu.admin.dashboard'), path: "/admin" },
    { icon: Users, label: t('dashboard.menu.admin.userManagement'), path: "/admin/users" },
    { icon: Bot, label: t('dashboard.menu.admin.modelManagement'), path: "/admin/models" },
    { icon: Network, label: t('dashboard.menu.admin.proxyManagement'), path: "/admin/proxies" },
    { icon: HardDrive, label: t('dashboard.menu.admin.storageSettings'), path: "/admin/storage-settings" },
    { icon: TestTube, label: t('dashboard.menu.admin.imageTest'), path: "/admin/image-test" },
    { icon: TrendingUp, label: t('dashboard.menu.admin.modelComparison'), path: "/model-comparison" },
    { icon: Package, label: t('dashboard.menu.admin.packageManagement'), path: "/admin/packages" },
    { icon: Gauge, label: t('dashboard.menu.admin.quotaManagement'), path: "/admin/quota" },
    { icon: Percent, label: t('dashboard.menu.admin.discountManagement'), path: "/admin/discount" },
    { icon: Coins, label: t('dashboard.menu.admin.coinManagement'), path: "/admin/fish-coin-management" },
    { icon: DollarSign, label: t('dashboard.menu.admin.homeworkPricing'), path: "/homework/pricing-config" },
    { icon: Image, label: t('dashboard.menu.admin.imageGenerationPricing'), path: "/admin/image-generation-pricing" },
    { icon: FileText, label: t('dashboard.menu.admin.pdfWatermarkConfig'), path: "/admin/pdf-watermark-config" },
    { icon: Video, label: t('dashboard.menu.admin.videoApiConfig'), path: "/admin/video-api" },
    { icon: Mic2, label: "语音服务设置", path: "/admin/voice-settings" },
    { icon: Terminal, label: "SSH / VPS 远程管理", path: "/admin/ssh-settings" },
    { icon: CreditCard, label: t('dashboard.menu.admin.paymentConfig'), path: "/admin/payment-config" },
    { icon: Ticket, label: t('dashboard.menu.admin.invitationCodes'), path: "/admin/invitations" },
    { icon: MessageCircle, label: t('dashboard.menu.admin.feedbackManagement'), path: "/admin/feedbacks" },
    { icon: Bell, label: t('dashboard.menu.admin.systemNotifications'), path: "/admin/notifications" },
    { icon: Download, label: t('dashboard.menu.admin.dataExport'), path: "/admin/export" },
    { icon: Settings, label: t('dashboard.menu.admin.systemSettings'), path: "/admin/system-settings" },
  ];
  
  // 根据用户角色选择菜单
  const menuItems = user?.role === "admin" && location.startsWith("/admin") ? adminMenuItems : userMenuItems;
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" style={{marginLeft: '-18px'}} />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-semibold tracking-tight truncate">
                    
                  </span>
                </div>
              ) : null}
              <div className="flex items-center gap-1">
                <SettingsMenu />
                <button
                  onClick={() => setLocation('/')}
                  className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                  aria-label="返回首页"
                  title="返回首页"
                >
                  <Home className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    {user?.avatarUrl ? (
                      <img 
                        src={user.avatarUrl} 
                        alt={user.name || t('dashboard.user')} 
                        className="h-full w-full object-cover rounded-full" 
                        onError={(e) => {
                          // 头像加载失败时隐藏图片，显示fallback
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : null}
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>{t('dashboard.signOut')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        {/* 拖拽手柄：可见的线条 + 更宽的可点击区域 */}
        <div
          className={`absolute top-0 right-0 w-1 h-full bg-border transition-colors ${isCollapsed ? "hidden" : ""}`}
          style={{ zIndex: 50 }}
        />
        <div
          className={`absolute top-0 right-0 w-3 h-full cursor-col-resize hover:bg-primary/10 transition-colors ${isCollapsed ? "hidden" : ""} ${isResizing ? "bg-primary/20" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 51, marginRight: "-4px" }}
          title="拖拽调整侧边栏宽度"
        />
      </div>

      <SidebarInset>
        {/* Header - 移动端和桌面端都显示 */}
        <div className="flex border-b h-14 items-center bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40 lg:hidden">
          {/* 左侧：SidebarTrigger */}
          <div className="flex items-center gap-3">
            <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
          </div>
          
          {/* 中间：居中标题 */}
          <div className="absolute left-1/2 -translate-x-1/2">
            <span className="text-base font-semibold tracking-tight text-foreground">
              {activeMenuItem?.label ?? "Menu"}
            </span>
          </div>
          
          {/* 右侧：返回按钮 */}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.history.back()}
              className="h-9 w-9 p-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6"/>
              </svg>
            </Button>
          </div>
        </div>
        <main className="flex-1 p-4 md:pl-6">{children}</main>
      </SidebarInset>
    </>
  );
}
