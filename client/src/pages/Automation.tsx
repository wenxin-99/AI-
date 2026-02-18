/**
 * 网站全自动交互沙箱 - 主页面
 * 
 * 功能：
 * 1. 站点账号管理
 * 2. 自动化任务创建和管理
 * 3. 实时沙箱面板（浏览器画面 + Agent 思考过程）
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useSandboxSocket } from "@/hooks/useSandboxSocket";
import {
  Bot, Globe, Play, Pause, Square, Trash2, Plus, Settings, Eye,
  MonitorPlay, Terminal, Code, ChevronDown, ChevronUp, Clock, Search,
  MessageSquare, FileText, AlertCircle, CheckCircle, Loader2, RefreshCw,
  Server, Key, User, Link, ExternalLink, Zap, ArrowLeft,
  Hand, Gamepad2,
} from "lucide-react";

// ============ 类型 ============

interface SiteAccount {
  id: number;
  siteName: string;
  siteUrl: string;
  loginUrl: string;
  username: string;
  status: string;
  lastLoginAt: string | null;
  lastLoginSuccess: boolean | null;
  loginFailCount: number;
  notes: string | null;
  createdAt: string;
}

interface AutomationTask {
  id: number;
  siteAccountId: number;
  taskType: string;
  name: string;
  instruction: string;
  status: string;
  progress: number;
  currentStep: string | null;
  totalSteps: number;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface TaskStep {
  id: number;
  stepNumber: number;
  type: string;
  content: string;
  screenshotUrl: string | null;
  selector: string | null;
  inputText: string | null;
  durationMs: number | null;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

// ============ API 调用 ============

const API_BASE = "/api/automation";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "请求失败");
  }
  return res.json();
}

// ============ 站点账号管理弹窗 ============

function AccountModal({
  open, onClose, onSave, editAccount,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  editAccount?: SiteAccount | null;
}) {
  const [form, setForm] = useState({
    siteName: "", siteUrl: "", loginUrl: "", username: "", password: "", notes: "",
  });

  useEffect(() => {
    if (editAccount) {
      setForm({
        siteName: editAccount.siteName,
        siteUrl: editAccount.siteUrl,
        loginUrl: editAccount.loginUrl,
        username: editAccount.username,
        password: "",
        notes: editAccount.notes || "",
      });
    } else {
      setForm({ siteName: "", siteUrl: "", loginUrl: "", username: "", password: "", notes: "" });
    }
  }, [editAccount, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <h3 className="text-lg font-bold">{editAccount ? "编辑站点账号" : "添加站点账号"}</h3>
        
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">站点名称 *</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="如：V2EX、知乎"
              value={form.siteName} onChange={e => setForm(f => ({ ...f, siteName: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">站点首页 URL *</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://www.v2ex.com"
              value={form.siteUrl} onChange={e => setForm(f => ({ ...f, siteUrl: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">登录页 URL *</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://www.v2ex.com/signin"
              value={form.loginUrl} onChange={e => setForm(f => ({ ...f, loginUrl: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">用户名 *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">密码 *</label>
              <input type="password" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">备注</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2}
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={() => onSave(form)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            {editAccount ? "保存修改" : "添加账号"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ 创建任务弹窗 ============

function TaskModal({
  open, onClose, onSave, accounts,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  accounts: SiteAccount[];
}) {
  const [form, setForm] = useState({
    siteAccountId: 0, taskType: "browse_and_post", name: "", instruction: "",
    targetUrls: "", searchKeywords: "", contentStyle: "professional",
  });

  if (!open) return null;

  const taskTypes = [
    { value: "login_only", label: "仅登录", desc: "登录站点并保持会话" },
    { value: "browse_and_post", label: "浏览并发帖", desc: "浏览指定页面后自动发帖" },
    { value: "search_and_reply", label: "搜索并回复", desc: "搜索关键词后自动回复" },
    { value: "custom", label: "自定义", desc: "根据指令自由执行" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500" /> 创建自动化任务
        </h3>
        
        <div className="space-y-4">
          {/* 选择站点账号 */}
          <div>
            <label className="block text-sm font-medium mb-1">选择站点账号 *</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.siteAccountId} onChange={e => setForm(f => ({ ...f, siteAccountId: Number(e.target.value) }))}>
              <option value={0}>请选择...</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.siteName} - {a.username}</option>
              ))}
            </select>
          </div>

          {/* 任务类型 */}
          <div>
            <label className="block text-sm font-medium mb-2">任务类型 *</label>
            <div className="grid grid-cols-2 gap-2">
              {taskTypes.map(t => (
                <button key={t.value}
                  className={`text-left p-3 rounded-lg border-2 transition-all ${
                    form.taskType === t.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setForm(f => ({ ...f, taskType: t.value }))}>
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-gray-500 mt-1">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 任务名称 */}
          <div>
            <label className="block text-sm font-medium mb-1">任务名称 *</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="如：V2EX 技术帖互动"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          {/* 任务指令 */}
          <div>
            <label className="block text-sm font-medium mb-1">任务指令 *</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={4}
              placeholder="详细描述你希望 Agent 执行的操作，例如：&#10;1. 登录 V2EX&#10;2. 浏览 /go/programmer 板块&#10;3. 找到最新的技术讨论帖&#10;4. 生成专业的回复内容并发布"
              value={form.instruction} onChange={e => setForm(f => ({ ...f, instruction: e.target.value }))} />
          </div>

          {/* 目标 URL */}
          {(form.taskType === "browse_and_post" || form.taskType === "custom") && (
            <div>
              <label className="block text-sm font-medium mb-1">目标 URL（每行一个）</label>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3}
                placeholder="https://www.v2ex.com/go/programmer&#10;https://www.v2ex.com/go/create"
                value={form.targetUrls} onChange={e => setForm(f => ({ ...f, targetUrls: e.target.value }))} />
            </div>
          )}

          {/* 搜索关键词 */}
          {(form.taskType === "search_and_reply" || form.taskType === "custom") && (
            <div>
              <label className="block text-sm font-medium mb-1">搜索关键词（每行一个）</label>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2}
                placeholder="Node.js 性能优化&#10;TypeScript 最佳实践"
                value={form.searchKeywords} onChange={e => setForm(f => ({ ...f, searchKeywords: e.target.value }))} />
            </div>
          )}

          {/* 内容风格 */}
          <div>
            <label className="block text-sm font-medium mb-1">内容风格</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.contentStyle} onChange={e => setForm(f => ({ ...f, contentStyle: e.target.value }))}>
              <option value="professional">专业技术</option>
              <option value="casual">轻松随意</option>
              <option value="friendly">友好热情</option>
              <option value="humorous">幽默风趣</option>
            </select>
          </div>
        </div>
        
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={() => {
            const data = {
              ...form,
              targetUrls: form.targetUrls ? form.targetUrls.split("\n").filter(Boolean) : [],
              searchKeywords: form.searchKeywords ? form.searchKeywords.split("\n").filter(Boolean) : [],
            };
            onSave(data);
          }} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            创建任务
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ 任务步骤时间线 ============

function StepTimeline({ steps, taskId }: { steps: TaskStep[]; taskId: number }) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [screenshots, setScreenshots] = useState<Record<number, string>>({});

  const loadScreenshot = async (stepId: number) => {
    if (screenshots[stepId]) return;
    try {
      const data = await apiFetch(`/tasks/${taskId}/steps/${stepId}/screenshot`);
      setScreenshots(prev => ({ ...prev, [stepId]: data.screenshot }));
    } catch (e) { /* ignore */ }
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case "navigate": return <Globe className="w-4 h-4 text-blue-500" />;
      case "click": return <MonitorPlay className="w-4 h-4 text-green-500" />;
      case "input": return <Terminal className="w-4 h-4 text-purple-500" />;
      case "captcha": return <Eye className="w-4 h-4 text-orange-500" />;
      case "think": return <Bot className="w-4 h-4 text-yellow-500" />;
      case "search": return <Search className="w-4 h-4 text-cyan-500" />;
      case "content_generate": return <FileText className="w-4 h-4 text-pink-500" />;
      case "post": return <MessageSquare className="w-4 h-4 text-indigo-500" />;
      case "wait": return <Clock className="w-4 h-4 text-gray-500" />;
      default: return <Zap className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStepLabel = (type: string) => {
    const labels: Record<string, string> = {
      navigate: "导航", click: "点击", input: "输入", captcha: "验证码",
      think: "思考", search: "搜索", content_generate: "生成内容",
      post: "发帖", reply: "回复", wait: "等待", screenshot: "截图",
      login: "登录", scroll: "滚动",
    };
    return labels[type] || type;
  };

  return (
    <div className="space-y-1">
      {steps.map((step, i) => (
        <div key={step.id} className="relative">
          {/* 连接线 */}
          {i < steps.length - 1 && (
            <div className="absolute left-[17px] top-8 bottom-0 w-px bg-gray-200" />
          )}
          
          <div
            className={`flex items-start gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
              expandedStep === step.id ? "bg-blue-50" : "hover:bg-gray-50"
            }`}
            onClick={() => {
              setExpandedStep(expandedStep === step.id ? null : step.id);
              if (step.screenshotUrl) loadScreenshot(step.id);
            }}
          >
            <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
              step.success ? "bg-green-100" : "bg-red-100"
            }`}>
              {getStepIcon(step.type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-400">#{step.stepNumber}</span>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100">
                  {getStepLabel(step.type)}
                </span>
                {step.durationMs && (
                  <span className="text-xs text-gray-400">{step.durationMs}ms</span>
                )}
                {!step.success && (
                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                )}
              </div>
              <p className="text-sm text-gray-700 mt-0.5 line-clamp-2">{step.content}</p>
            </div>
          </div>
          
          {/* 展开详情 */}
          {expandedStep === step.id && (
            <div className="ml-12 mt-1 mb-2 p-3 bg-gray-50 rounded-lg text-sm space-y-2">
              {step.selector && <div><span className="text-gray-500">选择器：</span><code className="text-xs bg-gray-200 px-1 rounded">{step.selector}</code></div>}
              {step.inputText && <div><span className="text-gray-500">输入内容：</span>{step.inputText}</div>}
              {step.errorMessage && <div className="text-red-600"><span className="text-gray-500">错误：</span>{step.errorMessage}</div>}
              {screenshots[step.id] && (
                <img src={screenshots[step.id]} alt="步骤截图" className="w-full rounded-lg border shadow-sm" />
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============ 实时沙箱面板 ============

function AutomationSandbox({ taskId }: { taskId: number }) {
  const sandbox = useSandboxSocket(taskId);
  const [activeTab, setActiveTab] = useState<"browser" | "terminal" | "thinking">("browser");
  const terminalRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [takeoverActive, setTakeoverActive] = useState(false);
  const [takeoverLoading, setTakeoverLoading] = useState(false);

  // 终端自动滚动
  useEffect(() => {
    if (terminalRef.current && activeTab === "terminal") {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [sandbox.terminal, activeTab]);

  // 接管模式切换
  const toggleTakeover = async () => {
    setTakeoverLoading(true);
    try {
      const endpoint = takeoverActive ? "disable" : "enable";
      const res = await apiFetch(`/tasks/${taskId}/takeover/${endpoint}`, { method: "POST" });
      if (res.success) {
        setTakeoverActive(!takeoverActive);
      } else {
        // 显示错误信息
        const errorMsg = res.error || res.message || "接管失败";
        alert(`接管失败：${errorMsg}\n\n可能原因：任务浏览器已关闭（服务器重启后需要重新启动任务）`);
      }
    } catch (err: any) {
      console.error("Takeover toggle failed:", err);
      alert(`接管失败：${err.message || '未知错误'}\n\n可能原因：任务浏览器已关闭（服务器重启后需要重新启动任务）`);
    } finally {
      setTakeoverLoading(false);
    }
  };

  // 处理接管模式下的点击操作
  const handleTakeoverClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!takeoverActive || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const imgWidth = imgRef.current.naturalWidth || 1920;
    const imgHeight = imgRef.current.naturalHeight || 1080;
    const scaleX = imgWidth / rect.width;
    const scaleY = imgHeight / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    sandbox.socket?.emit("takeover_action", { taskId, action: "click", payload: { x, y } });
  };

  // 处理接管模式下的键盘输入
  const handleTakeoverKeyDown = (e: React.KeyboardEvent) => {
    if (!takeoverActive) return;
    e.preventDefault();
    if (e.key.length === 1) {
      sandbox.socket?.emit("takeover_action", { taskId, action: "type", payload: { text: e.key } });
    } else {
      sandbox.socket?.emit("takeover_action", { taskId, action: "press", payload: { key: e.key } });
    }
  };

  // 处理接管模式下的滚动
  const handleTakeoverWheel = (e: React.WheelEvent) => {
    if (!takeoverActive) return;
    sandbox.socket?.emit("takeover_action", { taskId, action: "scroll", payload: { deltaX: e.deltaX, deltaY: e.deltaY } });
  };

  const tabs = [
    { id: "browser" as const, label: "浏览器", icon: <Globe className="w-4 h-4" />, badge: sandbox.browser.isLoading },
    { id: "terminal" as const, label: "终端", icon: <Terminal className="w-4 h-4" />, badge: false },
    { id: "thinking" as const, label: "思考过程", icon: <Bot className="w-4 h-4" />, badge: !!sandbox.thinking },
  ];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 rounded-xl border shadow-sm overflow-hidden">
      {/* 标签栏 */}
      <div className="flex items-center border-b bg-gray-50 px-2">
        {tabs.map(tab => (
          <button key={tab.id}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab(tab.id)}>
            {tab.icon}
            {tab.label}
            {tab.badge && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
          </button>
        ))}
        
        {/* 连接状态 */}
        <div className="ml-auto flex items-center gap-1.5 px-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${sandbox.isConnected ? "bg-green-500" : "bg-red-500"}`} />
          {sandbox.isConnected ? "已连接" : "断开"}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-hidden">
        {/* 浏览器标签 */}
        {activeTab === "browser" && (
          <div className="h-full flex flex-col">
            {/* 地址栏 */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-b">
              <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 text-sm text-gray-600 truncate font-mono bg-white rounded px-2 py-1 border">
                {sandbox.browser.url || "等待 Agent 打开网页..."}
              </div>
              {sandbox.browser.isLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}

            </div>
            

            {/* 截图区域 */}
            <div className="flex-1 overflow-auto bg-gray-200 flex items-center justify-center relative">
              {sandbox.browser.screenshot ? (
                <img 
                  ref={imgRef}
                  src={sandbox.browser.screenshot} 
                  alt="浏览器画面"
                  className={`max-w-full max-h-full object-contain ${takeoverActive ? "cursor-crosshair" : ""}`}
                  onClick={handleTakeoverClick}
                  onWheel={handleTakeoverWheel}
                  tabIndex={takeoverActive ? 0 : undefined}
                  onKeyDown={handleTakeoverKeyDown}
                  style={takeoverActive ? { outline: "2px solid #f97316", outlineOffset: "2px" } : undefined}
                />
              ) : (
                <div className="text-center text-gray-400 space-y-2">
                  <MonitorPlay className="w-16 h-16 mx-auto opacity-30" />
                  <p className="text-sm">等待 Agent 打开浏览器...</p>
                  <p className="text-xs">任务启动后，这里将实时显示浏览器画面</p>
                </div>
              )}
              {/* 接管操作按钮 - 底部居中 */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
                <button
                  className={`flex items-center shadow-lg ${takeoverActive ? "bg-orange-500 hover:bg-orange-600 animate-pulse" : "bg-blue-600 hover:bg-blue-700"} text-white text-sm px-4 py-2 rounded-full transition-colors`}
                  onClick={toggleTakeover}
                  disabled={takeoverLoading}
                >
                  {takeoverLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : takeoverActive ? (
                    <Hand className="w-4 h-4 mr-2" />
                  ) : (
                    <Gamepad2 className="w-4 h-4 mr-2" />
                  )}
                  {takeoverActive ? "归还控制" : "接管操作"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 终端标签 */}
        {activeTab === "terminal" && (
          <div ref={terminalRef} className="h-full overflow-auto bg-gray-900 p-3 font-mono text-sm">
            {sandbox.terminal.length === 0 ? (
              <div className="text-gray-500 text-center mt-10">
                <Terminal className="w-12 h-12 mx-auto opacity-30 mb-2" />
                <p>等待终端输出...</p>
              </div>
            ) : (
              sandbox.terminal.map((line, i) => (
                <div key={i} className={`py-0.5 ${
                  line.type === "command" ? "text-green-400" : "text-gray-300"
                }`}>
                  {line.type === "command" && <span className="text-blue-400">$ </span>}
                  {line.content}
                </div>
              ))
            )}
          </div>
        )}

        {/* 思考过程标签 */}
        {activeTab === "thinking" && (
          <div className="h-full overflow-auto p-4 space-y-3">
            {sandbox.steps.length === 0 && !sandbox.thinking ? (
              <div className="text-gray-400 text-center mt-10">
                <Bot className="w-12 h-12 mx-auto opacity-30 mb-2" />
                <p className="text-sm">等待 Agent 开始思考...</p>
              </div>
            ) : (
              <>
                {/* 当前思考 */}
                {sandbox.thinking && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg animate-pulse">
                    <div className="flex items-center gap-2 text-yellow-700 text-sm font-medium mb-1">
                      <Bot className="w-4 h-4" /> Agent 正在思考...
                    </div>
                    <p className="text-sm text-yellow-800">{sandbox.thinking}</p>
                  </div>
                )}
                
                {/* 历史步骤 */}
                {sandbox.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3 p-2">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                      {step.payload?.stepNumber || i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-xs text-gray-400">
                        {step.payload?.stepType || "step"} · {new Date(step.timestamp).toLocaleTimeString()}
                      </div>
                      <p className="text-sm text-gray-700 mt-0.5">{step.payload?.content}</p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      
      {/* 底部进度条 */}
      {sandbox.progress > 0 && (
        <div className="border-t px-3 py-2 bg-gray-50">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{sandbox.currentStep || "执行中..."}</span>
            <span>{Math.round(sandbox.progress)}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${sandbox.progress}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ============ 任务卡片 ============

function TaskCard({
  task, onStart, onPause, onCancel, onDelete, onView,
}: {
  task: AutomationTask;
  onStart: () => void;
  onPause: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  const statusConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
    pending: { color: "bg-gray-100 text-gray-700", icon: <Clock className="w-3.5 h-3.5" />, label: "待执行" },
    running: { color: "bg-blue-100 text-blue-700", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: "执行中" },
    paused: { color: "bg-yellow-100 text-yellow-700", icon: <Pause className="w-3.5 h-3.5" />, label: "已暂停" },
    completed: { color: "bg-green-100 text-green-700", icon: <CheckCircle className="w-3.5 h-3.5" />, label: "已完成" },
    failed: { color: "bg-red-100 text-red-700", icon: <AlertCircle className="w-3.5 h-3.5" />, label: "失败" },
    cancelled: { color: "bg-gray-100 text-gray-500", icon: <Square className="w-3.5 h-3.5" />, label: "已取消" },
  };

  const status = statusConfig[task.status] || statusConfig.pending;

  const taskTypeLabels: Record<string, string> = {
    login_only: "仅登录",
    browse_and_post: "浏览发帖",
    search_and_reply: "搜索回复",
    custom: "自定义",
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-medium text-sm truncate">{task.name}</h4>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
              {status.icon} {status.label}
            </span>
          </div>
          <p className="text-xs text-gray-500 line-clamp-1">{task.instruction}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span className="px-1.5 py-0.5 bg-gray-100 rounded">{taskTypeLabels[task.taskType] || task.taskType}</span>
            <span>{task.totalSteps} 步</span>
            {task.startedAt && <span>{new Date(task.startedAt).toLocaleString()}</span>}
          </div>
        </div>
        
        <div className="flex items-center gap-1 ml-2">
          {task.status === "pending" && (
            <button onClick={onStart} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title="启动">
              <Play className="w-4 h-4" />
            </button>
          )}
          {task.status === "running" && (
            <>
              <button onClick={onView} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600" title="查看实况">
                <Eye className="w-4 h-4" />
              </button>
              <button onClick={onPause} className="p-1.5 rounded-lg hover:bg-yellow-50 text-yellow-600" title="暂停">
                <Pause className="w-4 h-4" />
              </button>
              <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" title="取消">
                <Square className="w-4 h-4" />
              </button>
            </>
          )}
          {task.status === "paused" && (
            <button onClick={onStart} className="p-1.5 rounded-lg hover:bg-green-50 text-green-600" title="继续">
              <Play className="w-4 h-4" />
            </button>
          )}
          {(task.status === "completed" || task.status === "failed") && (
            <button onClick={onView} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600" title="查看详情">
              <Eye className="w-4 h-4" />
            </button>
          )}
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600" title="删除">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* 进度条 */}
      {task.status === "running" && task.progress > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{task.currentStep || "执行中..."}</span>
            <span>{Math.round(task.progress)}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${task.progress}%` }} />
          </div>
        </div>
      )}
      
      {/* 错误信息 */}
      {task.errorMessage && (
        <div className="mt-2 p-2 bg-red-50 rounded-lg text-xs text-red-600 flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span className="line-clamp-2">{task.errorMessage}</span>
        </div>
      )}
    </div>
  );
}

// ============ 主页面 ============

export default function Automation() {
  const [accounts, setAccounts] = useState<SiteAccount[]>([]);
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [activeTab, setActiveTab] = useState<"tasks" | "accounts">("tasks");
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editAccount, setEditAccount] = useState<SiteAccount | null>(null);
  const [viewingTaskId, setViewingTaskId] = useState<number | null>(null);
  const [taskDetail, setTaskDetail] = useState<{ task: AutomationTask; steps: TaskStep[]; account: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 加载数据
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [accountsRes, tasksRes] = await Promise.all([
        apiFetch("/accounts"),
        apiFetch("/tasks"),
      ]);
      setAccounts(accountsRes.accounts || []);
      setTasks(tasksRes.tasks || []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // 定时刷新运行中的任务
  useEffect(() => {
    const hasRunning = tasks.some(t => t.status === "running");
    if (!hasRunning) return;
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [tasks, loadData]);

  // 当查看任务时，定时刷新任务详情（包括步骤）
  useEffect(() => {
    if (!viewingTaskId) return;
    const refreshDetail = async () => {
      try {
        const detail = await apiFetch(`/tasks/${viewingTaskId}`);
        setTaskDetail(detail);
      } catch (e) { /* ignore */ }
    };
    // 立即加载一次
    refreshDetail();
    // 每 3 秒刷新
    const interval = setInterval(refreshDetail, 3000);
    return () => clearInterval(interval);
  }, [viewingTaskId]);

  // 账号操作
  const handleSaveAccount = async (data: any) => {
    try {
      if (editAccount) {
        await apiFetch(`/accounts/${editAccount.id}`, { method: "PUT", body: JSON.stringify(data) });
      } else {
        await apiFetch("/accounts", { method: "POST", body: JSON.stringify(data) });
      }
      setShowAccountModal(false);
      setEditAccount(null);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDeleteAccount = async (id: number) => {
    if (!confirm("确定删除此账号？")) return;
    await apiFetch(`/accounts/${id}`, { method: "DELETE" });
    loadData();
  };

  // 任务操作
  const handleSaveTask = async (data: any) => {
    try {
      await apiFetch("/tasks", { method: "POST", body: JSON.stringify(data) });
      setShowTaskModal(false);
      loadData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleStartTask = async (id: number) => {
    await apiFetch(`/tasks/${id}/start`, { method: "POST" });
    setViewingTaskId(id);
    // 立即加载任务详情
    try {
      const detail = await apiFetch(`/tasks/${id}`);
      setTaskDetail(detail);
    } catch (e) { /* ignore */ }
    loadData();
  };

  const handlePauseTask = async (id: number) => {
    await apiFetch(`/tasks/${id}/pause`, { method: "POST" });
    loadData();
  };

  const handleCancelTask = async (id: number) => {
    await apiFetch(`/tasks/${id}/cancel`, { method: "POST" });
    loadData();
  };

  const handleDeleteTask = async (id: number) => {
    if (!confirm("确定删除此任务？")) return;
    await apiFetch(`/tasks/${id}`, { method: "DELETE" });
    loadData();
  };

  const handleViewTask = async (id: number) => {
    try {
      const detail = await apiFetch(`/tasks/${id}`);
      setTaskDetail(detail);
      setViewingTaskId(id);
    } catch (e: any) {
      alert(e.message);
    }
  };

  // 查看实时沙箱
  if (viewingTaskId) {
    return (
      <div className="h-screen flex flex-col bg-gray-50">
        {/* 顶部栏 */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => { setViewingTaskId(null); setTaskDetail(null); }}
              className="p-2 rounded-lg hover:bg-gray-100">
              <ChevronDown className="w-5 h-5 rotate-90" />
            </button>
            <div>
              <h2 className="font-bold text-sm">
                {taskDetail?.task.name || `任务 #${viewingTaskId}`}
              </h2>
              <p className="text-xs text-gray-500">
                {taskDetail?.account?.siteName} · {taskDetail?.task.status === "running" ? "实时执行中" : taskDetail?.task.status}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {taskDetail?.task.status === "running" && (
              <>
                <button onClick={() => handlePauseTask(viewingTaskId)}
                  className="px-3 py-1.5 text-xs bg-yellow-100 text-yellow-700 rounded-lg hover:bg-yellow-200">
                  <Pause className="w-3.5 h-3.5 inline mr-1" /> 暂停
                </button>
                <button onClick={() => handleCancelTask(viewingTaskId)}
                  className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                  <Square className="w-3.5 h-3.5 inline mr-1" /> 取消
                </button>
              </>
            )}
          </div>
        </div>
        
        {/* 双栏布局 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧：实时沙箱 */}
          <div className="flex-1 p-4">
            <AutomationSandbox taskId={viewingTaskId} />
          </div>
          
          {/* 右侧：步骤时间线 */}
          <div className="w-[400px] border-l bg-white overflow-y-auto">
            <div className="p-4">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-500" />
                执行步骤
                {taskDetail?.steps && (
                  <span className="text-xs text-gray-400 font-normal">共 {taskDetail.steps.length} 步</span>
                )}
              </h3>
              {taskDetail?.steps && taskDetail.steps.length > 0 ? (
                <StepTimeline steps={taskDetail.steps} taskId={viewingTaskId} />
              ) : (
                <div className="text-center text-gray-400 text-sm mt-10">
                  <Clock className="w-10 h-10 mx-auto opacity-30 mb-2" />
                  <p>等待任务执行...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 主列表页
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页头 */}
      <div className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => window.history.back()} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="返回">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Bot className="w-7 h-7 text-blue-600" />
                  网站自动化沙箱
                </h1>
                <p className="text-sm text-gray-500 mt-1">AI Agent 自动登录、浏览、发帖、回复 — 全程可视化</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadData} className="p-2 rounded-lg hover:bg-gray-100" title="刷新">
                <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
          
          {/* 标签切换 */}
          <div className="flex items-center gap-1 mt-4">
            <button
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === "tasks" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
              }`}
              onClick={() => setActiveTab("tasks")}>
              <Zap className="w-4 h-4 inline mr-1" /> 自动化任务
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === "accounts" ? "bg-blue-100 text-blue-700" : "text-gray-500 hover:bg-gray-100"
              }`}
              onClick={() => setActiveTab("accounts")}>
              <Key className="w-4 h-4 inline mr-1" /> 站点账号
            </button>
          </div>
        </div>
      </div>
      
      {/* 内容区 */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {error}
          </div>
        )}
        
        {/* 任务列表 */}
        {activeTab === "tasks" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">任务列表</h2>
              <button onClick={() => {
                if (accounts.length === 0) {
                  alert("请先添加站点账号");
                  setActiveTab("accounts");
                  return;
                }
                setShowTaskModal(true);
              }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <Plus className="w-4 h-4" /> 创建任务
              </button>
            </div>
            
            {loading && tasks.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p>加载中...</p>
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <Bot className="w-16 h-16 mx-auto opacity-20 mb-3" />
                <p className="text-lg font-medium">还没有自动化任务</p>
                <p className="text-sm mt-1">创建第一个任务，让 AI Agent 帮你自动操作网站</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {tasks.map(task => (
                  <TaskCard key={task.id} task={task}
                    onStart={() => handleStartTask(task.id)}
                    onPause={() => handlePauseTask(task.id)}
                    onCancel={() => handleCancelTask(task.id)}
                    onDelete={() => handleDeleteTask(task.id)}
                    onView={() => handleViewTask(task.id)} />
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* 账号列表 */}
        {activeTab === "accounts" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-lg">站点账号</h2>
              <button onClick={() => { setEditAccount(null); setShowAccountModal(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <Plus className="w-4 h-4" /> 添加账号
              </button>
            </div>
            
            {accounts.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <Server className="w-16 h-16 mx-auto opacity-20 mb-3" />
                <p className="text-lg font-medium">还没有站点账号</p>
                <p className="text-sm mt-1">添加你要自动操作的网站账号</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {accounts.map(account => (
                  <div key={account.id} className="bg-white rounded-xl border shadow-sm p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <Globe className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-sm">{account.siteName}</h4>
                          <p className="text-xs text-gray-500">{account.username}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditAccount(account); setShowAccountModal(true); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100" title="编辑">
                          <Settings className="w-4 h-4 text-gray-400" />
                        </button>
                        <button onClick={() => handleDeleteAccount(account.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50" title="删除">
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </div>
                    
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Link className="w-3.5 h-3.5" />
                        <a href={account.siteUrl} target="_blank" rel="noopener" className="hover:text-blue-600 truncate">
                          {account.siteUrl}
                        </a>
                        <ExternalLink className="w-3 h-3" />
                      </div>
                      {account.lastLoginAt && (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-gray-500">上次登录：{new Date(account.lastLoginAt).toLocaleString()}</span>
                          {account.lastLoginSuccess ? (
                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                          )}
                        </div>
                      )}
                      {account.loginFailCount > 0 && (
                        <div className="text-xs text-red-500">连续失败 {account.loginFailCount} 次</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* 弹窗 */}
      <AccountModal open={showAccountModal} onClose={() => { setShowAccountModal(false); setEditAccount(null); }}
        onSave={handleSaveAccount} editAccount={editAccount} />
      <TaskModal open={showTaskModal} onClose={() => setShowTaskModal(false)}
        onSave={handleSaveTask} accounts={accounts} />
    </div>
  );
}
