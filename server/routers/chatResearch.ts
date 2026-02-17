/**
 * 对话中启动研究任务的路由
 * 
 * 复用 researchRouter 的核心逻辑，但专门为对话集成场景设计。
 * 返回 taskId 供前端在对话气泡中展示研究进度。
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "../db";
// 研究任务费用（🐟币）- 与独立研究页面保持一致
const RESEARCH_TASK_COST = 10;
export const chatResearchRouter = router({
  /**
   * 从对话中启动研究任务
   * 
   * 核心流程：
   * 1. 检查用户🐟币余额
   * 2. 扣除🐟币
   * 3. 创建 research_tasks 记录
   * 4. 推送到 BullMQ 队列
   * 5. 保存消息到对话记录（关键！确保刷新后不丢失）
   * 6. 返回 taskId 和 conversationId 供前端展示
   */
  startFromChat: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(2, "研究指令至少需要2个字符").max(2000, "研究指令最多2000个字符"),
        conversationId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      // 检查并扣除🐟币
      const deducted = await db.deductFishCoins(
        userId,
        RESEARCH_TASK_COST,
        `对话中深度研究: ${input.prompt.substring(0, 50)}...`
      );
      if (!deducted) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `🐟币余额不足，深度研究需要 ${RESEARCH_TASK_COST} 🐟币`,
        });
      }
      // 创建数据库记录
      const taskId = await db.createResearchTask({
        userId,
        prompt: input.prompt,
        cost: RESEARCH_TASK_COST.toFixed(2),
      });
      // 推送到 BullMQ 队列
      try {
        const { addResearchJob } = await import("../_core/agentQueue");
        const jobId = await addResearchJob({
          taskId,
          userId,
          prompt: input.prompt,
        });
        // 更新 BullMQ Job ID
        await db.updateResearchTaskBullmqJobId(taskId, jobId);
        console.log(`[ChatResearch] Task ${taskId} created from chat (job: ${jobId}, conversation: ${input.conversationId || 'N/A'})`);
      } catch (queueError: any) {
        console.error(`[ChatResearch] Failed to queue task ${taskId}:`, queueError);
        // 队列失败，退还🐟币并标记任务失败
        await db.refundFishCoins(userId, RESEARCH_TASK_COST, `对话研究任务入队失败退款（任务#${taskId}）`);
        await db.updateResearchTaskStatus(taskId, "failed", {
          errorMessage: "任务入队失败: " + queueError.message,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "研究任务创建失败，🐟币已退还。请稍后重试。",
        });
      }

      // ========== 关键修复：保存消息到对话记录 ==========
      // 确保深度研究的用户消息和研究任务卡片消息被持久化到数据库
      // 这样刷新页面后消息不会丢失
      let finalConversationId = input.conversationId;
      try {
        const now = Date.now();
        const userMessage = {
          role: "user",
          content: input.prompt,
          timestamp: now,
          sentAt: now,
        };
        const researchMessage = {
          role: "assistant",
          content: `<ResearchTaskCard taskId="${taskId}" prompt="${input.prompt.replace(/"/g, '&quot;')}" />`,
          timestamp: now + 1,
          isResearchTask: true,
          researchTaskId: taskId,
          researchPrompt: input.prompt,
        };

        if (finalConversationId) {
          // 已有对话：追加消息
          const conversation = await db.getChatConversationById(finalConversationId);
          if (conversation && conversation.userId === userId) {
            const existingMessages = JSON.parse(conversation.messages as string);
            existingMessages.push(userMessage, researchMessage);
            await db.updateChatConversation(finalConversationId, {
              messages: JSON.stringify(existingMessages),
            });
            console.log(`[ChatResearch] Messages saved to existing conversation ${finalConversationId}`);
          }
        } else {
          // 新对话：创建对话并保存消息
          const newConversation = await db.createChatConversation({
            userId,
            modelId: 1, // 默认模型ID，深度研究不依赖特定聊天模型
            title: `深度研究: ${input.prompt.substring(0, 50)}`,
            messages: JSON.stringify([userMessage, researchMessage]),
            packageId: null,
          });
          finalConversationId = Number(newConversation.insertId);
          console.log(`[ChatResearch] New conversation ${finalConversationId} created for research task ${taskId}`);
        }
      } catch (saveError: any) {
        // 消息保存失败不影响研究任务本身
        console.error(`[ChatResearch] Failed to save messages to conversation:`, saveError);
      }

      return {
        taskId,
        cost: RESEARCH_TASK_COST,
        status: "pending" as const,
        conversationId: finalConversationId,
      };
    }),
  /**
   * 获取研究任务费用信息（供前端显示确认弹窗）
   */
  getCost: protectedProcedure.query(async () => {
    return {
      cost: RESEARCH_TASK_COST,
      description: `深度研究将消耗 ${RESEARCH_TASK_COST} 🐟币`,
    };
  }),
});
