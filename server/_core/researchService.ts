/**
 * 自主研究代理服务 - Research Agent Service
 * 
 * 核心逻辑：手动实现"思考 -> 行动 -> 观察"循环。
 * 使用 OpenAI-compatible LLM 进行推理，Tavily REST API 进行搜索。
 * 支持 SSH 远程命令执行和文件编辑（通过 sshService）。
 * 不依赖 LangChain Agent 框架，避免包兼容性问题。
 */
import { storagePut } from "../storage";
import { shouldUseProxy } from "./proxyHelper";
import { SocksProxyAgent } from "socks-proxy-agent";
// Using native fetch (supports undici global proxy)
import { createSandboxEmitter, SandboxEmitter } from "./sandboxEmitter";

// 使用稳定的本地 SOCKS5 代理（端口 1080），而非通过 getProxyAgent() 获取的 VLESS 节点
// VLESS REALITY 节点存在 ECONNRESET 问题，端口 1080 的 xray 进程更稳定
const STABLE_PROXY_URL = process.env.RESEARCH_PROXY_URL || "socks5h://127.0.0.1:1080";

function getStableProxyAgent(): any {
  return new SocksProxyAgent(STABLE_PROXY_URL, {
    connect: { timeout: 30000 },
  });
}

// 研究任务参数
export interface RunResearchParams {
  taskId: number;
  userId: number;
  prompt: string;
  onProgress: (progress: number, currentStep: string) => Promise<void>;
}

// 研究任务结果
export interface RunResearchResult {
  reportUrl: string;
  reportContent: string;
  totalSteps: number;
  totalSearches: number;
}

// LLM 配置
interface LLMConfig {
  apiEndpoint: string;
  apiKey: string;
  modelName: string;
}

// Agent 决策 - 扩展支持 SSH 操作
interface AgentDecision {
  thought: string;
  action: "search" | "finish" | "ssh_exec" | "ssh_file_read" | "ssh_file_write";
  actionInput: string; // 搜索关键词 / 最终报告 / SSH 命令 / 文件路径 / JSON{filePath,content}
}

/**
 * 获取用于研究的 LLM 模型配置
 */
async function getResearchLLMConfig(): Promise<LLMConfig> {
  const { getDb } = await import("../db");
  const db = await getDb();
  
  let apiEndpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1";
  let apiKey = "";
  let modelName = "qwen-plus";
  
  if (db) {
    try {
      const { aiModels } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      
      const models = await db
        .select()
        .from(aiModels)
        .where(
          and(
            eq(aiModels.type, "chat"),
            eq(aiModels.enabled, true)
          )
        );
      
      // 按优先级选择模型
      const preferredModels = ["qwen-max", "qwen-plus", "qwen-turbo"];
      for (const preferred of preferredModels) {
        const found = models.find(m => m.apiModel === preferred);
        if (found && found.apiEndpoint && found.apiKey) {
          apiEndpoint = found.apiEndpoint;
          apiKey = found.apiKey;
          modelName = found.apiModel!;
          break;
        }
      }
      
      if (!apiKey && models.length > 0) {
        const first = models.find(m => m.apiKey && m.apiEndpoint);
        if (first) {
          apiEndpoint = first.apiEndpoint!;
          apiKey = first.apiKey!;
          modelName = first.apiModel || first.name;
        }
      }
    } catch (error) {
      console.warn("[ResearchService] Failed to get model from DB:", error);
    }
  }
  
  if (!apiKey) {
    throw new Error("没有可用的 LLM 模型配置。请在管理面板中配置至少一个 chat 模型。");
  }

  // 确保 endpoint 以 /v1 结尾
  const baseUrl = apiEndpoint.replace(/\/chat\/completions\/?$/, "").replace(/\/$/, "");

  console.log(`[ResearchService] Using model: ${modelName} at ${baseUrl}`);
  return { apiEndpoint: baseUrl, apiKey, modelName };
}

/**
 * 调用 LLM (OpenAI-compatible API)
 */
async function callLLM(
  config: LLMConfig,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const url = `${config.apiEndpoint}/chat/completions`;
  
  // 检查是否需要代理
  const needsProxy = await shouldUseProxy(url);
  const agent = needsProxy ? getStableProxyAgent() : null;
  
  const fetchOptions: any = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      messages,
      temperature: 0.3,
      max_tokens: 8192,
    }),
  };
  
  if (agent) {
    fetchOptions.agent = agent;
    console.log(`[ResearchService] Using stable proxy for LLM request to ${url}`);
  }
  
  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`LLM API error: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * 调用 Tavily Search API
 */
async function tavilySearch(query: string): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY 环境变量未配置。请在 .env 文件中设置 Tavily API 密钥。");
  }

  // Tavily API 需要走代理（IPv4-only 域名）
  // 始终使用稳定的本地 SOCKS5 代理
  const agent = getStableProxyAgent();
  
  const fetchOptions: any = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 5,
      include_answer: true,
      include_raw_content: false,
    }),
    agent,
  };
  
  console.log(`[ResearchService] Using stable proxy for Tavily search: "${query.substring(0, 50)}"`);
  
  const response = await fetch("https://api.tavily.com/search", fetchOptions);

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Tavily API error: ${response.status} - ${errorText.substring(0, 200)}`);
  }

  const data = await response.json();
  
  // 格式化搜索结果
  let formattedResults = "";
  if (data.answer) {
    formattedResults += `**AI 摘要**: ${data.answer}\n\n`;
  }
  if (data.results && Array.isArray(data.results)) {
    for (const result of data.results) {
      formattedResults += `**${result.title}**\n`;
      formattedResults += `URL: ${result.url}\n`;
      formattedResults += `${result.content}\n\n`;
    }
  }
  
  return formattedResults || "未找到相关搜索结果。";
}

/**
 * 获取用户的默认 SSH 配置
 */
async function getDefaultSSHConfig(userId: number): Promise<any | null> {
  try {
    const { getDb } = await import("../db");
    const { sshConfigs } = await import("../../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    
    // 先找默认配置
    let [config] = await db
      .select()
      .from(sshConfigs)
      .where(and(eq(sshConfigs.userId, userId), eq(sshConfigs.isDefault, true), eq(sshConfigs.isActive, true)));
    
    // 没有默认的就找第一个活跃的
    if (!config) {
      [config] = await db
        .select()
        .from(sshConfigs)
        .where(and(eq(sshConfigs.userId, userId), eq(sshConfigs.isActive, true)));
    }
    
    return config || null;
  } catch (err) {
    console.error("[ResearchService] Failed to get SSH config:", err);
    return null;
  }
}

/**
 * 从数据库记录构建 SSH 连接配置
 */
function buildSSHConfigFromRecord(record: any) {
  return {
    host: record.host,
    port: record.port,
    username: record.username,
    authType: record.authType,
    password: record.password ? Buffer.from(record.password, "base64").toString("utf8") : null,
    privateKey: record.privateKey ? Buffer.from(record.privateKey, "base64").toString("utf8") : null,
    passphrase: record.passphrase ? Buffer.from(record.passphrase, "base64").toString("utf8") : null,
    connectTimeout: record.connectTimeout,
  };
}

/**
 * 执行 SSH 命令（供 Agent 使用）
 */
async function agentSSHExec(
  userId: number,
  command: string,
  taskId: number,
  sandbox: SandboxEmitter,
): Promise<string> {
  const config = await getDefaultSSHConfig(userId);
  if (!config) {
    return "错误：没有可用的 SSH 配置。请先在管理面板中添加 SSH 服务器配置。";
  }
  
  const sshConfig = buildSSHConfigFromRecord(config);
  
  // 在终端显示命令
  sandbox.onTerminalExec(`ssh ${config.username}@${config.host} "${command}"`, "");
  
  try {
    const { sshExecStream } = await import("./sshService");
    let output = "";
    const result = await sshExecStream(sshConfig, command, (data, isStderr) => {
      output += data;
      // 实时推送终端输出
      const prefix = isStderr ? "\x1b[31m" : "\x1b[37m";
      const { emitTerminalOutput } = require("./socketManager");
      emitTerminalOutput(taskId, `${prefix}${data}\x1b[0m`);
    }, 30000);
    
    const fullOutput = result.stdout + (result.stderr ? `\n[STDERR] ${result.stderr}` : "");
    return `[Exit Code: ${result.exitCode}]\n${fullOutput}`.substring(0, 5000);
  } catch (err: any) {
    const errMsg = `SSH 命令执行失败: ${err.message}`;
    sandbox.onTerminalExec("", `\x1b[31m${errMsg}\x1b[0m`);
    return errMsg;
  }
}

/**
 * 读取远程文件（供 Agent 使用）
 */
async function agentSSHFileRead(
  userId: number,
  filePath: string,
  taskId: number,
  sandbox: SandboxEmitter,
): Promise<string> {
  const config = await getDefaultSSHConfig(userId);
  if (!config) {
    return "错误：没有可用的 SSH 配置。";
  }
  
  const sshConfig = buildSSHConfigFromRecord(config);
  sandbox.onTerminalExec(`cat "${filePath}"`, "");
  
  try {
    const { sshReadFile } = await import("./sshService");
    const fileInfo = await sshReadFile(sshConfig, filePath);
    
    // 在代码面板显示文件内容
    const ext = filePath.split(".").pop() || "txt";
    const langMap: Record<string, string> = {
      ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
      py: "python", sh: "bash", json: "json", yaml: "yaml", yml: "yaml",
      md: "markdown", html: "html", css: "css", sql: "sql", conf: "ini",
      nginx: "nginx", xml: "xml", env: "bash",
    };
    const language = langMap[ext] || "plaintext";
    sandbox.onCodeUpdate(fileInfo.content, language, filePath);
    
    return `文件: ${filePath} (${fileInfo.size} bytes)\n\n${fileInfo.content}`.substring(0, 8000);
  } catch (err: any) {
    return `读取文件失败: ${err.message}`;
  }
}

/**
 * 写入远程文件（供 Agent 使用，自动备份）
 */
async function agentSSHFileWrite(
  userId: number,
  filePath: string,
  content: string,
  taskId: number,
  sandbox: SandboxEmitter,
): Promise<string> {
  const config = await getDefaultSSHConfig(userId);
  if (!config) {
    return "错误：没有可用的 SSH 配置。";
  }
  
  const sshConfig = buildSSHConfigFromRecord(config);
  sandbox.onTerminalExec(`write "${filePath}"`, "");
  
  try {
    const { sshReadFile, sshWriteFile, sshBackupFile } = await import("./sshService");
    const { sshFileBackups } = await import("../../drizzle/schema");
    const { getDb } = await import("../db");
    
    // 读取原始内容用于备份
    let originalContent = "";
    try {
      const fileInfo = await sshReadFile(sshConfig, filePath);
      originalContent = fileInfo.content;
    } catch {
      originalContent = "";
    }
    
    // 保存备份到数据库
    const db = await getDb();
    await db.insert(sshFileBackups).values({
      sshConfigId: config.id,
      taskId,
      filePath,
      originalContent,
      modifiedContent: content,
      rolledBack: false,
    });
    
    // 在远程服务器创建 .bak 备份
    if (originalContent) {
      try {
        await sshBackupFile(sshConfig, filePath);
      } catch {
        // 备份失败不阻塞
      }
    }
    
    // 写入新内容
    await sshWriteFile(sshConfig, filePath, content);
    
    // 推送代码更新事件（显示 diff）
    const { emitCodeUpdate } = await import("./socketManager");
    emitCodeUpdate(taskId, content, "typescript", filePath);
    
    const { emitTerminalOutput } = await import("./socketManager");
    emitTerminalOutput(taskId, `\x1b[32m✓ 文件已写入: ${filePath}\x1b[0m\r\n`);
    
    return `文件已成功写入: ${filePath}${originalContent ? " (已自动备份原始文件)" : " (新文件)"}`;
  } catch (err: any) {
    return `写入文件失败: ${err.message}`;
  }
}

/**
 * 让 LLM 做出下一步决策
 */
async function getAgentDecision(
  config: LLMConfig,
  originalPrompt: string,
  history: Array<{ thought: string; action: string; observation: string }>,
  iteration: number,
  maxIterations: number,
  hasSSH: boolean,
): Promise<AgentDecision> {
  // SSH 工具描述（仅在用户有 SSH 配置时提供）
  const sshToolsDesc = hasSSH ? `
5. **ssh_exec**: 在远程 VPS 上执行 Shell 命令。actionInput 为要执行的命令字符串。
6. **ssh_file_read**: 读取远程 VPS 上的文件内容。actionInput 为文件绝对路径。
7. **ssh_file_write**: 写入/修改远程 VPS 上的文件（自动备份）。actionInput 为 JSON 格式: {"filePath": "/path/to/file", "content": "文件内容"}
` : "";

  const sshRulesDesc = hasSSH ? `
6. 当任务涉及服务器操作（部署、配置、调试等），优先使用 ssh_exec 执行命令。
7. 修改文件前先用 ssh_file_read 查看当前内容，然后用 ssh_file_write 写入修改后的完整内容。
8. ssh_file_write 会自动备份原始文件，支持回滚。
` : "";

  const availableActions = hasSSH 
    ? "search、finish、ssh_exec、ssh_file_read、ssh_file_write" 
    : "search、finish";

  const systemPrompt = `你是一个专业的自主研究代理（Autonomous Research Agent）。你的任务是根据用户的研究指令，通过多次在线搜索来收集全面、准确的信息，并最终生成一份高质量的研究报告。${hasSSH ? "你还可以通过 SSH 在远程 VPS 服务器上执行命令和编辑文件。" : ""}

## 工作模式

你需要在每一步中做出决策，格式如下：

**思考**: [分析当前已有信息，决定下一步行动]
**行动**: ${availableActions}
**行动输入**: [对应行动的输入]

## 可用行动

1. **search**: 在线搜索信息。actionInput 为搜索关键词。
2. **finish**: 完成任务并输出最终报告。actionInput 为最终 Markdown 报告内容。
3. 当 action 为 search 时，actionInput 为搜索关键词。
4. 当 action 为 finish 时，actionInput 为最终 Markdown 报告。${sshToolsDesc}

## 规则

1. 每次只能执行一个行动。
2. 搜索时，使用精确、具体的关键词。如果之前的搜索结果不理想，换一种关键词。
3. 当你认为已经收集了足够的信息时，使用 finish 行动输出最终报告。
4. 你最多可以执行 ${maxIterations} 次行动。当前是第 ${iteration + 1} 次决策。
5. 如果这是最后一次决策（第 ${maxIterations} 次），你必须使用 finish 行动。${sshRulesDesc}

## 报告格式要求（finish 时）

最终报告必须使用 Markdown 格式，包含：
- **标题**: 明确的研究主题
- **摘要**: 简洁的研究发现概述（200字以内）
- **正文**: 按主题分节，每节包含详细分析
- **结论**: 总结关键发现和建议
- **参考来源**: 列出所有引用的信息来源 URL

使用中文撰写报告（除非用户明确要求其他语言）。

## 输出格式

你必须严格按照以下 JSON 格式输出，不要输出任何其他内容：

\`\`\`json
{
  "thought": "你的思考过程",
  "action": "${availableActions} 中的一个",
  "actionInput": "对应行动的输入"
}
\`\`\``;

  // 构建历史消息
  let historyText = "";
  if (history.length > 0) {
    historyText = "\n\n## 已有研究记录\n\n";
    for (let i = 0; i < history.length; i++) {
      historyText += `### 第 ${i + 1} 轮\n`;
      historyText += `**思考**: ${history[i].thought}\n`;
      historyText += `**行动**: ${history[i].action}\n`;
      historyText += `**结果**: ${history[i].observation.substring(0, 1500)}\n\n`;
    }
  }

  const userMessage = `## 研究指令\n\n${originalPrompt}${historyText}\n\n请做出下一步决策。记住使用严格的 JSON 格式输出。`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const response = await callLLM(config, messages);
  
  // 解析 JSON 响应
  try {
    // 尝试从 markdown code block 中提取 JSON
    const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) || 
                      response.match(/\{[\s\S]*"thought"[\s\S]*"action"[\s\S]*"actionInput"[\s\S]*\}/);
    
    let jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
    jsonStr = jsonStr.trim();
    
    const parsed = JSON.parse(jsonStr);
    
    const validActions = ["search", "finish", "ssh_exec", "ssh_file_read", "ssh_file_write"];
    const action = validActions.includes(parsed.action) ? parsed.action : "search";
    
    return {
      thought: parsed.thought || "无思考内容",
      action: action as AgentDecision["action"],
      actionInput: parsed.actionInput || "",
    };
  } catch (parseError) {
    console.warn(`[ResearchService] Failed to parse LLM response as JSON, attempting fallback:`, response.substring(0, 200));
    
    // 如果是最后一次迭代，将整个响应作为报告
    if (iteration >= maxIterations - 1) {
      return {
        thought: "解析失败，将响应作为最终报告",
        action: "finish",
        actionInput: response,
      };
    }
    
    // 否则尝试提取搜索关键词
    return {
      thought: response.substring(0, 200),
      action: "search",
      actionInput: originalPrompt.substring(0, 100),
    };
  }
}

/**
 * 执行自主研究任务
 */
export async function runResearchTask(params: RunResearchParams): Promise<RunResearchResult> {
  const { taskId, userId, prompt, onProgress } = params;
  const MAX_ITERATIONS = 10;
  
  // 创建沙箱事件发射器，用于实时推送 Agent 状态到前端
  const sandbox = createSandboxEmitter(taskId);
  
  console.log(`[ResearchService] Starting research task ${taskId}: "${prompt.substring(0, 100)}..."`);  
  sandbox.onStatusChange("running", "研究任务已启动");
  
  await onProgress(5, "正在初始化研究代理...");
  
  // 初始化 LLM 配置
  const llmConfig = await getResearchLLMConfig();
  
  // 检查是否有可用的 SSH 配置
  const sshConfig = await getDefaultSSHConfig(userId);
  const hasSSH = !!sshConfig;
  if (hasSSH) {
    console.log(`[ResearchService] SSH available: ${sshConfig.username}@${sshConfig.host}:${sshConfig.port}`);
    sandbox.onTerminalExec("", `\x1b[36mSSH 已连接: ${sshConfig.username}@${sshConfig.host}:${sshConfig.port}\x1b[0m\r\n`);
  }
  
  await onProgress(10, "研究代理已初始化，开始分析研究指令...");
  
  // 步骤记录
  let stepNumber = 0;
  let totalSearches = 0;
  const history: Array<{ thought: string; action: string; observation: string }> = [];
  const { createResearchTaskStep } = await import("../db");
  
  let finalReport = "";
  
  // 思考-行动-观察 循环
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const isLastIteration = iteration >= MAX_ITERATIONS - 1;
    
    console.log(`[ResearchService] Task ${taskId} - Iteration ${iteration + 1}/${MAX_ITERATIONS}`);
    
    // 1. 获取 Agent 决策（思考 + 行动）
    let decision: AgentDecision;
    try {
      decision = await getAgentDecision(llmConfig, prompt, history, iteration, MAX_ITERATIONS, hasSSH);
    } catch (error: any) {
      console.error(`[ResearchService] LLM decision error:`, error.message);
      // 如果 LLM 调用失败，尝试直接搜索原始 prompt
      if (iteration === 0) {
        decision = {
          thought: `LLM 决策失败 (${error.message})，直接搜索原始指令`,
          action: "search",
          actionInput: prompt.substring(0, 200),
        };
      } else {
        // 如果已有历史搜索结果，尝试生成报告
        decision = {
          thought: `LLM 决策失败，基于已有信息生成报告`,
          action: "finish",
          actionInput: "",
        };
      }
    }
    
    // 记录思考步骤
    stepNumber++;
    sandbox.onThink(decision.thought, stepNumber);
    await createResearchTaskStep({
      taskId,
      stepNumber,
      type: "thought",
      content: decision.thought,
    });
    
    const progressPercent = Math.min(80, 10 + Math.floor(((iteration + 1) / MAX_ITERATIONS) * 70));
    
    if (decision.action === "finish") {
      // 完成研究
      finalReport = decision.actionInput;
      
      // 如果 actionInput 为空（LLM 失败回退），基于历史生成简单报告
      if (!finalReport && history.length > 0) {
        finalReport = await generateFallbackReport(llmConfig, prompt, history);
      }
      
      stepNumber++;
      await createResearchTaskStep({
        taskId,
        stepNumber,
        type: "summary",
        content: finalReport.substring(0, 500) + (finalReport.length > 500 ? "..." : ""),
      });
      
      await onProgress(progressPercent, "研究完成，正在整理报告...");
      break;
    }
    
    // 2. 执行行动
    let observation = "";
    const actionLabel = decision.action;
    
    if (decision.action === "search") {
      // === 搜索行动 ===
      stepNumber++;
      const searchQuery = decision.actionInput;
      totalSearches++;
      
      await sandbox.onSearch(searchQuery, stepNumber);
      
      await createResearchTaskStep({
        taskId,
        stepNumber,
        type: "action",
        content: `搜索: ${searchQuery}`,
        toolName: "tavily_search",
        toolInput: searchQuery,
      });
      
      await onProgress(progressPercent, `正在搜索: "${searchQuery.substring(0, 50)}..." (第${totalSearches}次搜索)`);
      
      try {
        observation = await tavilySearch(searchQuery);
      } catch (searchError: any) {
        console.warn(`[ResearchService] Search failed:`, searchError.message);
        observation = `搜索失败: ${searchError.message}`;
      }
      
    } else if (decision.action === "ssh_exec") {
      // === SSH 命令执行 ===
      stepNumber++;
      const command = decision.actionInput;
      
      await createResearchTaskStep({
        taskId,
        stepNumber,
        type: "action",
        content: `SSH 执行: ${command}`,
        toolName: "ssh_exec",
        toolInput: command,
      });
      
      await onProgress(progressPercent, `正在执行命令: "${command.substring(0, 50)}..."`);
      observation = await agentSSHExec(userId, command, taskId, sandbox);
      
    } else if (decision.action === "ssh_file_read") {
      // === SSH 文件读取 ===
      stepNumber++;
      const filePath = decision.actionInput;
      
      await createResearchTaskStep({
        taskId,
        stepNumber,
        type: "action",
        content: `读取文件: ${filePath}`,
        toolName: "ssh_file_read",
        toolInput: filePath,
      });
      
      await onProgress(progressPercent, `正在读取文件: ${filePath}`);
      observation = await agentSSHFileRead(userId, filePath, taskId, sandbox);
      
    } else if (decision.action === "ssh_file_write") {
      // === SSH 文件写入 ===
      stepNumber++;
      let filePath = "";
      let content = "";
      
      try {
        const parsed = JSON.parse(decision.actionInput);
        filePath = parsed.filePath;
        content = parsed.content;
      } catch {
        // 如果不是 JSON，尝试简单解析
        const lines = decision.actionInput.split("\n");
        filePath = lines[0].trim();
        content = lines.slice(1).join("\n");
      }
      
      await createResearchTaskStep({
        taskId,
        stepNumber,
        type: "action",
        content: `写入文件: ${filePath}`,
        toolName: "ssh_file_write",
        toolInput: filePath,
      });
      
      await onProgress(progressPercent, `正在写入文件: ${filePath}`);
      observation = await agentSSHFileWrite(userId, filePath, content, taskId, sandbox);
    }
    
    // 3. 记录观察结果
    stepNumber++;
    sandbox.onObserve(observation, stepNumber);
    await createResearchTaskStep({
      taskId,
      stepNumber,
      type: "observation",
      content: observation.length > 2000 ? observation.substring(0, 2000) + "..." : observation,
    });
    
    // 记录历史
    history.push({
      thought: decision.thought,
      action: `${actionLabel}: ${decision.actionInput.substring(0, 200)}`,
      observation,
    });
    
    // 如果是最后一次迭代但 Agent 没有选择 finish，强制生成报告
    if (isLastIteration) {
      console.log(`[ResearchService] Max iterations reached, forcing report generation`);
      await onProgress(80, "达到最大搜索次数，正在生成报告...");
      finalReport = await generateFallbackReport(llmConfig, prompt, history);
      
      stepNumber++;
      await createResearchTaskStep({
        taskId,
        stepNumber,
        type: "summary",
        content: finalReport.substring(0, 500) + (finalReport.length > 500 ? "..." : ""),
      });
    }
  }
  
  // 如果循环结束仍没有报告
  if (!finalReport) {
    finalReport = "## 研究未能完成\n\n研究代理未能在限定步骤内生成有效报告。请尝试使用更具体的研究指令重新提交。";
  }
  
  sandbox.onReportGenerated(finalReport);
  await onProgress(90, "正在上传报告到存储...");
  
  // 上传报告到 S3
  const reportKey = `research-reports/task-${taskId}-${Date.now()}.md`;
  let reportUrl = "";
  
  try {
    const uploadResult = await storagePut(
      reportKey,
      Buffer.from(finalReport, "utf-8"),
      "text/markdown"
    );
    reportUrl = uploadResult.url;
    console.log(`[ResearchService] Report uploaded to: ${reportUrl}`);
  } catch (uploadError: any) {
    console.warn(`[ResearchService] Failed to upload report to S3: ${uploadError.message}`);
    reportUrl = "";
  }
  
  await onProgress(95, "报告已生成，正在完成最终处理...");
  
  console.log(`[ResearchService] Task ${taskId} completed: ${stepNumber} steps, ${totalSearches} searches`);
  
  sandbox.onStatusChange("completed", "研究任务已完成");
  sandbox.onProgress(100, "完成");
  
  return {
    reportUrl,
    reportContent: finalReport,
    totalSteps: stepNumber,
    totalSearches,
  };
}

/**
 * 基于已有搜索历史生成回退报告
 */
async function generateFallbackReport(
  config: LLMConfig,
  originalPrompt: string,
  history: Array<{ thought: string; action: string; observation: string }>,
): Promise<string> {
  const historyText = history.map((h, i) => 
    `### 步骤 ${i + 1}: ${h.action}\n${h.observation.substring(0, 1500)}`
  ).join("\n\n");

  const messages = [
    {
      role: "system",
      content: `你是一个专业的研究报告撰写者。请根据以下搜索结果，生成一份高质量的 Markdown 研究报告。

报告必须包含：
- 标题
- 摘要（200字以内）
- 正文（按主题分节）
- 结论
- 参考来源

使用中文撰写。`,
    },
    {
      role: "user",
      content: `## 研究指令\n\n${originalPrompt}\n\n## 搜索结果\n\n${historyText}\n\n请基于以上信息生成研究报告。`,
    },
  ];

  try {
    return await callLLM(config, messages);
  } catch (error: any) {
    console.error(`[ResearchService] Fallback report generation failed:`, error.message);
    // 最后的回退：直接拼接搜索结果
    return `# ${originalPrompt}\n\n## 研究结果\n\n${historyText}\n\n## 注意\n\n报告生成失败，以上为原始搜索结果。`;
  }
}
