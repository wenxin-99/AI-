package controllers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/config"
	"github.com/uniproxy/panel/database/model"
	"github.com/uniproxy/panel/services"
	"gorm.io/gorm"
)

// GostController Gost控制器
type GostController struct {
	cfg     *config.Config
	db      *gorm.DB
	service *services.GostService
}

// NewGostController 创建Gost控制器
func NewGostController(cfg *config.Config, db *gorm.DB) *GostController {
	return &GostController{
		cfg:     cfg,
		db:      db,
		service: services.NewGostService(cfg, db),
	}
}

// ListTunnels 获取隧道列表
func (gc *GostController) ListTunnels(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

	var tunnels []model.GostTunnel
	var total int64

	offset := (page - 1) * pageSize

	gc.db.Model(&model.GostTunnel{}).Count(&total)
	gc.db.Offset(offset).Limit(pageSize).Find(&tunnels)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"tunnels":   tunnels,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// CreateTunnelRequest 创建隧道请求
type CreateTunnelRequest struct {
	Name       string `json:"name" binding:"required"`
	Protocol   string `json:"protocol" binding:"required"`
	LocalPort  int    `json:"local_port" binding:"required"`
	RemoteAddr string `json:"remote_addr" binding:"required"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	SpeedLimit int    `json:"speed_limit"`
}

// CreateTunnel 创建隧道
func (gc *GostController) CreateTunnel(c *gin.Context) {
	var req CreateTunnelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误",
		})
		return
	}

	// 检查端口是否已被使用
	var count int64
	gc.db.Model(&model.GostTunnel{}).Where("local_port = ?", req.LocalPort).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "端口已被使用",
		})
		return
	}

	// 验证协议
	validProtocols := []string{"tcp", "udp", "http", "https", "socks5"}
	valid := false
	for _, p := range validProtocols {
		if req.Protocol == p {
			valid = true
			break
		}
	}
	if !valid {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "不支持的协议",
		})
		return
	}

	tunnel := &model.GostTunnel{
		Name:       req.Name,
		Protocol:   req.Protocol,
		LocalPort:  req.LocalPort,
		RemoteAddr: req.RemoteAddr,
		Username:   req.Username,
		Password:   req.Password,
		SpeedLimit: req.SpeedLimit,
		Enable:     true,
	}

	if err := gc.db.Create(tunnel).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "创建隧道失败",
		})
		return
	}

	// 重新生成配置并重启
	if err := gc.service.Restart(); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "隧道创建成功,但重启Gost失败: " + err.Error(),
			"data":    tunnel,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "创建成功",
		"data":    tunnel,
	})
}

// GetTunnel 获取隧道详情
func (gc *GostController) GetTunnel(c *gin.Context) {
	id := c.Param("id")

	var tunnel model.GostTunnel
	if err := gc.db.First(&tunnel, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "隧道不存在",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    tunnel,
	})
}

// UpdateTunnel 更新隧道
func (gc *GostController) UpdateTunnel(c *gin.Context) {
	id := c.Param("id")

	var req CreateTunnelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误",
		})
		return
	}

	var tunnel model.GostTunnel
	if err := gc.db.First(&tunnel, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "隧道不存在",
		})
		return
	}

	// 更新字段
	tunnel.Name = req.Name
	tunnel.Protocol = req.Protocol
	tunnel.LocalPort = req.LocalPort
	tunnel.RemoteAddr = req.RemoteAddr
	tunnel.Username = req.Username
	tunnel.Password = req.Password
	tunnel.SpeedLimit = req.SpeedLimit

	if err := gc.db.Save(&tunnel).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "更新失败",
		})
		return
	}

	// 重启Gost
	gc.service.Restart()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "更新成功",
		"data":    tunnel,
	})
}

// DeleteTunnel 删除隧道
func (gc *GostController) DeleteTunnel(c *gin.Context) {
	id := c.Param("id")

	if err := gc.db.Delete(&model.GostTunnel{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "删除失败",
		})
		return
	}

	// 重启Gost
	gc.service.Restart()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "删除成功",
	})
}

// Restart 重启Gost
func (gc *GostController) Restart(c *gin.Context) {
	if err := gc.service.Restart(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "重启失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "重启成功",
	})
}

// GetStatus 获取Gost状态
func (gc *GostController) GetStatus(c *gin.Context) {
	running := gc.service.IsRunning()
	version, _ := gc.service.GetVersion()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"running": running,
			"version": version,
			"enabled": gc.cfg.Gost.Enabled,
		},
	})
}
