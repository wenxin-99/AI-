/**
 * SandboxPanel - 研究沙箱面板
 * 
 * 右栏组件，包含三个 Tab：
 * 1. 浏览器预览 - 显示截图，支持缩放和全屏查看
 * 2. 代码编辑器 - Monaco Editor 显示代码
 * 3. 终端 - 显示 Agent 的执行日志
 */
import { useState, useEffect, useRef, useMemo } from "react";
import {
  Globe,
  Code2,
  Terminal as TerminalIcon,
  Loader2,
  RefreshCw,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Wifi,
  WifiOff,
  ExternalLink,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import type {
  BrowserState,
  CodeState,
  TerminalState,
} from "@/hooks/useSandboxSocket";

// ============ Props ============

interface SandboxPanelProps {
  browser: BrowserState;
  code: CodeState;
  terminal: TerminalState;
  activeTab: "browser" | "code" | "terminal";
  onTabChange: (tab: "browser" | "code" | "terminal") => void;
  isConnected: boolean;
}

// ============ Tab 配置 ============

const tabs = [
  { id: "browser" as const, label: "浏览器", icon: Globe },
  { id: "code" as const, label: "代码", icon: Code2 },
  { id: "terminal" as const, label: "终端", icon: TerminalIcon },
];

// ============ 浏览器预览 Tab ============

function BrowserPreview({ browser }: { browser: BrowserState }) {
  const [zoom, setZoom] = useState(1);
  const [isImageExpanded, setIsImageExpanded] = useState(false);

  const screenshotSrc = browser.screenshotBase64
    ? `data:image/jpeg;base64,${browser.screenshotBase64}`
    : browser.screenshot
    ? `data:image/jpeg;base64,${browser.screenshot}`
    : null;

  const displayUrl = browser.url || "about:blank";

  return (
    <div className="flex flex-col h-full bg-background">
      {/* 浏览器地址栏 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b">
        {/* 窗口控制按钮 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Circle className="w-3 h-3 fill-red-500 text-red-500" />
          <Circle className="w-3 h-3 fill-yellow-500 text-yellow-500" />
          <Circle className="w-3 h-3 fill-green-500 text-green-500" />
        </div>

        {/* 导航按钮 */}
        <div className="flex items-center gap-1 ml-1 flex-shrink-0">
          <button className="p-1 rounded hover:bg-muted" disabled>
            <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button className="p-1 rounded hover:bg-muted" disabled>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          {browser.isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-1" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground ml-1" />
          )}
        </div>

        {/* 地址栏 */}
        <div className="flex-1 flex items-center bg-background rounded-md px-3 py-1.5 text-xs border min-w-0">
          {browser.isLoading && (
            <Loader2 className="w-3 h-3 animate-spin text-primary mr-2 flex-shrink-0" />
          )}
          <span className="truncate text-muted-foreground font-mono text-[11px]">
            {displayUrl}
          </span>
        </div>

        {/* 工具按钮 */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {screenshotSrc && (
            <>
              <button
                onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="缩小"
              >
                <ZoomOut className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <span className="text-[10px] text-muted-foreground min-w-[28px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(z => Math.min(3, z + 0.25))}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="放大"
              >
                <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={() => setIsImageExpanded(true)}
                className="p-1 rounded hover:bg-muted transition-colors"
                title="全屏查看截图"
              >
                <Maximize2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </>
          )}
          {browser.url && (
            <a
              href={browser.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded hover:bg-muted transition-colors"
              title="在新窗口打开"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
            </a>
          )}
        </div>
      </div>

      {/* 页面内容区 */}
      <div className="flex-1 relative overflow-auto bg-white dark:bg-zinc-900">
        {screenshotSrc ? (
          <div className="p-2 flex items-start justify-center min-h-full">
            <img
              src={screenshotSrc}
              alt={browser.title || "Browser Preview"}
              className="max-w-full rounded shadow-sm transition-transform duration-200 cursor-pointer"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "top center",
              }}
              onClick={() => {
                if (zoom < 2) setZoom(z => z + 0.5);
                else setZoom(1);
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <Globe className="w-12 h-12 opacity-20" />
            <p className="text-sm">等待 Agent 访问网页...</p>
            <p className="text-xs opacity-60">
              当 Agent 执行搜索时，浏览器截图将在此实时显示
            </p>
          </div>
        )}

        {/* 加载遮罩 */}
        {browser.isLoading && screenshotSrc && (
          <div className="absolute inset-0 bg-background/30 flex items-center justify-center">
            <div className="flex items-center gap-2 bg-background/90 px-4 py-2 rounded-lg shadow-lg">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm">加载中...</span>
            </div>
          </div>
        )}
      </div>

      {/* 页面标题栏 */}
      {browser.title && (
        <div className="px-3 py-1.5 bg-muted/30 border-t text-xs text-muted-foreground truncate">
          {browser.title}
        </div>
      )}

      {/* 全屏截图弹窗 */}
      {isImageExpanded && screenshotSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8 cursor-pointer"
          onClick={() => setIsImageExpanded(false)}
        >
          <img
            src={screenshotSrc}
            alt="Browser screenshot (expanded)"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setIsImageExpanded(false)}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-black/50 rounded-full p-2"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ============ 代码编辑器 Tab ============

function CodeEditor({ code }: { code: CodeState }) {
  // 映射语言名称到 Monaco 语言 ID
  const monacoLanguage = useMemo(() => {
    const langMap: Record<string, string> = {
      markdown: "markdown",
      javascript: "javascript",
      typescript: "typescript",
      python: "python",
      json: "json",
      html: "html",
      css: "css",
      text: "plaintext",
      bash: "shell",
      shell: "shell",
      sql: "sql",
      yaml: "yaml",
      xml: "xml",
      ini: "ini",
    };
    return langMap[code.language] || "markdown";
  }, [code.language]);

  if (!code.code) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <Code2 className="w-10 h-10 opacity-20" />
        <span className="text-sm">等待 Agent 编辑代码...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 文件标签栏 */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-muted/50 border-b overflow-x-auto">
        <div className="flex items-center gap-1.5 px-3 py-1 bg-background rounded-t text-xs font-medium border border-b-0">
          <Code2 className="w-3 h-3" />
          <span>{code.filename || "output"}</span>
          {code.language && (
            <span className="text-muted-foreground">({code.language})</span>
          )}
        </div>
        {/* 历史文件标签 */}
        {code.history && code.history.length > 1 && (
          <span className="text-xs text-muted-foreground ml-2">
            +{code.history.length - 1} 个历史版本
          </span>
        )}
      </div>

      {/* Monaco Editor */}
      <div className="flex-1">
        <Editor
          height="100%"
          language={monacoLanguage}
          value={code.code}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            padding: { top: 8 },
            renderLineHighlight: "none",
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />
      </div>
    </div>
  );
}

// ============ 终端 Tab ============

function TerminalView({ terminal }: { terminal: TerminalState }) {
  const terminalRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminal.lines.length]);

  // 解析 ANSI 转义序列为 HTML
  const parseAnsi = (text: string): string => {
    const colorMap: Record<string, string> = {
      "30": "#1e1e1e",
      "31": "#ef4444",
      "32": "#22c55e",
      "33": "#eab308",
      "34": "#3b82f6",
      "35": "#a855f7",
      "36": "#06b6d4",
      "37": "#d4d4d4",
      "90": "#737373",
    };

    let result = text;
    // Replace ANSI color codes with spans
    result = result.replace(
      /\x1b\[(\d+)m(.*?)(?:\x1b\[0m|$)/g,
      (_, code, content) => {
        const color = colorMap[code];
        if (color) {
          return `<span style="color:${color}">${content}</span>`;
        }
        return content;
      }
    );
    // Remove any remaining escape sequences
    result = result.replace(/\x1b\[\d+m/g, "");
    // Convert \r\n to <br>
    result = result.replace(/\r?\n/g, "<br/>");
    return result;
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* 终端标题栏 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#2d2d2d] border-b border-[#404040]">
        <TerminalIcon className="w-3.5 h-3.5 text-gray-400" />
        <span className="text-xs text-gray-400 font-mono">
          研究代理 — bash
        </span>
      </div>

      {/* 终端内容 */}
      <div
        ref={terminalRef}
        className="flex-1 overflow-auto p-3 font-mono text-xs leading-5 text-gray-300"
      >
        {terminal.lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-500">
            <TerminalIcon className="w-10 h-10 opacity-20" />
            <span className="text-sm">等待 Agent 执行命令...</span>
          </div>
        ) : (
          terminal.lines.map((line, index) => (
            <div
              key={index}
              dangerouslySetInnerHTML={{ __html: parseAnsi(line.content) }}
            />
          ))
        )}
        {/* 光标 */}
        {terminal.lines.length > 0 && (
          <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse" />
        )}
      </div>
    </div>
  );
}

// ============ 主组件 ============

export default function SandboxPanel({
  browser,
  code,
  terminal,
  activeTab,
  onTabChange,
  isConnected,
}: SandboxPanelProps) {
  return (
    <div className="flex flex-col h-full border-l bg-background">
      {/* Tab 栏 */}
      <div className="flex items-center justify-between border-b bg-muted/30">
        <div className="flex items-center">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors relative ${
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground/80"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
                {/* 活跃指示器 */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
                {/* 浏览器加载指示器 */}
                {tab.id === "browser" && browser.isLoading && (
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                )}
              </button>
            );
          })}
        </div>

        {/* 连接状态 */}
        <div className="flex items-center gap-1.5 px-3 text-xs text-muted-foreground">
          {isConnected ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-green-500" />
              <span>已连接</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-red-500" />
              <span>未连接</span>
            </>
          )}
        </div>
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "browser" && <BrowserPreview browser={browser} />}
        {activeTab === "code" && <CodeEditor code={code} />}
        {activeTab === "terminal" && <TerminalView terminal={terminal} />}
      </div>
    </div>
  );
}
