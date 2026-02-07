package controllers

import (
	"net/http"
	"runtime"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/config"
	"gorm.io/gorm"
)

// SystemController 系统控制器
type SystemController struct {
	cfg *config.Config
	db  *gorm.DB
}

// NewSystemController 创建系统控制器
func NewSystemController(cfg *config.Config, db *gorm.DB) *SystemController {
	return &SystemController{
		cfg: cfg,
		db:  db,
	}
}

// GetInfo 获取系统信息
func (sc *SystemController) GetInfo(c *gin.Context) {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"panel_name":    "UniProxy Panel",
			"panel_version": "1.0.0",
			"go_version":    runtime.Version(),
			"os":            runtime.GOOS,
			"arch":          runtime.GOARCH,
			"cpu_cores":     runtime.NumCPU(),
			"memory": gin.H{
				"alloc":       m.Alloc,
				"total_alloc": m.TotalAlloc,
				"sys":         m.Sys,
			},
			"xray_enabled": sc.cfg.Xray.Enabled,
			"gost_enabled": sc.cfg.Gost.Enabled,
		},
	})
}

// GetSettings 获取系统设置
func (sc *SystemController) GetSettings(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"server": gin.H{
				"port":      sc.cfg.Server.Port,
				"base_path": sc.cfg.Server.BasePath,
				"log_level": sc.cfg.Server.LogLevel,
			},
			"security": gin.H{
				"jwt_expire_hour": sc.cfg.Security.JWTExpireHour,
				"two_factor_name": sc.cfg.Security.TwoFactorName,
			},
		},
	})
}

// UpdateSettings 更新系统设置
func (sc *SystemController) UpdateSettings(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "功能开发中",
	})
}

// GetLogs 获取系统日志
func (sc *SystemController) GetLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    []interface{}{},
		"message": "功能开发中",
	})
}
