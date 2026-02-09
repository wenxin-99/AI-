package controllers

import (
	"fmt"
	"net/http"
	"os"
	"runtime"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/config"
	"gopkg.in/yaml.v3"
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
	var req struct {
		Server struct {
			Port     int    `json:"port"`
			BasePath string `json:"base_path"`
			LogLevel string `json:"log_level"`
		} `json:"server"`
		Security struct {
			JWTExpireHour int    `json:"jwt_expire_hour"`
			TwoFactorName string `json:"two_factor_name"`
		} `json:"security"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误: " + err.Error(),
		})
		return
	}

	// 检测哪些配置发生了变化
	logLevelChanged := sc.cfg.Server.LogLevel != req.Server.LogLevel
	portChanged := sc.cfg.Server.Port != req.Server.Port
	basePathChanged := sc.cfg.Server.BasePath != req.Server.BasePath
	jwtExpireChanged := sc.cfg.Security.JWTExpireHour != req.Security.JWTExpireHour
	twoFactorChanged := sc.cfg.Security.TwoFactorName != req.Security.TwoFactorName

	// 更新内存中的配置
	sc.cfg.Server.Port = req.Server.Port
	sc.cfg.Server.BasePath = req.Server.BasePath
	sc.cfg.Server.LogLevel = req.Server.LogLevel
	sc.cfg.Security.JWTExpireHour = req.Security.JWTExpireHour
	sc.cfg.Security.TwoFactorName = req.Security.TwoFactorName

	// 热重载：立即应用日志级别变更
	if logLevelChanged {
		switch req.Server.LogLevel {
		case "debug":
			gin.SetMode(gin.DebugMode)
		case "info", "warn", "error":
			gin.SetMode(gin.ReleaseMode)
		default:
			gin.SetMode(gin.ReleaseMode)
		}
	}

	// 保存配置到文件
	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		configPath = "/opt/uniproxy-panel/config.yaml"
	}

	// 读取现有配置文件
	data, err := os.ReadFile(configPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "读取配置文件失败: " + err.Error(),
		})
		return
	}

	// 解析 YAML
	var configMap map[string]interface{}
	if err := yaml.Unmarshal(data, &configMap); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "解析配置文件失败: " + err.Error(),
		})
		return
	}

	// 更新配置
	if serverMap, ok := configMap["server"].(map[string]interface{}); ok {
		serverMap["port"] = req.Server.Port
		serverMap["base_path"] = req.Server.BasePath
		serverMap["log_level"] = req.Server.LogLevel
	}

	if securityMap, ok := configMap["security"].(map[string]interface{}); ok {
		securityMap["jwt_expire_hour"] = req.Security.JWTExpireHour
		securityMap["two_factor_name"] = req.Security.TwoFactorName
	}

	// 写回配置文件
	newData, err := yaml.Marshal(configMap)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "序列化配置失败: " + err.Error(),
		})
		return
	}

	// 备份原配置文件
	backupPath := fmt.Sprintf("%s.bak", configPath)
	if err := os.WriteFile(backupPath, data, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "备份配置文件失败: " + err.Error(),
		})
		return
	}

	// 保存新配置
	if err := os.WriteFile(configPath, newData, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "保存配置文件失败: " + err.Error(),
		})
		return
	}

	// 判断是否需要重启（端口和路径变更需要重启）
	needsRestart := portChanged || basePathChanged

	// 生成提示消息
	var message string
	var hotReloadedItems []string
	var restartRequiredItems []string

	if logLevelChanged {
		hotReloadedItems = append(hotReloadedItems, "日志级别")
	}
	if jwtExpireChanged || twoFactorChanged {
		hotReloadedItems = append(hotReloadedItems, "安全设置")
	}
	if portChanged {
		restartRequiredItems = append(restartRequiredItems, "监听端口")
	}
	if basePathChanged {
		restartRequiredItems = append(restartRequiredItems, "基础路径")
	}

	if len(hotReloadedItems) > 0 && len(restartRequiredItems) == 0 {
		message = fmt.Sprintf("配置已保存并立即生效（%s）", joinStrings(hotReloadedItems, "、"))
	} else if len(hotReloadedItems) > 0 && len(restartRequiredItems) > 0 {
		message = fmt.Sprintf("配置已保存，%s 已立即生效，%s 需要重启服务后生效",
			joinStrings(hotReloadedItems, "、"), joinStrings(restartRequiredItems, "、"))
	} else if len(restartRequiredItems) > 0 {
		message = fmt.Sprintf("配置已保存，%s 需要重启服务后生效", joinStrings(restartRequiredItems, "、"))
	} else {
		message = "配置已保存"
	}

	c.JSON(http.StatusOK, gin.H{
		"success":           true,
		"message":           message,
		"data": gin.H{
			"needs_restart":        needsRestart,
			"hot_reloaded":         hotReloadedItems,
			"restart_required":     restartRequiredItems,
		},
	})
}

// joinStrings 连接字符串数组
func joinStrings(items []string, sep string) string {
	if len(items) == 0 {
		return ""
	}
	result := items[0]
	for i := 1; i < len(items); i++ {
		result += sep + items[i]
	}
	return result
}

// GetLogs 获取系统日志
func (sc *SystemController) GetLogs(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    []interface{}{},
		"message": "功能开发中",
	})
}
