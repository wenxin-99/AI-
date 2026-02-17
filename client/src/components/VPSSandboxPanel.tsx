import { useState, useEffect, useRef, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import {
  Terminal,
  Code,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Trash2,
  ArrowLeft,
  FileCode,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface TerminalLine {
  text: string;
  isStderr: boolean;
  timestamp: number;
}

interface FileDiff {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  timestamp: number;
}

interface VPSSandboxPanelProps {
  taskId?: number;
  userId?: number;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 简单的行级 Diff 算法
 */
function computeLineDiff(original: string, modified: string) {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const maxLen = Math.max(origLines.length, modLines.length);
  const result: Array<{
    lineNum: number;
    type: "unchanged" | "added" | "removed" | "modified";
    original?: string;
    modified?: string;
  }> = [];

  for (let i = 0; i < maxLen; i++) {
    const orig = i < origLines.length ? origLines[i] : undefined;
    const mod = i < modLines.length ? modLines[i] : undefined;

    if (orig === mod) {
      result.push({ lineNum: i + 1, type: "unchanged", original: orig, modified: mod });
    } else if (orig === undefined) {
      result.push({ lineNum: i + 1, type: "added", modified: mod });
    } else if (mod === undefined) {
      result.push({ lineNum: i + 1, type: "removed", original: orig });
    } else {
      result.push({ lineNum: i + 1, type: "modified", original: orig, modified: mod });
    }
  }
  return result;
}

export default function VPSSandboxPanel({ taskId, userId, isOpen, onClose }: VPSSandboxPanelProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"terminal" | "diff">("terminal");
  const [isExpanded, setIsExpanded] = useState(false);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [fileDiffs, setFileDiffs] = useState<FileDiff[]>([]);
  const [selectedDiffIndex, setSelectedDiffIndex] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Socket.io 连接
  useEffect(() => {
    if (!isOpen) return;

    const room = taskId ? `ssh_task_${taskId}` : userId ? `ssh_user_${userId}` : null;
    if (!room) return;

    const newSocket = io(window.location.origin, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    newSocket.on("connect", () => {
      console.log("[VPS Panel] Socket connected, joining room:", room);
      newSocket.emit("join-room", room);
    });

    newSocket.on("ssh:output", (data: { data: string; isStderr: boolean; timestamp: number }) => {
      setTerminalLines((prev) => [
        ...prev,
        { text: data.data, isStderr: data.isStderr, timestamp: data.timestamp },
      ]);
    });

    newSocket.on("ssh:complete", (data: { exitCode: number; stdout: string; stderr: string }) => {
      setTerminalLines((prev) => [
        ...prev,
        {
          text: `\n--- 命令执行完成 (exit code: ${data.exitCode}) ---\n`,
          isStderr: false,
          timestamp: Date.now(),
        },
      ]);
    });

    newSocket.on("ssh:error", (data: { error: string }) => {
      setTerminalLines((prev) => [
        ...prev,
        { text: `\n❌ 错误: ${data.error}\n`, isStderr: true, timestamp: Date.now() },
      ]);
    });

    newSocket.on("ssh:file-diff", (data: FileDiff) => {
      setFileDiffs((prev) => [...prev, data]);
      setActiveTab("diff");
      setSelectedDiffIndex(-1); // 将在 useEffect 中更新为最新
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      setSocket(null);
    };
  }, [isOpen, taskId, userId]);

  // 自动选择最新的 diff
  useEffect(() => {
    if (selectedDiffIndex === -1 && fileDiffs.length > 0) {
      setSelectedDiffIndex(fileDiffs.length - 1);
    }
  }, [fileDiffs, selectedDiffIndex]);

  // 终端自动滚动到底部
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLines]);

  // 当前选中的 diff
  const currentDiff = fileDiffs[selectedDiffIndex] || null;
  const diffLines = useMemo(() => {
    if (!currentDiff) return [];
    return computeLineDiff(currentDiff.originalContent, currentDiff.modifiedContent);
  }, [currentDiff]);

  if (!isOpen) return null;

  const panelClass = isExpanded
    ? "fixed inset-0 z-50 bg-white flex flex-col"
    : "fixed right-0 top-0 bottom-0 w-[600px] z-50 bg-white shadow-2xl border-l flex flex-col";

  return (
    <div className={panelClass}>
      {/* 头部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 text-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">VPS 沙箱</span>
          {taskId && <span className="text-xs text-gray-400">任务 #{taskId}</span>}
        </div>
        <div className="flex items-center gap-1">
          {/* Tab 切换 */}
          <div className="flex bg-gray-800 rounded-md mr-2">
            <button
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeTab === "terminal" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"
              }`}
              onClick={() => setActiveTab("terminal")}
            >
              <Terminal className="h-3 w-3 inline mr-1" />
              终端
            </button>
            <button
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                activeTab === "diff" ? "bg-gray-600 text-white" : "text-gray-400 hover:text-white"
              }`}
              onClick={() => setActiveTab("diff")}
            >
              <Code className="h-3 w-3 inline mr-1" />
              Diff ({fileDiffs.length})
            </button>
          </div>

          <button
            className="p-1 hover:bg-gray-700 rounded"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "缩小" : "放大"}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button className="p-1 hover:bg-gray-700 rounded" onClick={onClose} title="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden flex">
        {isExpanded ? (
          /* 展开模式：左右分屏 */
          <>
            <div className="w-1/2 border-r flex flex-col">
              <div className="px-3 py-1.5 bg-gray-100 text-xs text-gray-600 font-medium flex items-center gap-1 shrink-0">
                <Terminal className="h-3 w-3" /> SSH 终端输出
                <button
                  className="ml-auto text-gray-400 hover:text-gray-600"
                  onClick={() => setTerminalLines([])}
                  title="清空"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <div
                ref={terminalRef}
                className="flex-1 overflow-auto bg-gray-950 p-3 font-mono text-xs leading-5"
              >
                {terminalLines.length === 0 ? (
                  <div className="text-gray-500 text-center mt-8">等待 Agent 执行命令...</div>
                ) : (
                  terminalLines.map((line, i) => (
                    <span key={i} className={line.isStderr ? "text-red-400" : "text-green-300"}>
                      {line.text}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="w-1/2 flex flex-col">
              <div className="px-3 py-1.5 bg-gray-100 text-xs text-gray-600 font-medium flex items-center gap-1 shrink-0">
                <Code className="h-3 w-3" /> 代码对比
                {fileDiffs.length > 1 && (
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30"
                      disabled={selectedDiffIndex <= 0}
                      onClick={() => setSelectedDiffIndex((i) => i - 1)}
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </button>
                    <span>
                      {selectedDiffIndex + 1}/{fileDiffs.length}
                    </span>
                    <button
                      className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30"
                      disabled={selectedDiffIndex >= fileDiffs.length - 1}
                      onClick={() => setSelectedDiffIndex((i) => i + 1)}
                    >
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
              {renderDiffView(currentDiff, diffLines)}
            </div>
          </>
        ) : (
          /* 收起模式：单面板 Tab 切换 */
          <>
            {activeTab === "terminal" ? (
              <div className="flex-1 flex flex-col">
                <div className="px-3 py-1.5 bg-gray-100 text-xs text-gray-600 font-medium flex items-center gap-1 shrink-0">
                  <Terminal className="h-3 w-3" /> SSH 终端输出
                  <button
                    className="ml-auto text-gray-400 hover:text-gray-600"
                    onClick={() => setTerminalLines([])}
                    title="清空"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div
                  ref={terminalRef}
                  className="flex-1 overflow-auto bg-gray-950 p-3 font-mono text-xs leading-5"
                >
                  {terminalLines.length === 0 ? (
                    <div className="text-gray-500 text-center mt-8">等待 Agent 执行命令...</div>
                  ) : (
                    terminalLines.map((line, i) => (
                      <span key={i} className={line.isStderr ? "text-red-400" : "text-green-300"}>
                        {line.text}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col">
                <div className="px-3 py-1.5 bg-gray-100 text-xs text-gray-600 font-medium flex items-center gap-1 shrink-0">
                  <Code className="h-3 w-3" /> 代码对比
                  {fileDiffs.length > 1 && (
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30"
                        disabled={selectedDiffIndex <= 0}
                        onClick={() => setSelectedDiffIndex((i) => i - 1)}
                      >
                        <ChevronLeft className="h-3 w-3" />
                      </button>
                      <span>
                        {selectedDiffIndex + 1}/{fileDiffs.length}
                      </span>
                      <button
                        className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30"
                        disabled={selectedDiffIndex >= fileDiffs.length - 1}
                        onClick={() => setSelectedDiffIndex((i) => i + 1)}
                      >
                        <ChevronRight className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
                {renderDiffView(currentDiff, diffLines)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function renderDiffView(
  currentDiff: FileDiff | null,
  diffLines: ReturnType<typeof computeLineDiff>
) {
  if (!currentDiff) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        <div className="text-center">
          <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>等待 Agent 修改文件...</p>
          <p className="text-xs mt-1">修改文件时将自动显示对比视图</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 文件路径 */}
      <div className="px-3 py-1 bg-blue-50 text-xs text-blue-700 font-mono shrink-0 truncate">
        {currentDiff.filePath}
      </div>
      {/* Diff 内容 */}
      <div className="flex-1 overflow-auto font-mono text-xs">
        <table className="w-full border-collapse">
          <tbody>
            {diffLines.map((line, i) => {
              let bgClass = "";
              let prefix = " ";
              if (line.type === "added") {
                bgClass = "bg-green-50";
                prefix = "+";
              } else if (line.type === "removed") {
                bgClass = "bg-red-50";
                prefix = "-";
              } else if (line.type === "modified") {
                bgClass = "bg-yellow-50";
                prefix = "~";
              }

              if (line.type === "modified") {
                return (
                  <React.Fragment key={i}>
                    <tr className="bg-red-50">
                      <td className="px-2 py-0 text-gray-400 text-right select-none w-10 border-r">
                        {line.lineNum}
                      </td>
                      <td className="px-1 py-0 text-red-500 select-none w-4">-</td>
                      <td className="px-2 py-0 text-red-700 whitespace-pre-wrap break-all">
                        {line.original}
                      </td>
                    </tr>
                    <tr className="bg-green-50">
                      <td className="px-2 py-0 text-gray-400 text-right select-none w-10 border-r">
                        {line.lineNum}
                      </td>
                      <td className="px-1 py-0 text-green-500 select-none w-4">+</td>
                      <td className="px-2 py-0 text-green-700 whitespace-pre-wrap break-all">
                        {line.modified}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              }

              return (
                <tr key={i} className={bgClass}>
                  <td className="px-2 py-0 text-gray-400 text-right select-none w-10 border-r">
                    {line.lineNum}
                  </td>
                  <td
                    className={`px-1 py-0 select-none w-4 ${
                      line.type === "added"
                        ? "text-green-500"
                        : line.type === "removed"
                        ? "text-red-500"
                        : "text-gray-300"
                    }`}
                  >
                    {prefix}
                  </td>
                  <td
                    className={`px-2 py-0 whitespace-pre-wrap break-all ${
                      line.type === "added"
                        ? "text-green-700"
                        : line.type === "removed"
                        ? "text-red-700"
                        : "text-gray-700"
                    }`}
                  >
                    {line.type === "removed" ? line.original : line.modified || line.original}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
