import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import XrayManage from "./pages/XrayManage";
import GostManage from "./pages/GostManage";
import TrafficStats from "./pages/TrafficStats";
import SubscriptionManage from "./pages/SubscriptionManage";
import NodeManage from "./pages/NodeManage";
import BBROptimize from "./pages/BBROptimize";
import Certificates from "./pages/Certificates";


function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/login"} component={Login} />
      <Route path={"/register"} component={Register} />
      <Route path={"/dashboard"} component={Dashboard} />
      <Route path={"/xray"} component={XrayManage} />
      <Route path={"/gost"} component={GostManage} />
      <Route path={"/traffic"} component={TrafficStats} />
      <Route path={"/subscription"} component={SubscriptionManage} />
      <Route path={"/nodes"} component={NodeManage} />
      <Route path={"/bbr"} component={BBROptimize} />
      <Route path={"/certificates"} component={Certificates} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="dark"
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
