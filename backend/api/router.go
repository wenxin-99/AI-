package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/config"
	"github.com/uniproxy/panel/controllers"
	"github.com/uniproxy/panel/middleware"
	"gorm.io/gorm"
)

// SetupRouter 设置路由
func SetupRouter(cfg *config.Config, db *gorm.DB) *gin.Engine {
	// 设置Gin模式
	if cfg.Server.LogLevel == "debug" {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.Default()

	// 应用中间件
	router.Use(middleware.CORS())

	// 健康检查
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "服务运行正常",
		})
	})

	// 初始化控制器
	authController := controllers.NewAuthController(cfg, db)
	registerController := controllers.NewRegisterController(cfg, db)
	userController := controllers.NewUserController(db)
	xrayController := controllers.NewXrayController(cfg, db)
	// gostController := controllers.NewGostController(cfg, db) // Temporarily disabled
	systemController := controllers.NewSystemController(cfg, db)
	trafficController := controllers.NewTrafficController(db)
	subscriptionController := controllers.NewSubscriptionController(db)
	nodeController := controllers.NewNodeController(db)
	bbrController := controllers.NewBBRController()
	certController := controllers.NewCertificateController(db)

	// API v1 路由组
	v1 := router.Group(cfg.Server.BasePath + "api/v1")
	{
		// 认证相关(无需JWT)
		auth := v1.Group("/auth")
		{
			auth.POST("/login", authController.Login)
			auth.POST("/logout", authController.Logout)
		}

		// 注册相关(无需JWT)
		v1.POST("/register", registerController.Register)
		v1.GET("/check/username", registerController.CheckUsername)
		v1.GET("/check/email", registerController.CheckEmail)

		// 需要JWT认证的路由
		authenticated := v1.Group("")
		authenticated.Use(middleware.JWTAuth(cfg))
		{
			// 用户相关
			auth := authenticated.Group("/auth")
			{
				auth.POST("/refresh", authController.RefreshToken)
				auth.GET("/profile", authController.GetProfile)
				auth.PUT("/profile", authController.UpdateProfile)
				auth.POST("/2fa/enable", authController.Enable2FA)
				auth.POST("/2fa/verify", authController.Verify2FA)
			}

			// 用户管理(仅管理员)
			users := authenticated.Group("/users")
			users.Use(middleware.RequireAdmin())
			{
				users.GET("", userController.List)
				users.POST("", userController.Create)
				users.GET("/:id", userController.Get)
				users.PUT("/:id", userController.Update)
				users.DELETE("/:id", userController.Delete)
				users.GET("/:id/traffic", userController.GetTraffic)
				users.POST("/:id/reset", userController.ResetTraffic)
			}

			// Xray管理
			xray := authenticated.Group("/xray")
			{
				// 入站管理
				xray.GET("/inbounds", xrayController.ListInbounds)
				xray.POST("/inbounds", xrayController.CreateInbound)
				xray.GET("/inbounds/:id", xrayController.GetInbound)
				xray.PUT("/inbounds/:id", xrayController.UpdateInbound)
				xray.DELETE("/inbounds/:id", xrayController.DeleteInbound)

				// 客户端管理
				xray.GET("/clients", xrayController.ListClients)
				xray.POST("/clients", xrayController.CreateClient)
				xray.PUT("/clients/:id", xrayController.UpdateClient)
				xray.DELETE("/clients/:id", xrayController.DeleteClient)

					// Xray控制
					xray.POST("/restart", xrayController.Restart)
					xray.GET("/status", xrayController.GetStatus)
					// xray.POST("/generate-keypair", xrayController.GenerateKeypair) // TODO: Implement
					
					// 测试连接
					// xray.POST("/inbounds/:id/test", xrayController.TestInbound) // TODO: Implement
			}

			// Gost管理 - Temporarily disabled
			// gost := authenticated.Group("/gost")
			// {
			// 	// TODO: Re-implement Gost management when needed
			// }

			// 系统管理(仅管理员)
			system := authenticated.Group("/system")
			system.Use(middleware.RequireAdmin())
			{
				system.GET("/info", systemController.GetInfo)
				system.GET("/settings", systemController.GetSettings)
				system.PUT("/settings", systemController.UpdateSettings)
				system.GET("/logs", systemController.GetLogs)
			}

			// 流量统计
			traffic := authenticated.Group("/traffic")
			{
				traffic.GET("/user/:user_id", trafficController.GetUserTraffic)
				traffic.GET("/inbound/:inbound", trafficController.GetInboundTraffic)
				traffic.GET("/system", trafficController.GetSystemTraffic)
				traffic.GET("/trend", trafficController.GetTrafficTrend)
				traffic.POST("/reset/:user_id", trafficController.ResetUserTraffic)
				traffic.POST("/reset-all", trafficController.ResetAllUserTraffic)
				traffic.DELETE("/clean", trafficController.CleanOldLogs)
			}

			// 订阅管理
			subscription := authenticated.Group("/subscription")
			{
				subscription.GET("/generate", subscriptionController.GenerateSubscription)
				subscription.GET("/link", subscriptionController.GetSubscriptionLink)
				subscription.GET("/list", subscriptionController.ListSubscriptions)
				subscription.POST("/:id/toggle", subscriptionController.ToggleSubscription)
				subscription.DELETE("/:id", subscriptionController.DeleteSubscription)
			}

			// 节点管理
			node := authenticated.Group("/node")
			{
				node.POST("", nodeController.CreateNode)
				node.PUT("/:id", nodeController.UpdateNode)
				node.DELETE("/:id", nodeController.DeleteNode)
				node.GET("/:id", nodeController.GetNode)
				node.GET("/list", nodeController.ListNodes)
				node.POST("/:id/toggle", nodeController.ToggleNode)
				node.POST("/:id/sync", nodeController.SyncNode)
				node.GET("/:id/stats", nodeController.GetNodeStats)
				node.GET("/:id/health", nodeController.CheckNodeHealth)
				node.POST("/batch-sync", nodeController.BatchSyncNodes)
				node.GET("/generate-token", nodeController.GenerateAPIToken)
			}

			// BBR优化管理
			bbr := authenticated.Group("/bbr")
			{
				bbr.GET("/status", bbrController.GetStatus)
				bbr.POST("/enable", bbrController.Enable)
				bbr.POST("/disable", bbrController.Disable)
				bbr.POST("/optimize-protocol", bbrController.OptimizeProtocol)
				bbr.GET("/metrics", bbrController.GetMetrics)
				bbr.POST("/auto-optimize", bbrController.AutoOptimize)
			}

			// 证书管理
			certs := authenticated.Group("/certificates")
			{
				certs.GET("", certController.ListCertificates)
				certs.GET("/:id", certController.GetCertificate)
				certs.POST("/upload", certController.UploadCertificate)
				certs.POST("/generate", certController.GenerateSelfSignedCert)
				certs.DELETE("/:id", certController.DeleteCertificate)
				certs.GET("/expiring", certController.CheckExpiring)
			}
		}

		// 订阅公开接口(无需认证)
		// 节点API接口(使用JWT认证)
		nodeAPI := v1.Group("/node")
		nodeAPI.Use(middleware.JWTAuth(cfg))
		{
			nodeAPI.POST("/heartbeat", nodeController.Heartbeat)
			nodeAPI.GET("/config", nodeController.GetNodeConfig)
			nodeAPI.POST("/register", nodeController.RegisterNode)
		}
		// 节点安装脚本公开接口(供curl直接执行)
		// 使用 /node-script/install 避免与 authenticated /node 路由组冲突
		v1.GET("/node-script/install", nodeController.GetInstallScriptRaw)
		// 同时支持 POST 方法（前端调用）
		v1.POST("/node-script/generate", middleware.JWTAuth(cfg), nodeController.GenerateInstallScript)
		v1.GET("/sub/:token", subscriptionController.GetSubscriptionByToken)
	}

	return router
}
