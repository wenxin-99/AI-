/**
 * 沙箱事件发射器
 * 
 * 为 researchService 提供一个简洁的接口来发射沙箱事件。
 * 封装了 Socket.io 广播和 Playwright 截图的调用逻辑。
 * 
 * 使用方式：
 *   const emitter = createSandboxEmitter(taskId);
 *   await emitter.onSearch(query, results);
 *   await emitter.onThink(thought);
 *   await emitter.onFinish(report);
 */
import {
  emitBrowserNavigate,
  emitBrowserScreenshot,
  emitBrowserLoading,
  emitCodeUpdate,
  emitTerminalCommand,
  emitTerminalOutput,
  emitAgentThinking,
  emitAgentSearching,
  emitAgentStep,
  emitTaskStatus,
  emitTaskProgress,
} from "./socketManager";
import { captureScreenshot, CaptureResult } from "./browserCapture";

export interface SandboxEmitter {
  /** Agent 开始思考 */
  onThink: (thought: string, stepNumber: number) => void;

  /** Agent 开始搜索 - 会自动触发 Playwright 截图 */
  onSearch: (query: string, stepNumber: number) => Promise<void>;

  /** Agent 观察到搜索结果 */
  onObserve: (observation: string, stepNumber: number) => void;

  /** Agent 访问了一个 URL（触发截图） */
  onBrowse: (url: string) => Promise<CaptureResult>;

  /** 代码内容更新 */
  onCodeUpdate: (code: string, language: string, filename?: string) => void;

  /** 终端命令执行 */
  onTerminalExec: (command: string, output: string) => void;

  /** 任务进度更新 */
  onProgress: (progress: number, currentStep: string) => void;

  /** 任务状态变更 */
  onStatusChange: (status: string, message?: string) => void;

  /** 研究报告生成完成 */
  onReportGenerated: (report: string) => void;
}

/**
 * 为特定任务创建沙箱事件发射器
 */
export function createSandboxEmitter(taskId: number): SandboxEmitter {
  return {
    onThink(thought: string, stepNumber: number) {
      emitAgentThinking(taskId, thought);
      emitAgentStep(taskId, "think", thought, stepNumber);
      // 同时在终端显示思考过程
      emitTerminalOutput(taskId, `\x1b[33m[思考 #${stepNumber}]\x1b[0m ${thought.substring(0, 200)}...\r\n`);
    },

    async onSearch(query: string, stepNumber: number) {
      emitAgentSearching(taskId, query);
      emitAgentStep(taskId, "search", query, stepNumber);
      
      // 终端显示搜索命令
      emitTerminalCommand(taskId, `tavily_search "${query}"`);
      emitTerminalOutput(taskId, `\x1b[36m$ tavily_search "${query}"\x1b[0m\r\n`);
      emitTerminalOutput(taskId, `\x1b[90m搜索中...\x1b[0m\r\n`);

      // 使用 Playwright 截图搜索引擎页面
      const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-Hans`;
      emitBrowserLoading(taskId, searchUrl);
      emitBrowserNavigate(taskId, searchUrl);

      try {
        const result = await captureScreenshot(searchUrl, {
          timeout: 12000,
          waitAfterLoad: 1500,
          quality: 55,
        });

        if (result.success && result.screenshotBase64) {
          emitBrowserScreenshot(
            taskId,
            result.screenshotBase64,
            result.url || searchUrl,
            result.title || `搜索: ${query}`
          );
        }
      } catch (err: any) {
        console.warn(`[SandboxEmitter] Screenshot failed for search: ${err.message}`);
      }
    },

    onObserve(observation: string, stepNumber: number) {
      emitAgentStep(taskId, "observe", observation, stepNumber);
      
      // 终端显示搜索结果摘要
      const summary = observation.substring(0, 300).replace(/\n/g, "\r\n");
      emitTerminalOutput(taskId, `\x1b[32m[结果]\x1b[0m ${summary}\r\n\r\n`);

      // 代码面板显示完整的搜索结果（JSON 格式）
      emitCodeUpdate(taskId, observation, "markdown", `search_result_${stepNumber}.md`);
    },

    async onBrowse(url: string): Promise<CaptureResult> {
      emitBrowserNavigate(taskId, url);
      emitBrowserLoading(taskId, url);
      emitTerminalOutput(taskId, `\x1b[36m$ browse "${url}"\x1b[0m\r\n`);

      const result = await captureScreenshot(url, {
        timeout: 15000,
        waitAfterLoad: 2000,
        quality: 60,
      });

      if (result.success && result.screenshotBase64) {
        emitBrowserScreenshot(
          taskId,
          result.screenshotBase64,
          result.url || url,
          result.title || url
        );
        emitTerminalOutput(taskId, `\x1b[32m✓ 页面加载完成: ${result.title || url}\x1b[0m\r\n`);
      } else {
        emitTerminalOutput(taskId, `\x1b[31m✗ 页面加载失败: ${result.error}\x1b[0m\r\n`);
      }

      return result;
    },

    onCodeUpdate(code: string, language: string, filename?: string) {
      emitCodeUpdate(taskId, code, language, filename);
    },

    onTerminalExec(command: string, output: string) {
      emitTerminalCommand(taskId, command);
      emitTerminalOutput(taskId, `\x1b[36m$ ${command}\x1b[0m\r\n${output}\r\n`);
    },

    onProgress(progress: number, currentStep: string) {
      emitTaskProgress(taskId, progress, currentStep);
    },

    onStatusChange(status: string, message?: string) {
      emitTaskStatus(taskId, status, message);
    },

    onReportGenerated(report: string) {
      // 在代码面板显示最终报告
      emitCodeUpdate(taskId, report, "markdown", "research_report.md");
      emitTerminalOutput(taskId, `\r\n\x1b[32m═══════════════════════════════════════\x1b[0m\r\n`);
      emitTerminalOutput(taskId, `\x1b[32m  ✓ 研究报告生成完成\x1b[0m\r\n`);
      emitTerminalOutput(taskId, `\x1b[32m═══════════════════════════════════════\x1b[0m\r\n`);
      emitTaskStatus(taskId, "completed", "研究报告已生成");
    },
  };
}
