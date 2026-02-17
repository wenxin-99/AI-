import { TooltipProvider } from "@/components/ui/tooltip";
import { useTokenRefresh } from "./_core/hooks/useTokenRefresh";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { useSwipeBack } from "./hooks/useSwipeBack";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminUsers from "./pages/admin/Users";
import AdminModels from "./pages/admin/Models";
import AdminInvitations from "./pages/admin/Invitations";
import Chat from "./pages/Chat";

import Files from "./pages/Files";
import Transactions from "./pages/Transactions";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import Recharge from "./pages/Recharge";
import Help from "./pages/Help";
import Invite from "./pages/Invite";
import Feedback from "./pages/Feedback";
import AdminFeedbacks from "./pages/admin/Feedbacks";
import AdminExport from "./pages/admin/Export";
import AdminNotifications from "./pages/admin/SystemNotifications";
import AdminQuotaManagement from "./pages/admin/QuotaManagement";
import VIPMembership from "./pages/VIPMembership";
import ModelManagement from "./pages/admin/ModelManagement";
import PackageManagement from "./pages/admin/PackageManagement";
import ProxyManagement from "./pages/admin/ProxyManagement";
import ProxyRulesManagement from "./pages/admin/ProxyRulesManagement";
import StorageSettings from "./pages/admin/StorageSettings";
import ImageGenerationTest from "./pages/admin/ImageGenerationTest";
import ModelComparison from "./pages/ModelComparison";
import { OAuthDiagnostics } from "./pages/OAuthDiagnostics";

import ForumLogin from "./pages/ForumLogin";
import AuthModeTest from "./pages/admin/AuthModeTest";
import DiscountManagement from "./pages/DiscountManagement";
import ImageGallery from "./pages/ImageGallery";
import VideoGallery from "./pages/VideoGallery";
import VideoHistory from "./pages/VideoHistory";
import VideoShare from "./pages/VideoShare";
import Research from "./pages/Research";
import ResearchTask from "./pages/ResearchTask";
import VideoApiConfig from "./pages/admin/VideoApiConfig";
import SystemSettings from "./pages/admin/SystemSettings";
import VoiceSettings from "./pages/admin/VoiceSettings";
import SSHSettings from "./pages/admin/SSHSettings";
import VoiceChat from "./pages/VoiceChat";
import HomeworkCorrection from "./pages/HomeworkCorrection";
import HomeworkHistory from "./pages/HomeworkHistory";
import CorrectionShare from "./pages/CorrectionShare";
import WrongQuestionBook from "./pages/WrongQuestionBook";
import StorageStats from "./pages/StorageStats";
import HomeworkPricingConfig from "./pages/HomeworkPricingConfig";
import ImageGenerationPricing from "./pages/admin/ImageGenerationPricing";
import PDFWatermarkConfig from "./pages/admin/PDFWatermarkConfig";
import FishCoinManagement from "./pages/admin/FishCoinManagement";
import Pricing from "./pages/Pricing";
import Orders from "./pages/Orders";
import Subscription from "./pages/Subscription";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import PaymentConfig from "./pages/admin/PaymentConfig";

function Router() {
  const [location] = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
      >
        <Switch location={location}>
      <Route path="/" component={Home} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/chat" component={Chat} />
      <Route path="/homework" component={HomeworkCorrection} />
      <Route path="/homework/history" component={HomeworkHistory} />
      <Route path="/homework/pricing-config" component={HomeworkPricingConfig} />
      <Route path="/admin/image-generation-pricing" component={ImageGenerationPricing} />
      <Route path="/admin/pdf-watermark-config" component={PDFWatermarkConfig} />
      <Route path="/admin/fish-coin-management" component={FishCoinManagement} />
      <Route path="/share/:token" component={CorrectionShare} />
      <Route path="/wrong-questions" component={WrongQuestionBook} />
      <Route path="/storage-stats" component={StorageStats} />
      <Route path="/images" component={ImageGallery} />
      <Route path="/videos" component={VideoGallery} />
      <Route path="/video-history" component={VideoHistory} />
      <Route path="/research" component={Research} />
      <Route path="/research/:taskId" component={ResearchTask} />
      <Route path="/share/video/:token" component={VideoShare} />

      <Route path="/files" component={Files} />
      <Route path="/transactions" component={Transactions} />
      <Route path="/notifications" component={Notifications} />
      <Route path="/profile" component={Profile} />
      <Route path="/recharge" component={Recharge} />
      <Route path="/model-comparison" component={ModelComparison} />
      <Route path="/oauth-diagnostics" component={OAuthDiagnostics} />

      <Route path="/forum-login" component={ForumLogin} />
      <Route path="/help" component={Help} />
      <Route path="/invite" component={Invite} />
      <Route path="/feedback" component={Feedback} />
      <Route path="/vip" component={VIPMembership} />
      
      {/* Stripe支付路由 */}
      <Route path="/pricing" component={Pricing} />
      <Route path="/orders" component={Orders} />
      <Route path="/subscription" component={Subscription} />
      <Route path="/payment/success" component={PaymentSuccess} />
      <Route path="/payment/cancel" component={PaymentCancel} />
      
      {/* 管理员路由 */}
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/models" component={ModelManagement} />
      <Route path="/admin/packages" component={PackageManagement} />
      <Route path="/admin/proxies" component={ProxyManagement} />
      <Route path="/admin/proxy-rules" component={ProxyRulesManagement} />
      <Route path="/admin/storage-settings" component={StorageSettings} />
      <Route path="/admin/image-test" component={ImageGenerationTest} />
      <Route path="/admin/invitations" component={AdminInvitations} />
      <Route path="/admin/feedbacks" component={AdminFeedbacks} />
      <Route path="/admin/notifications" component={AdminNotifications} />
      <Route path="/admin/quota" component={AdminQuotaManagement} />
      <Route path="/admin/export" component={AdminExport} />
      <Route path="/admin/model-management" component={ModelManagement} />
      <Route path="/admin/auth-mode-test" component={AuthModeTest} />
      <Route path="/admin/discount" component={DiscountManagement} />
      <Route path="/admin/video-api" component={VideoApiConfig} />
      <Route path="/admin/system-settings" component={SystemSettings} />
      <Route path="/admin/ssh-settings" component={SSHSettings} />
      <Route path="/admin/voice-settings" component={VoiceSettings} />
      <Route path="/voice-chat" component={VoiceChat} />
      <Route path="/admin/payment-config" component={PaymentConfig} />
      
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  // Token自动刷新
  useTokenRefresh();
  // 左滑返回手势
  useSwipeBack();
  
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <NotificationProvider>
          <TooltipProvider>
            <Router />
          </TooltipProvider>
        </NotificationProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;