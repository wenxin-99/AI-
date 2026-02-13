import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { aiModels } from "../drizzle/schema";
import { eq, desc, and } from "drizzle-orm";
import { getUserByOpenId } from "./db";
import { nanoid } from "nanoid";
import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { notifyOwner } from "./_core/notification";
import { sendNotificationToUser } from "./_core/notifications";
import { storagePut } from "./storage";
import { transcribeAudio } from "./_core/voiceTranscription";
import axios from "axios";
import { externalOAuthConfig } from "./_core/externalOAuth";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { getVideoTaskStatus } from "./_core/videoGeneration";

/**
 * 恢复pending/processing的视频任务（服务器启动时调用）
 */
export async function recoverVideoTasks(): Promise<void> {
  console.log("[Video Recovery] Starting recovery of pending/processing tasks...");
  
  try {
    // 获取所有pending或processing状态的任务
    const dbInstance = await db.getDb();
    if (!dbInstance) {
      console.error("[Video Recovery] Database not available");
      return;
    }

    const { videoGenerationTasks } = await import("../drizzle/schema");
    const { eq, or } = await import("drizzle-orm");
    
    const tasks = await dbInstance
      .select()
      .from(videoGenerationTasks)
      .where(
        or(
          eq(videoGenerationTasks.status, "pending"),
          eq(videoGenerationTasks.status, "processing")
        )
      );

    if (tasks.length === 0) {
      console.log("[Video Recovery] No tasks to recover");
      return;
    }

    console.log(`[Video Recovery] Found ${tasks.length} tasks to recover`);

    // 为每个任务启动后台轮询
    for (const task of tasks) {
      if (task.polloTaskId) {
        console.log(`[Video Recovery] Recovering task ${task.id} (Pollo: ${task.polloTaskId})`);
        pollVideoTaskInBackground(task.id, task.polloTaskId, task.retryCount || 0).catch((error) => {
          console.error(`[Video Recovery] Failed to recover task ${task.id}:`, error);
        });
      } else {
        console.warn(`[Video Recovery] Task ${task.id} has no polloTaskId, marking as failed`);
        await db.updateVideoTaskStatus(task.id, "failed");
        await db.updateVideoTaskError(task.id, "服务器重启后无法恢复任务");
        // 退款
        if (task.cost) {
          await db.refundFishCoins(task.userId, parseFloat(task.cost), `视频生成失败退款（任务#${task.id}）`);
        }
      }
    }

    console.log("[Video Recovery] Recovery process completed");
  } catch (error) {
    console.error("[Video Recovery] Error during recovery:", error);
  }
}

/**
 * 后台轮询视频生成任务状态（带重试机制）
 * @param taskId 数据库任务ID
 * @param polloTaskId Pollo AI任务ID
 * @param retryCount 当前重试次数
 */
async function pollVideoTaskInBackground(taskId: number, polloTaskId: string, retryCount: number = 0): Promise<void> {
  const maxAttempts = 60; // 最多轮询60次（约5分钟）
  const intervalMs = 5000; // 每5秒轮询一次
  const maxRetries = 3; // 最多重试3次

  console.log(`[Video Polling] Starting background polling for task ${taskId} (Pollo: ${polloTaskId}, retry: ${retryCount})`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      const status = await getVideoTaskStatus(polloTaskId);
      console.log(`[Video Polling] Task ${taskId} status (attempt ${attempt + 1}/${maxAttempts}):`, status.status);

      // 更新进度和状态
      let progress = 10; // 默认进度
      let taskStatus = "pending"; // 默认状态
      
      if (status.status === "waiting") {
        progress = Math.min(10 + attempt * 1, 30); // 等待中：10-30%
        taskStatus = "processing"; // waiting也算是处理中
      } else if (status.status === "processing") {
        progress = Math.min(30 + attempt * 2, 90); // 处理中：30-90%
        taskStatus = "processing";
      } else if (status.status === "succeed") {
        progress = 100;
        taskStatus = "completed";
      }
      
      await db.updateVideoTaskProgress(taskId, progress);
      await db.updateVideoTaskStatus(taskId, taskStatus);

      if (status.status === "succeed") {
        // 视频生成成功
        await db.updateVideoTaskStatus(taskId, "completed");
        if (status.videoUrl) {
          // 更新videoGenerationTasks表的videoUrl字段
          await db.updateVideoTaskUrl(taskId, status.videoUrl);
          // 创建视频记录
          const task = await db.getVideoTask(taskId);
          if (task) {
            await db.saveGeneratedVideo({
              userId: task.userId,
              prompt: task.prompt,
              videoUrl: status.videoUrl,
              thumbnailUrl: status.videoUrl, // Pollo暂不提供缩略图，使用视频URL
              duration: task.duration,
              provider: task.provider || "pollo",
              cost: parseFloat(task.cost),
            });
            
            // 发送成功SSE通知
            try {
              await sendNotificationToUser(task.userId, {
                type: "video_generation_success",
                title: "视频生成成功",
                message: `任务 #${taskId} 已完成，点击查看视频`,
                data: {
                  taskId,
                  videoUrl: status.videoUrl,
                  prompt: task.prompt,
                },
              });
              console.log(`[Video Polling] Sent success notification to user ${task.userId}`);
            } catch (notifyError) {
              console.error(`[Video Polling] Failed to send success notification for task ${taskId}:`, notifyError);
            }
          }
        }
        console.log(`[Video Polling] Task ${taskId} completed successfully`);
        return;
      } else if (status.status === "failed") {
        // 视频生成失败，尝试重试
        console.error(`[Video Polling] Task ${taskId} failed:`, status.errorMessage);
        
        if (retryCount < maxRetries) {
          // 还有重试机会
          const newRetryCount = retryCount + 1;
          console.log(`[Video Polling] Retrying task ${taskId} (attempt ${newRetryCount}/${maxRetries})`);
          
          // 更新重试次数
          await db.incrementVideoTaskRetryCount(taskId);
          
          // 重新提交任务
          const task = await db.getVideoTask(taskId);
          if (task) {
            const { generateVideo } = await import("./_core/videoGeneration");
            const result = await generateVideo({
              prompt: task.prompt,
              duration: task.duration,
              style: task.style || undefined,
            });
            
            if (result.taskId) {
              // 更新polloTaskId
              await db.updateVideoTaskPolloId(taskId, result.taskId);
              // 开始新的轮询
              pollVideoTaskInBackground(taskId, result.taskId, newRetryCount).catch(console.error);
              return;
            }
          }
        }
        
        // 重试次数用尽或重试失败，退款
        await handleVideoTaskFailure(taskId, status.errorMessage || "视频生成失败");
        return;
      }

      // 继续等待（waiting或processing状态）
    } catch (error: any) {
      console.error(`[Video Polling] Error polling task ${taskId} (attempt ${attempt + 1}):`, error);
      // 继续尝试
    }
  }

  // 超时，尝试重试
  if (retryCount < maxRetries) {
    const newRetryCount = retryCount + 1;
    console.log(`[Video Polling] Task ${taskId} timed out, retrying (attempt ${newRetryCount}/${maxRetries})`);
    
    await db.incrementVideoTaskRetryCount(taskId);
    
    const task = await db.getVideoTask(taskId);
    if (task) {
      const { generateVideo } = await import("./_core/videoGeneration");
      const result = await generateVideo({
        prompt: task.prompt,
        duration: task.duration,
        style: task.style || undefined,
      });
      
      if (result.taskId) {
        await db.updateVideoTaskPolloId(taskId, result.taskId);
        pollVideoTaskInBackground(taskId, result.taskId, newRetryCount).catch(console.error);
        return;
      }
    }
  }
  
  // 重试次数用尽，退款
  await handleVideoTaskFailure(taskId, "视频生成超时（超过5分钟）");
}

/**
 * 处理视频任务失败：更新状态、退款并发送通知
 */
async function handleVideoTaskFailure(taskId: number, errorMessage: string): Promise<void> {
  console.log(`[Video Polling] Handling failure for task ${taskId}: ${errorMessage}`);
  
  // 更新任务状态
  await db.updateVideoTaskStatus(taskId, "failed");
  await db.updateVideoTaskError(taskId, errorMessage);
  
  // 退款
  const task = await db.getVideoTask(taskId);
  if (task && task.cost) {
    try {
      const refundAmount = parseFloat(task.cost);
      await db.refundFishCoins(task.userId, refundAmount, `视频生成失败退款（任务#${taskId}）`);
      console.log(`[Video Polling] Refunded ${task.cost} 鱼币 to user ${task.userId} for failed task ${taskId}`);
      
      // 发送SSE通知
      try {
        await sendNotificationToUser(task.userId, {
          type: "video_generation_failed",
          title: "视频生成失败",
          message: `任务 #${taskId} 生成失败：${errorMessage}\n\n已退款 ${refundAmount.toFixed(2)} 🐟币`,
          data: {
            taskId,
            errorMessage,
            refundAmount,
          },
        });
        console.log(`[Video Polling] Sent failure notification to user ${task.userId}`);
      } catch (notifyError) {
        console.error(`[Video Polling] Failed to send notification for task ${taskId}:`, notifyError);
      }
    } catch (error) {
      console.error(`[Video Polling] Failed to refund for task ${taskId}:`, error);
    }
  }
}

// 管理员权限中间件
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
  }
  return next({ ctx });
});

import { adminRouter } from "./routers/admin";
import { researchRouter } from "./routers/research";
import { chatResearchRouter } from "./routers/chatResearch";

export const appRouter = router({
  system: systemRouter,
  admin: adminRouter,
  research: researchRouter,
  chatResearch: chatResearchRouter,
  
  // OAuth诊断
  oauth: router({
    // 获取外部OAuth配置信息（用于诊断）
    getConfig: publicProcedure.query(() => {
      return {
        serverUrl: externalOAuthConfig.serverUrl,
        clientId: externalOAuthConfig.clientId,
        redirectUri: externalOAuthConfig.redirectUri,
        portalUrl: externalOAuthConfig.portalUrl,
        hasClientSecret: !!externalOAuthConfig.clientSecret,
        env: {
          FORUM_OAUTH_SERVER_URL: process.env.FORUM_OAUTH_SERVER_URL || "not set",
          FORUM_OAUTH_CLIENT_ID: process.env.FORUM_OAUTH_CLIENT_ID || "not set",
          FORUM_OAUTH_REDIRECT_URI: process.env.FORUM_OAUTH_REDIRECT_URI || "not set",
          FORUM_OAUTH_PORTAL_URL: process.env.FORUM_OAUTH_PORTAL_URL || "not set",
          FORUM_OAUTH_CLIENT_SECRET: process.env.FORUM_OAUTH_CLIENT_SECRET ? "set" : "not set",
        },
      };
    }),
  }),
  
  auth: router({
    me: publicProcedure.query(async ({ ctx }) => {
      // 如果用户未登录，直接返回null
      if (!ctx.user) return null;
      
      // 从数据库重新查询最新的用户数据（包括余额）
      const latestUser = await getUserByOpenId(ctx.user.openId);
      return latestUser || ctx.user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      // 使用expires设置为过去的时间来清除cookie，比maxAge=-1更可靠
      ctx.res.cookie(COOKIE_NAME, '', {
        ...cookieOptions,
        expires: new Date(0), // 设置为1970年，确保cookie立即过期
        maxAge: 0,
      });
      console.log('[Logout] Cookie cleared with options:', { ...cookieOptions, expires: new Date(0) });
      return { success: true } as const;
    }),
    // 刷新token
    refreshToken: protectedProcedure.mutation(async ({ ctx }) => {
      const { sdk } = await import("./_core/sdk");
      const newToken = await sdk.createSessionToken(ctx.user.openId, {
        name: ctx.user.name || undefined,
      });
      
      // 根据AUTH_MODE决定返回方式
      const { ENV } = await import("./_core/env");
      if (ENV.authMode === 'cookie') {
        // Cookie模式：更新cookie并返回token
        ctx.res.cookie(COOKIE_NAME, newToken, getSessionCookieOptions(ctx.req));
      }
      
      return { 
        success: true, 
        token: newToken 
      };
    }),
    // 更新用户偏好模型
    updatePreference: protectedProcedure
      .input(z.object({
        preferredModelId: z.number().nullable().optional(),
        preferredPackageId: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.updateUserPreference(ctx.user.id, input);
        return { success: true };
      }),
  }),

  // 🐟币积分系统
  fishCoin: router({
    // 获取当前用户余额
    getBalance: protectedProcedure.query(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      return {
        balance: user?.fishCoinBalance || "0.00",
      };
    }),

    // 从论坛同步余额
    syncFromForum: protectedProcedure.mutation(async ({ ctx }) => {
      const user = await db.getUserById(ctx.user.id);
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
      }

      // 只有论坛用户才能同步
      if (user.loginMethod !== "forum_oauth" && user.loginMethod !== "forum_password") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "只有论坛用户才能同步余额" });
      }

      try {
        // 从论坛获取最新积分
        const { getUserInfoByOpenId } = await import("./_core/forumPointsSync");
        const forumUserInfo = await getUserInfoByOpenId(user.openId);
        
        if (!forumUserInfo) {
          throw new TRPCError({ code: "NOT_FOUND", message: "无法从论坛获取用户信息" });
        }

        const newForumPoints = forumUserInfo.points || 0;
        const previousForumPoints = user.forumPoints || 0;
        
        // 计算新增的论坛积分（只转换增量部分）
        const forumPointsIncrement = newForumPoints - previousForumPoints;
        
        console.log("[Sync From Forum] Points calculation:", {
          previousForumPoints,
          newForumPoints,
          forumPointsIncrement,
        });
        
        // 更新论坛积分记录
        await db.upsertUser({
          openId: user.openId,
          forumPoints: newForumPoints,
        });
        
        // 如果有新增积分，转换为🐟币余额（1:1比例）
        if (forumPointsIncrement > 0) {
          const currentBalance = parseFloat(user.fishCoinBalance || "0");
          const newBalance = (currentBalance + forumPointsIncrement).toFixed(2);
          
          console.log("[Sync From Forum] Converting forum points to fish coins:", {
            currentBalance,
            forumPointsIncrement,
            newBalance,
          });
          
          // 更新余额
          await db.updateUserFishCoins(user.id, newBalance);
          
          // 记录充值交易
          await db.createFishCoinTransaction({
            userId: user.id,
            type: "recharge",
            amount: forumPointsIncrement.toFixed(2),
            balanceAfter: newBalance,
            description: `论坛积分同步（${forumPointsIncrement}积分）`,
          });
          
          return { 
            success: true, 
            message: `成功同步${forumPointsIncrement}🐟币`,
            newBalance,
            forumPoints: newForumPoints,
          };
        } else if (forumPointsIncrement < 0) {
          // 论坛积分减少了，记录但不扣除本地余额（避免双重扣除）
          console.warn("[Sync From Forum] Forum points decreased:", {
            previousForumPoints,
            newForumPoints,
            decrease: Math.abs(forumPointsIncrement),
          });
          
          return {
            success: true,
            message: "论坛积分已同步，但积分减少不影响本地余额",
            newBalance: user.fishCoinBalance,
            forumPoints: newForumPoints,
          };
        } else {
          return {
            success: true,
            message: "余额已是最新，无需同步",
            newBalance: user.fishCoinBalance,
            forumPoints: newForumPoints,
          };
        }
      } catch (error: any) {
        console.error("[Sync From Forum] Failed to sync:", error);
        throw new TRPCError({ 
          code: "INTERNAL_SERVER_ERROR", 
          message: `同步失败: ${error.message}` 
        });
      }
    }),

    // 获取用户交易历史
    getTransactions: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const transactions = await db.getUserTransactions(ctx.user.id, input.limit);
        return transactions;
      }),

    // 管理员：调整用户余额
    adjustBalance: adminProcedure
      .input(
        z.object({
          userId: z.number(),
          amount: z.string(),
          description: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        const user = await db.getUserById(input.userId);
        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
        }

        const currentBalance = parseFloat(user.fishCoinBalance);
        const adjustAmount = parseFloat(input.amount);
        const newBalance = (currentBalance + adjustAmount).toFixed(2);

        if (parseFloat(newBalance) < 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "余额不能为负数" });
        }

        await db.updateUserFishCoins(input.userId, newBalance);
        await db.createFishCoinTransaction({
          userId: input.userId,
          type: "admin_adjust",
          amount: input.amount,
          balanceAfter: newBalance,
          description: input.description,
        });

        return { success: true, newBalance };
      }),

    // 管理员：查看所有交易记录
    getAllTransactions: adminProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input }) => {
        return await db.getAllTransactions(input.limit);
      }),

    // 用户充值（模拟）
    recharge: protectedProcedure
      .input(
        z.object({
          amount: z.number().positive(),
          bonus: z.number().nonnegative(),
          paymentMethod: z.enum(["alipay", "wechat"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = await db.getUserById(ctx.user.id);
        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
        }

        const totalAmount = input.amount + input.bonus;
        const currentBalance = parseFloat(user.fishCoinBalance);
        const newBalance = (currentBalance + totalAmount).toFixed(2);

        // 更新用户余额
        await db.updateUserFishCoins(ctx.user.id, newBalance);
        
        // 记录充值交易
        await db.createFishCoinTransaction({
          userId: ctx.user.id,
          type: "recharge",
          amount: totalAmount.toString(),
          balanceAfter: newBalance,
          description: `充值 ${input.amount} 🐟币，赠送 ${input.bonus} 🐟币`,
        });

        // 检查是否是首次充值，如果是则给邀请人发放额外奖励
        const invitationCode = await db.getInvitationCodeByUsedBy(ctx.user.id);
        if (invitationCode && !invitationCode.firstRechargeDone && invitationCode.createdBy !== ctx.user.id) {
          // 标记首充已完成
          await db.markFirstRechargeDone(invitationCode.id);

          // 给邀请人发放额外奖励
          const inviter = await db.getUserById(invitationCode.createdBy);
          if (inviter) {
            const inviterBalance = parseFloat(inviter.fishCoinBalance);
            const rewardAmount = parseFloat(invitationCode.firstRechargeReward.toString());
            const inviterNewBalance = (inviterBalance + rewardAmount).toFixed(2);

            await db.updateUserFishCoins(invitationCode.createdBy, inviterNewBalance);
            await db.createFishCoinTransaction({
              userId: invitationCode.createdBy,
              type: "recharge",
              amount: rewardAmount.toString(),
              balanceAfter: inviterNewBalance,
              description: `邀请好友首次充值奖励`,
            });

            // 发送通知给邀请人
            await sendNotificationToUser(invitationCode.createdBy, {
              type: "info",
              title: "🎉 邀请奖励到账！",
              message: `您邀请的好友已完成首次充值，您获得了 ${rewardAmount} 🐟币额外奖励！`,
            });
          }
        }

        return { success: true, newBalance };
      }),
  }),

  // AI模型管理
  aiModel: router({
    // 获取所有模型
    getAll: publicProcedure.query(async () => {
      return await db.getAllAiModels();
    }),

    // 根据类型获取启用的模型
    getByType: publicProcedure
      .input(z.object({ type: z.enum(["chat", "image", "text", "transcription"]) }))
      .mutation(async ({ input }) => {
        return await db.getEnabledAiModelsByType(input.type);
      }),

    // 获取单个模型详情
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const model = await db.getAiModelById(input.id);
        if (!model) {
          throw new TRPCError({ code: "NOT_FOUND", message: "模型不存在" });
        }
        return model;
      }),

    // 管理员：创建模型
    create: adminProcedure
      .input(
        z.object({
          name: z.string(),
          displayName: z.string(),
          description: z.string().optional(),
          type: z.enum(["chat", "image", "text", "transcription"]),
          costPerUse: z.string(),
          enabled: z.boolean().optional(),
          config: z.string().optional(),
          apiEndpoint: z.string().optional(),
          apiKey: z.string().optional(),
          apiModel: z.string().optional(),
          tier: z.enum(["lite", "pro", "max"]).optional(),
          visibleToUser: z.boolean().optional(),
          supportsVision: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        try {
          console.log('[AI Model Create] Input:', JSON.stringify(input, null, 2));
          const result = await db.createAiModel(input);
          console.log('[AI Model Create] Success:', result);
          return { success: true };
        } catch (error) {
          console.error('[AI Model Create] Error:', error);
          console.error('[AI Model Create] Error stack:', error instanceof Error ? error.stack : 'No stack');
          console.error('[AI Model Create] Error message:', error instanceof Error ? error.message : String(error));
          throw error;
        }
      }),

    // 管理员：更新模型
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          displayName: z.string().optional(),
          description: z.string().optional(),
          type: z.enum(["chat", "image", "text", "transcription"]).optional(),
          costPerUse: z.string().optional(),
          enabled: z.boolean().optional(),
          config: z.string().optional(),
          apiEndpoint: z.string().optional(),
          apiKey: z.string().optional(),
          apiModel: z.string().optional(),
          tier: z.enum(["lite", "pro", "max"]).optional(),
          visibleToUser: z.boolean().optional(),
          supportsVision: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        await db.updateAiModel(id, updates);
        return { success: true };
      }),

    // 管理员：删除模型
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteAiModel(input.id);
        return { success: true };
      }),

    // 管理员：测试模型
    test: adminProcedure
      .input(
        z.object({
          id: z.number(),
        })
      )
      .mutation(async ({ input }) => {
        const { testModelApi } = await import("./modelApiTester");
        const result = await testModelApi(input.id);
        return result;
      }),
  }),

  // 用户管理
  user: router({
    // 用户：更新个人资料
    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().optional(),
          email: z.string().email().optional(),
          avatarUrl: z.string().url().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.updateUserProfile(ctx.user.id, input);
        return { success: true };
      }),

    // 管理员：获取所有用户
    getAll: adminProcedure.query(async () => {
      return await db.getAllUsers();
    }),

    // 管理员：获取用户详情
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const user = await db.getUserById(input.id);
        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
        }
        return user;
      }),

    // 用户：获取自己的配额使用情况
    getQuotaStatus: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserQuotaStatus(ctx.user.id);
    }),

    // 管理员：更新用户配额
    updateQuota: adminProcedure
      .input(
        z.object({
          userId: z.number(),
          dailyChatQuota: z.number().optional(),
          dailyImageQuota: z.number().optional(),
          dailyDocumentQuota: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { userId, ...quotas } = input;
        await db.updateUserQuota(userId, quotas);
        return { success: true };
      }),

    // 用户：获取VIP会员信息
    getVIPInfo: protectedProcedure.query(async ({ ctx }) => {
      // 先检查VIP是否到期
      await db.checkAndHandleVIPExpiration(ctx.user.id);
      return await db.getVIPInfo(ctx.user.id);
    }),

    // 用户：购买VIP会员
    purchaseVIP: protectedProcedure
      .input(
        z.object({
          tier: z.enum(["vip", "premium"]),
          durationDays: z.number().default(30),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 定价：VIP 50🐟币/30天，高级VIP 150🐟币/30天
        const prices = {
          vip: 50,
          premium: 150,
        };
        
        const price = prices[input.tier];
        const user = await db.getUserById(ctx.user.id);
        
        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
        }
        
        const currentBalance = parseFloat(user.fishCoinBalance);
        if (currentBalance < price) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: `🐟币余额不足，需要 ${price} 🐟币，当前余额 ${currentBalance} 🐟币` 
          });
        }
        
        // 扣除🐟币
        const newBalance = (currentBalance - price).toFixed(2);
        await db.updateUserFishCoins(ctx.user.id, newBalance);
        
        // 记录交易
        await db.createFishCoinTransaction({
          userId: ctx.user.id,
          type: "consume",
          amount: `-${price}.00`,
          balanceAfter: newBalance,
          description: `购买${input.tier === "vip" ? "VIP" : "高级VIP"}会员（${input.durationDays}天）`,
        });
        
        // 升级为VIP
        const result = await db.upgradeUserToVIP(ctx.user.id, input.tier, input.durationDays);
        
        // 发送通知
        await sendNotificationToUser(ctx.user.id, {
          title: "🎉 成功升级为VIP会员",
          message: `恭喜您成为${input.tier === "vip" ? "VIP" : "高级VIP"}会员，享受更多配额和权益！`,
          type: "info",
        });
        
        return {
          success: true,
          expiresAt: result.expiresAt,
          newBalance,
        };
      }),
  }),

  // 邀请码管理
  invitation: router({
    // 用户：生成邀请码
     createUserInvitation: protectedProcedure.mutation(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
      const { invitationCodes } = await import("../drizzle/schema");
      const { createForumInviteCode, formatExpiresAt } = await import("./forumApi");
      
      // 生成XXXX-XXXX-XXXX格式的邀请码
      const generateInviteCode = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        const randomSegment = (length: number) => {
          let result = '';
          for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
          }
          return result;
        };
        return `${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
      };
      const code = generateInviteCode();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      
      // 1. 先在AI网站本地数据库创建邀请码
      await db.insert(invitationCodes).values({
        code,
        createdBy: ctx.user.id,
        type: "user",
        expiresAt,
        rewardAmount: "50.00",
      });
      
      // 2. 同步到论坛系统
      try {
        const forumResult = await createForumInviteCode({
          code,
          max_uses: 1, // 每个邀请码只能使用一次
          reward_points: 50, // 论坛奖励50币
          created_by: "ai-site",
          expires_at: formatExpiresAt(expiresAt),
          note: `AI网站用户 ${ctx.user.name || ctx.user.email} 生成的邀请码`,
        });
        
        if (!forumResult.success) {
          console.error("[createUserInvitation] Failed to sync to forum:", forumResult.error);
          // 论坛同步失败不影响AI网站的邀请码功能，只记录错误
        } else {
          console.log("[createUserInvitation] Successfully synced to forum:", {
            code,
            idempotent: forumResult.idempotent,
          });
        }
      } catch (error) {
        console.error("[createUserInvitation] Error syncing to forum:", error);
        // 论坛同步异常不影响AI网站的邀请码功能
      }
      
      return { code, expiresAt, rewardAmount: "50.00" };
    }),

    // 用户：获取我的邀请记录
    getMyInvitations: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

      const { invitationCodes, users } = await import("../drizzle/schema");
      const { eq } = await import("drizzle-orm");

      const invitations = await db
        .select()
        .from(invitationCodes)
        .where(eq(invitationCodes.createdBy, ctx.user.id));

      const invitationsWithUsers = await Promise.all(
        invitations.map(async (inv) => {
          if (inv.usedBy) {
            const invitedUser = await db
              .select({ name: users.name, email: users.email })
              .from(users)
              .where(eq(users.id, inv.usedBy))
              .limit(1);
            return { ...inv, invitedUser: invitedUser[0] };
          }
          return { ...inv, invitedUser: null };
        })
      );

      return invitationsWithUsers;
    }),

    // 管理员：生成邀请码
    generate: adminProcedure
      .input(
        z.object({
          expiresInHours: z.number().default(24),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const dbInstance = await getDb();
        if (!dbInstance) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });
        const { invitationCodes } = await import("../drizzle/schema");
        const { createForumInviteCode, formatExpiresAt } = await import("./forumApi");
        
        // 生成XXXX-XXXX-XXXX格式的邀请码（与用户生成保持一致）
        const generateInviteCode = () => {
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          const randomSegment = (length: number) => {
            let result = '';
            for (let i = 0; i < length; i++) {
              result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
          };
          return `${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
        };
        const code = generateInviteCode();
        const expiresAt = new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000);

        // 1. 先在AI网站本地数据库创建邀请码
        await dbInstance.insert(invitationCodes).values({
          code,
          createdBy: ctx.user.id,
          type: "admin",
          expiresAt,
          rewardAmount: "50.00",
        });
        
        // 2. 同步到论坛系统
        try {
          const forumResult = await createForumInviteCode({
            code,
            max_uses: 1, // 每个邀请码只能使用一次
            reward_points: 50, // 论坛奖励50币
            created_by: "ai-site-admin",
            expires_at: formatExpiresAt(expiresAt),
            note: `AI网站管理员 ${ctx.user.name || ctx.user.email} 生成的邀请码`,
          });
          
          if (!forumResult.success) {
            console.error("[adminGenerateInvitation] Failed to sync to forum:", forumResult.error);
            // 论坛同步失败不影响AI网站的邀请码功能，只记录错误
          } else {
            console.log("[adminGenerateInvitation] Successfully synced to forum:", {
              code,
              idempotent: forumResult.idempotent,
            });
          }
        } catch (error) {
          console.error("[adminGenerateInvitation] Error syncing to forum:", error);
          // 论坛同步异常不影响AI网站的邀请码功能
        }

        return { code, expiresAt, rewardAmount: "50.00" };
      }),

    // 管理员：获取所有邀请码
    getAll: adminProcedure.query(async () => {
      return await db.getAllInvitationCodes();
    }),

    // 公开：验证邀请码
    validate: publicProcedure
      .input(z.object({ code: z.string() }))
      .mutation(async ({ input }) => {
        const invitation = await db.getInvitationCodeByCode(input.code);

        if (!invitation) {
          return { valid: false, message: "邀请码不存在" };
        }

        if (invitation.used) {
          return { valid: false, message: "邀请码已被使用" };
        }

        if (new Date() > invitation.expiresAt) {
          return { valid: false, message: "邀请码已过期" };
        }

        return { valid: true, rewardAmount: invitation.rewardAmount };
      }),

    // Webhook：论坛通知邀请码已被使用
    webhookUsed: publicProcedure
      .input(
        z.object({
          code: z.string(),
          used_by_username: z.string(),
          used_by_openid: z.string(),
          used_at: z.string(),
          reward_points: z.number(),
          signature: z.string(), // 用于验证webhook请求的签名
        })
      )
      .mutation(async ({ input }) => {
        const { handleInvitationUsed, verifyWebhookSignature } = await import("./invitationWebhook");

        // 验证签名
        const payload = JSON.stringify({
          code: input.code,
          used_by_username: input.used_by_username,
          used_by_openid: input.used_by_openid,
          used_at: input.used_at,
          reward_points: input.reward_points,
        });

        if (!verifyWebhookSignature(input.signature, payload)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "签名验证失败",
          });
        }

        // 处理webhook
        const result = await handleInvitationUsed({
          code: input.code,
          used_by_username: input.used_by_username,
          used_by_openid: input.used_by_openid,
          used_at: input.used_at,
          reward_points: input.reward_points,
        });

        if (!result.success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: result.message,
          });
        }

        return result;
      }),
  }),

  // AI功能
  ai: router({
    // AI对话
    chat: protectedProcedure
      .input(
        z.object({
          modelId: z.number(),
          messages: z.array(
            z.object({
              role: z.enum(["system", "user", "assistant"]),
              content: z.string(),
            })
          ),
          conversationId: z.number().optional(),
          packageId: z.number().optional(), // 模型套餐ID，用于智能模型选择
          hasVisionContent: z.boolean().optional(), // 是否包含图片内容
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 初始化思考步骤追踪器
        const { ThinkingStepTracker } = await import("./_core/thinkingStepTracker");
        const tracker = new ThinkingStepTracker(ctx.user.id);
        
        let selectedModelId = input.modelId;
        let usedFallback = false;
        let fallbackReason = "";

        // 步骤1: 选择模型
        const step1 = await tracker.startStep("选择AI模型");
        
        // 如果提供了packageId且包含视觉内容，检查模型是否支持视觉
        if (input.packageId && input.hasVisionContent) {
          const { getModelPackageById, getPrimaryModel, getFallbackModels } = await import("./modelPackageManager");
          const pkg = await getModelPackageById(input.packageId);
          
          if (pkg) {
            const primaryModel = await getPrimaryModel(input.packageId);
            
            // 如果主模型不支持视觉，尝试使用备用模型
            if (primaryModel && !primaryModel.supportsVision) {
              const fallbackModels = await getFallbackModels(input.packageId);
              const visionModel = fallbackModels.find(m => m.supportsVision && m.enabled);
              
              if (visionModel) {
                selectedModelId = visionModel.id;
                usedFallback = true;
                fallbackReason = `主模型 ${primaryModel.displayName} 不支持图片理解，自动切换到 ${visionModel.displayName}`;
              }
            }
          }
        }

        const model = await db.getAiModelById(selectedModelId);
        if (!model || !model.enabled) {
          await tracker.errorStep(step1, "模型不可用");
          throw new TRPCError({ code: "NOT_FOUND", message: "模型不可用" });
        }

        if (model.type !== "chat") {
          await tracker.errorStep(step1, "模型不支持对话");
          throw new TRPCError({ code: "BAD_REQUEST", message: "该模型不支持对话功能" });
        }
        
        await tracker.completeStep(step1, `已选择: ${model.displayName}`);

        // 步骤2: 检查用户权限
        const step2 = await tracker.startStep("检查用户权限");
        
        // 检查用户配额
        const quotaCheck = await db.checkQuota(ctx.user.id, "chat");
        if (!quotaCheck.allowed) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: `今日对话配额已用完（${quotaCheck.limit}/${quotaCheck.limit}），请明天再试或升级为VIP` 
          });
        }

        // 检查用户余额
        const user = await db.getUserById(ctx.user.id);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        const balance = parseFloat(user.fishCoinBalance);
        const originalCost = parseFloat(model.costPerUse);

        // 计算等级折扣后的实际费用
        const { finalCost, discount, discountPercent } = await db.calculateDiscountedCost(
          ctx.user.id,
          originalCost,
          "chat"
        );

        if (balance < finalCost) {
          await tracker.errorStep(step2, `余额不足: ${balance} < ${finalCost}`);
          // 通知管理员用户余额不足
          await notifyOwner({
            title: "用户余额不足",
            content: `用户 ${user.name || user.email} (ID: ${user.id}) 余额不足，当前余额: ${balance} 🐟币，需要: ${finalCost.toFixed(2)} 🐟币`,
          });
          throw new TRPCError({ code: "BAD_REQUEST", message: "🐟币余额不足" });
        }
        
        await tracker.completeStep(step2, `配额和余额检查通过`);

        // 步骤3: 调用AI模型
        const step3 = await tracker.startStep(`调用 ${model.displayName}`);
        
        // 调用LLM
        const response = await invokeLLM({
          model: model.name, // 使用用户选择的模型
          messages: input.messages,
        });
        
        await tracker.completeStep(step3, `生成了 ${response.choices[0]?.message?.content?.length || 0} 个字符`);

        const assistantMessage = response.choices[0]?.message?.content || "";
        
        // 步骤4: 处理费用和交易
        const step4 = await tracker.startStep("处理费用和交易");

        // 扣除🐟币（使用折扣后的价格）
        const newBalance = (balance - finalCost).toFixed(2);
        await db.updateUserFishCoins(ctx.user.id, newBalance);
        
        // 构建交易描述（显示折扣信息）
        let description = `使用 ${model.displayName} 进行对话`;
        if (discountPercent > 0) {
          description += ` (原价: ${originalCost.toFixed(2)}, 等级折扣: ${discountPercent}%, 实付: ${finalCost.toFixed(2)})`;
        }
        
        const transaction = await db.createFishCoinTransaction({
          userId: ctx.user.id,
          type: "consume",
          amount: `-${finalCost.toFixed(2)}`,
          balanceAfter: newBalance,
          modelId: model.id,
          description,
        });

        // 记录折扣使用日志（如果享受了折扣）
        if (discountPercent > 0) {
          await db.logDiscountUsage({
            userId: ctx.user.id,
            userTier: user.userTier,
            serviceType: "chat",
            originalPrice: originalCost,
            discountPercent,
            savedAmount: discount,
            actualPrice: finalCost,
            transactionId: transaction?.id,
          });
        }

        // 增加配额使用次数
        await db.incrementQuotaUsage(ctx.user.id, "chat");
        
        await tracker.completeStep(step4, `扣除 ${finalCost.toFixed(2)} 🐟币`);

        // 保存或更新对话历史
        const allMessages = [...input.messages, { role: "assistant" as const, content: assistantMessage }];

        if (input.conversationId) {
          await db.updateChatConversation(input.conversationId, {
            messages: JSON.stringify(allMessages),
          });
        } else {
          await db.createChatConversation({
            userId: ctx.user.id,
            modelId: model.id,
            messages: JSON.stringify(allMessages),
          });
        }

        return {
          message: assistantMessage,
          newBalance,
          cost: finalCost.toFixed(2),
          originalCost: originalCost.toFixed(2),
          discount: discount.toFixed(2),
          discountPercent,
          usedFallback, // 是否使用了备用模型
          fallbackReason, // 备用模型使用原因
          thinkingSteps: tracker.getAllSteps(), // 返回思考步骤
        };
      }),

    // 生成推荐追问
    generateSuggestedQuestions: protectedProcedure
      .input(
        z.object({
          assistantResponse: z.string(),
          userMessage: z.string().optional(),
          conversationHistory: z.array(z.object({
            role: z.enum(["user", "assistant"]),
            content: z.string(),
          })).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 构建个性化的prompt，包含历史对话上下文
        let contextInfo = "";
        
        // 如果有历史对话，分析用户的兴趣点和问题风格
        if (input.conversationHistory && input.conversationHistory.length > 0) {
          // 只取最近的5轮对话，避免上下文过长
          const recentHistory = input.conversationHistory.slice(-10); // 最近5轮（5用户+5助手）
          contextInfo = "\n\n历史对话上下文：\n";
          recentHistory.forEach((msg, index) => {
            const label = msg.role === "user" ? "用户" : "AI";
            contextInfo += `${label}: ${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}\n`;
          });
        }
        
        const prompt = `你是一个智能对话助手，擅长根据用户的对话历史和兴趣点生成个性化的追问问题。

当前对话：
${input.userMessage ? `用户问题：${input.userMessage}\n` : ""}AI回复：${input.assistantResponse}
${contextInfo}

请根据以上信息，生成3个相关的追问问题。问题应该：
1. 符合用户的兴趣点和提问风格
2. 与当前对话主题相关
3. 能够帮助用户深入了解或扩展讨论
4. 简洁、具体、有价值

请直接返回3个问题，每行一个，不要编号和其他解释。`;

        const response = await invokeLLM({
          model: "gemini-2.5-flash", // 辅助功能使用默认模型
          messages: [
            {
              role: "system",
              content: "你是一个专业的问题生成助手，擅长根据对话内容生成有价值的追问。",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        });

        const questionsText = response.choices[0]?.message?.content || "";
        // 确俜ontent是字符串类型
        const contentStr = typeof questionsText === 'string' ? questionsText : '';
        const questions = contentStr
          .split("\n")
          .map((q: string) => q.trim())
          .filter((q: string) => q.length > 0 && q.length < 100) // 过滤空行和过长的问题
          .slice(0, 3); // 只取前3个

        return {
          questions,
        };
      }),

    // AI图片生成
    generateImage: protectedProcedure
      .input(
        z.object({
          modelId: z.number(),
          prompt: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const model = await db.getAiModelById(input.modelId);
        if (!model || !model.enabled) {
          throw new TRPCError({ code: "NOT_FOUND", message: "模型不可用" });
        }

        if (model.type !== "image") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "该模型不支持图片生成" });
        }

        // 检查用户配额
        const quotaCheck = await db.checkQuota(ctx.user.id, "image");
        if (!quotaCheck.allowed) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: `今日图片生成配额已用完（${quotaCheck.limit}/${quotaCheck.limit}），请明天再试或升级为VIP` 
          });
        }

        // 检查用户余额
        const user = await db.getUserById(ctx.user.id);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        const balance = parseFloat(user.fishCoinBalance);
        const originalCost = parseFloat(model.costPerUse);

        // 计算等级折扣后的实际费用
        const { finalCost, discount, discountPercent } = await db.calculateDiscountedCost(
          ctx.user.id,
          originalCost,
          "image"
        );

        if (balance < finalCost) {
          await notifyOwner({
            title: "用户余额不足",
            content: `用户 ${user.name || user.email} (ID: ${user.id}) 余额不足，当前余额: ${balance} 🐟币，需要: ${finalCost.toFixed(2)} 🐟币`,
          });
          // 发送实时通知给用户
          sendNotificationToUser(ctx.user.id, {
            type: "low_balance",
            title: "🐟币余额不足",
            message: `当前余额: ${balance} 🐟币，无法完成操作。请联系管理员充值。`,
          });
          throw new TRPCError({ code: "BAD_REQUEST", message: "🐟币余额不足" });
        }

        // 调用图片生成API
        const result = await generateImage({
          prompt: input.prompt,
        });

        // 扣除🐟币（使用折扣后的价格）
        const newBalance = (balance - finalCost).toFixed(2);
        await db.updateUserFishCoins(ctx.user.id, newBalance);
        
        // 构建交易描述（显示折扣信息）
        let description = `使用 ${model.displayName} 生成图片`;
        if (discountPercent > 0) {
          description += ` (原价: ${originalCost.toFixed(2)}, 等级折扣: ${discountPercent}%, 实付: ${finalCost.toFixed(2)})`;
        }
        
        const transaction = await db.createFishCoinTransaction({
          userId: ctx.user.id,
          type: "consume",
          amount: `-${finalCost.toFixed(2)}`,
          balanceAfter: newBalance,
          modelId: model.id,
          description,
        });

        // 记录折扣使用日志（如果享受了折扣）
        if (discountPercent > 0) {
          await db.logDiscountUsage({
            userId: ctx.user.id,
            userTier: user.userTier,
            serviceType: "image",
            originalPrice: originalCost,
            discountPercent,
            savedAmount: discount,
            actualPrice: finalCost,
            transactionId: transaction?.id,
          });
        }

        // 增加配额使用次数
        await db.incrementQuotaUsage(ctx.user.id, "image");

        // 保存图片历史记录
        if (result.url) {
          await db.saveGeneratedImage({
            userId: ctx.user.id,
            imageUrl: result.url,
            prompt: input.prompt,
            cost: finalCost.toFixed(2),
          });
        }

        return {
          imageUrl: result.url,
          newBalance,
          cost: finalCost.toFixed(2),
          originalCost: originalCost.toFixed(2),
          discount: discount.toFixed(2),
          discountPercent,
        };
      }),

    // AI文本处理
    processText: protectedProcedure
      .input(
        z.object({
          modelId: z.number(),
          text: z.string(),
          task: z.string(), // 任务描述，如"总结", "翻译", "分析"等
        })
      )
      .mutation(async ({ ctx, input }) => {
        const model = await db.getAiModelById(input.modelId);
        if (!model || !model.enabled) {
          throw new TRPCError({ code: "NOT_FOUND", message: "模型不可用" });
        }

        if (model.type !== "text") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "该模型不支持文本处理" });
        }

        // 检查用户余额
        const user = await db.getUserById(ctx.user.id);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        const balance = parseFloat(user.fishCoinBalance);
        const originalCost = parseFloat(model.costPerUse);

        // 计算等级折扣后的实际费用
        const { finalCost, discount, discountPercent } = await db.calculateDiscountedCost(
          ctx.user.id,
          originalCost,
          "document"
        );

        if (balance < finalCost) {
          await notifyOwner({
            title: "用户余额不足",
            content: `用户 ${user.name || user.email} (ID: ${user.id}) 余额不足，当前余额: ${balance} 🐟币，需要: ${finalCost.toFixed(2)} 🐟币`,
          });
          // 发送实时通知给用户
          sendNotificationToUser(ctx.user.id, {
            type: "low_balance",
            title: "🐟币余额不足",
            message: `当前余额: ${balance} 🐟币，无法完成操作。请联系管理员充值。`,
          });
          throw new TRPCError({ code: "BAD_REQUEST", message: "🐟币余额不足" });
        }

        // 调用LLM处理文本
        const response = await invokeLLM({
          model: "gemini-2.5-flash", // 文本处理使用默认模型
          messages: [
            {
              role: "system",
              content: `你是一个专业的文本处理助手。用户的任务是: ${input.task}`,
            },
            {
              role: "user",
              content: input.text,
            },
          ],
        });

        const result = response.choices[0]?.message?.content || "";

        // 扣除🐟币（使用折扣后的价格）
        const newBalance = (balance - finalCost).toFixed(2);
        await db.updateUserFishCoins(ctx.user.id, newBalance);
        
        // 构建交易描述（显示折扣信息）
        let description = `使用 ${model.displayName} 处理文本: ${input.task}`;
        if (discountPercent > 0) {
          description += ` (原价: ${originalCost.toFixed(2)}, 等级折扣: ${discountPercent}%, 实付: ${finalCost.toFixed(2)})`;
        }
        
        const transaction = await db.createFishCoinTransaction({
          userId: ctx.user.id,
          type: "consume",
          amount: `-${finalCost.toFixed(2)}`,
          balanceAfter: newBalance,
          modelId: model.id,
          description,
        });

        // 记录折扣使用日志（如果享受了折扣）
        if (discountPercent > 0) {
          await db.logDiscountUsage({
            userId: ctx.user.id,
            userTier: user.userTier,
            serviceType: "document",
            originalPrice: originalCost,
            discountPercent,
            savedAmount: discount,
            actualPrice: finalCost,
            transactionId: transaction?.id,
          });
        }

        return {
          result,
          newBalance,
          cost: finalCost.toFixed(2),
          originalCost: originalCost.toFixed(2),
          discount: discount.toFixed(2),
          discountPercent,
        };
      }),

    // 实时语音输入转文字（用于语音输入对话框）
    transcribeVoiceInput: protectedProcedure
      .input(
        z.object({
          audioData: z.string(), // base64编码的音频数据
          language: z.string().optional(), // 语言代码
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          // 将base64转换为Buffer
          const base64Data = input.audioData.split(",")[1] || input.audioData;
          const audioBuffer = Buffer.from(base64Data, "base64");

          // 直接使用audioBuffer调用语音转文字API，不需要上传到S3
          console.log(`[语音输入] 开始调用transcribeAudio, 音频大小: ${audioBuffer.length} bytes`);
          const transcription = await transcribeAudio({
            audioBuffer,
            language: input.language,
          });
          console.log(`[语音输入] transcribeAudio返回结果:`, 'error' in transcription ? `错误: ${transcription.error}` : `成功, 文本长度: ${transcription.text.length}`);

          // 检查是否有错误
          if ("error" in transcription) {
            console.error(`[语音输入] 转录失败:`, transcription);
            throw new TRPCError({ 
              code: "INTERNAL_SERVER_ERROR", 
              message: transcription.error,
              cause: transcription
            });
          }

          return {
            text: transcription.text,
            language: transcription.language,
          };
        } catch (error: any) {
          console.error("语音识别失败:", error);
          throw new TRPCError({ 
            code: "INTERNAL_SERVER_ERROR", 
            message: error.message || "语音识别失败" 
          });
        }
      }),
    
    // 生成Word文档
    generateDocument: protectedProcedure
      .input(
        z.object({
          title: z.string().min(1, "标题不能为空"),
          content: z.string().min(1, "内容不能为空"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 检查用户配额
        const quotaCheck = await db.checkQuota(ctx.user.id, "document");
        if (!quotaCheck.allowed) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: `今日文档生成配额已用完（${quotaCheck.limit}/${quotaCheck.limit}），请明天再试或升级为VIP` 
          });
        }

        // 生成文档并上传到S3
        const { generateDocument } = await import("./documentService");
        const url = await generateDocument({
          title: input.title,
          content: input.content,
          author: ctx.user.name || "匿名用户",
          timestamp: new Date(),
        });

        // 增加配额使用次数
        await db.incrementQuotaUsage(ctx.user.id, "document");

        return {
          url,
          fileName: `${input.title}.docx`,
        };
      }),
  }),

  // 图片历史记录管理
  images: router({
    // 获取用户的图片历史
    getAll: protectedProcedure
      .input(
        z.object({
          limit: z.number().optional().default(50),
          offset: z.number().optional().default(0),
        })
      )
      .query(async ({ ctx, input }) => {
        return await db.getUserGeneratedImages(ctx.user.id, input.limit, input.offset);
      }),

    // 获取用户收藏的图片
    getFavorites: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserFavoriteImages(ctx.user.id);
    }),

    // 切换图片收藏状态
    toggleFavorite: protectedProcedure
      .input(z.object({ imageId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.toggleImageFavorite(input.imageId, ctx.user.id);
        if (!result) {
          throw new TRPCError({ code: "NOT_FOUND", message: "图片不存在" });
        }
        return result;
      }),

    // 删除图片记录
    delete: protectedProcedure
      .input(z.object({ imageId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteGeneratedImage(input.imageId, ctx.user.id);
        return { success: true };
      }),

    // 获取用户图片统计
    getStats: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserImageStats(ctx.user.id);
    }),

    // 生成图片
    generate: protectedProcedure
      .input(
        z.object({
          prompt: z.string().min(1, "请输入图片描述"),
          originalImages: z.array(
            z.object({
              url: z.string().url(),
              mimeType: z.string(),
            })
          ).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 检查用户余额
        const user = await db.getUserById(ctx.user.id);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "用户不存在" });
        }

        // 图片生成固定费用：10🐟币
        const cost = 10;
        const currentBalance = parseFloat(user.fishCoinBalance.toString());
        if (currentBalance < cost) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "🐟币余额不足" });
        }

        try {
          // 调用图片生成API
          const result = await generateImage({
            prompt: input.prompt,
            originalImages: input.originalImages,
          });

          // 扣除🐟币
          const currentBalance = parseFloat(user.fishCoinBalance.toString());
          const newBalance = (currentBalance - cost).toFixed(2);
          await db.updateUserFishCoins(ctx.user.id, newBalance);

          // 记录消费
          await db.createFishCoinTransaction({
            userId: ctx.user.id,
            amount: cost.toString(),
            type: "consume",
            balanceAfter: newBalance,
            description: "图片生成",
            modelId: null,
          });

          // 保存生成的图片记录
          if (!result.url) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "图片生成成功但未返回URL",
            });
          }
          await db.saveGeneratedImage({
            userId: ctx.user.id,
            prompt: input.prompt,
            imageUrl: result.url,
            cost: cost.toString(),
          });

          return {
            success: true,
            imageUrl: result.url,
            cost,
          };
        } catch (error: any) {
          console.error("[images.generate] Error:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message || "图片生成失败",
          });
        }
      }),

    // 代理图片下载 - 解决CORS问题，带文件系统缓存
    proxyImage: protectedProcedure
      .input(z.object({ url: z.string() }))
      .query(async ({ input }) => {
        try {
          // 处理本地 /uploads/ 路径
          if (input.url.startsWith('/uploads/') || input.url.startsWith('uploads/')) {
            console.log('[proxyImage] Reading local file:', input.url);
            const relativePath = input.url.startsWith('/') ? input.url.slice(1) : input.url;
            const candidates = [
              path.join(process.cwd(), 'dist', 'public', relativePath),
              path.join(process.cwd(), relativePath),
              path.join(process.cwd(), 'public', relativePath),
            ];
            let filePath = '';
            for (const candidate of candidates) {
              try { await fs.access(candidate); filePath = candidate; break; } catch {}
            }
            if (!filePath) {
              console.error('[proxyImage] Local file not found, tried:', candidates);
              throw new Error('Local file not found: ' + input.url);
            }
            console.log('[proxyImage] Found local file at:', filePath);
            const fileData = await fs.readFile(filePath);
            const base64 = fileData.toString('base64');
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
              '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
              '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
            };
            const contentType = mimeTypes[ext] || 'image/png';
            return { data: `data:${contentType};base64,${base64}`, contentType };
          }

          // 生成缓存文件名（使用URL的MD5作为文件名）
          const urlHash = crypto.createHash('md5').update(input.url).digest('hex');
          const cacheDir = path.join(process.cwd(), '.cache', 'images');
          const cacheFilePath = path.join(cacheDir, `${urlHash}.json`);
          
          // 检查缓存是否存在
          try {
            const cachedData = await fs.readFile(cacheFilePath, 'utf-8');
            const cached = JSON.parse(cachedData);
            // 缓存有效期：24小时
            if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
              console.log('[proxyImage] Cache hit:', input.url);
              return {
                data: cached.data,
                contentType: cached.contentType,
              };
            }
          } catch (err) {
            // 缓存不存在或读取失败，继续下载
          }
          
          // 使用fetch下载图片（通过undici全局代理自动处理）
          console.log("[proxyImage] Downloading:", input.url);
          const fetchResp = await fetch(input.url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(30000),
          });
          if (!fetchResp.ok) throw new Error(`HTTP ${fetchResp.status}`);
          const arrayBuffer = await fetchResp.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString('base64');
          const contentType = fetchResp.headers.get('content-type') || 'image/png';
          const dataUrl = `data:${contentType};base64,${base64}`;
          
          // 保存到缓存
          try {
            await fs.mkdir(cacheDir, { recursive: true });
            await fs.writeFile(cacheFilePath, JSON.stringify({
              data: dataUrl,
              contentType,
              timestamp: Date.now(),
              url: input.url,
            }));
            console.log('[proxyImage] Cached:', input.url);
          } catch (err) {
            console.error('[proxyImage] Cache write error:', err);
            // 缓存失败不影响返回结果
          }
          
          return {
            data: dataUrl,
            contentType,
          };
        } catch (error) {
          console.error('[proxyImage] Error:', error);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: '图片下载失败' 
          });
        }
      }),
  }),

  // 视频生成管理
  videos: router({
    // 检测视频生成意图（混合模式：关键词匹配 + AI判断）
    detectVideoIntent: protectedProcedure
      .input(z.object({ message: z.string() }))
      .mutation(async ({ input }) => {
        const message = input.message.trim();

        // 第一步：关键词快速匹配
        const videoKeywords = [
          // 中文关键词
          '生成视频', '制作视频', '创建视频', '做个视频', '做一个视频',
          '视频生成', '视频制作', '生成一段视频', '制作一段视频',
          '帮我生成', '帮我做', '帮我制作', '我想生成', '我想做',
          '视频', '生成视频', '制作视频', '创建视频', '来个视频', '要视频',
          '做个动画', '生成动画', '制作动画', '创建动画',
          '做个短视频', '生成短视频', '制作短视频',
          // 英文关键词
          'generate video', 'create video', 'make video', 'video generation',
          'generate a video', 'create a video', 'make a video',
          'help me generate', 'help me create', 'help me make',
          'i want to generate', 'i want to create', 'i want to make',
          'make an animation', 'generate animation', 'create animation'
        ];

        const hasKeyword = videoKeywords.some(keyword => 
          message.toLowerCase().includes(keyword.toLowerCase())
        );

        if (hasKeyword) {
          // 关键词匹配成功，提取描述
          let prompt = message;
          // 移除关键词
          videoKeywords.forEach(keyword => {
            prompt = prompt.replace(new RegExp(keyword, 'gi'), '').trim();
          });
          // 移除常见的连接词
          prompt = prompt.replace(/^[：:，,。.的一个关于]+/, '').trim();

          return {
            isVideoRequest: true,
            confidence: 'high',
            method: 'keyword',
            prompt: prompt || message,
            duration: 5,
            style: undefined,
            provider: 'Pika'
          };
        }
        // 第二步：AI意图识别（已禁用，只使用关键词匹配）
        // 关键词未匹配，返回false
        return {
          isVideoRequest: false,
          confidence: "low",
          method: "keyword",
          prompt: message,
          duration: 5,
          style: undefined,
          provider: "Pika"
        };
      }),
    // 生成视频
    generate: protectedProcedure
      .input(
        z.object({
          prompt: z.string(),
          duration: z.union([z.literal(5), z.literal(10)]).optional().default(5),
          style: z.string().optional(),
          provider: z.string().optional().default("mock"),
          conversationId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 获取API配置
        const config = await db.getVideoApiConfig(input.provider);
        // 根据视频时长选择对应的费用
        const cost = input.duration === 5 
          ? (config?.cost5s ? parseFloat(config.cost5s) : 30)
          : (config?.cost10s ? parseFloat(config.cost10s) : 50);

        // 检查用户余额
        const user = await db.getUserById(ctx.user.id);
        if (!user || parseFloat(user.fishCoinBalance) < cost) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "🐟币余额不足" });
        }

        // 创建任务
        const taskId = await db.createVideoTask({
          userId: ctx.user.id,
          prompt: input.prompt,
          duration: input.duration,
          style: input.style,
          provider: input.provider,
          cost,
        });

        if (!taskId) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "创建任务失败" });
        }

        // 扫除🐟币（使用原子操作确保余额不会变成负数）
        const deductResult = await db.deductFishCoins(ctx.user.id, cost, `视频生成: ${input.prompt.substring(0, 50)}`);
        if (!deductResult) {
          // 余额不足，删除任务
          await db.deleteVideoTask(taskId);
          throw new TRPCError({ code: "BAD_REQUEST", message: "🐟币余额不足" });
        }

        // 调用Pollo AI API生成视频
        try {
          const videoGen = await import("./_core/videoGeneration");
          const result = await videoGen.generateVideo({
            prompt: input.prompt,
            duration: input.duration,
            provider: "pollo",
          });

          // 更新任务的Pollo AI任务ID和状态
          await db.updateVideoTaskPolloId(taskId, result.taskId);
          await db.updateVideoTaskStatus(taskId, "processing");

          // 启动后台轮询任务（不等待完成）
          pollVideoTaskInBackground(taskId, result.taskId).catch((error) => {
            console.error(`[Video Generation] Background polling failed for task ${taskId}:`, error);
          });

          // 如果提供了conversationId，保存消息到对话记录
          if (input.conversationId) {
            try {
              const conversation = await db.getChatConversationById(input.conversationId);
              if (conversation && conversation.userId === ctx.user.id) {
                const messages = JSON.parse(conversation.messages as string);
                // 添加视频生成请求消息
                messages.push({
                  role: "user",
                  content: `生成视频: ${input.prompt}`,
                  isVideoTask: true,
                  videoTaskId: taskId,
                  videoPrompt: input.prompt,
                  timestamp: Date.now(),
                });
                await db.updateChatConversation(input.conversationId, { messages: JSON.stringify(messages) });
              }
            } catch (error) {
              console.error(`[Video Generation] Failed to save message to conversation ${input.conversationId}:`, error);
            }
          }

          return { taskId, status: "processing", polloTaskId: result.taskId };
        } catch (error: any) {
          console.error(`[Video Generation] Failed to start generation for task ${taskId}:`, error);
          await db.updateVideoTaskStatus(taskId, "failed");
          await db.updateVideoTaskError(taskId, error.message || "视频生成失败");
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message || "视频生成失败" });
        }
      }),

    // 查询任务状态
    getTaskStatus: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .query(async ({ ctx, input }) => {
        const task = await db.getVideoTask(input.taskId);
        if (!task || task.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "任务不存在" });
        }
        return task;
      }),

    // 获取用户的任务列表
    getTasks: protectedProcedure
      .input(z.object({ limit: z.number().optional().default(50) }))
      .query(async ({ ctx, input }) => {
        return await db.getUserVideoTasks(ctx.user.id, input.limit);
      }),

    // 获取用户的视频历史
    getAll: protectedProcedure
      .input(
        z.object({
          limit: z.number().optional().default(50),
          onlyFavorites: z.boolean().optional().default(false),
        })
      )
      .query(async ({ ctx, input }) => {
        return await db.getUserVideos(ctx.user.id, {
          limit: input.limit,
          onlyFavorites: input.onlyFavorites,
        });
      }),

    // 切换视频收藏状态
    toggleFavorite: protectedProcedure
      .input(z.object({ videoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const result = await db.toggleVideoFavorite(input.videoId, ctx.user.id);
        if (!result) {
          throw new TRPCError({ code: "NOT_FOUND", message: "视频不存在" });
        }
        return result;
      }),

    // 删除视频任务（单个删除）
    deleteTask: protectedProcedure
      .input(z.object({ taskId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // 检查视频任务是否存在且属于当前用户
        const task = await db.getVideoTask(input.taskId);
        if (!task || task.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "视频任务不存在" });
        }
        
        // 删除视频任务
        await db.deleteVideoTask(input.taskId);
        return { success: true };
      }),

    // 批量删除视频任务
    deleteTasks: protectedProcedure
      .input(z.object({ taskIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => {
        let deletedCount = 0;
        
        // 逐个检查并删除
        for (const taskId of input.taskIds) {
          const task = await db.getVideoTask(taskId);
          if (task && task.userId === ctx.user.id) {
            await db.deleteVideoTask(taskId);
            deletedCount++;
          }
        }
        
        return { success: true, deletedCount };
      }),

    // 删除视频记录（旧接口，保留向后兼容）
    delete: protectedProcedure
      .input(z.object({ videoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteGeneratedVideo(input.videoId, ctx.user.id);
        return { success: true };
      }),

    // 获取用户视频统计
    getStats: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserVideoStats(ctx.user.id);
    }),

    // 获取API配置列表（仅管理员）
    getApiConfigs: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "无权限" });
      }
      return await db.getEnabledVideoApiConfigs();
    }),

    // 保存API配置（仅管理员）
    saveApiConfig: protectedProcedure
      .input(
        z.object({
          provider: z.string(),
          apiKey: z.string().optional(),
          apiEndpoint: z.string().optional(),
          isEnabled: z.boolean().optional(),
          cost5s: z.number().optional(),
          cost10s: z.number().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "无权限" });
        }
        await db.upsertVideoApiConfig(input);
        return { success: true };
      }),

    // 创建视频分享链接
    createShare: protectedProcedure
      .input(
        z.object({
          videoId: z.number(),
          title: z.string().optional(),
          description: z.string().optional(),
          expiresInDays: z.number().optional(), // 过期天数，不传表示永久有效
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 检查视频是否存在且属于当前用户
        const video = await db.getVideoTask(input.videoId);
        if (!video || video.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "视频不存在" });
        }
        if (video.status !== 'completed' || !video.videoUrl) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "只能分享已完成的视频" });
        }

        // 生成分享令牌
        const crypto = await import('crypto');
        const shareToken = crypto.randomBytes(32).toString('hex');

        // 计算过期时间
        let expiresAt = null;
        if (input.expiresInDays) {
          const expireDate = new Date();
          expireDate.setDate(expireDate.getDate() + input.expiresInDays);
          expiresAt = expireDate;
        }

        // 创建分享记录
        await db.createVideoShare({
          videoId: input.videoId,
          shareToken,
          userId: ctx.user.id,
          title: input.title || video.prompt.substring(0, 50),
          description: input.description,
          expiresAt,
        });

        return {
          shareToken,
          shareUrl: `${process.env.APP_URL || 'https://insights.ren'}/share/video/${shareToken}`,
        };
      }),

    // 获取分享视频信息（公开访问）
    getSharedVideo: publicProcedure
      .input(z.object({ shareToken: z.string() }))
      .mutation(async ({ input }) => {
        const share = await db.getVideoShareByToken(input.shareToken);
        if (!share) {
          throw new TRPCError({ code: "NOT_FOUND", message: "分享链接不存在" });
        }
        if (!share.isEnabled) {
          throw new TRPCError({ code: "FORBIDDEN", message: "分享链接已禁用" });
        }
        if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
          throw new TRPCError({ code: "FORBIDDEN", message: "分享链接已过期" });
        }

        // 增加访问次数
        await db.incrementShareViewCount(share.id);

        // 获取视频信息
        const video = await db.getVideoTask(share.videoId);
        if (!video || video.status !== 'completed' || !video.videoUrl) {
          throw new TRPCError({ code: "NOT_FOUND", message: "视频不可用" });
        }

        return {
          title: share.title || video.prompt,
          description: share.description,
          videoUrl: video.videoUrl,
          duration: video.duration,
          createdAt: video.createdAt,
          viewCount: share.viewCount + 1,
        };
      }),

    // 删除分享链接
    deleteShare: protectedProcedure
      .input(z.object({ shareId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const share = await db.getVideoShareById(input.shareId);
        if (!share || share.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "分享链接不存在" });
        }
        await db.deleteVideoShare(input.shareId);
        return { success: true };
      }),
  }),

  // 对话历史管理
  conversation: router({
    // 创建新对话
    create: protectedProcedure
      .input(
        z.object({
          modelId: z.number(),
          title: z.string(),
          packageId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 如果提供了packageId，使用套餐的主模型
        let actualModelId = input.modelId;
        if (input.packageId) {
          const pkg = await db.getModelPackageById(input.packageId);
          if (pkg) {
            actualModelId = pkg.primaryModelId;
          }
        }
        
        const result = await db.createChatConversation({
          userId: ctx.user.id,
          modelId: actualModelId,
          title: input.title,
          messages: JSON.stringify([]),
          packageId: input.packageId || null,
        });
        return { id: Number((result as any).insertId) };
      }),

    // 获取用户的所有对话（带标签）
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return await db.getConversationsWithTags(ctx.user.id);
    }),

    // 获取单个对话详情
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const conversation = await db.getChatConversationById(input.id);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "对话不存在" });
        }
        return conversation;
      }),

    // 删除对话
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const conversation = await db.getChatConversationById(input.id);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "对话不存在" });
        }
        await db.deleteChatConversation(input.id);
        return { success: true };
      }),

    // 导出对话为Markdown
    exportMarkdown: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const conversation = await db.getChatConversationById(input.id);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "对话不存在" });
        }

        const messages = JSON.parse(conversation.messages);
        let markdown = `# ${conversation.title || "对话记录"}\n\n`;
        markdown += `**创建时间**: ${new Date(conversation.createdAt).toLocaleString()}\n\n`;
        markdown += `---\n\n`;

        messages.forEach((msg: any, index: number) => {
          const role = msg.role === "user" ? "👤 用户" : "🤖 AI助手";
          markdown += `### ${role}\n\n${msg.content}\n\n`;
        });

        return { markdown, filename: `conversation-${conversation.id}.md` };
      }),

    // 导出对话为PDF
    exportPdf: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const conversation = await db.getChatConversationById(input.id);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "对话不存在" });
        }

        const messages = JSON.parse(conversation.messages);
        
        // 使用Puppeteer生成PDF（支持Google Fonts中文字体 + Markdown解析）
        const { generateSimplePDFFromHTML } = await import('./pdfService');
        const { marked } = await import('marked');
        
        // 配置marked选项
        marked.setOptions({
          breaks: true,
          gfm: true,
        });
        
        // 构建对话历史HTML（使用marked解析Markdown）
        const messagesHtml = messages.map((msg: any) => {
          const role = msg.role === "user" ? "👤 用户" : "🤖 AI助手";
          const roleClass = msg.role === "user" ? "user-message" : "ai-message";
          // 使用marked解析Markdown内容
          const htmlContent = marked.parse(msg.content || '');
          return `
            <div class="message ${roleClass}">
              <div class="role">${role}</div>
              <div class="content markdown-body">${htmlContent}</div>
            </div>
          `;
        }).join('');
        
        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap" rel="stylesheet">
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: 'Noto Sans SC', 'Noto Sans CJK SC', 'WenQuanYi Zen Hei', sans-serif;
                padding: 40px;
                background: white;
                color: #333;
              }
              h1 {
                text-align: center;
                font-size: 24px;
                margin-bottom: 10px;
                color: #000;
              }
              .meta {
                text-align: center;
                font-size: 12px;
                color: #666;
                margin-bottom: 30px;
              }
              .message {
                margin-bottom: 20px;
                padding-bottom: 20px;
                border-bottom: 1px solid #e0e0e0;
              }
              .message:last-child {
                border-bottom: none;
              }
              .role {
                font-size: 14px;
                font-weight: bold;
                margin-bottom: 8px;
                color: #333;
              }
              .content {
                font-size: 12px;
                line-height: 1.6;
                color: #444;
                word-wrap: break-word;
              }
              .user-message .content {
                white-space: pre-wrap;
              }
              .user-message .role {
                color: #2563eb;
              }
              .ai-message .role {
                color: #16a34a;
              }
              /* Markdown渲染样式 */
              .markdown-body h1, .markdown-body h2, .markdown-body h3,
              .markdown-body h4, .markdown-body h5, .markdown-body h6 {
                color: #333;
                margin-top: 16px;
                margin-bottom: 8px;
                font-weight: 600;
              }
              .markdown-body h1 { font-size: 20px; }
              .markdown-body h2 { font-size: 18px; }
              .markdown-body h3 { font-size: 16px; }
              .markdown-body h4 { font-size: 14px; }
              .markdown-body p {
                margin-bottom: 8px;
              }
              .markdown-body strong {
                font-weight: 700;
                color: #333;
              }
              .markdown-body em {
                font-style: italic;
              }
              .markdown-body ul, .markdown-body ol {
                padding-left: 24px;
                margin-bottom: 8px;
              }
              .markdown-body li {
                margin-bottom: 4px;
              }
              .markdown-body code {
                background: #f0f0f0;
                padding: 2px 6px;
                border-radius: 3px;
                font-size: 11px;
                font-family: 'Courier New', monospace;
              }
              .markdown-body pre {
                background: #f5f5f5;
                padding: 12px;
                border-radius: 6px;
                overflow-x: auto;
                margin-bottom: 12px;
              }
              .markdown-body pre code {
                background: none;
                padding: 0;
              }
              .markdown-body blockquote {
                border-left: 3px solid #ddd;
                padding-left: 12px;
                color: #666;
                margin-bottom: 8px;
              }
              .markdown-body table {
                border-collapse: collapse;
                width: 100%;
                margin-bottom: 12px;
              }
              .markdown-body th, .markdown-body td {
                border: 1px solid #ddd;
                padding: 6px 10px;
                text-align: left;
                font-size: 11px;
              }
              .markdown-body th {
                background: #f5f5f5;
                font-weight: 600;
              }
              .markdown-body hr {
                border: none;
                border-top: 1px solid #e0e0e0;
                margin: 16px 0;
              }
            </style>
          </head>
          <body>
            <h1>${conversation.title || '对话记录'}</h1>
            <div class="meta">创建时间: ${new Date(conversation.createdAt).toLocaleString('zh-CN')}</div>
            ${messagesHtml}
          </body>
          </html>
        `;
        
        const filename = `conversation-${conversation.id}-${Date.now()}.pdf`;
        const pdfBuffer = await generateSimplePDFFromHTML(html);
        
        // 上传到S3
        const s3Key = `conversations/${ctx.user.id}/${filename}`;
        const { url } = await storagePut(s3Key, pdfBuffer, "application/pdf");
        
        return { url, filename };
      }),

    // 更新对话标题
    updateTitle: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          title: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const conversation = await db.getChatConversationById(input.id);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "对话不存在" });
        }
        await db.updateChatConversation(input.id, { title: input.title });
        return { success: true };
      }),

    // 更新对话使用的模型套餐
    updatePackage: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          packageId: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const conversation = await db.getChatConversationById(input.id);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "对话不存在" });
        }
        // 切换到套餐模式时，清除modelId以确保使用套餐的主模型
        await db.updateChatConversation(input.id, { packageId: input.packageId, modelId: 0 });
        return { success: true };
      }),

    // 自动生成对话标题
    generateTitle: protectedProcedure
      .input(
        z.object({
          conversationId: z.number(),
          userMessage: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const conversation = await db.getChatConversationById(input.conversationId);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "对话不存在" });
        }

        // 使用LLM生成简短的任务主题
        try {
          // 获取一个可用的聊天模型来生成标题
          const titleModel = await db.getFirstEnabledChatModel();
          const titleModelConfig = titleModel ? {
            model: titleModel.apiModel || titleModel.name,
            apiEndpoint: titleModel.apiEndpoint?.replace(':streamGenerateContent', ':generateContent'),
            apiKey: titleModel.apiKey,
          } : {
            model: "gemini-2.5-flash",
          };
          const response = await invokeLLM({
            ...titleModelConfig,
            max_tokens: 256,
            messages: [
              {
                role: "system",
                content: "你是一个专业的标题生成助手。根据用户的问题，生成一个简洁、准确的对话标题，不超过15个字。\n\n重要要求：\n1. 只返回标题文本，不要添加任何前缀、后缀、解释或标点符号\n2. 不要使用引号、书名号或其他符号包裹标题\n3. 直接输出标题，不要加“标题：”等前缀\n4. 保持简洁，抓住核心主题",
              },
              {
                role: "user",
                content: `请为以下问题生成一个简洁的对话标题：\n\n${input.userMessage}`,
              },
            ],
          });

          const messageContent = response.choices[0]?.message?.content;
          const generatedTitle = typeof messageContent === 'string'
            ? messageContent.trim()
            : "新对话";

          // 更新对话标题
          await db.updateChatConversation(input.conversationId, { title: generatedTitle });

          return { title: generatedTitle };
        } catch (error) {
          console.error("生成标题失败:", error);
          // 如果生成失败，使用用户消息的前20个字作为标题
          const fallbackTitle = input.userMessage.slice(0, 20) + (input.userMessage.length > 20 ? "..." : "");
          await db.updateChatConversation(input.conversationId, { title: fallbackTitle });
          return { title: fallbackTitle };
        }
      }),

    // 模型对比
    compareModels: protectedProcedure
      .input(
        z.object({
          prompt: z.string(),
          modelIds: z.array(z.number()).min(2).max(4),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 检查所有模型是否可用
        const models = await Promise.all(
          input.modelIds.map((id) => db.getAiModelById(id))
        );

        for (const model of models) {
          if (!model || !model.enabled) {
            throw new TRPCError({ code: "NOT_FOUND", message: `模型${model?.name || ""}不可用` });
          }
          if (model.type !== "chat") {
            throw new TRPCError({ code: "BAD_REQUEST", message: `模型${model.name}不支持对话功能` });
          }
        }

        // 检查用户余额
        const user = await db.getUserById(ctx.user.id);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        // 计算总成本
        const totalCost = models.reduce((sum, model) => sum + (model ? parseFloat(model.costPerUse.toString()) : 0), 0);
        const currentBalance = parseFloat(user.fishCoinBalance);

        if (currentBalance < totalCost) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `余额不足，需要 ${totalCost.toFixed(2)} 🐟币，当前余额 ${currentBalance.toFixed(2)} 🐟币`,
          });
        }

        // 并行调用所有模型
        const results: Record<string, { response: string; responseTime: number; cost: number; modelName: string }> = {};
        const startTime = Date.now();

        await Promise.all(
          models.map(async (model) => {
            if (!model) return;

            const modelStartTime = Date.now();
            try {
              const response = await invokeLLM({
                model: model.name, // 模型对比使用对应的模型
                messages: [
                  { role: "user", content: input.prompt },
                ],
              });

              const responseTime = Date.now() - modelStartTime;
              const messageContent = response.choices[0]?.message?.content;
              const responseText = typeof messageContent === 'string' 
                ? messageContent 
                : Array.isArray(messageContent)
                  ? messageContent.map(c => c.type === 'text' ? c.text : '').join('')
                  : "模型未返回内容";
              
              results[model.id.toString()] = {
                response: responseText,
                responseTime,
                cost: parseFloat(model.costPerUse.toString()),
                modelName: model.name,
              };
            } catch (error: any) {
              results[model.id.toString()] = {
                response: `错误: ${error.message || "模型调用失败"}`,
                responseTime: Date.now() - modelStartTime,
                cost: parseFloat(model.costPerUse.toString()),
                modelName: model.name,
              };
            }
          })
        );

        // 扣除余额
        const newBalance = (currentBalance - totalCost).toFixed(2);
        await db.updateUserFishCoins(ctx.user.id, newBalance);

        // 记录交易
        await db.createFishCoinTransaction({
          userId: ctx.user.id,
          type: "consume",
          amount: `-${totalCost.toFixed(2)}`,
          balanceAfter: newBalance,
          description: `模型对比（${models.map((m) => m?.name).join(", ")}）`,
        });

        // 保存对比记录
        await db.createModelComparison({
          userId: ctx.user.id,
          prompt: input.prompt,
          modelIds: JSON.stringify(input.modelIds),
          results: JSON.stringify(results),
          totalCost: totalCost.toString(),
        });

        return {
          results,
          totalCost,
          totalTime: Date.now() - startTime,
          newBalance,
        };
      }),

    // 获取用户的对比历史
    getComparisonHistory: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const comparisons = await db.getUserModelComparisons(ctx.user.id, input.limit);
        return comparisons.map((c) => ({
          ...c,
          modelIds: JSON.parse(c.modelIds),
          results: JSON.parse(c.results),
        }));
      }),

    // 获取带标签的对话列表
    getAllWithTags: protectedProcedure.query(async ({ ctx }) => {
      return await db.getConversationsWithTags(ctx.user.id);
    }),

    // 获取对话的标签
    getTags: protectedProcedure
      .input(z.object({ conversationId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await db.getConversationTags(input.conversationId);
      }),

    // 为对话添加标签
    addTag: protectedProcedure
      .input(z.object({ conversationId: z.number(), tagId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const conversation = await db.getChatConversationById(input.conversationId);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "对话不存在" });
        }
        await db.addTagToConversation(input.conversationId, input.tagId);
        return { success: true };
      }),

    // 从对话移除标签
    removeTag: protectedProcedure
      .input(z.object({ conversationId: z.number(), tagId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const conversation = await db.getChatConversationById(input.conversationId);
        if (!conversation || conversation.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "对话不存在" });
        }
        await db.removeTagFromConversation(input.conversationId, input.tagId);
        return { success: true };
      }),
  }),

  // 标签管理
  tag: router({
    // 获取用户的所有标签
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserTags(ctx.user.id);
    }),

    // 创建新标签
    create: protectedProcedure
      .input(z.object({ name: z.string(), color: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        await db.createTag(ctx.user.id, input.name, input.color);
        return { success: true };
      }),

    // 更新标签
    update: protectedProcedure
      .input(
        z.object({
          tagId: z.number(),
          name: z.string().optional(),
          color: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { tagId, ...data } = input;
        await db.updateTag(tagId, ctx.user.id, data);
        return { success: true };
      }),

    // 删除标签
    delete: protectedProcedure
      .input(z.object({ tagId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteTag(input.tagId, ctx.user.id);
        return { success: true };
      }),
  }),

  // 文件上传和处理
  file: router({
    // 获取用户的所有文件
    getAll: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserFiles(ctx.user.id);
    }),

    // 获取单个文件详情
    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const file = await db.getUploadedFileById(input.id);
        if (!file || file.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "文件不存在" });
        }
        return file;
      }),

    // 直接上传文件到S3（用于AI对话中的图片/文件上传）
    uploadToS3: protectedProcedure
      .input(
        z.object({
          filename: z.string(),
          mimeType: z.string(),
          fileData: z.string(), // base64编码的文件数据
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 检查是否为图片文件
        const isImage = input.mimeType.startsWith('image/');
        
        // 如果是图片，检查图片配额
        if (isImage) {
          const quotaCheck = await db.checkQuota(ctx.user.id, "image");
          if (!quotaCheck.allowed) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `今日图片配额已用完（${quotaCheck.limit}/${quotaCheck.limit}），请明天再试或升级为VIP`
            });
          }
        }

        // 生成唯一文件键
        const fileKey = `user-${ctx.user.id}/chat-uploads/${Date.now()}-${nanoid(8)}-${input.filename}`;

        // 将base64转换为Buffer
        const base64Data = input.fileData.split(",")[1] || input.fileData;
        const fileBuffer = Buffer.from(base64Data, "base64");

        // 上传到S3
        const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);
        
        // 如果是图片，扣除图片配额
        if (isImage) {
          await db.incrementQuotaUsage(ctx.user.id, "image");
          console.log(`[Upload] Image quota incremented for user ${ctx.user.id}`);
        }

        return {
          fileKey,
          fileUrl: url,
          filename: input.filename,
        };
      }),

    // 生成上传URL（返回签名URL供前端直接上传）
    getUploadUrl: protectedProcedure
      .input(
        z.object({
          filename: z.string(),
          mimeType: z.string(),
          fileSize: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 检查文件大小限制 (16MB)
        const maxSize = 16 * 1024 * 1024;
        if (input.fileSize > maxSize) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "文件大小超过限制 (16MB)" });
        }

        // 生成唯一文件键
        const fileKey = `user-${ctx.user.id}/uploads/${Date.now()}-${nanoid(8)}-${input.filename}`;

        // 返回文件键和上传信息
        return {
          fileKey,
          filename: input.filename,
          mimeType: input.mimeType,
        };
      }),

    // 确认文件上传完成，创建数据库记录
    confirmUpload: protectedProcedure
      .input(
        z.object({
          fileKey: z.string(),
          fileUrl: z.string(),
          originalName: z.string(),
          mimeType: z.string(),
          fileSize: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // 判断文件类型
        let category: "pdf" | "word" | "audio" | "other" = "other";
        if (input.mimeType.includes("pdf")) {
          category = "pdf";
        } else if (
          input.mimeType.includes("word") ||
          input.mimeType.includes("document") ||
          input.originalName.endsWith(".docx") ||
          input.originalName.endsWith(".doc")
        ) {
          category = "word";
        } else if (input.mimeType.startsWith("audio/")) {
          category = "audio";
        }

        const result = await db.createUploadedFile({
          userId: ctx.user.id,
          originalName: input.originalName,
          fileKey: input.fileKey,
          fileUrl: input.fileUrl,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          category,
          status: "pending",
        });

        return { success: true, fileId: Number((result as any).insertId) };
      }),

    // 处理PDF文件（提取文本）
    processPdf: protectedProcedure
      .input(
        z.object({
          fileId: z.number(),
          modelId: z.number(),
          task: z.string().optional(), // 如"总结", "分析"等
        })
      )
      .mutation(async ({ ctx, input }) => {
        const file = await db.getUploadedFileById(input.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "文件不存在" });
        }

        if (file.category !== "pdf") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "该文件不是PDF格式" });
        }

        const model = await db.getAiModelById(input.modelId);
        if (!model || !model.enabled) {
          throw new TRPCError({ code: "NOT_FOUND", message: "模型不可用" });
        }

        // 检查用户余额
        const user = await db.getUserById(ctx.user.id);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        const balance = parseFloat(user.fishCoinBalance);
        const cost = parseFloat(model.costPerUse);

        if (balance < cost) {
          await notifyOwner({
            title: "用户余额不足",
            content: `用户 ${user.name || user.email} (ID: ${user.id}) 余额不足，当前余额: ${balance} 🐟币`,
          });
          // 发送实时通知给用户
          sendNotificationToUser(ctx.user.id, {
            type: "low_balance",
            title: "🐟币余额不足",
            message: `当前余额: ${balance} 🐟币，无法完成操作。请联系管理员充值。`,
          });
          throw new TRPCError({ code: "BAD_REQUEST", message: "🐟币余额不足" });
        }

        // 更新文件状态
        await db.updateFileStatus(input.fileId, "processing");

        try {
          // 使用LLM处理PDF（这里模拟处理，实际需要PDF解析库）
          const taskPrompt = input.task || "提取和总结文档内容";
          const response = await invokeLLM({
            model: "gemini-2.5-flash", // PDF处理使用默认模型
            messages: [
              {
                role: "system",
                content: `你是一个专业的文档处理助手。任务: ${taskPrompt}`,
              },
              {
                role: "user",
                content: `请处理这个PDF文件: ${file.originalName}。由于技术限制，请说明如何处理这类文件。`,
              },
            ],
          });

          const result = response.choices[0]?.message?.content || "";

          // 扣除🐟币
          const newBalance = (balance - cost).toFixed(2);
          await db.updateUserFishCoins(ctx.user.id, newBalance);
          await db.createFishCoinTransaction({
            userId: ctx.user.id,
            type: "consume",
            amount: `-${cost.toFixed(2)}`,
            balanceAfter: newBalance,
            modelId: model.id,
            description: `处理PDF文件: ${file.originalName}`,
          });

          // 更新文件状态和结果
          await db.updateFileStatus(input.fileId, "completed", JSON.stringify({ result, task: taskPrompt }));

          return {
            result,
            newBalance,
            cost: cost.toFixed(2),
          };
        } catch (error) {
          await db.updateFileStatus(input.fileId, "failed");
          throw error;
        }
      }),

    // 处理音频文件（语音转文字）
    transcribeAudio: protectedProcedure
      .input(
        z.object({
          fileId: z.number(),
          modelId: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const file = await db.getUploadedFileById(input.fileId);
        if (!file || file.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "文件不存在" });
        }

        if (file.category !== "audio") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "该文件不是音频格式" });
        }

        const model = await db.getAiModelById(input.modelId);
        if (!model || !model.enabled) {
          throw new TRPCError({ code: "NOT_FOUND", message: "模型不可用" });
        }

        if (model.type !== "transcription") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "该模型不支持语音转文字" });
        }

        // 检查用户配额
        const quotaCheck = await db.checkQuota(ctx.user.id, "document");
        if (!quotaCheck.allowed) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: `今日文档处理配额已用完（${quotaCheck.limit}/${quotaCheck.limit}），请明天再试或升级为VIP` 
          });
        }

        // 检查用户余额
        const user = await db.getUserById(ctx.user.id);
        if (!user) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }

        const balance = parseFloat(user.fishCoinBalance);
        const cost = parseFloat(model.costPerUse);

        if (balance < cost) {
          await notifyOwner({
            title: "用户余额不足",
            content: `用户 ${user.name || user.email} (ID: ${user.id}) 余额不足，当前余额: ${balance} 🐟币`,
          });
          // 发送实时通知给用户
          sendNotificationToUser(ctx.user.id, {
            type: "low_balance",
            title: "🐟币余额不足",
            message: `当前余额: ${balance} 🐟币，无法完成操作。请联系管理员充值。`,
          });
          throw new TRPCError({ code: "BAD_REQUEST", message: "🐟币余额不足" });
        }

        // 更新文件状态
        await db.updateFileStatus(input.fileId, "processing");

        try {
          // 调用语音转文字API
          const transcription = await transcribeAudio({
            audioUrl: file.fileUrl,
          });

          // 检查是否有错误
          if ("error" in transcription) {
            throw new TRPCError({ 
              code: "INTERNAL_SERVER_ERROR", 
              message: transcription.error 
            });
          }

          // 扣除🐟币
          const newBalance = (balance - cost).toFixed(2);
          await db.updateUserFishCoins(ctx.user.id, newBalance);
          await db.createFishCoinTransaction({
            userId: ctx.user.id,
            type: "consume",
            amount: `-${cost.toFixed(2)}`,
            balanceAfter: newBalance,
            modelId: model.id,
            description: `语音转文字: ${file.originalName}`,
          });

          // 增加配额使用次数
          await db.incrementQuotaUsage(ctx.user.id, "document");

          // 更新文件状态和结果
          await db.updateFileStatus(input.fileId, "completed", JSON.stringify(transcription));

          return {
            text: transcription.text,
            language: transcription.language,
            newBalance,
            cost: cost.toFixed(2),
          };
        } catch (error) {
          await db.updateFileStatus(input.fileId, "failed");
          throw error;
        }
      }),
  }),

  // 用户反馈
  feedback: router({ 
    // 用户：提交反馈
    create: protectedProcedure
      .input(
        z.object({
          type: z.enum(["bug", "feature", "improvement", "other"]),
          title: z.string().min(1).max(255),
          content: z.string().min(1),
          rating: z.number().min(1).max(5).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

        const { feedbacks } = await import("../drizzle/schema");
        await db.insert(feedbacks).values({
          userId: ctx.user.id,
          type: input.type,
          title: input.title,
          content: input.content,
          rating: input.rating,
        });

        // 通知管理员
        await notifyOwner({
          title: "新用户反馈",
          content: `用户 ${ctx.user.name || ctx.user.email} 提交了反馈: ${input.title}`,
        });

        return { success: true };
      }),

    // 用户：获取我的反馈
    getMyFeedbacks: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

      const { feedbacks } = await import("../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");

      return await db
        .select()
        .from(feedbacks)
        .where(eq(feedbacks.userId, ctx.user.id))
        .orderBy(desc(feedbacks.createdAt));
    }),

    // 管理员：获取所有反馈
    getAll: adminProcedure
      .input(
        z.object({
          status: z.enum(["pending", "in_progress", "resolved", "closed"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

        const { feedbacks, users } = await import("../drizzle/schema");
        const { eq, desc } = await import("drizzle-orm");

        let query = db.select().from(feedbacks);

        if (input.status) {
          query = query.where(eq(feedbacks.status, input.status)) as any;
        }

        const results = await query.orderBy(desc(feedbacks.createdAt));

        // 获取用户信息
        const feedbacksWithUsers = await Promise.all(
          results.map(async (feedback) => {
            const user = await db
              .select({ name: users.name, email: users.email })
              .from(users)
              .where(eq(users.id, feedback.userId))
              .limit(1);
            return { ...feedback, user: user[0] };
          })
        );

        return feedbacksWithUsers;
      }),

    // 管理员：更新反馈状态
    updateStatus: adminProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pending", "in_progress", "resolved", "closed"]),
          adminResponse: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

        const { feedbacks } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        await db
          .update(feedbacks)
          .set({
            status: input.status,
            adminResponse: input.adminResponse,
          })
          .where(eq(feedbacks.id, input.id));

        return { success: true };
      }),
  }),

  // 数据导出
  export: router({
    // 管理员：导出用户列表
    users: adminProcedure
      .input(
        z.object({
          format: z.enum(["excel", "csv"]),
        })
      )
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

        const { users } = await import("../drizzle/schema");
        const { desc } = await import("drizzle-orm");

        const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));

        if (input.format === "excel") {
          const ExcelJS = (await import("exceljs")).default;
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet("用户列表");

          worksheet.columns = [
            { header: "ID", key: "id", width: 10 },
            { header: "姓名", key: "name", width: 20 },
            { header: "邮箱", key: "email", width: 30 },
            { header: "角色", key: "role", width: 15 },
            { header: "🐟币余额", key: "fishCoinBalance", width: 15 },
            { header: "注册时间", key: "createdAt", width: 20 },
            { header: "最后登录", key: "lastSignedIn", width: 20 },
          ];

          allUsers.forEach((user) => {
            worksheet.addRow({
              id: user.id,
              name: user.name || "",
              email: user.email || "",
              role: user.role,
              fishCoinBalance: user.fishCoinBalance,
              createdAt: user.createdAt.toISOString(),
              lastSignedIn: user.lastSignedIn.toISOString(),
            });
          });

          const buffer = await workbook.xlsx.writeBuffer();
          return {
            data: Buffer.from(buffer).toString("base64"),
            filename: `users_${Date.now()}.xlsx`,
          };
        } else {
          // CSV格式
          const headers = ["ID", "姓名", "邮箱", "角色", "🐟币余额", "注册时间", "最后登录"];
          const rows = allUsers.map((user) => [
            user.id,
            user.name || "",
            user.email || "",
            user.role,
            user.fishCoinBalance,
            user.createdAt.toISOString(),
            user.lastSignedIn.toISOString(),
          ]);

          const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
          return {
            data: Buffer.from(csv, "utf-8").toString("base64"),
            filename: `users_${Date.now()}.csv`,
          };
        }
      }),

    // 管理员：导出交易记录
    transactions: adminProcedure
      .input(
        z.object({
          format: z.enum(["excel", "csv"]),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

        const { fishCoinTransactions, users } = await import("../drizzle/schema");
        const { desc, and, gte, lte, eq } = await import("drizzle-orm");

        let query = db.select().from(fishCoinTransactions);

        const conditions = [];
        if (input.startDate) {
          conditions.push(gte(fishCoinTransactions.createdAt, new Date(input.startDate)));
        }
        if (input.endDate) {
          conditions.push(lte(fishCoinTransactions.createdAt, new Date(input.endDate)));
        }

        if (conditions.length > 0) {
          query = query.where(and(...conditions)) as any;
        }

        const transactions = await query.orderBy(desc(fishCoinTransactions.createdAt));

        // 获取用户信息
        const transactionsWithUsers = await Promise.all(
          transactions.map(async (tx) => {
            const user = await db
              .select({ name: users.name, email: users.email })
              .from(users)
              .where(eq(users.id, tx.userId))
              .limit(1);
            return { ...tx, user: user[0] };
          })
        );

        if (input.format === "excel") {
          const ExcelJS = (await import("exceljs")).default;
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet("交易记录");

          worksheet.columns = [
            { header: "ID", key: "id", width: 10 },
            { header: "用户", key: "user", width: 20 },
            { header: "类型", key: "type", width: 15 },
            { header: "金额", key: "amount", width: 15 },
            { header: "余额", key: "balance", width: 15 },
            { header: "描述", key: "description", width: 30 },
            { header: "时间", key: "createdAt", width: 20 },
          ];

          transactionsWithUsers.forEach((tx) => {
            worksheet.addRow({
              id: tx.id,
              user: tx.user?.name || tx.user?.email || "",
              type: tx.type === "recharge" ? "收入" : "支出",
              amount: tx.amount,
              balance: tx.balanceAfter,
              description: tx.description || "",
              createdAt: tx.createdAt.toISOString(),
            });
          });

          const buffer = await workbook.xlsx.writeBuffer();
          return {
            data: Buffer.from(buffer).toString("base64"),
            filename: `transactions_${Date.now()}.xlsx`,
          };
        } else {
          const headers = ["ID", "用户", "类型", "金额", "余额", "描述", "时间"];
          const rows = transactionsWithUsers.map((tx) => [
            tx.id,
            tx.user?.name || tx.user?.email || "",
            tx.type === "recharge" ? "收入" : "支出",
            tx.amount,
            tx.balanceAfter,
            tx.description || "",
            tx.createdAt.toISOString(),
          ]);

          const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
          return {
            data: Buffer.from(csv, "utf-8").toString("base64"),
            filename: `transactions_${Date.now()}.csv`,
          };
        }
      }),

    // 管理员：导出反馈数据
    feedbacks: adminProcedure
      .input(
        z.object({
          format: z.enum(["excel", "csv"]),
          status: z.enum(["pending", "in_progress", "resolved", "closed"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

        const { feedbacks, users } = await import("../drizzle/schema");
        const { desc, eq } = await import("drizzle-orm");

        let query = db.select().from(feedbacks);

        if (input.status) {
          query = query.where(eq(feedbacks.status, input.status)) as any;
        }

        const allFeedbacks = await query.orderBy(desc(feedbacks.createdAt));

        // 获取用户信息
        const feedbacksWithUsers = await Promise.all(
          allFeedbacks.map(async (feedback) => {
            const user = await db
              .select({ name: users.name, email: users.email })
              .from(users)
              .where(eq(users.id, feedback.userId))
              .limit(1);
            return { ...feedback, user: user[0] };
          })
        );

        if (input.format === "excel") {
          const ExcelJS = (await import("exceljs")).default;
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet("反馈数据");

          worksheet.columns = [
            { header: "ID", key: "id", width: 10 },
            { header: "用户", key: "user", width: 20 },
            { header: "类型", key: "type", width: 15 },
            { header: "标题", key: "title", width: 30 },
            { header: "内容", key: "content", width: 50 },
            { header: "评分", key: "rating", width: 10 },
            { header: "状态", key: "status", width: 15 },
            { header: "管理员回复", key: "adminResponse", width: 50 },
            { header: "时间", key: "createdAt", width: 20 },
          ];

          feedbacksWithUsers.forEach((feedback) => {
            worksheet.addRow({
              id: feedback.id,
              user: feedback.user?.name || feedback.user?.email || "",
              type: feedback.type,
              title: feedback.title,
              content: feedback.content,
              rating: feedback.rating || "",
              status: feedback.status,
              adminResponse: feedback.adminResponse || "",
              createdAt: feedback.createdAt.toISOString(),
            });
          });

          const buffer = await workbook.xlsx.writeBuffer();
          return {
            data: Buffer.from(buffer).toString("base64"),
            filename: `feedbacks_${Date.now()}.xlsx`,
          };
        } else {
          const headers = ["ID", "用户", "类型", "标题", "内容", "评分", "状态", "管理员回复", "时间"];
          const rows = feedbacksWithUsers.map((feedback) => [
            feedback.id,
            feedback.user?.name || feedback.user?.email || "",
            feedback.type,
            feedback.title,
            feedback.content,
            feedback.rating || "",
            feedback.status,
            feedback.adminResponse || "",
            feedback.createdAt.toISOString(),
          ]);

          const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
          return {
            data: Buffer.from(csv, "utf-8").toString("base64"),
            filename: `feedbacks_${Date.now()}.csv`,
          };
        }
      }),
  }),

  // 用户统计
  stats: router({
    // 获取用户使用统计
    getUserStats: protectedProcedure.query(async ({ ctx }) => {
      const { getDb } = await import("./db");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

      const { fishCoinTransactions, chatConversations, uploadedFiles } = await import("../drizzle/schema");
      const { eq, and, sql } = await import("drizzle-orm");

      // 获取对话次数
      const chatCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(chatConversations)
        .where(eq(chatConversations.userId, ctx.user.id));

      // 获取图片生成数量（通过消费记录统计）
      const imageCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(fishCoinTransactions)
        .where(
          and(
            eq(fishCoinTransactions.userId, ctx.user.id),
            eq(fishCoinTransactions.type, "consume"),
            sql`${fishCoinTransactions.description} LIKE '%生成图片%'`
          )
        );

      // 获取文档处理量
      const fileCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(uploadedFiles)
        .where(eq(uploadedFiles.userId, ctx.user.id));

      // 获取最近30天的🐟币消费趋势
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const transactions = await db
        .select()
        .from(fishCoinTransactions)
        .where(
          and(
            eq(fishCoinTransactions.userId, ctx.user.id),
            sql`${fishCoinTransactions.createdAt} >= ${thirtyDaysAgo}`
          )
        );

      // 按日期聚合消费数据
      const dailyConsumption: Record<string, { consume: number; recharge: number }> = {};
      transactions.forEach((tx) => {
        const date = new Date(tx.createdAt).toISOString().split("T")[0];
        if (!dailyConsumption[date]) {
          dailyConsumption[date] = { consume: 0, recharge: 0 };
        }
        const amount = Math.abs(Number(tx.amount));
        if (tx.type === "consume") {
          dailyConsumption[date].consume += amount;
        } else if (tx.type === "recharge" || tx.type === "admin_adjust") {
          dailyConsumption[date].recharge += amount;
        }
      });

      // 转换为数组格式
      const consumptionTrend = Object.entries(dailyConsumption)
        .map(([date, data]) => ({
          date,
          consume: data.consume,
          recharge: data.recharge,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 获取论坛等级权益配置
      const { getForumLevelBenefit, getGlobalDiscountSettings } = await import("./db");
      const forumBenefit = ctx.user.forumTrustLevel !== null 
        ? await getForumLevelBenefit(ctx.user.forumTrustLevel)
        : null;
      
      // 获取全局折扣开关
      const globalDiscountSettings = await getGlobalDiscountSettings();
      const globalDiscountEnabled = globalDiscountSettings?.discountEnabled ?? false;

      return {
        chatCount: Number(chatCount[0]?.count || 0),
        imageCount: Number(imageCount[0]?.count || 0),
        fileCount: Number(fileCount[0]?.count || 0),
        consumptionTrend,
        forumTrustLevel: ctx.user.forumTrustLevel,
        forumPoints: ctx.user.forumPoints,
        forumBenefitEnabled: globalDiscountEnabled && (forumBenefit?.enabled ?? false), // 同时检查全局开关和等级开关
        forumChatDiscount: forumBenefit?.chatDiscount ?? 0,
        forumImageDiscount: forumBenefit?.imageDiscount ?? 0,
        forumDocumentDiscount: forumBenefit?.documentDiscount ?? 0,
      };
    }),
  }),

  // 系统配置
  config: router({
    // 管理员：获取配置
    get: adminProcedure
      .input(z.object({ key: z.string() }))
      .mutation(async ({ input }) => {
        return await db.getSystemConfig(input.key);
      }),

    // 管理员：设置配置
    set: adminProcedure
      .input(
        z.object({
          key: z.string(),
          value: z.string(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await db.setSystemConfig(input.key, input.value, input.description);
        return { success: true };
      }),

    // 管理员：获取所有配置
    getAll: adminProcedure.query(async () => {
      return await db.getAllSystemConfigs();
    }),

    // 公开：检查是否需要邀请码注册
    requireInvitation: publicProcedure.query(async () => {
      const config = await db.getSystemConfig("require_invitation");
      return {
        required: config?.configValue === "true",
      };
    }),
  }),

  // 系统通知管理
  notification: router({
    // 管理员：获取所有通知
    getAll: adminProcedure
      .input(
        z.object({
          limit: z.number().optional().default(50),
          offset: z.number().optional().default(0),
          type: z.enum(["info", "warning", "error", "success", "all"]).optional().default("all"),
          isRead: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return await db.getSystemNotifications(input);
      }),

    // 管理员：标记通知为已读
    markAsRead: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.markNotificationAsRead(input.id);
        return { success: true };
      }),

    // 管理员：批量标记为已读
    markAllAsRead: adminProcedure.mutation(async () => {
      await db.markAllNotificationsAsRead();
      return { success: true };
    }),

    // 管理员：删除通知
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteSystemNotification(input.id);
        return { success: true };
      }),

    // 管理员：获取未读通知数量
    getUnreadCount: adminProcedure.query(async () => {
      const count = await db.getUnreadNotificationCount();
      return { count };
    }),
  }),

  // 模型套餐管理
  modelPackage: router({
    // 用户：获取所有可用套餐
    getAll: publicProcedure.query(async () => {
      const { getAllModelPackages } = await import("./modelPackageManager");
      const packages = await getAllModelPackages();
      return packages;
    }),

    // 用户：获取单个套餐详情
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { getModelPackageById, getPrimaryModel, getFallbackModels } = await import("./modelPackageManager");
        const pkg = await getModelPackageById(input.id);
        if (!pkg) {
          throw new TRPCError({ code: "NOT_FOUND", message: "套餐不存在" });
        }
        const primaryModel = await getPrimaryModel(input.id);
        const fallbackModels = await getFallbackModels(input.id);
        return {
          ...pkg,
          primaryModel,
          fallbackModels,
        };
      }),

    // 管理员：创建套餐
    create: adminProcedure
      .input(
        z.object({
          name: z.string(),
          displayName: z.string(),
          description: z.string().optional(),
          primaryModelId: z.number(),
          fallbackModelIds: z.string(),
          enabled: z.boolean().optional(),
          sortOrder: z.number().optional(),
          fishCoinCost: z.union([z.number(), z.string().transform((val) => parseFloat(val))]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { createModelPackage } = await import("./modelPackageManager");
        await createModelPackage(input);
        return { success: true };
      }),

    // 管理员：更新套餐
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          displayName: z.string().optional(),
          description: z.string().optional(),
          primaryModelId: z.number().optional(),
          fallbackModelIds: z.string().optional(),
          enabled: z.boolean().optional(),
          sortOrder: z.number().optional(),
          fishCoinCost: z.union([z.number(), z.string().transform((val) => parseFloat(val))]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const { updateModelPackage } = await import("./modelPackageManager");
        await updateModelPackage(id, data);
        return { success: true };
      }),

    // 管理员：删除套餐
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteModelPackage } = await import("./modelPackageManager");
        await deleteModelPackage(input.id);
        return { success: true };
      }),
  }),

  // 代理管理
  proxy: router({
    // 管理员：获取所有代理
    getAll: adminProcedure.query(async () => {
      const { getAllProxies } = await import("./proxyManager");
      const proxies = await getAllProxies();
      return proxies;
    }),

    // 管理员：获取单个代理
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { getProxyById } = await import("./proxyManager");
        const proxy = await getProxyById(input.id);
        if (!proxy) {
          throw new TRPCError({ code: "NOT_FOUND", message: "代理不存在" });
        }
        return proxy;
      }),

    // 管理员：创建代理
    create: adminProcedure
      .input(
        z.object({
          name: z.string(),
          type: z.enum(["socks5", "http", "https", "vless", "ss"]),
          host: z.string(),
          port: z.number(),
          username: z.string().optional(),
          password: z.string().optional(),
          vlessConfig: z.any().optional(),
          enabled: z.boolean().optional(),
          priority: z.number().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { createProxy } = await import("./proxyManager");
        const id = await createProxy({
          ...input,
          enabled: input.enabled ?? true,
          priority: input.priority ?? 0,
        });
        return { success: true, id };
      }),
    // 管理员：从链接创建代理(支持SS和VLESS)
    createFromUrl: adminProcedure
      .input(
        z.object({
          url: z.string(),
          name: z.string().optional(),
          enabled: z.boolean().optional(),
          priority: z.number().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { parseSSUrl, parseVLESSUrl, startXrayForProxy } = await import("./proxyLinkParser");
        const { createProxy } = await import("./proxyManager");
        
        let proxyConfig: any = null;
        let proxyType: "ss" | "vless" | null = null;
        
        // 尝试解析SS链接
        if (input.url.startsWith("ss://")) {
          proxyConfig = parseSSUrl(input.url);
          proxyType = "ss";
        }
        // 尝试解析VLESS链接
        else if (input.url.startsWith("vless://")) {
          proxyConfig = parseVLESSUrl(input.url);
          proxyType = "vless";
        }
        
        if (!proxyConfig || !proxyType) {
          throw new TRPCError({ 
            code: "BAD_REQUEST", 
            message: "无效的代理链接格式,仅支持ss://和vless://" 
          });
        }
        
        // 创建代理记录
        const id = await createProxy({
          name: input.name || proxyConfig.name || `${proxyType.toUpperCase()} Proxy`,
          type: proxyType,
          host: proxyConfig.server,
          port: proxyConfig.port,
          vlessConfig: proxyConfig,
          enabled: input.enabled ?? true,
          priority: input.priority ?? 0,
        });
        
        // 立即启动Xray进程
        try {
          const socksPort = await startXrayForProxy(id, proxyConfig);
          console.log(`[Proxy] Started Xray for proxy ${id} on port ${socksPort}`);
        } catch (error) {
          console.error(`[Proxy] Failed to start Xray for proxy ${id}:`, error);
        }
        
        return { success: true, id };
      }),

    // 管理员：更新代理
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          type: z.enum(["socks5", "http", "https", "vless", "ss"]).optional(),
          host: z.string().optional(),
          port: z.number().optional(),
          username: z.string().optional(),
          password: z.string().optional(),
          vlessConfig: z.any().optional(),
          enabled: z.boolean().optional(),
          priority: z.number().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const { updateProxy } = await import("./proxyManager");
        await updateProxy(id, data);
        return { success: true };
      }),

    // 管理员：删除代理
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteProxy } = await import("./proxyManager");
        await deleteProxy(input.id);
        return { success: true };
      }),

    // 管理员：测试代理
    test: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { testProxy } = await import("./proxyManager");
        const result = await testProxy(input.id);
        return result;
      }),
  }),

  // 模型成本分析
  proxyRules: router({
    // 管理员：获取所有代理规则
    getAll: adminProcedure.query(async () => {
      const { getAllProxyRules } = await import("./proxyRulesManager");
      const rules = await getAllProxyRules();
      return rules;
    }),
    // 管理员：获取单个代理规则
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { getProxyRuleById } = await import("./proxyRulesManager");
        const rule = await getProxyRuleById(input.id);
        if (!rule) {
          throw new TRPCError({ code: "NOT_FOUND", message: "代理规则不存在" });
        }
        return rule;
      }),
    // 管理员：创建代理规则
    create: adminProcedure
      .input(
        z.object({
          name: z.string(),
          pattern: z.string(),
          enabled: z.boolean().optional(),
          priority: z.number().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { createProxyRule } = await import("./proxyRulesManager");
        const id = await createProxyRule({
          ...input,
          enabled: input.enabled ?? true,
          priority: input.priority ?? 0,
        });
        return { success: true, id };
      }),
    // 管理员：更新代理规则
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          pattern: z.string().optional(),
          enabled: z.boolean().optional(),
          priority: z.number().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const { updateProxyRule } = await import("./proxyRulesManager");
        await updateProxyRule(id, data);
        return { success: true };
      }),
    // 管理员：删除代理规则
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteProxyRule } = await import("./proxyRulesManager");
        await deleteProxyRule(input.id);
        return { success: true };
      }),
    // 管理员：测试URL匹配
    testMatch: adminProcedure
      .input(z.object({ url: z.string() }))
      .mutation(async ({ input }) => {
        const { testUrlMatch } = await import("./proxyRulesManager");
        const result = await testUrlMatch(input.url);
        return result;
      }),
  }),
  // 图片模型管理路由
  imageModels: router({
    // 获取所有图片生成模型
    list: protectedProcedure
      .query(async () => {
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new Error('数据库不可用');
        
        const models = await dbInstance
          .select()
          .from(aiModels)
          .where(eq(aiModels.type, 'image'))
          .orderBy(desc(aiModels.enabled), desc(aiModels.createdAt));
        return models;
      }),

    // 创建图片生成模型
    create: protectedProcedure
      .input(z.object({
        name: z.string(),
        displayName: z.string(),
        apiEndpoint: z.string(),
        apiKey: z.string(),
        apiModel: z.string(),
      }))
      .mutation(async ({ input }) => {
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new Error('数据库不可用');
        
        const result = await dbInstance.insert(aiModels).values({
          name: input.name,
          displayName: input.displayName,
          type: 'image',
          apiEndpoint: input.apiEndpoint,
          apiKey: input.apiKey,
          apiModel: input.apiModel,
          enabled: true,
          createdAt: new Date(),
        });
        return { success: true, id: result.insertId };
      }),

    // 删除图片生成模型
    delete: protectedProcedure
      .input(z.object({
        id: z.number(),
      }))
      .mutation(async ({ input }) => {
        const dbInstance = await db.getDb();
        if (!dbInstance) throw new Error('数据库不可用');
        
        await dbInstance.delete(aiModels).where(eq(aiModels.id, input.id));
        return { success: true };
      }),

    // 测试图片生成
    testGeneration: protectedProcedure
      .input(z.object({
        prompt: z.string(),
      }))
      .mutation(async ({ input }) => {
        try {
          console.log('[Image Test] Starting image generation test with prompt:', input.prompt);
          
          // 获取启用的图片生成模型
          const dbInstance = await db.getDb();
          if (!dbInstance) throw new Error('数据库不可用');
          
          const models = await dbInstance
            .select()
            .from(aiModels)
            .where(
              and(
                eq(aiModels.type, 'image'),
                eq(aiModels.enabled, true)
              )
            )
            .limit(1);
          
          const model = models[0];
          if (!model) {
            throw new Error('没有找到启用的图片生成模型');
          }

          console.log('[Image Test] Using model:', model.name, model.apiEndpoint);

          // 调用图片生成API
          const result = await generateImage({ prompt: input.prompt });

          console.log('[Image Test] Generation successful:', result);

          return {
            success: true,
            imageUrl: result.imageUrl,
          };
        } catch (error: any) {
          console.error('[Image Test] Generation failed:', error);
          return {
            success: false,
            error: error.message || '图片生成失败',
            details: error.stack || JSON.stringify(error, null, 2),
          };
        }
      }),
  }),
  storageSettings: router({
    // 管理员：获取所有存储配置
    getAll: adminProcedure.query(async () => {
      const { getAllStorageSettings } = await import("./storageManager");
      const settings = await getAllStorageSettings();
      return settings;
    }),
    // 管理员：获取单个存储配置
    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { getStorageSettingsById } = await import("./storageManager");
        const settings = await getStorageSettingsById(input.id);
        if (!settings) {
          throw new TRPCError({ code: "NOT_FOUND", message: "存储配置不存在" });
        }
        return settings;
      }),
    // 管理员：创建存储配置
    create: adminProcedure
      .input(
        z.object({
          type: z.enum(["local", "aliyun", "tencent", "aws"]),
          enabled: z.boolean().optional(),
          priority: z.number().optional(),
          config: z.any().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { createStorageSettings } = await import("./storageManager");
        const id = await createStorageSettings(input);
        return { success: true, id };
      }),
    // 管理员：更新存储配置
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          type: z.enum(["local", "aliyun", "tencent", "aws"]).optional(),
          enabled: z.boolean().optional(),
          priority: z.number().optional(),
          config: z.any().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const { updateStorageSettings } = await import("./storageManager");
        await updateStorageSettings(id, data);
        return { success: true };
      }),
    // 管理员：删除存储配置
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const { deleteStorageSettings } = await import("./storageManager");
        await deleteStorageSettings(input.id);
        return { success: true };
      }),
    // 管理员：测试存储连接
    test: adminProcedure
      .input(
        z.object({
          id: z.number().optional(),
          type: z.enum(["local", "aliyun", "tencent", "aws"]).optional(),
          config: z.any().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { testStorageConnection, getStorageSettingsById } = await import("./storageManager");
        
        if (input.id) {
          // 测试已存在的配置
          const settings = await getStorageSettingsById(input.id);
          if (!settings) {
            throw new TRPCError({ code: "NOT_FOUND", message: "存储配置不存在" });
          }
          const result = await testStorageConnection({
            type: settings.type,
            config: settings.config,
          });
          return result;
        } else if (input.type) {
          // 测试新配置
          const result = await testStorageConnection({
            type: input.type,
            config: input.config,
          });
          return result;
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "必须提供id或type" });
        }
      }),
  }),
  modelCost: router({
    // 管理员：获取模型使用统计
    getStats: adminProcedure
      .input(z.object({ days: z.number().optional() }))
      .mutation(async ({ input }) => {
        const { getModelUsageStats } = await import("./modelCostAnalysis");
        const stats = await getModelUsageStats(input.days);
        return stats;
      }),

    // 管理员：获取成本优化建议
    getOptimizationSuggestions: adminProcedure.query(async () => {
      const { generateCostOptimizationSuggestions } = await import("./modelCostAnalysis");
      const suggestions = await generateCostOptimizationSuggestions();
      return suggestions;
    }),
  }),

  // 折扣管理
  discount: router({
    // 获取所有用户等级折扣配置
    getAll: publicProcedure.query(async () => {
      const configs = await db.getAllDiscountConfigs();
      return configs;
    }),

    // 获取全局折扣设置
    getGlobalSettings: publicProcedure.query(async () => {
      const settings = await db.getGlobalDiscountSettings();
      return settings;
    }),

    // 管理员：更新用户等级折扣配置（支持定时折扣）
    updateConfig: adminProcedure
      .input(
        z.object({
          userTier: z.enum(["free", "vip", "premium"]),
          chatDiscount: z.number().min(0).max(100).optional(),
          imageDiscount: z.number().min(0).max(100).optional(),
          documentDiscount: z.number().min(0).max(100).optional(),
          enabled: z.boolean().optional(),
          startTime: z.string().nullable().optional(), // ISO时间字符串
          endTime: z.string().nullable().optional(), // ISO时间字符串
        })
      )
      .mutation(async ({ input }) => {
        await db.updateDiscountConfig(input.userTier, input);
        return { success: true };
      }),

    // 管理员：更新全局折扣设置
    updateGlobalSettings: adminProcedure
      .input(
        z.object({
          discountEnabled: z.boolean(),
        })
      )
      .mutation(async ({ input }) => {
        await db.updateGlobalDiscountSettings(input);
        return { success: true };
      }),

    // 获取折扣使用统计
    getStatistics: adminProcedure.query(async () => {
      const stats = await db.getDiscountStatistics();
      return stats;
    }),

    // 获取折扣叠加规则列表
    getStackRules: adminProcedure.query(async () => {
      const rules = await db.getDiscountStackRules();
      return rules;
    }),

    // 创建折扣叠加规则
    createStackRule: adminProcedure
      .input(
        z.object({
          ruleName: z.string(),
          enabled: z.boolean().optional(),
          tierDiscountWeight: z.number().min(0).max(100).optional(),
          activityDiscountWeight: z.number().min(0).max(100).optional(),
          couponWeight: z.number().min(0).max(100).optional(),
          maxDiscountPercent: z.number().min(0).max(100).optional(),
          stackStrategy: z.enum(["additive", "multiplicative", "max"]).optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const rule = await db.createDiscountStackRule(input);
        return rule;
      }),

    // 更新折扣叠加规则
    updateStackRule: adminProcedure
      .input(
        z.object({
          id: z.number(),
          ruleName: z.string().optional(),
          enabled: z.boolean().optional(),
          tierDiscountWeight: z.number().min(0).max(100).optional(),
          activityDiscountWeight: z.number().min(0).max(100).optional(),
          couponWeight: z.number().min(0).max(100).optional(),
          maxDiscountPercent: z.number().min(0).max(100).optional(),
          stackStrategy: z.enum(["additive", "multiplicative", "max"]).optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        await db.updateDiscountStackRule(input.id, input);
        return { success: true };
      }),

    // 删除折扣叠加规则
    deleteStackRule: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteDiscountStackRule(input.id);
        return { success: true };
      }),

    // 获取折扣使用日志
    getUsageLogs: adminProcedure
      .input(
        z.object({
          userId: z.number().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          limit: z.number().min(1).max(1000).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const logs = await db.getDiscountUsageLogs(input);
        return logs;
      }),
  }),

  // 视频API配置管理
  videoApi: router({
    // 获取所有视频API配置
    getAll: publicProcedure.query(async () => {
      const configs = await db.getAllVideoApiConfigs();
      return configs;
    }),

    // 获取启用的视频API配置
    getEnabled: publicProcedure.query(async () => {
      const configs = await db.getEnabledVideoApiConfigs();
      return configs;
    }),

    // 管理员：添加视频API配置
    create: adminProcedure
      .input(
        z.object({
          provider: z.string(),
          apiKey: z.string().optional(),
          apiEndpoint: z.string().optional(),
          isEnabled: z.boolean().default(false),
          cost5s: z.string().default("30.00"),
          cost10s: z.string().default("50.00"),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const config = await db.createVideoApiConfig(input);
        return config;
      }),

    // 管理员：更新视频API配置
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          apiKey: z.string().optional(),
          apiEndpoint: z.string().optional(),
          isEnabled: z.boolean().optional(),
          cost5s: z.string().optional(),
          cost10s: z.string().optional(),
          description: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const config = await db.updateVideoApiConfig(id, data);
        return config;
      }),

    // 管理员：删除视频API配置
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await db.deleteVideoApiConfig(input.id);
        return { success: true };
      }),
  }),

  // 论坛等级权益管理
  forumBenefits: router({
    // 获取所有等级权益配置
    getAll: publicProcedure.query(async () => {
      const benefits = await db.getAllForumLevelBenefits();
      return benefits;
    }),

    // 获取指定等级的权益
    getByLevel: publicProcedure
      .input(z.object({ trustLevel: z.number().min(0).max(9) }))
      .mutation(async ({ input }) => {
        const benefit = await db.getForumLevelBenefit(input.trustLevel);
        return benefit;
      }),

    // 管理员：更新等级权益配置
    update: adminProcedure
      .input(
        z.object({
          trustLevel: z.number().min(0).max(9),
          levelName: z.string().optional(),
          chatDiscount: z.number().min(0).max(100).optional(),
          imageDiscount: z.number().min(0).max(100).optional(),
          documentDiscount: z.number().min(0).max(100).optional(),
          specialBenefits: z.string().optional(), // JSON string
          enabled: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { getDb } = await import("./db");
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "数据库连接失败" });

        const { forumLevelBenefits } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");

        const updateData: Record<string, unknown> = {};
        if (input.levelName !== undefined) updateData.levelName = input.levelName;
        if (input.chatDiscount !== undefined) updateData.chatDiscount = input.chatDiscount;
        if (input.imageDiscount !== undefined) updateData.imageDiscount = input.imageDiscount;
        if (input.documentDiscount !== undefined) updateData.documentDiscount = input.documentDiscount;
        if (input.specialBenefits !== undefined) updateData.specialBenefits = input.specialBenefits;
        if (input.enabled !== undefined) updateData.enabled = input.enabled;

        if (Object.keys(updateData).length > 0) {
          await db
            .update(forumLevelBenefits)
            .set(updateData)
            .where(eq(forumLevelBenefits.trustLevel, input.trustLevel));
        }

        return { success: true };
      }),
  }),

  // 作业批改系统
  homework: router({
    // 批量批改作业
    correctBatch: protectedProcedure
      .input(z.object({
        imageUrls: z.array(z.string()).min(1).max(10),
        subject: z.enum(["math", "chinese", "english", "physics", "chemistry", "other"]).default("math"),
        grade: z.string().optional(),
        title: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 检查用户余额
        const user = await db.getUserById(ctx.user.id);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "用户不存在" });
        
        // 获取用户偏好的模型套餐（用于记录modelId）
        const packageId = user.preferredPackageId || 2;
        const modelPackage = await db.getModelPackageById(packageId);
        
        if (!modelPackage) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "模型套餐不存在，请联系管理员" });
        }
        
        // 根据年级计算扣费金额（每次批改统一扣费，不按图片数量）
        // 从数据库读取费用配置
        const gradeNum = parseInt(input.grade || '0') || 0;
        const pricingConfig = await db.getHomeworkPricingByGrade(gradeNum);
        
        if (!pricingConfig) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "未找到费用配置" });
        }
        
        const costPerCorrection = parseFloat(pricingConfig.pricePerCorrection);
        const gradeCategory = pricingConfig.gradeName;
        const useAdvancedModel = pricingConfig.useAdvancedModel;
        
        const totalCost = costPerCorrection;
        const userBalance = parseFloat(user.fishCoinBalance);
        console.log(`[Homework Correction] Grade: ${input.grade}, Category: ${gradeCategory}, Cost: ${totalCost}, Balance: ${userBalance}`);
        
        if (userBalance < totalCost) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "🐟币余额不足" });
        }
        
        // 扣除🐟币
        console.log(`[Homework Correction] Attempting to deduct ${totalCost} fish coins from user ${ctx.user.id}`);
        const deductSuccess = await db.deductFishCoins(
          ctx.user.id,
          totalCost,
          `${gradeCategory}作业批改（${input.imageUrls.length}张图片）`
        );
        console.log(`[Homework Correction] Deduct result: ${deductSuccess}`);
        
        if (!deductSuccess) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "扣除🐟币失败" });
        }
        
        // 逐一批改每张图片
        // 根据useAdvancedModel选择模型
        // 使用支持视觉的模型：16=qwen-vl-max, 6=Gemini 3 Flash
        const selectedModelId = useAdvancedModel ? 6 : 16;
        const selectedModel = await db.getModelById(selectedModelId);
        if (selectedModel === null) {
          // 回退：如果指定模型不存在，尝试其他视觉模型
          const fallbackModel = await db.getModelById(useAdvancedModel ? 16 : 18);
          if (!fallbackModel) {
            // 批改失败，退还费用
            await db.refundFishCoins(ctx.user.id, totalCost, `作业批改失败退费（模型不可用）`);
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "视觉模型配置不存在，费用已退还" });
          }
          Object.assign(selectedModel || {}, fallbackModel);
        }
        console.log(`[Homework Correction] Using model: ${selectedModel!.name} (ID: ${selectedModelId}), apiModel: ${selectedModel!.apiModel}`);
        
        // 预处理：将本地图片URL转换为base64 data URL
        const fs = (await import('fs')).default;
        const path = (await import('path')).default;
        const processedImageUrls: string[] = [];
        for (const imgUrl of input.imageUrls) {
          if (imgUrl.startsWith('/uploads/') || imgUrl.includes('/uploads/')) {
            try {
              const urlPath = imgUrl.split('/uploads/')[1];
              const localPath = path.join('/www/wwwroot/ai_platform/uploads', urlPath);
              const fileBuffer = fs.readFileSync(localPath);
              const ext = path.extname(localPath).toLowerCase();
              const mimeTypes: Record<string, string> = {
                '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp'
              };
              const mimeType = mimeTypes[ext] || 'image/jpeg';
              const base64 = fileBuffer.toString('base64');
              processedImageUrls.push(`data:${mimeType};base64,${base64}`);
              console.log(`[Homework Correction] Converted local image to base64: ${imgUrl} (${fileBuffer.length} bytes)`);
            } catch (e: any) {
              console.error(`[Homework Correction] Failed to read local image: ${imgUrl}`, e.message);
              processedImageUrls.push(imgUrl); // 回退使用原始URL
            }
          } else {
            processedImageUrls.push(imgUrl);
          }
        }
        
        const correctionResults: any[] = [];
        let totalQuestions = 0;
        let correctCount = 0;
        let wrongCount = 0;
        const wrongQuestionsList: any[] = [];
        
        for (let i = 0; i < processedImageUrls.length; i++) {
          const imageUrl = processedImageUrls[i];
          const originalImageUrl = input.imageUrls[i];
          
          try {
            // 调用AI批改
            const response = await invokeLLM({
              model: selectedModel!.apiModel || selectedModel!.name,
              messages: [
                {
                  role: "system",
                  content: `你是一位专业的作业批改老师。请仔细分析图片中的作业，并按以下JSON格式返回批改结果：
{
  "questions": [
    {
      "questionNumber": "题号（如：1、2.(1)、3.(2)等）",
      "questionContent": "题目内容（完整抄写题目）",
      "studentAnswer": "学生的手写答案（仔细辨认）",
      "correctAnswer": "正确答案",
      "isCorrect": true或false,
      "errorAnalysis": "错误原因分析（仅在isCorrect为false时填写）",
      "knowledgePoint": "知识点"
    }
  ],
  "summary": "总体评价"
}

【重要规则】：
1. 每个小题必须单独作为一个question对象。例如：第4题有(1)(2)(3)三个小题，必须分别列出为"4.(1)"、"4.(2)"、"4.(3)"三个独立的question
2. 填空题中每个空算一个独立的question
3. 计算题要仔细检查计算过程和最终结果
4. 仔细辨认学生的手写答案，不要猜测或遗漏
5. 判断对错时要严格准确，不确定的答案倾向于标记为正确
6. 必须识别图片中的所有题目，不要遗漏任何一题
7. 给出总体评价和鼓励性建议`
                },
                {
                  role: "user",
                  content: [
                    { type: "text", text: `请批改这张${input.subject}作业（第${i + 1}/${input.imageUrls.length}张）` },
                    { type: "image_url", image_url: { url: imageUrl } }
                  ]
                }
              ],
              apiEndpoint: selectedModel!.apiEndpoint,
              apiKey: selectedModel!.apiKey,
              response_format: { type: "json_object" }
            });
            
            const content = response.choices[0].message.content;
            if (!content || typeof content !== 'string') throw new Error("AI返回内容为空或格式错误");
            
            // 清理markdown代码块标记
            const cleanContent = content.replace(/^```json\n/, "").replace(/\n```$/, "").trim();
            const result = JSON.parse(cleanContent);
            correctionResults.push({
              imageUrl: originalImageUrl,
              imageIndex: i + 1,
              ...result
            });
            
            // 统计题目数量
            totalQuestions += result.questions.length;
            correctCount += result.questions.filter((q: any) => q.isCorrect).length;
            wrongCount += result.questions.filter((q: any) => !q.isCorrect).length;
            
            // 收集错题
            result.questions.forEach((q: any) => {
              if (!q.isCorrect) {
                wrongQuestionsList.push({
                  questionContent: q.questionContent,
                  studentAnswer: q.studentAnswer,
                  correctAnswer: q.correctAnswer,
                  errorAnalysis: q.errorAnalysis,
                  knowledgePoint: q.knowledgePoint,
                  questionImageUrl: originalImageUrl,
                });
              }
            });
          } catch (error) {
            console.error(`[Homework Correction] Failed to correct image ${i + 1}:`, error);
            correctionResults.push({
              imageUrl: originalImageUrl,
              imageIndex: i + 1,
              error: "批改失败",
              questions: [],
              summary: "图片识别或批改过程中出现错误"
            });
          }
        }
        
        // 检查是否所有图片都批改失败，如果是则退还费用
        const allFailed = correctionResults.every(r => r.error);
        if (allFailed) {
          console.log(`[Homework Correction] All images failed, refunding ${totalCost} fish coins to user ${ctx.user.id}`);
          await db.refundFishCoins(ctx.user.id, totalCost, `作业批改失败退费（${input.imageUrls.length}张图片均失败）`);
        }
        
        // 计算正确率
        const accuracy = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
        
        // 确定评分等级
        let scoreLevel: "excellent" | "good" | "pass" | "fail";
        if (accuracy >= 90) scoreLevel = "excellent";
        else if (accuracy >= 80) scoreLevel = "good";
        else if (accuracy >= 60) scoreLevel = "pass";
        else scoreLevel = "fail";
        
        // 生成批改总结
        const summary = `本次批改共${input.imageUrls.length}张作业，总计${totalQuestions}道题，正确${correctCount}题，错误${wrongCount}题，正确率${accuracy.toFixed(2)}%。${scoreLevel === "excellent" ? "优秀！" : scoreLevel === "good" ? "良好！" : scoreLevel === "pass" ? "及格，继续努力！" : "需要加强练习！"}`;
        
        // 生成标题：优先使用用户姓名，其次使用年级，最后使用默认标题
        let generatedTitle = input.title;
        if (!generatedTitle) {
          const subjectMap: Record<string, string> = {
            math: "数学",
            chinese: "语文",
            english: "英语",
            physics: "物理",
            chemistry: "化学",
            other: "其他"
          };
          const subjectName = subjectMap[input.subject] || input.subject;
          
          if (user.name && user.name !== 'app' && user.name !== 'user') {
            // 有有效姓名，显示“张三的数学作业”
            generatedTitle = `${user.name}的${subjectName}作业`;
          } else if (input.grade) {
            // 没有姓名但有年级，显示“X年级数学作业”
            generatedTitle = `${input.grade}年级${subjectName}作业`;
          } else {
            // 都没有，使用默认标题
            generatedTitle = `${subjectName}作业批改 - ${new Date().toLocaleDateString()}`;
          }
        }
        
        // 保存批改记录
        const correctionId = await db.createHomeworkCorrection({
          userId: ctx.user.id,
          title: generatedTitle,
          type: input.imageUrls.length > 1 ? "batch" : "single",
          subject: input.subject,
          grade: input.grade,
          totalQuestions,
          correctCount,
          wrongCount,
          accuracy: accuracy.toFixed(2),
          scoreLevel,
          imageUrls: JSON.stringify(input.imageUrls),
          correctionResult: JSON.stringify(correctionResults),
          summary,
          modelId: modelPackage.primaryModelId,
          fishCoinCost: totalCost.toFixed(2),
        });
        
        // 保存错题到错题本
        if (wrongQuestionsList.length > 0) {
          const wrongQuestionsData = wrongQuestionsList.map(q => ({
            userId: ctx.user.id,
            correctionId: correctionId as number,
            subject: input.subject,
            knowledgePoint: q.knowledgePoint,
            questionContent: q.questionContent,
            studentAnswer: q.studentAnswer,
            correctAnswer: q.correctAnswer,
            errorAnalysis: q.errorAnalysis,
            questionImageUrl: q.questionImageUrl,
            status: "pending" as const,
            retryCount: 0,
            isMastered: false,
          }));
          
          await db.createWrongQuestions(wrongQuestionsData);
        }
        
        // 异步生成思维导图和学习建议（不阻塞返回结果）
        const generateInsightsAsync = async () => {
          let mindMap: string | null = null;
          let studySuggestions: string | null = null;
          try {
            const knowledgePoints = new Set<string>();
            correctionResults.forEach((result: any) => {
              if (result.questions) {
                result.questions.forEach((q: any) => {
                  if (q.knowledgePoint) {
                    knowledgePoints.add(q.knowledgePoint);
                  }
                });
              }
            });
            
            // 生成思维导图（使用Mermaid格式）
            const mindMapPrompt = `根据以下作业批改结果，生成一个知识点关系的思维导图（Mermaid格式）：

科目：${input.subject}
总题数：${totalQuestions}
正确率：${accuracy.toFixed(2)}%
涉及的知识点：${Array.from(knowledgePoints).join('、')}
错题数：${wrongCount}

请生成一个清晰的Mermaid思维导图，展示：
1. 主题（科目）作为中心节点
2. 各个知识点作为子节点
3. 错题较多的知识点用特殊标记
4. 知识点之间的关系（如果有）

只返回Mermaid代码，不要包含其他文字说明。使用mindmap语法。`;
            
            const mindMapResponse = await invokeLLM({
            model: selectedModel!.apiModel || selectedModel!.name,
            messages: [
              { role: "system", content: "你是一位专业的教育专家，擅长将知识点整理成思维导图。" },
              { role: "user", content: mindMapPrompt }
            ],
            apiEndpoint: selectedModel!.apiEndpoint,
            apiKey: selectedModel!.apiKey,
          });
            
            const mindMapContent = mindMapResponse.choices[0].message.content;
            if (mindMapContent && typeof mindMapContent === 'string') {
              mindMap = mindMapContent.trim();
            }
            
            // 生成学习建议
            const suggestionsPrompt = `根据以下作业批改结果，生成个性化的学习建议：

科目：${input.subject}
总题数：${totalQuestions}
正确率：${accuracy.toFixed(2)}%
正确题数：${correctCount}
错误题数：${wrongCount}
涉及的知识点：${Array.from(knowledgePoints).join('、')}

错题详情：
${wrongQuestionsList.map((q, idx) => `${idx + 1}. 知识点：${q.knowledgePoint}\n   错误原因：${q.errorAnalysis}`).join('\n\n')}

请生成：
1. 学习重点（需要加强的知识点）
2. 练习建议（针对性的练习方向）
3. 学习方法建议（如何提高该科目成绩）
4. 鼓励和激励的话语

请用Markdown格式返回，使用标题、列表等格式使内容清晰易读。`;
            
            const suggestionsResponse = await invokeLLM({
            model: selectedModel!.apiModel || selectedModel!.name,
            messages: [
              { role: "system", content: "你是一位经验丰富的教育顾问，擅长根据学生的学习情况提供个性化建议。" },
              { role: "user", content: suggestionsPrompt }
            ],
            apiEndpoint: selectedModel!.apiEndpoint,
            apiKey: selectedModel!.apiKey,
          });
            
            const suggestionsContent = suggestionsResponse.choices[0].message.content;
            if (suggestionsContent && typeof suggestionsContent === 'string') {
              studySuggestions = suggestionsContent.trim();
            }
            
            // 更新数据库记录
            if (mindMap || studySuggestions) {
              await db.updateHomeworkCorrectionInsights(correctionId as number, {
                mindMap,
                studySuggestions
              });
            }
          } catch (error) {
            console.error('[Homework Correction] Failed to generate insights:', error);
          }
        };
        
        // 后台异步执行，不等待结果
        generateInsightsAsync().catch(err => {
          console.error('[Homework Correction] Async insights generation failed:', err);
        });
        
        return {
          correctionId,
          totalQuestions,
          correctCount,
          wrongCount,
          accuracy: parseFloat(accuracy.toFixed(2)),
          scoreLevel,
          summary,
          correctionResults,
          wrongQuestionsCount: wrongQuestionsList.length,
        };
      }),
    
    // 获取批改记录列表
    getList: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(100).default(50),
      }))
      .query(async ({ ctx, input }) => {
        const corrections = await db.getUserHomeworkCorrections(ctx.user.id, input.limit);
        return corrections.map(c => ({
          ...c,
          imageUrls: JSON.parse(c.imageUrls),
          correctionResults: JSON.parse(c.correctionResult)
        }));
      }),
    
    // 获取单个批改记录详情
    getDetail: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const correction = await db.getHomeworkCorrectionById(input.id);
        if (!correction || correction.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "批改记录不存在" });
        }
        
        return {
          ...correction,
          imageUrls: JSON.parse(correction.imageUrls),
          correctionResults: JSON.parse(correction.correctionResult),
        };
      }),
    
    // 删除批改记录
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteHomeworkCorrection(input.id, ctx.user.id);
        return { success: true };
      }),
    
    // 生成PDF（后端）
    generatePDF: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { generatePDFFromHTML } = await import('./pdfService');
        
        // 获取批改记录
        const correction = await db.getHomeworkCorrectionById(input.id);
        if (!correction || correction.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "批改记录不存在" });
        }
        
        // 解析数据
        const correctionResult = JSON.parse(correction.correctionResult);
        // 合并所有图片的题目（correctionResult是数组，每个元素对应一张图片）
        const allQuestions: any[] = [];
        correctionResult.forEach((result: any) => {
          if (result.questions && Array.isArray(result.questions)) {
            allQuestions.push(...result.questions);
          }
        });
        
        // 科目映射
        const subjectMap: Record<string, string> = {
          math: '数学',
          chinese: '语文',
          english: '英语',
          physics: '物理',
          chemistry: '化学',
          biology: '生物',
          history: '历史',
          geography: '地理',
          politics: '政治',
          other: '其他',
        };
        
        // 获取用户的PDF设置
        const userPdfSettings = await db.getUserPdfSettings(ctx.user.id);
        
        // 生成PDF（优先使用Puppeteer，失败则降级到PDFKit）
        let pdfBuffer: Buffer;
        try {
          const { generatePDFWithPuppeteer } = await import('./pdfService');
          pdfBuffer = await generatePDFWithPuppeteer({
          title: correction.title,
          date: new Date(correction.createdAt).toLocaleString('zh-CN'),
          subject: subjectMap[correction.subject] || correction.subject,
          studentName: userPdfSettings?.showStudentName ? (ctx.user.name || undefined) : undefined,
          stats: {
            accuracy: correction.accuracy,
            correctCount: `${correction.correctCount}/${correction.totalQuestions}`,
            totalScore: `100分`,
          },
          questions: allQuestions.map((q: any, idx: number) => ({
            index: idx + 1,
            content: q.questionContent || q.content || '题目内容',
            studentAnswer: q.studentAnswer || q.answer || '',
            correctAnswer: q.correctAnswer || '',
            isCorrect: q.isCorrect || false,
            analysis: q.errorAnalysis || q.analysis || '',
          })),
          studyAdvice: correction.studySuggestions || '',
          mindMap: correction.mindMap || '',
          watermarkConfig: {
            enabled: true,
            watermarkText: userPdfSettings?.watermarkText || '仅供学习使用',
          },
          headerFooterConfig: {
            showHeader: !!userPdfSettings?.headerContent,
            showFooter: !!userPdfSettings?.footerContent,
            showPageNumber: userPdfSettings?.showPageNumber ?? true,
            headerText: userPdfSettings?.headerContent || undefined,
            footerText: userPdfSettings?.footerContent || undefined,
          },
          errorsOnly: false,
          });
          console.log('[PDF Generation] Successfully generated PDF with Puppeteer');
        } catch (puppeteerError) {
          console.error('[PDF Generation] Puppeteer failed, falling back to PDFKit:', puppeteerError);
          
          // 降级到PDFKit
          const { generatePDFWithPDFKit } = await import('./pdfServiceLite');
          pdfBuffer = await generatePDFWithPDFKit({
            title: correction.title,
            subject: subjectMap[correction.subject] || correction.subject,
            date: new Date(correction.createdAt).toISOString(),
            totalQuestions: correction.totalQuestions,
            correctCount: correction.correctCount,
            score: correction.totalQuestions > 0 ? (correction.correctCount / correction.totalQuestions) * 100 : 0,
            questions: allQuestions.map((q: any, idx: number) => ({
              questionNumber: idx + 1,
              question: q.questionContent || q.question || q.content || '题目内容',
              studentAnswer: q.studentAnswer || q.answer || '未作答',
              correctAnswer: q.correctAnswer || '无标准答案',
              isCorrect: q.isCorrect === true,
              analysis: q.errorAnalysis || q.analysis || (q.isCorrect ? '' : '请查看正确答案'),
            })),
            errorsOnly: false,
            studyAdvice: correction.studySuggestions || undefined,
            mindMap: correction.mindMap || undefined,
            watermarkText: userPdfSettings?.watermarkText || '仅供学习使用',
            studentName: userPdfSettings?.showStudentName ? (ctx.user.name || undefined) : undefined,
          });
          console.log('[PDF Generation] Successfully generated PDF with PDFKit (fallback)');
        }
        
        // 将PDF上传到S3
        const { storagePut } = await import('./storage');
        const fileName = `homework-${correction.id}-${Date.now()}.pdf`;
        const { url } = await storagePut(
          `pdfs/${ctx.user.id}/${fileName}`,
          pdfBuffer,
          'application/pdf'
        );
        
        return { url };
      }),
    
    // 导出错题本PDF
    generateErrorsPDF: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // 获取批改记录
        const correction = await db.getHomeworkCorrectionById(input.id);
        if (!correction || correction.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "批改记录不存在" });
        }
        
        // 解析数据
        const correctionResult = JSON.parse(correction.correctionResult);
        const allQuestions: any[] = [];
        correctionResult.forEach((result: any) => {
          if (result.questions && Array.isArray(result.questions)) {
            allQuestions.push(...result.questions);
          }
        });
        
        // 只保留错题
        const errorQuestions = allQuestions.filter((q: any) => !q.isCorrect);
        
        if (errorQuestions.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "没有错题可导出" });
        }
        
        // 科目映射
        const subjectMap: Record<string, string> = {
          math: '数学',
          chinese: '语文',
          english: '英语',
          physics: '物理',
          chemistry: '化学',
          biology: '生物',
          history: '历史',
          geography: '地理',
          politics: '政治',
          other: '其他',
        };
        
        // 获取用户的PDF设置
        const userPdfSettings = await db.getUserPdfSettings(ctx.user.id);
        
        // 生成PDF（优先使用Puppeteer，失败则降级到PDFKit）
        let pdfBuffer: Buffer;
        try {
          const { generatePDFWithPuppeteer } = await import('./pdfService');
          pdfBuffer = await generatePDFWithPuppeteer({
            title: `${correction.title} - 错题本`,
            date: new Date(correction.createdAt).toLocaleString('zh-CN'),
            subject: subjectMap[correction.subject] || correction.subject,
            studentName: userPdfSettings?.showStudentName ? (ctx.user.name || undefined) : undefined,
            stats: {
              accuracy: correction.accuracy,
              correctCount: `${errorQuestions.length}`,
              totalScore: `错题数`,
            },
            questions: errorQuestions.map((q: any, idx: number) => ({
              index: idx + 1,
              content: q.questionContent || q.content || '题目内容',
              studentAnswer: q.studentAnswer || q.answer || '',
              correctAnswer: q.correctAnswer || '',
              isCorrect: false,
              analysis: q.errorAnalysis || q.analysis || '',
            })),
            studyAdvice: correction.studySuggestions || '',
            mindMap: '', // 错题本不包含思维导图
            watermarkConfig: {
              enabled: true,
              watermarkText: userPdfSettings?.watermarkText || '仅供学习使用',
            },
            headerFooterConfig: {
              showHeader: !!userPdfSettings?.headerContent,
              showFooter: !!userPdfSettings?.footerContent,
              showPageNumber: userPdfSettings?.showPageNumber ?? true,
              headerText: userPdfSettings?.headerContent || undefined,
              footerText: userPdfSettings?.footerContent || undefined,
            },
            errorsOnly: true,
          });
          console.log('[PDF Generation] Successfully generated errors PDF with Puppeteer');
        } catch (puppeteerError) {
          console.error('[PDF Generation] Puppeteer failed, falling back to PDFKit:', puppeteerError);
          
          // 降级到PDFKit
          const { generatePDFWithPDFKit } = await import('./pdfServiceLite');
          pdfBuffer = await generatePDFWithPDFKit({
            title: `${correction.title} - 错题本`,
            subject: subjectMap[correction.subject] || correction.subject,
            date: new Date(correction.createdAt).toISOString(),
            totalQuestions: errorQuestions.length,
            correctCount: 0,
            score: 0,
            questions: errorQuestions.map((q: any, idx: number) => ({
              questionNumber: idx + 1,
              question: q.questionContent || q.question || q.content || '题目内容',
              studentAnswer: q.studentAnswer || q.answer || '未作答',
              correctAnswer: q.correctAnswer || '无标准答案',
              isCorrect: false,
              analysis: q.errorAnalysis || q.analysis || '请查看正确答案',
            })),
            errorsOnly: true,
            studyAdvice: correction.studySuggestions || undefined,
            mindMap: undefined,
            watermarkText: userPdfSettings?.watermarkText || '仅供学习使用',
            studentName: userPdfSettings?.showStudentName ? (ctx.user.name || undefined) : undefined,
          });
          console.log('[PDF Generation] Successfully generated errors PDF with PDFKit (fallback)');
        }
        
        // 将PDF上传到S3
        const { storagePut } = await import('./storage');
        const fileName = `homework-errors-${correction.id}-${Date.now()}.pdf`;
        const { url } = await storagePut(
          `pdfs/${ctx.user.id}/${fileName}`,
          pdfBuffer,
          'application/pdf'
        );
        
        return { url };
      }),
    
    // 导出思维导图PDF
    generateMindMapPDF: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // 获取批改记录
        const correction = await db.getHomeworkCorrectionById(input.id);
        if (!correction || correction.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "批改记录不存在" });
        }
        
        if (!correction.mindMap) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "没有思维导图可导出" });
        }
        
        // 科目映射
        const subjectMap: Record<string, string> = {
          math: '数学',
          chinese: '语文',
          english: '英语',
          physics: '物理',
          chemistry: '化学',
          biology: '生物',
          history: '历史',
          geography: '地理',
          politics: '政治',
          other: '其他',
        };
        
        // 获取用户的PDF设置
        const userPdfSettings = await db.getUserPdfSettings(ctx.user.id);
        
        // 生成PDF（优先使用Puppeteer，失败则降级到PDFKit）
        let pdfBuffer: Buffer;
        try {
          const { generatePDFWithPuppeteer } = await import('./pdfService');
          pdfBuffer = await generatePDFWithPuppeteer({
            title: `${correction.title} - 思维导图`,
            date: new Date(correction.createdAt).toLocaleString('zh-CN'),
            subject: subjectMap[correction.subject] || correction.subject,
            studentName: userPdfSettings?.showStudentName ? (ctx.user.name || undefined) : undefined,
            stats: {
              accuracy: correction.accuracy,
              correctCount: `${correction.correctCount}/${correction.totalQuestions}`,
              totalScore: `100分`,
            },
            questions: [], // 思维导图不包含题目
            studyAdvice: '', // 思维导图不包含学习建议
            mindMap: correction.mindMap,
            watermarkConfig: {
              enabled: true,
              watermarkText: userPdfSettings?.watermarkText || '仅供学习使用',
            },
            headerFooterConfig: {
              showHeader: !!userPdfSettings?.headerContent,
              showFooter: !!userPdfSettings?.footerContent,
              showPageNumber: userPdfSettings?.showPageNumber ?? true,
              headerText: userPdfSettings?.headerContent || undefined,
              footerText: userPdfSettings?.footerContent || undefined,
            },
            errorsOnly: false,
          });
          console.log('[PDF Generation] Successfully generated mindmap PDF with Puppeteer');
        } catch (puppeteerError) {
          console.error('[PDF Generation] Puppeteer failed, falling back to PDFKit:', puppeteerError);
          
          // 降级到PDFKit
          const { generatePDFWithPDFKit } = await import('./pdfServiceLite');
          pdfBuffer = await generatePDFWithPDFKit({
            title: `${correction.title} - 思维导图`,
            subject: subjectMap[correction.subject] || correction.subject,
            date: new Date(correction.createdAt).toISOString(),
            totalQuestions: 0,
            correctCount: 0,
            score: 0,
            questions: [],
            errorsOnly: false,
            studyAdvice: undefined,
            mindMap: correction.mindMap,
            watermarkText: userPdfSettings?.watermarkText || '仅供学习使用',
            studentName: userPdfSettings?.showStudentName ? (ctx.user.name || undefined) : undefined,
          });
          console.log('[PDF Generation] Successfully generated mindmap PDF with PDFKit (fallback)');
        }
        
        // 将PDF上传到S3
        const { storagePut } = await import('./storage');
        const fileName = `homework-mindmap-${correction.id}-${Date.now()}.pdf`;
        const { url } = await storagePut(
          `pdfs/${ctx.user.id}/${fileName}`,
          pdfBuffer,
          'application/pdf'
        );
        
        return { url };
      }),
    
    // 获取所有费用配置（管理员）
    getPricingConfigs: protectedProcedure
      .query(async ({ ctx }) => {
        // 检查是否为管理员
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: "FORBIDDEN", message: "无权访问" });
        }
        
        return await db.getAllHomeworkPricingConfigs();
      }),
    
    // 更新费用配置（管理员）
    updatePricingConfig: protectedProcedure
      .input(z.object({
        gradeCategory: z.string(),
        pricePerCorrection: z.number().min(0).optional(),
        useAdvancedModel: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 检查是否为管理员
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: "FORBIDDEN", message: "无权访问" });
        }
        
        const { gradeCategory, ...data } = input;
        await db.updateHomeworkPricingConfig(gradeCategory, data);
        
        return { success: true };
      }),
  }),

  // 错题本系统
  wrongQuestion: router({
    // 获取错题列表
    getList: protectedProcedure
      .input(z.object({
        subject: z.enum(["math", "chinese", "english", "physics", "chemistry", "other"]).optional(),
        status: z.enum(["pending", "done", "mastered"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }))
      .query(async ({ ctx, input }) => {
        return await db.getUserWrongQuestions(ctx.user.id, input);
      }),
    
    // 获取错题统计
    getStats: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getWrongQuestionStats(ctx.user.id);
      }),
    
    // 更新错题状态
    updateStatus: protectedProcedure
      .input(z.object({
        id: z.number(),
        status: z.enum(["pending", "done", "mastered"]),
        incrementRetry: z.boolean().default(false),
      }))
      .mutation(async ({ ctx, input }) => {
        const question = await db.getWrongQuestionById(input.id);
        if (!question || question.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "错题不存在" });
        }
        
        await db.updateWrongQuestionStatus(input.id, input.status, input.incrementRetry);
        return { success: true };
      }),
    
    // 删除错题
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteWrongQuestion(input.id, ctx.user.id);
        return { success: true };
      }),
    
    // 获取批改记录的错题列表
    getByCorrectionId: protectedProcedure
      .input(z.object({ correctionId: z.number() }))
      .query(async ({ ctx, input }) => {
        return await db.getWrongQuestionsByCorrectionId(input.correctionId);
      }),
    
    // 导出PDF错题本
    exportPDF: protectedProcedure
      .input(z.object({
        subject: z.enum(["math", "chinese", "english", "physics", "chemistry", "other"]).optional(),
        status: z.enum(["pending", "done", "mastered"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 获取错题列表
        const questions = await db.getUserWrongQuestions(ctx.user.id, {
          subject: input.subject,
          status: input.status,
          limit: 1000,
          offset: 0,
        });
        
        if (questions.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "没有符合条件的错题" });
        }
        
        // 映射数据库字段到PDF生成器格式
        const mappedQuestions = questions.map(q => ({
          id: q.id,
          subject: q.subject,
          questionContent: q.questionContent,
          correctAnswer: q.correctAnswer,
          studentAnswer: q.studentAnswer,
          errorAnalysis: q.errorAnalysis,
          knowledgePoint: q.knowledgePoint,
          status: q.status,
          retryCount: q.retryCount,
          createdAt: q.createdAt,
        }));
        
        // 生成PDF
        const { generateWrongQuestionPDF } = await import("./_core/pdfGenerator");
        const pdfBuffer = await generateWrongQuestionPDF(mappedQuestions as any, ctx.user.name || "用户");
        
        // 上传到S3
        const timestamp = Date.now();
        const filename = `wrong-questions-${timestamp}.pdf`;
        const { url } = await storagePut(
          `users/${ctx.user.id}/pdfs/${filename}`,
          pdfBuffer,
          "application/pdf"
        );
        
        return { url, filename };
      }),
  }),
  
  // S3存储统计
  storage: router({
    // 获取总存储统计
    getTotal: protectedProcedure
      .query(async () => {
        return await db.getTotalStorageStats();
      }),
    
    // 获取历史统计（最近N天）
    getHistory: protectedProcedure
      .input(z.object({
        days: z.number().min(1).max(90).default(30),
      }))
      .mutation(async ({ input }) => {
        return await db.getStorageStats(input.days);
      }),
    
    // 获取今日统计
    getToday: protectedProcedure
      .query(async () => {
        return await db.getTodayStorageStat();
      }),
  }),
  
  // 批改报告分享
  correctionShare: router({
    // 创建分享链接
    create: protectedProcedure
      .input(z.object({
        correctionId: z.number(),
        shareTitle: z.string().optional(),
        expiresAt: z.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 验证批改记录存在且属于当前用户
        const correction = await db.getHomeworkCorrectionById(input.correctionId);
        if (!correction || correction.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "批改记录不存在" });
        }
        
        // 生成随机分享令牌
        const shareToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        
        await db.createCorrectionShare({
          correctionId: input.correctionId,
          userId: ctx.user.id,
          shareToken,
          shareTitle: input.shareTitle,
          expiresAt: input.expiresAt,
        });
        
        return { shareToken };
      }),
    
    // 获取用户的所有分享链接
    getList: protectedProcedure
      .query(async ({ ctx }) => {
        return await db.getUserCorrectionShares(ctx.user.id);
      }),
    
    // 删除分享链接
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteCorrectionShare(input.id, ctx.user.id);
        return { success: true };
      }),
    
    // 切换分享链接状态
    toggle: protectedProcedure
      .input(z.object({
        id: z.number(),
        enabled: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        await db.toggleCorrectionShare(input.id, ctx.user.id, input.enabled);
        return { success: true };
      }),
    
    // 获取分享详情（公开接口）
    getByToken: publicProcedure
      .input(z.object({ shareToken: z.string() }))
      .mutation(async ({ input }) => {
        const share = await db.getCorrectionShareByToken(input.shareToken);
        if (!share || !share.enabled) {
          throw new TRPCError({ code: "NOT_FOUND", message: "分享链接不存在或已禁用" });
        }
        
        // 检查是否过期
        if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
          throw new TRPCError({ code: "FORBIDDEN", message: "分享链接已过期" });
        }
        
        // 增加访问次数
        await db.incrementCorrectionShareViewCount(input.shareToken);
        
        // 获取批改记录
        const correction = await db.getHomeworkCorrectionById(share.correctionId);
        if (!correction) {
          throw new TRPCError({ code: "NOT_FOUND", message: "批改记录不存在" });
        }
        
        return {
          share,
          correction: {
            ...correction,
            imageUrls: JSON.parse(correction.imageUrls),
            correctionResult: JSON.parse(correction.correctionResult),
          },
        };
      }),
  }),
  
  // 图片生成费用配置
  imageGenerationPricing: router({
    // 获取配置（管理员）
    getConfig: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
      }
      
      const config = await db.getImageGenerationPricing();
      if (!config) {
        throw new TRPCError({ code: "NOT_FOUND", message: "配置不存在" });
      }
      
      return config;
    }),
    
    // 更新配置（管理员）
    updateConfig: protectedProcedure
      .input(z.object({
        pricePerImage: z.number().min(0).optional(),
        displayName: z.string().optional(),
        description: z.string().optional(),
        enabled: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
        }
        
        await db.updateImageGenerationPricing(input);
        return { success: true };
      }),
  }),
  
  // PDF水印配置
  pdfWatermarkConfig: router({
    // 获取配置（管理员）
    getConfig: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
      }
      
      const config = await db.getPdfWatermarkConfig();
      if (!config) {
        throw new TRPCError({ code: "NOT_FOUND", message: "配置不存在" });
      }
      
      return config;
    }),
    
    // 更新配置（管理员）
    updateConfig: protectedProcedure
      .input(z.object({
        watermarkText: z.string().optional(),
        opacity: z.number().min(0).max(1).optional(),
        rotation: z.number().min(-180).max(180).optional(),
        fontSize: z.number().min(10).max(200).optional(),
        color: z.string().optional(),
        enabled: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
        }
        
        await db.updatePdfWatermarkConfig(input);
        return { success: true };
      }),
    
    // 获取配置（公开接口，用于PDF生成）
    getPublicConfig: publicProcedure.query(async () => {
      const config = await db.getPdfWatermarkConfig();
      return config;
    }),
  }),
  
  // 用户PDF导出设置
  userPdfSettings: router({
    // 获取用户PDF设置
    getSettings: protectedProcedure.query(async ({ ctx }) => {
      const settings = await db.getUserPdfSettings(ctx.user.id);
      
      // 如果用户没有设置，返回默认值
      if (!settings) {
        return {
          watermarkText: null, // null表示使用默认值
          watermarkEnabled: true,
          showStudentName: true,
          headerContent: null,
          footerContent: null,
          showPageNumber: true,
        };
      }
      
      return settings;
    }),
    
    // 更新用户PDF设置
    updateSettings: protectedProcedure
      .input(z.object({
        watermarkText: z.string().nullable().optional(),
        watermarkEnabled: z.boolean().optional(),
        showStudentName: z.boolean().optional(),
        headerContent: z.string().nullable().optional(),
        footerContent: z.string().nullable().optional(),
        showPageNumber: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const settings = await db.upsertUserPdfSettings(ctx.user.id, input);
        return settings;
      }),
  }),
  
  // Stripe支付
  // 支付配置管理（管理员）
  paymentConfig: router({
    // 获取所有支付配置
    getAll: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') {
        throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
      }
      
      return await db.getAllPaymentConfigs();
    }),
    
    // 根据支付方式获取配置
    getByProvider: protectedProcedure
      .input(z.object({
        provider: z.enum(['stripe', 'alipay', 'wechat']),
      }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
        }
        
        return await db.getPaymentConfigByProvider(input.provider);
      }),
    
    // 创建或更新支付配置
    upsert: protectedProcedure
      .input(z.object({
        provider: z.enum(['stripe', 'alipay', 'wechat']),
        enabled: z.boolean(),
        config: z.object({
          // Stripe配置
          stripePublicKey: z.string().optional(),
          stripeSecretKey: z.string().optional(),
          stripeWebhookSecret: z.string().optional(),
          // 支付宝配置
          alipayAppId: z.string().optional(),
          alipayPrivateKey: z.string().optional(),
          alipayPublicKey: z.string().optional(),
          alipayNotifyUrl: z.string().optional(),
          alipayReturnUrl: z.string().optional(),
          // 微信配置
          wechatAppId: z.string().optional(),
          wechatMchId: z.string().optional(),
          wechatApiKey: z.string().optional(),
          wechatNotifyUrl: z.string().optional(),
        }),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
        }
        
        // 将config对象转换为JSON字符串
        const configJson = JSON.stringify(input.config);
        
        return await db.upsertPaymentConfig(input.provider, {
          enabled: input.enabled,
          config: configJson,
          notes: input.notes,
        });
      }),
    
    // 删除支付配置
    delete: protectedProcedure
      .input(z.object({
        provider: z.enum(['stripe', 'alipay', 'wechat']),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
        }
        
        await db.deletePaymentConfig(input.provider);
        return { success: true };
      }),
    
    // 获取启用的支付方式
    getEnabled: publicProcedure.query(async () => {
      return await db.getEnabledPaymentProviders();
    }),
    
    // 测试支付配置连接
    testConnection: protectedProcedure
      .input(z.object({
        provider: z.enum(['stripe', 'alipay', 'wechat']),
        config: z.object({
          // Stripe配置
          stripePublicKey: z.string().optional(),
          stripeSecretKey: z.string().optional(),
          stripeWebhookSecret: z.string().optional(),
          // 支付宝配置
          alipayAppId: z.string().optional(),
          alipayPrivateKey: z.string().optional(),
          alipayPublicKey: z.string().optional(),
          alipayNotifyUrl: z.string().optional(),
          alipayReturnUrl: z.string().optional(),
          // 微信配置
          wechatAppId: z.string().optional(),
          wechatMchId: z.string().optional(),
          wechatApiKey: z.string().optional(),
          wechatNotifyUrl: z.string().optional(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== 'admin') {
          throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
        }
        
        try {
          if (input.provider === 'stripe') {
            // 测试Stripe连接
            const secretKey = input.config.stripeSecretKey;
            if (!secretKey) {
              throw new Error('Stripe Secret Key未配置');
            }
            
            // 动态导入stripe
            const Stripe = (await import('stripe')).default;
            const stripe = new Stripe(secretKey, {
              apiVersion: '2026-01-28.clover',
            });
            
            // 尝试获取账户信息来验证密钥
            const account = await stripe.balance.retrieve();
            
            return {
              success: true,
              message: `Stripe连接成功！账户余额：${account.available[0]?.amount || 0} ${account.available[0]?.currency || 'USD'}`,
              details: {
                currency: account.available[0]?.currency,
                balance: account.available[0]?.amount,
              },
            };
          } else if (input.provider === 'alipay') {
            // 支付宝测试连接
            const { alipayAppId, alipayPrivateKey, alipayPublicKey } = input.config;
            
            if (!alipayAppId || !alipayPrivateKey || !alipayPublicKey) {
              throw new Error('支付宝配置不完整，请填写App ID、应用私钥和支付宝公钥');
            }
            
            // 基本验证：检查密钥格式
            if (!alipayPrivateKey.includes('BEGIN') || !alipayPrivateKey.includes('PRIVATE KEY')) {
              throw new Error('应用私钥格式不正确，应包含BEGIN和PRIVATE KEY标记');
            }
            
            if (!alipayPublicKey.includes('BEGIN') || !alipayPublicKey.includes('PUBLIC KEY')) {
              throw new Error('支付宝公钥格式不正确，应包含BEGIN和PUBLIC KEY标记');
            }
            
            return {
              success: true,
              message: '支付宝配置格式验证通过！App ID和密钥格式正确。',
              details: {
                appId: alipayAppId,
                note: '实际支付功能需要在生产环境中测试',
              },
            };
          } else if (input.provider === 'wechat') {
            // 微信支付测试连接
            const { wechatAppId, wechatMchId, wechatApiKey } = input.config;
            
            if (!wechatAppId || !wechatMchId || !wechatApiKey) {
              throw new Error('微信支付配置不完整，请填写App ID、商户号和API密钥');
            }
            
            // 基本验证：检查格式
            if (!wechatAppId.startsWith('wx')) {
              throw new Error('App ID格式不正确，应以wx开头');
            }
            
            if (wechatApiKey.length !== 32) {
              throw new Error('API密钥长度不正确，应为32位');
            }
            
            return {
              success: true,
              message: '微信支付配置格式验证通过！App ID、商户号和API密钥格式正确。',
              details: {
                appId: wechatAppId,
                mchId: wechatMchId,
                note: '实际支付功能需要在生产环境中测试',
              },
            };
          }
          
          throw new Error('不支持的支付方式');
        } catch (error: any) {
          return {
            success: false,
            message: `连接测试失败：${error.message}`,
            details: {
              error: error.message,
              code: error.code,
            },
          };
        }
      }),
  }),
  
  payment: router({
    // 创建支付会话
    createCheckoutSession: protectedProcedure
      .input(z.object({
        productId: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          const response = await axios.post(
            `${ctx.req.protocol}://${ctx.req.get('host')}/api/stripe/create-checkout-session`,
            {
              productId: input.productId,
              userId: ctx.user.id,
              userEmail: ctx.user.email,
              userName: ctx.user.name,
            }
          );
          return response.data;
        } catch (error: any) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.response?.data?.error || '创建支付会话失败',
          });
        }
      }),
    
    // 获取用户订单列表
    getOrders: protectedProcedure
      .input(z.object({
        limit: z.number().optional().default(20),
      }))
      .query(async ({ ctx, input }) => {
        const { getUserOrders } = await import('./stripe-db');
        return await getUserOrders(ctx.user.id, input.limit);
      }),
    
    // 获取用户订阅列表
    getSubscriptions: protectedProcedure.query(async ({ ctx }) => {
      const { getUserSubscriptions } = await import('./stripe-db');
      return await getUserSubscriptions(ctx.user.id);
    }),
    
    // 获取用户活跃订阅
    getActiveSubscription: protectedProcedure.query(async ({ ctx }) => {
      const { getUserActiveSubscription } = await import('./stripe-db');
      return await getUserActiveSubscription(ctx.user.id);
    }),
  }),
});

export type AppRouter = typeof appRouter;
