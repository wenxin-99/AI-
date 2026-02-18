import "dotenv/config";
import { setupGlobalProxy } from "./globalProxy";
setupGlobalProxy();
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { createServer } from "http";
import net from "net";
import { initSocketIO } from "./socketManager";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import path from "path";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    
  // Graceful shutdown

  
  // Global error handler

  server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Initialize Socket.io for real-time sandbox events
  initSocketIO(server);

  // Graceful shutdown
  const gracefulShutdown = (signal: string) => {
    console.log(`[Server] ${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log("[Server] HTTP server closed");
      process.exit(0);
    });
    setTimeout(() => {
      console.error("[Server] Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  console.log("[Server] Socket.io initialized");
  
  // CORS configuration - allow credentials
  app.use(cors({
    origin: (origin, cb) => {
      const ok = ["https://insights.mom","https://www.insights.mom","https://insights.ren","https://ai.mpsboring.com","http://localhost:3000","http://localhost:5173"];
      cb(null, !origin || ok.includes(origin));
    },
    credentials: true, // Allow cookies
  }));
  
  // Security headers
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  // Stripe webhook MUST use raw body for signature verification
  // Register this BEFORE express.json() middleware
  const stripeRouter = (await import("../routes/stripe")).default;
  app.use("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeRouter);
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser());
  
  // Register other Stripe routes (after json middleware)
  app.use("/api/stripe", stripeRouter);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // External OAuth callback under /api/forum/callback (论坛OAuth专用回调)
  const { handleExternalOAuthCallback } = await import("./externalOAuthCallback");
  
  // Forum password login route
  const forumPasswordLoginRouter = (await import("../routes/forumPasswordLogin")).default;
  app.use("/api/forum", forumPasswordLoginRouter);
  
  // Test route to verify /api/forum/* paths work
  app.get("/api/forum/test", (req, res) => {
    res.json({ success: true, message: "Forum API routes are working!" });
  });
  
  // Webhook routes for forum integration
  const webhookRouter = (await import("../routes/webhook")).default;
  app.use("/api/webhook", webhookRouter);
  
  // Workaround for Manus platform routing bug - use path parameters
  // Forum should redirect to: https://ai.mpsboring.com/api/forum/callback/code/{code}/state/{state}
  // MUST register this route BEFORE the wildcard route to ensure it matches first
  app.get("/api/forum/callback/code/:code/state/:state", async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`\n========== [Forum OAuth Path Params] Callback Received at ${timestamp} ==========`);
    console.log("[Forum OAuth Path Params] Request details:", {
      method: req.method,
      path: req.path,
      params: req.params,
      query: req.query,
      originalUrl: req.originalUrl,
    });
    console.log("=========================================================\n");
    
    const { code, state } = req.params;
    
    if (!code || !state) {
      console.error("[Forum OAuth Path Params] Missing code or state");
      return res.status(400).send("Missing authorization code or state");
    }
    
    // Reconstruct the request as if it came with query parameters
    req.query = { code, state };
    console.log("[Forum OAuth Path Params] Reconstructed query:", req.query);
    
    try {
      return await handleExternalOAuthCallback(req, res);
    } catch (error) {
      console.error("[Forum OAuth Path Params] Error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: "Internal server error", details: errorMessage });
    }
  });
  
  // Register forum OAuth callback route (standard query parameters)
  app.get("/api/forum/callback", async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`\n========== [Forum OAuth] Callback Received at ${timestamp} ==========`);
    console.log("[Forum OAuth] Request details:", {
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      baseUrl: req.baseUrl,
      query: req.query,
      params: req.params,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
        referer: req.headers.referer,
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-forwarded-proto': req.headers['x-forwarded-proto'],
      },
    });
    console.log("[Forum OAuth] Full URL:", `${req.protocol}://${req.get('host')}${req.originalUrl}`);
    console.log("=========================================================\n");
    
    try {
      return await handleExternalOAuthCallback(req, res);
    } catch (error) {
      console.error("[Forum OAuth] Error handling callback:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Internal server error", details: errorMessage });
    }
  });
  
  // Catch-all route for debugging - capture any /api/forum/callback/* requests
  app.get("/api/forum/callback/*", async (req, res) => {
    const timestamp = new Date().toISOString();
    console.log(`\n========== [Forum OAuth Wildcard] Callback Received at ${timestamp} ==========`);
    console.log("[Forum OAuth Wildcard] Request details:", {
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      baseUrl: req.baseUrl,
      query: req.query,
      params: req.params,
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
        referer: req.headers.referer,
      },
      fullUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    });
    console.log("=========================================================\n");
    
    // Try to extract code and state from the URL path
    const pathParts = req.path.split('/');
    const codeIndex = pathParts.indexOf('code');
    const stateIndex = pathParts.indexOf('state');
    
    let code, state;
    if (codeIndex !== -1 && codeIndex + 1 < pathParts.length) {
      code = pathParts[codeIndex + 1];
    }
    if (stateIndex !== -1 && stateIndex + 1 < pathParts.length) {
      state = pathParts[stateIndex + 1];
    }
    
    console.log("[Forum OAuth Wildcard] Extracted:", { code, state });
    
    if (code && state) {
      req.query = { code, state };
      try {
        return await handleExternalOAuthCallback(req, res);
      } catch (error) {
        console.error("[Forum OAuth Wildcard] Error:", error);
        return res.status(500).json({ error: "Authentication failed", details: error instanceof Error ? error.message : String(error) });
      }
    } else {
      return res.status(400).json({
        error: "Invalid callback URL format",
        received: req.originalUrl,
        extracted: { code, state },
        message: "Could not extract code and state from URL"
      });
    }
  });
  
  // This route has been moved above to ensure it matches before the wildcard route
  
  // Catch-all for malformed URLs (debugging purpose)
  app.get("/api/forum/:stateParam", async (req, res) => {
    const { stateParam } = req.params;
    
    // Skip known routes
    if (stateParam === 'callback' || stateParam === 'test') {
      return; // Let other handlers process it
    }
    
    console.log("[Forum OAuth Workaround] Caught malformed callback URL:", {
      stateParam,
      originalUrl: req.originalUrl,
      query: req.query,
    });
    
    return res.status(400).json({
      error: "Manus platform routing bug detected",
      message: "The OAuth callback URL was malformed by the platform",
      receivedUrl: req.originalUrl,
      expectedUrl: "/api/forum/callback?code=xxx&state=yyy",
      actualUrl: `/api/forum/${stateParam}`,
      solution: "Please update the forum OAuth client to use path parameters",
      correctFormat: "https://ai.mpsboring.com/api/forum/callback/code/{code}/state/{state}"
    });
  });
  
  // Workaround for Manus platform routing bug
  // Use path parameters instead of query parameters: /api/auth/callback/code/xxx/state/yyy
  app.get("/api/auth/callback/code/:code/state/:state", async (req, res) => {
    console.log("[OAuth Path Params] Received callback with path params:", req.params);
    
    const { code, state } = req.params;
    
    if (!code || !state) {
      console.error("[OAuth Path Params] Missing code or state");
      return res.status(400).send("Missing authorization code or state");
    }
    
    // Reconstruct the request as if it came with query parameters
    req.query = { code, state };
    console.log("[OAuth Path Params] Reconstructed query:", req.query);
    
    // Call the original handler
    return handleExternalOAuthCallback(req, res);
  });
  
  // Catch-all route for Manus platform routing bug
  // Manus seems to transform /api/auth/callback?code=xxx&state=yyy into /api/auth/STATE_VALUE
  // This route must be registered AFTER /api/auth/callback to avoid conflicts
  app.get("/api/auth/:stateParam", async (req, res) => {
    // Skip if this is the 'callback' route (already handled above)
    if (req.params.stateParam === 'callback') {
      return res.status(404).send("Not found");
    }
    
    console.log("[OAuth Catch-All] Received request:", {
      path: req.path,
      params: req.params,
      query: req.query,
      headers: req.headers,
      originalUrl: req.originalUrl,
      url: req.url,
    });
    
    // Try to extract code and state from various sources
    const stateParam = req.params.stateParam;
    const codeFromQuery = req.query.code as string;
    const stateFromQuery = req.query.state as string;
    
    // Log what we found
    console.log("[OAuth Catch-All] Extracted parameters:", {
      stateParam,
      codeFromQuery,
      stateFromQuery,
    });
    
    // For now, just return detailed error to help debug
    return res.status(400).send(`
      <h1>OAuth Callback Debug Info</h1>
      <p><strong>Path:</strong> ${req.path}</p>
      <p><strong>Original URL:</strong> ${req.originalUrl}</p>
      <p><strong>State Param:</strong> ${stateParam}</p>
      <p><strong>Code from Query:</strong> ${codeFromQuery || 'N/A'}</p>
      <p><strong>State from Query:</strong> ${stateFromQuery || 'N/A'}</p>
      <p><strong>All Headers:</strong></p>
      <pre>${JSON.stringify(req.headers, null, 2)}</pre>
    `);
  });
  
  // SSE Notifications endpoint
  const { addNotificationClient } = await import("./notifications");
  const { sdk } = await import("./sdk");
  app.get("/api/notifications/stream", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      addNotificationClient(user.id, res);
    } catch (error) {
      res.status(401).json({ error: "Unauthorized" });
    }
  });
  
  // File upload endpoint removed - now using /api/upload router with multer
  // Chat stream API (SSE)
  const chatStreamRouter = (await import("../api/chatStream")).default;
  app.use("/api/chat", chatStreamRouter);

  // TTS (Text-to-Speech) API
  const ttsRouter = (await import("../api/ttsRouter")).default;
  app.use("/api/tts", ttsRouter);
  // SSH / VPS 远程操控 API
  let sshRouter: any;
  try {
    sshRouter = (await import("../api/sshRouter")).default;
    console.log("[SSH] Router loaded successfully");
  } catch (e: any) {
    console.error("[SSH] Failed to load router:", e.message);
  }
  if (sshRouter) app.use("/api/ssh", sshRouter);
  // 网站全自动交互沙箱 API
  let automationRouter: any;
  try {
    automationRouter = (await import("./automationRouter")).default;
    console.log("[Automation] Router loaded successfully");
  } catch (e: any) {
    console.error("[Automation] Failed to load router:", e.message);
  }
  if (automationRouter) app.use("/api/automation", automationRouter);
  // 定时任务系统 API
  let scheduledTaskRouter: any;
  let initScheduledTasksFn: any;
  try {
    const stModule = await import("../api/scheduledTaskRouter");
    scheduledTaskRouter = stModule.default;
    initScheduledTasksFn = stModule.initScheduledTasks;
    console.log("[ScheduledTask] Router loaded successfully");
  } catch (e: any) {
    console.error("[ScheduledTask] Failed to load router:", e.message);
  }
  if (scheduledTaskRouter) app.use("/api/scheduled-tasks", scheduledTaskRouter);
  if (initScheduledTasksFn) initScheduledTasksFn().catch((e: any) => console.error("[ScheduledTask] Init failed:", e));
  
  // File upload API
  const uploadRouter = (await import("../api/upload")).default;
  app.use("/api/upload", uploadRouter);
  // Image proxy API
  const imageProxyRouter = (await import("../api/imageProxy")).default;
  app.use("/api/image-proxy", imageProxyRouter);
  
  // Video proxy API for CORS-free downloads
  const { videoProxyRouter } = await import("../api/videoProxy");
  app.use("/api/video-proxy", videoProxyRouter);
  
  // SEO: Sitemap.xml
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const { generateSitemap, getSitemapUrls } = await import("../sitemap");
      const urls = getSitemapUrls();
      const xml = generateSitemap(urls);
      res.header("Content-Type", "application/xml");
      res.send(xml);
    } catch (error) {
      console.error("[Sitemap] Error generating sitemap:", error);
      res.status(500).send("Error generating sitemap");
    }
  });
  
  // SEO: robots.txt
  app.get("/robots.txt", (req, res) => {
    const robotsTxt = `User-agent: *
Allow: /
Sitemap: https://insights.mom/sitemap.xml`;
    res.header("Content-Type", "text/plain");
    res.send(robotsTxt);
  });
  
  // Health check
  app.get("/healthz", (req, res) => { res.json({ status: "ok", ts: new Date().toISOString() }); });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Serve uploaded files (images, documents, etc.)
  const uploadsPath = path.resolve(process.cwd(), "uploads");
  app.use("/uploads", express.static(uploadsPath, {
    maxAge: "30d",
    setHeaders: (res, filePath) => {
      const ext = filePath.split(".").pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        pdf: "application/pdf",
        wav: "audio/wav",
        mp3: "audio/mpeg",
      };
      if (ext && mimeTypes[ext]) {
        res.setHeader("Content-Type", mimeTypes[ext]);
      }
    }
  }));

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);
    
    // 恢复pending/processing的视频任务
    try {
      const { recoverVideoTasks } = await import("../routers");
      await recoverVideoTasks();
    } catch (error) {
      console.error("[Server] Failed to recover video tasks:", error);
    }
    
    // 启动论坛积分同步补偿定时任务
    try {
      const { startSyncCompensationScheduler } = await import("./forumSyncCompensation");
      startSyncCompensationScheduler();
    } catch (error) {
      console.error("[Server] Failed to start forum sync compensation scheduler:", error);
    }
    
    // 启动邀请码过期清理定时任务
    try {
      const { startCleanupSchedule } = await import("../invitationCleanup");
      startCleanupSchedule();
      console.log("[Server] Invitation cleanup scheduler started");
    } catch (error) {
      console.error("[Server] Failed to start invitation cleanup scheduler:", error);
    }

    // 启动自主研究代理 Worker
    try {
      const { initResearchWorker } = await import("./agentQueue");
      initResearchWorker();
      console.log("[Server] Research agent worker started");
    } catch (error) {
      console.error("[Server] Failed to start research agent worker:", error);
    }
  });
}

startServer().catch(console.error);