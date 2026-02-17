import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean, bigint, date } from "drizzle-orm/mysql-core";

/**
 * 用户表 - 扩展支持🐟币积分系统
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // 🐟币余额，使用decimal保证精度
  fishCoinBalance: decimal("fishCoinBalance", { precision: 10, scale: 2 }).default("100.00").notNull(),
  // 用户等级: free(免费), vip(VIP), premium(高级VIP)
  userTier: mysqlEnum("userTier", ["free", "vip", "premium"]).default("free").notNull(),
  // VIP到期时间（仅对vip和premium有效）
  vipExpiresAt: timestamp("vipExpiresAt"),
  // 每日对话配额（免费:10, VIP:50, 高级VIP:200）
  dailyChatQuota: int("dailyChatQuota").default(10).notNull(),
  // 每日图片生成配额（免费:5, VIP:20, 高级VIP:100）
  dailyImageQuota: int("dailyImageQuota").default(5).notNull(),
  // 每日文档处理配额（免费:3, VIP:15, 高级VIP:50）
  dailyDocumentQuota: int("dailyDocumentQuota").default(3).notNull(),
  // 今日已使用对话次数
  todayChatUsed: int("todayChatUsed").default(0).notNull(),
  // 今日已使用图片生成次数
  todayImageUsed: int("todayImageUsed").default(0).notNull(),
  // 今日已使用文档处理次数
  todayDocumentUsed: int("todayDocumentUsed").default(0).notNull(),
  // 配额重置日期（用于判断是否需要重置）
  quotaResetDate: timestamp("quotaResetDate").defaultNow().notNull(),
  // 用户偏好的模型ID
  preferredModelId: int("preferredModelId"),
  // 用户偏好的模型套餐ID
  preferredPackageId: int("preferredPackageId"),
  // 用户头像 URL
  avatarUrl: text("avatarUrl"),
  // 论坛信任等级 (0-5)
  forumTrustLevel: int("forumTrustLevel"),
  // 论坛积分
  forumPoints: int("forumPoints"),
  // Stripe客户ID（用于关联Stripe支付）
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/**
 * AI模型配置表
 */
export const aiModels = mysqlTable("aimodels", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  displayName: varchar("displayName", { length: 200 }).notNull(),
  description: text("description"),
  // 模型类型: chat(对话), image(图片生成), text(文本处理), transcription(语音转文字)
  type: mysqlEnum("type", ["chat", "image", "text", "transcription"]).notNull(),
  // 模型等级: lite(轻量级), pro(专业级), max(旗舰级)
  tier: mysqlEnum("tier", ["lite", "pro", "max"]).default("pro"),
  // 每次调用消耗的🐟币
  costPerUse: decimal("costPerUse", { precision: 10, scale: 2 }).notNull(),
  // 是否启用
  enabled: boolean("enabled").default(true).notNull(),
  // 是否在用户界面显示（false则隐藏具体模型名，只显示分类）
  visibleToUser: boolean("visibleToUser").default(false).notNull(),
  // 模型配置(JSON格式存储额外参数)
  config: text("config"),
  // 自定义API端点（如DeepSeek API）
  apiEndpoint: text("apiEndpoint"),
  // 自定义API密钥
  apiKey: text("apiKey"),
  // API模型标识符（例如gpt-4, qwen-max）
  apiModel: text("apiModel"),
  // 模型来源: builtin(内置), custom(自定义)
  source: mysqlEnum("source", ["builtin", "custom"]).default("custom"),
  // API状态: available(可用), unavailable(不可用), untested(未测试)
  apiStatus: mysqlEnum("apiStatus", ["available", "unavailable", "untested"]).default("untested"),
  // 最后测试时间
  lastTestedAt: timestamp("lastTestedAt"),
  // 平均响应时间（毫秒）
  avgResponseTime: int("avgResponseTime"),
  // 是否支持视觉识别（图片理解能力）
  supportsVision: boolean("supportsVision").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * 🐟币消费记录表
 */
export const fishCoinTransactions = mysqlTable("fishCoinTransactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // 交易类型: consume(消费), recharge(充值), admin_adjust(管理员调整)
  type: mysqlEnum("type", ["consume", "recharge", "admin_adjust"]).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  // 余额快照
  balanceAfter: decimal("balanceAfter", { precision: 10, scale: 2 }).notNull(),
  // 关联的AI模型ID(如果是消费)
  modelId: int("modelId"),
  // 描述信息
  description: text("description"),
  // 论坛积分同步状态
  forumSynced: boolean("forumSynced").default(false).notNull(),
  // 论坛积分同步参考编号（用于冲正）
  forumRef: varchar("forumRef", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * 文件上传记录表
 */
export const uploadedFiles = mysqlTable("uploadedFiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // 原始文件名
  originalName: varchar("originalName", { length: 500 }).notNull(),
  // S3存储的文件键
  fileKey: text("fileKey").notNull(),
  // S3文件URL
  fileUrl: text("fileUrl").notNull(),
  // 文件类型
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  // 文件大小(字节)
  fileSize: int("fileSize").notNull(),
  // 文件类型分类: pdf, word, audio, other
  category: mysqlEnum("category", ["pdf", "word", "audio", "other"]).notNull(),
  // 处理状态: pending(待处理), processing(处理中), completed(已完成), failed(失败)
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  // 处理结果(JSON格式存储提取的文本、转录结果等)
  processResult: text("processResult"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * 对话历史表
 */
export const chatConversations = mysqlTable("chatConversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 200 }).default("新对话").notNull(),
  // 使用的模型ID
  modelId: int("modelId").notNull(),
  // 使用的模型套餐ID（可选，用于套餐切换功能）
  packageId: int("packageId"),
  // 对话消息(JSON数组格式存储)
  messages: text("messages").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * 邀请码表
 */
export const invitationCodes = mysqlTable("invitationCodes", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  // 创建者ID(管理员或用户)
  createdBy: int("createdBy").notNull(),
  // 邀请类型: admin(管理员创建), user(用户邀请)
  type: mysqlEnum("type", ["admin", "user"]).default("admin").notNull(),
  // 是否已使用
  used: boolean("used").default(false).notNull(),
  // 使用者ID
  usedBy: int("usedBy"),
  // 邀请奖励金额(邀请人和被邀请人各获得的🐟币)
  rewardAmount: decimal("rewardAmount", { precision: 10, scale: 2 }).default("50.00").notNull(),
  // 首充额外奖励金额(被邀请人首次充值时，邀请人额外获得的🐟币)
  firstRechargeReward: decimal("firstRechargeReward", { precision: 10, scale: 2 }).default("100.00").notNull(),
  // 被邀请人是否已完成首次充值
  firstRechargeDone: boolean("firstRechargeDone").default(false).notNull(),
  // 首次充值完成时间
  firstRechargeAt: timestamp("firstRechargeAt"),
  // 过期时间
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  usedAt: timestamp("usedAt"),
});

/**
 * Webhook请求日志表
 */
export const webhookLogs = mysqlTable("webhookLogs", {
  id: int("id").autoincrement().primaryKey(),
  // 请求唯一标识
  ref: varchar("ref", { length: 64 }).notNull().unique(),
  // 邀请码
  invitationCode: varchar("invitationCode", { length: 32 }).notNull(),
  // 请求来源IP
  sourceIp: varchar("sourceIp", { length: 45 }),
  // 请求体
  requestBody: text("requestBody"),
  // 响应状态码
  responseStatus: int("responseStatus"),
  // 响应体
  responseBody: text("responseBody"),
  // 错误信息
  errorMessage: text("errorMessage"),
  // 处理时间(毫秒)
  processingTime: int("processingTime"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * 邀请奖励记录表
 */
export const inviteRewards = mysqlTable("inviteRewards", {
  id: int("id").autoincrement().primaryKey(),
  // 奖励唯一标识(与webhook请求关联)
  ref: varchar("ref", { length: 64 }).notNull(),
  // 邀请码ID
  invitationCodeId: int("invitationCodeId").notNull(),
  // 邀请码
  invitationCode: varchar("invitationCode", { length: 32 }).notNull(),
  // 邀请人ID
  inviterId: int("inviterId").notNull(),
  // 被邀请人ID
  inviteeId: int("inviteeId").notNull(),
  // 邀请人奖励金额
  inviterReward: decimal("inviterReward", { precision: 10, scale: 2 }).notNull(),
  // 被邀请人奖励金额
  inviteeReward: decimal("inviteeReward", { precision: 10, scale: 2 }).notNull(),
  // 奖励状态: pending(待处理), completed(已完成), failed(失败)
  status: mysqlEnum("status", ["pending", "completed", "failed"]).default("pending").notNull(),
  // 错误信息
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

/**
 * 系统配置表
 */
export const systemConfig = mysqlTable("systemConfig", {
  id: int("id").autoincrement().primaryKey(),
  // 配置键
  configKey: varchar("configKey", { length: 100 }).notNull().unique(),
  // 配置值
  configValue: text("configValue").notNull(),
  // 配置描述
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AiModel = typeof aiModels.$inferSelect;
export type InsertAiModel = typeof aiModels.$inferInsert;
export type FishCoinTransaction = typeof fishCoinTransactions.$inferSelect;
export type InsertFishCoinTransaction = typeof fishCoinTransactions.$inferInsert;
export type UploadedFile = typeof uploadedFiles.$inferSelect;
export type InsertUploadedFile = typeof uploadedFiles.$inferInsert;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatConversation = typeof chatConversations.$inferInsert;
export type InvitationCode = typeof invitationCodes.$inferSelect;
export type InsertInvitationCode = typeof invitationCodes.$inferInsert;
export type WebhookLog = typeof webhookLogs.$inferSelect;
export type InsertWebhookLog = typeof webhookLogs.$inferInsert;
export type InviteReward = typeof inviteRewards.$inferSelect;
export type InsertInviteReward = typeof inviteRewards.$inferInsert;
export type SystemConfig = typeof systemConfig.$inferSelect;
export type InsertSystemConfig = typeof systemConfig.$inferInsert;

/**
 * 用户反馈表
 */
export const feedbacks = mysqlTable("feedbacks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["bug", "feature", "improvement", "other"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  rating: int("rating"), // 1-5星评分
  status: mysqlEnum("status", ["pending", "in_progress", "resolved", "closed"]).default("pending").notNull(),
  adminResponse: text("adminResponse"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Feedback = typeof feedbacks.$inferSelect;
export type InsertFeedback = typeof feedbacks.$inferInsert;

/**
 * API密钥表 - 用于第三方API访问
 */
export const apiKeys = mysqlTable("apiKeys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(), // 密钥名称
  keyHash: varchar("keyHash", { length: 255 }).notNull().unique(), // 密钥哈希值
  keyPrefix: varchar("keyPrefix", { length: 20 }).notNull(), // 密钥前缀（用于显示）
  lastUsedAt: timestamp("lastUsedAt"),
  expiresAt: timestamp("expiresAt"), // 过期时间
  isActive: mysqlEnum("isActive", ["yes", "no"]).default("yes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

/**
 * 系统通知表 - 存储所有系统通知记录
 */
export const systemNotifications = mysqlTable("systemNotifications", {
  id: int("id").autoincrement().primaryKey(),
  // 通知类型: info(信息), warning(警告), error(错误), success(成功)
  type: mysqlEnum("type", ["info", "warning", "error", "success"]).default("info").notNull(),
  // 通知标题
  title: varchar("title", { length: 255 }).notNull(),
  // 通知内容
  content: text("content").notNull(),
  // 触发用户ID（如果是用户操作触发的通知）
  triggeredBy: int("triggeredBy"),
  // 相关数据（JSON格式存储额外信息）
  metadata: text("metadata"),
  // 是否已读
  isRead: boolean("isRead").default(false).notNull(),
  // 已读时间
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SystemNotification = typeof systemNotifications.$inferSelect;
export type InsertSystemNotification = typeof systemNotifications.$inferInsert;

/**
 * 模型对比记录表
 */
export const modelComparisons = mysqlTable("modelComparisons", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("userId").notNull(),
  // 用户输入的问题
  prompt: text("prompt").notNull(),
  // 对比的模型ID列表（JSON数组）
  modelIds: text("modelIds").notNull(),
  // 每个模型的回答结果（JSON对象）
  // 格式: { "modelId": { "response": "...", "responseTime": 1234, "cost": 0.5 } }
  results: text("results").notNull(),
  // 总消耗的🐟币
  totalCost: decimal("totalCost", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InsertModelComparison = typeof modelComparisons.$inferInsert;

/**
 * 模型使用统计表
 */
export const modelUsageStats = mysqlTable("modelUsageStats", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  modelId: int("modelId").notNull(),
  // 调用类型: chat(对话), image(图片生成), document(文档处理)
  usageType: mysqlEnum("usageType", ["chat", "image", "document"]).notNull(),
  // 消耗的鱼币
  costAmount: decimal("costAmount", { precision: 10, scale: 2 }).notNull(),
  // 响应时间(毫秒)
  responseTime: int("responseTime"),
  // 是否成功
  success: boolean("success").default(true).notNull(),
  // 错误信息(如果失败)
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ModelUsageStat = typeof modelUsageStats.$inferSelect;
export type InsertModelUsageStat = typeof modelUsageStats.$inferInsert;

/**
 * 模型套餐表 - 高中低档模型套餐配置
 */
export const modelPackages = mysqlTable("modelPackages", {
  id: int("id").autoincrement().primaryKey(),
  // 套餐名称: premium(高档), standard(中档), economy(低档)
  name: varchar("name", { length: 50 }).notNull().unique(),
  // 显示名称
  displayName: varchar("displayName", { length: 100 }).notNull(),
  // 套餐描述
  description: text("description"),
  // 主模型ID
  primaryModelId: int("primaryModelId").notNull(),
  // 备用模型ID列表(以逗号分隔)
  fallbackModelIds: text("fallbackModelIds").notNull(),
  // 每次使用消耗的🐟币
  fishCoinCost: decimal("fishCoinCost", { precision: 10, scale: 2 }).notNull(),
  // 是否启用
  enabled: boolean("enabled").default(true).notNull(),
  // 排序顺序(数字越小越靠前)
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ModelPackage = typeof modelPackages.$inferSelect;
export type InsertModelPackage = typeof modelPackages.$inferInsert;

/**
 * 论坛等级权益配置表
 */
export const forumLevelBenefits = mysqlTable("forumLevelBenefits", {
  id: int("id").autoincrement().primaryKey(),
  // 论坛信任等级 (0-9)
  trustLevel: int("trustLevel").notNull().unique(),
  // 等级名称
  levelName: varchar("levelName", { length: 50 }).notNull(),
  // AI对话折扣百分比 (0-100, 例如20表示20%折扣)
  chatDiscount: int("chatDiscount").default(0).notNull(),
  // 图片生成折扣百分比
  imageDiscount: int("imageDiscount").default(0).notNull(),
  // 文件处理折扣百分比
  documentDiscount: int("documentDiscount").default(0).notNull(),
  // 特殊权益描述 (JSON数组，例如 ["优先队列", "新模型优先体验"])
  specialBenefits: text("specialBenefits"),
  // 是否启用
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ForumLevelBenefit = typeof forumLevelBenefits.$inferSelect;
export type InsertForumLevelBenefit = typeof forumLevelBenefits.$inferInsert;

/**
 * 用户等级折扣配置表
 */
export const discountConfig = mysqlTable("discountConfig", {
  id: int("id").autoincrement().primaryKey(),
  // 用户等级: free(免费), vip(VIP), premium(高级VIP)
  userTier: mysqlEnum("userTier", ["free", "vip", "premium"]).notNull().unique(),
  // 等级显示名称
  tierDisplayName: varchar("tierDisplayName", { length: 50 }).notNull(),
  // AI对话折扣百分比 (0-100, 例如20表示打8折，即优惠20%)
  chatDiscount: int("chatDiscount").default(0).notNull(),
  // 图片生成折扣百分比
  imageDiscount: int("imageDiscount").default(0).notNull(),
  // 文件处理折扣百分比
  documentDiscount: int("documentDiscount").default(0).notNull(),
  // 是否启用该等级的折扣
  enabled: boolean("enabled").default(true).notNull(),
  // 折扣描述
  description: text("description"),
  // 定时折扣：生效时间（null表示立即生效）
  startTime: timestamp("startTime"),
  // 定时折扣：失效时间（null表示永久有效）
  endTime: timestamp("endTime"),
  // 统计：使用次数
  usageCount: int("usageCount").default(0).notNull(),
  // 统计：总节省金额（单位：🐟币）
  totalSaved: decimal("totalSaved", { precision: 10, scale: 2 }).default("0.00").notNull(),
  // 统计：受益用户数（去重）
  benefitedUsers: int("benefitedUsers").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DiscountConfig = typeof discountConfig.$inferSelect;
export type InsertDiscountConfig = typeof discountConfig.$inferInsert;

/**
 * 全局折扣设置表（单行配置）
 */
export const globalDiscountSettings = mysqlTable("globalDiscountSettings", {
  id: int("id").autoincrement().primaryKey(),
  // 是否全局启用折扣功能
  discountEnabled: boolean("discountEnabled").default(true).notNull(),
  // 折扣系统描述
  description: text("description"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GlobalDiscountSettings = typeof globalDiscountSettings.$inferSelect;
export type InsertGlobalDiscountSettings = typeof globalDiscountSettings.$inferInsert;

/**
 * 折扣叠加规则表
 */
export const discountStackRule = mysqlTable("discountStackRule", {
  id: int("id").autoincrement().primaryKey(),
  // 规则名称
  ruleName: varchar("ruleName", { length: 100 }).notNull(),
  // 是否启用
  enabled: boolean("enabled").default(true).notNull(),
  // 等级折扣权重（0-100，100表示全额参与）
  tierDiscountWeight: int("tierDiscountWeight").default(100).notNull(),
  // 活动折扣权重（0-100）
  activityDiscountWeight: int("activityDiscountWeight").default(100).notNull(),
  // 优惠券权重（0-100）
  couponWeight: int("couponWeight").default(100).notNull(),
  // 最大折扣百分比（防止过度优惠，0-100）
  maxDiscountPercent: int("maxDiscountPercent").default(50).notNull(),
  // 叠加策略：additive(相加), multiplicative(相乘), max(取最大值)
  stackStrategy: mysqlEnum("stackStrategy", ["additive", "multiplicative", "max"]).default("additive").notNull(),
  // 规则描述
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DiscountStackRule = typeof discountStackRule.$inferSelect;
export type InsertDiscountStackRule = typeof discountStackRule.$inferInsert;

/**
 * 折扣使用日志表（用于统计）
 */
export const discountUsageLog = mysqlTable("discountUsageLog", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // 用户等级
  userTier: mysqlEnum("userTier", ["free", "vip", "premium"]).notNull(),
  // 服务类型：chat(对话), image(图片), document(文档)
  serviceType: mysqlEnum("serviceType", ["chat", "image", "document"]).notNull(),
  // 原价（单位：🐟币）
  originalPrice: decimal("originalPrice", { precision: 10, scale: 2 }).notNull(),
  // 折扣百分比（0-100）
  discountPercent: int("discountPercent").notNull(),
  // 节省金额（单位：🐟币）
  savedAmount: decimal("savedAmount", { precision: 10, scale: 2 }).notNull(),
  // 实际支付（单位：🐟币）
  actualPrice: decimal("actualPrice", { precision: 10, scale: 2 }).notNull(),
  // 关联的消费记录ID
  transactionId: int("transactionId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DiscountUsageLog = typeof discountUsageLog.$inferSelect;
export type InsertDiscountUsageLog = typeof discountUsageLog.$inferInsert;

/**
 * 对话标签表
 */
export const conversationTags = mysqlTable("conversationTags", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  // 标签颜色（hex格式，如 #3b82f6）
  color: varchar("color", { length: 7 }).default("#3b82f6").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ConversationTag = typeof conversationTags.$inferSelect;
export type InsertConversationTag = typeof conversationTags.$inferInsert;

/**
 * 对话-标签关联表
 */
export const conversationTagRelations = mysqlTable("conversationTagRelations", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  tagId: int("tagId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ConversationTagRelation = typeof conversationTagRelations.$inferSelect;
export type InsertConversationTagRelation = typeof conversationTagRelations.$inferInsert;

/**
 * 生成图片历史记录表
 */
export const generatedImages = mysqlTable("generatedImages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // 图片URL
  imageUrl: text("imageUrl").notNull(),
  // 生成时使用的prompt
  prompt: text("prompt").notNull(),
  // 图片风格（如果指定）
  style: varchar("style", { length: 50 }),
  // 关联的对话ID（如果是在对话中生成的）
  conversationId: int("conversationId"),
  // 关联的消息ID（如果是在对话中生成的）
  messageIndex: int("messageIndex"),
  // 是否收藏
  isFavorite: boolean("isFavorite").default(false).notNull(),
  // 生成耗费的🐟币
  cost: decimal("cost", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GeneratedImage = typeof generatedImages.$inferSelect;
export type InsertGeneratedImage = typeof generatedImages.$inferInsert;

/**
 * 视频生成任务表
 */
export const videoGenerationTasks = mysqlTable("videoGenerationTasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // 生成时使用的prompt
  prompt: text("prompt").notNull(),
  // 视频时长（秒）
  duration: int("duration").default(5).notNull(),
  // 视频风格（如果指定）
  style: varchar("style", { length: 50 }),
  // 服务商（runway, luma, pika等）
  provider: varchar("provider", { length: 50 }),
  // Pollo AI任务ID（用于查询状态）
  polloTaskId: varchar("polloTaskId", { length: 100 }),
  // 任务状态：pending, processing, completed, failed
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  // 任务进度（0-100）
  progress: int("progress").default(0).notNull(),
  // 视频URL（生成完成后）
  videoUrl: text("videoUrl"),
  // 缩略图URL
  thumbnailUrl: text("thumbnailUrl"),
  // 错误信息（如果失败）
  errorMessage: text("errorMessage"),
  // 重试次数（最多3次）
  retryCount: int("retryCount").default(0).notNull(),
  // 关联的对话ID（如果是在对话中生成的）
  conversationId: int("conversationId"),
  // 关联的消息ID（如果是在对话中生成的）
  messageIndex: int("messageIndex"),
  // 生成耗费的🐟币
  cost: decimal("cost", { precision: 10, scale: 2 }).notNull(),
  // 是否收藏
  isFavorite: boolean("isFavorite").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VideoGenerationTask = typeof videoGenerationTasks.$inferSelect;
export type InsertVideoGenerationTask = typeof videoGenerationTasks.$inferInsert;

/**
 * 视频历史记录表
 */
export const generatedVideos = mysqlTable("generatedVideos", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // 视频URL
  videoUrl: text("videoUrl").notNull(),
  // 缩略图URL
  thumbnailUrl: text("thumbnailUrl"),
  // 生成时使用的prompt
  prompt: text("prompt").notNull(),
  // 视频时长（秒）
  duration: int("duration").notNull(),
  // 视频风格（如果指定）
  style: varchar("style", { length: 50 }),
  // 服务商
  provider: varchar("provider", { length: 50 }),
  // 关联的对话ID（如果是在对话中生成的）
  conversationId: int("conversationId"),
  // 关联的消息ID（如果是在对话中生成的）
  messageIndex: int("messageIndex"),
  // 是否收藏
  isFavorite: boolean("isFavorite").default(false).notNull(),
  // 生成耗费的🐟币
  cost: decimal("cost", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GeneratedVideo = typeof generatedVideos.$inferSelect;
export type InsertGeneratedVideo = typeof generatedVideos.$inferInsert;

/**
 * 视频生成API配置表
 */
export const videoApiConfigs = mysqlTable("videoApiConfigs", {
  id: int("id").autoincrement().primaryKey(),
  // 服务商名称（runway, luma, pika等）
  provider: varchar("provider", { length: 50 }).notNull().unique(),
  // API密钥
  apiKey: text("apiKey"),
  // API端点URL
  apiEndpoint: text("apiEndpoint"),
  // 是否启用
  isEnabled: boolean("isEnabled").default(false).notNull(),
  // 5秒视频生成的🐟币成本
  cost5s: decimal("cost5s", { precision: 10, scale: 2 }).default("30.00").notNull(),
  // 10秒视频生成的🐟币成本
  cost10s: decimal("cost10s", { precision: 10, scale: 2 }).default("50.00").notNull(),
  // 配置说明
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VideoApiConfig = typeof videoApiConfigs.$inferSelect;
export type InsertVideoApiConfig = typeof videoApiConfigs.$inferInsert;

/**
 * 视频分享表 - 管理视频分享链接
 */
export const videoShares = mysqlTable("videoShares", {
  id: int("id").autoincrement().primaryKey(),
  // 关联的视频任务ID
  videoId: int("videoId").notNull(),
  // 分享令牌（用于生成分享链接）
  shareToken: varchar("shareToken", { length: 64 }).notNull().unique(),
  // 分享创建者ID
  userId: int("userId").notNull(),
  // 分享标题（可选）
  title: varchar("title", { length: 200 }),
  // 分享描述（可选）
  description: text("description"),
  // 访问次数
  viewCount: int("viewCount").default(0).notNull(),
  // 分享链接过期时间（null表示永久有效）
  expiresAt: timestamp("expiresAt"),
  // 是否启用（可以手动禁用分享）
  isEnabled: boolean("isEnabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VideoShare = typeof videoShares.$inferSelect;
export type InsertVideoShare = typeof videoShares.$inferInsert;

/**
 * 作业批改记录表
 */
export const homeworkCorrections = mysqlTable("homeworkCorrections", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // 批改标题（自动生成或用户自定义）
  title: varchar("title", { length: 255 }).notNull(),
  // 批改类型: single(单张), batch(批量)
  type: mysqlEnum("type", ["single", "batch"]).default("single").notNull(),
  // 科目: math(数学), chinese(语文), english(英语), physics(物理), chemistry(化学), other(其他)
  subject: mysqlEnum("subject", ["math", "chinese", "english", "physics", "chemistry", "other"]).default("math").notNull(),
  // 年级: grade1-grade12, university
  grade: varchar("grade", { length: 20 }),
  // 总题数
  totalQuestions: int("totalQuestions").default(0).notNull(),
  // 正确题数
  correctCount: int("correctCount").default(0).notNull(),
  // 错误题数
  wrongCount: int("wrongCount").default(0).notNull(),
  // 正确率（百分比，0-100）
  accuracy: decimal("accuracy", { precision: 5, scale: 2 }).default("0.00").notNull(),
  // 评分等级: excellent(优秀90+), good(良好80-89), pass(及格60-79), fail(不及格<60)
  scoreLevel: mysqlEnum("scoreLevel", ["excellent", "good", "pass", "fail"]),
  // 批改图片URLs（JSON数组）
  imageUrls: text("imageUrls").notNull(),
  // 批改结果（JSON格式，包含每道题的详细批改信息）
  correctionResult: text("correctionResult").notNull(),
  // AI批改总结
  summary: text("summary"),
  // 思维导图（Mermaid格式）
  mindMap: text("mindMap"),
  // 学习建议（JSON数组）
  studySuggestions: text("studySuggestions"),
  // 使用的模型ID
  modelId: int("modelId").notNull(),
  // 消耗的🐟币
  fishCoinCost: decimal("fishCoinCost", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HomeworkCorrection = typeof homeworkCorrections.$inferSelect;
export type InsertHomeworkCorrection = typeof homeworkCorrections.$inferInsert;

/**
 * 错题本表
 */
export const wrongQuestions = mysqlTable("wrongQuestions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // 关联的批改记录ID
  correctionId: int("correctionId").notNull(),
  // 科目
  subject: mysqlEnum("subject", ["math", "chinese", "english", "physics", "chemistry", "other"]).default("math").notNull(),
  // 知识点/题型（如：加减法、乘除法、应用题、阅读理解等）
  knowledgePoint: varchar("knowledgePoint", { length: 100 }),
  // 题目内容（从AI批改结果中提取）
  questionContent: text("questionContent").notNull(),
  // 学生答案
  studentAnswer: text("studentAnswer"),
  // 正确答案
  correctAnswer: text("correctAnswer").notNull(),
  // 错误原因分析
  errorAnalysis: text("errorAnalysis"),
  // 题目图片URL
  questionImageUrl: text("questionImageUrl"),
  // 是否已重做: pending(待重做), done(已重做), mastered(已掌握)
  status: mysqlEnum("status", ["pending", "done", "mastered"]).default("pending").notNull(),
  // 重做次数
  retryCount: int("retryCount").default(0).notNull(),
  // 最后重做时间
  lastRetryAt: timestamp("lastRetryAt"),
  // 是否已掌握（连续3次正确即为掌握）
  isMastered: boolean("isMastered").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WrongQuestion = typeof wrongQuestions.$inferSelect;
export type InsertWrongQuestion = typeof wrongQuestions.$inferInsert;

/**
 * 批改报告分享链接表
 */
export const correctionShares = mysqlTable("correctionShares", {
  id: int("id").autoincrement().primaryKey(),
  // 关联的批改记录ID
  correctionId: int("correctionId").notNull(),
  // 用户ID
  userId: int("userId").notNull(),
  // 分享链接的唯一标识符（用于生成URL）
  shareToken: varchar("shareToken", { length: 64 }).notNull().unique(),
  // 分享标题
  shareTitle: varchar("shareTitle", { length: 255 }),
  // 访问次数
  viewCount: int("viewCount").default(0).notNull(),
  // 是否启用（可以禁用分享链接）
  enabled: boolean("enabled").default(true).notNull(),
  // 过期时间（null表示永久有效）
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CorrectionShare = typeof correctionShares.$inferSelect;
export type InsertCorrectionShare = typeof correctionShares.$inferInsert;

/**
 * S3存储统计表（每日统计）
 */
export const storageStats = mysqlTable("storageStats", {
  id: int("id").autoincrement().primaryKey(),
  // 统计日期
  statDate: date("statDate").notNull().unique(),
  // 总文件数量
  totalFiles: int("totalFiles").default(0).notNull(),
  // 图片文件数量
  imageFiles: int("imageFiles").default(0).notNull(),
  // 文档文件数量
  documentFiles: int("documentFiles").default(0).notNull(),
  // 其他文件数量
  otherFiles: int("otherFiles").default(0).notNull(),
  // 总存储大小（字节）
  totalSize: bigint("totalSize", { mode: "number" }).default(0).notNull(),
  // 图片存储大小（字节）
  imageSize: bigint("imageSize", { mode: "number" }).default(0).notNull(),
  // 文档存储大小（字节）
  documentSize: bigint("documentSize", { mode: "number" }).default(0).notNull(),
  // 其他文件存储大小（字节）
  otherSize: bigint("otherSize", { mode: "number" }).default(0).notNull(),
  // 新增文件数（当日）
  newFiles: int("newFiles").default(0).notNull(),
  // 新增存储大小（当日，字节）
  newSize: bigint("newSize", { mode: "number" }).default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StorageStat = typeof storageStats.$inferSelect;
export type InsertStorageStat = typeof storageStats.$inferInsert;

/**
 * 作业批改费用配置表
 */
export const homeworkPricingConfig = mysqlTable("homeworkPricingConfig", {
  id: int("id").autoincrement().primaryKey(),
  // 年级类别（primary, middle, high, college, graduate）
  gradeCategory: varchar("gradeCategory", { length: 32 }).notNull().unique(),
  // 年级显示名称
  gradeName: varchar("gradeName", { length: 64 }).notNull(),
  // 年级范围描述（如"1-6年级"）
  gradeRange: varchar("gradeRange", { length: 64 }).notNull(),
  // 每次批改费用（🐟币）
  pricePerCorrection: decimal("pricePerCorrection", { precision: 10, scale: 2 }).notNull(),
  // 是否使用旗舰模型
  useAdvancedModel: boolean("useAdvancedModel").default(false).notNull(),
  // 排序顺序
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type HomeworkPricingConfig = typeof homeworkPricingConfig.$inferSelect;
export type InsertHomeworkPricingConfig = typeof homeworkPricingConfig.$inferInsert;

/**
 * 图片生成费用配置表
 */
export const imageGenerationPricing = mysqlTable("imageGenerationPricing", {
  id: int("id").autoincrement().primaryKey(),
  // 配置名称
  configName: varchar("configName", { length: 64 }).notNull().unique(),
  // 显示名称
  displayName: varchar("displayName", { length: 64 }).notNull(),
  // 每张图片费用（🐟币）
  pricePerImage: decimal("pricePerImage", { precision: 10, scale: 2 }).notNull(),
  // 是否启用
  enabled: boolean("enabled").default(true).notNull(),
  // 描述
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ImageGenerationPricing = typeof imageGenerationPricing.$inferSelect;
export type InsertImageGenerationPricing = typeof imageGenerationPricing.$inferInsert;

/**
 * PDF水印配置表
 */
export const pdfWatermarkConfig = mysqlTable("pdf_watermark_config", {
  id: int("id").autoincrement().primaryKey(),
  // 水印文字
  watermarkText: varchar("watermark_text", { length: 255 }).notNull().default('仅供学习使用'),
  // 透明度（0.00-1.00）
  opacity: decimal("opacity", { precision: 3, scale: 2 }).notNull().default('0.10'),
  // 旋转角度（-180到180）
  rotation: int("rotation").notNull().default(-45),
  // 字体大小
  fontSize: int("font_size").notNull().default(60),
  // 颜色
  color: varchar("color", { length: 20 }).notNull().default('#000000'),
  // 是否启用
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type PdfWatermarkConfig = typeof pdfWatermarkConfig.$inferSelect;
export type InsertPdfWatermarkConfig = typeof pdfWatermarkConfig.$inferInsert;

/**
 * 用户PDF导出设置表
 */
export const userPdfSettings = mysqlTable("user_pdf_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  // 水印文字（null表示使用默认）
  watermarkText: varchar("watermark_text", { length: 255 }),
  // 是否启用水印
  watermarkEnabled: boolean("watermark_enabled").default(true).notNull(),
  // 是否显示学生姓名
  showStudentName: boolean("show_student_name").default(true).notNull(),
  // 页眉内容（null表示使用默认）
  headerContent: text("header_content"),
  // 页脚内容（null表示使用默认）
  footerContent: text("footer_content"),
  // 是否显示页码
  showPageNumber: boolean("show_page_number").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type UserPdfSettings = typeof userPdfSettings.$inferSelect;
export type InsertUserPdfSettings = typeof userPdfSettings.$inferInsert;

/**
 * 订单表 - 记录用户的购买订单
 */
export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  // Stripe支付意图ID
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  // 订单类型: coin_package(🐟币充值包), subscription(订阅)
  orderType: mysqlEnum("order_type", ["coin_package", "subscription"]).notNull(),
  // 产品标识（例如：coin_100, coin_500, membership_basic_monthly）
  productId: varchar("product_id", { length: 100 }).notNull(),
  // 产品名称
  productName: varchar("product_name", { length: 255 }).notNull(),
  // 订单金额（美元）
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  // 货币代码
  currency: varchar("currency", { length: 3 }).default("usd").notNull(),
  // 订单状态: pending(待支付), completed(已完成), failed(失败), refunded(已退款)
  status: mysqlEnum("status", ["pending", "completed", "failed", "refunded"]).default("pending").notNull(),
  // 🐟币数量（仅充值包订单）
  coinAmount: int("coin_amount"),
  // 支付完成时间
  paidAt: timestamp("paid_at"),
  // 退款时间
  refundedAt: timestamp("refunded_at"),
  // 订单元数据（JSON格式）
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

/**
 * 订阅表 - 记录用户的会员订阅
 */
export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  // Stripe订阅ID
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }).notNull().unique(),
  // 订阅计划: basic_monthly(基础月付), basic_yearly(基础年付), premium_monthly(高级月付), premium_yearly(高级年付)
  planId: varchar("plan_id", { length: 100 }).notNull(),
  // 订阅状态: active(活跃), canceled(已取消), past_due(逾期), trialing(试用中)
  status: mysqlEnum("status", ["active", "canceled", "past_due", "trialing"]).notNull(),
  // 当前周期开始时间
  currentPeriodStart: timestamp("current_period_start").notNull(),
  // 当前周期结束时间
  currentPeriodEnd: timestamp("current_period_end").notNull(),
  // 取消时间
  canceledAt: timestamp("canceled_at"),
  // 是否在周期结束时取消
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

/**
 * 支付配置表 - 支持多种支付方式配置
 */
export const paymentConfig = mysqlTable("paymentConfig", {
  id: int("id").autoincrement().primaryKey(),
  // 支付方式: stripe(Stripe), alipay(支付宝), wechat(微信支付)
  provider: mysqlEnum("provider", ["stripe", "alipay", "wechat"]).notNull().unique(),
  // 是否启用
  enabled: boolean("enabled").default(false).notNull(),
  // 配置数据(JSON格式存储不同支付方式的参数)
  // Stripe: { publicKey, secretKey, webhookSecret }
  // 支付宝: { appId, privateKey, publicKey, notifyUrl, returnUrl }
  // 微信: { appId, mchId, apiKey, notifyUrl }
  config: text("config").notNull(),
  // 备注说明
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PaymentConfig = typeof paymentConfig.$inferSelect;
export type InsertPaymentConfig = typeof paymentConfig.$inferInsert;

/**
 * 自主研究任务表 - Autonomous Research Agent
 */
export const researchTasks = mysqlTable("research_tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  // 用户的原始研究指令
  prompt: text("prompt").notNull(),
  // 任务状态: pending(等待中), processing(处理中), completed(已完成), failed(失败)
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  // 任务进度百分比 (0-100)
  progress: int("progress").default(0).notNull(),
  // 当前正在执行的步骤描述
  currentStep: varchar("currentStep", { length: 255 }),
  // 完成后的报告 S3 URL
  reportUrl: text("reportUrl"),
  // 报告内容（Markdown格式，同时存储在数据库中作为备份）
  reportContent: text("reportContent"),
  // 错误信息（如果失败）
  errorMessage: text("errorMessage"),
  // 消耗的🐟币
  cost: decimal("cost", { precision: 10, scale: 2 }).default("0.00").notNull(),
  // BullMQ 任务ID（用于查询队列状态）
  bullmqJobId: varchar("bullmqJobId", { length: 100 }),
  // Agent 使用的 LLM 模型
  modelUsed: varchar("modelUsed", { length: 100 }),
  // 总搜索次数
  totalSearches: int("totalSearches").default(0).notNull(),
  // 总思考步骤数
  totalSteps: int("totalSteps").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ResearchTask = typeof researchTasks.$inferSelect;
export type InsertResearchTask = typeof researchTasks.$inferInsert;

/**
 * 研究任务步骤表 - 记录 Agent 的每一步思考/行动/观察
 */
export const researchTaskSteps = mysqlTable("research_task_steps", {
  id: int("id").autoincrement().primaryKey(),
  // 关联的研究任务 ID
  taskId: int("taskId").notNull(),
  // 步骤序号（从1开始）
  stepNumber: int("stepNumber").notNull(),
  // 步骤类型: thought(思考), action(行动), observation(观察), summary(总结)
  type: mysqlEnum("type", ["thought", "action", "observation", "summary"]).notNull(),
  // 步骤的具体内容
  content: text("content").notNull(),
  // 如果是 action 类型，记录使用的工具名称
  toolName: varchar("toolName", { length: 100 }),
  // 如果是 action 类型，记录工具的输入参数
  toolInput: text("toolInput"),
  // 步骤耗时（毫秒）
  durationMs: int("durationMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ResearchTaskStep = typeof researchTaskSteps.$inferSelect;
export type InsertResearchTaskStep = typeof researchTaskSteps.$inferInsert;

/**
 * SSH 配置表 - 存储 VPS 连接信息
 */
export const sshConfigs = mysqlTable("ssh_configs", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  port: int("port").default(22).notNull(),
  username: varchar("username", { length: 100 }).notNull(),
  authType: mysqlEnum("authType", ["password", "privateKey"]).default("password").notNull(),
  password: text("password"),
  privateKey: text("privateKey"),
  passphrase: text("passphrase"),
  isDefault: boolean("isDefault").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  userId: int("userId").notNull(),
  connectTimeout: int("connectTimeout").default(10).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SSHConfig = typeof sshConfigs.$inferSelect;
export type InsertSSHConfig = typeof sshConfigs.$inferInsert;

/**
 * SSH 文件备份表 - 记录 Agent 修改文件前的备份
 */
export const sshFileBackups = mysqlTable("ssh_file_backups", {
  id: int("id").autoincrement().primaryKey(),
  sshConfigId: int("sshConfigId").notNull(),
  taskId: int("taskId"),
  filePath: varchar("filePath", { length: 500 }).notNull(),
  originalContent: text("originalContent").notNull(),
  modifiedContent: text("modifiedContent"),
  rolledBack: boolean("rolledBack").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SSHFileBackup = typeof sshFileBackups.$inferSelect;
export type InsertSSHFileBackup = typeof sshFileBackups.$inferInsert;
