package controllers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/uniproxy/panel/config"
	"github.com/uniproxy/panel/database/model"
	"github.com/uniproxy/panel/services"
	"gorm.io/gorm"
)

// XrayController Xray控制器
type XrayController struct {
	cfg     *config.Config
	db      *gorm.DB
	service *services.XrayService
}

// NewXrayController 创建Xray控制器
func NewXrayController(cfg *config.Config, db *gorm.DB) *XrayController {
	return &XrayController{
		cfg:     cfg,
		db:      db,
		service: services.NewXrayService(cfg, db),
	}
}

// ========== 入站管理 ==========

// ListInbounds 获取入站列表
func (xc *XrayController) ListInbounds(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

	var inbounds []model.XrayInbound
	var total int64

	offset := (page - 1) * pageSize

	xc.db.Model(&model.XrayInbound{}).Count(&total)
	xc.db.Offset(offset).Limit(pageSize).Find(&inbounds)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"inbounds":  inbounds,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// CreateInboundRequest 创建入站请求
type CreateInboundRequest struct {
	Remark         string `json:"remark" binding:"required"`
	Port           int    `json:"port" binding:"required"`
	Protocol       string `json:"protocol" binding:"required"`
	Listen         string `json:"listen"`
	Settings       string `json:"settings"`
	StreamSettings string `json:"stream_settings"`
	Sniffing       string `json:"sniffing"`
}

// CreateInbound 创建入站
func (xc *XrayController) CreateInbound(c *gin.Context) {
	var req CreateInboundRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误",
		})
		return
	}

	// 检查端口是否已被使用
	var count int64
	xc.db.Model(&model.XrayInbound{}).Where("port = ?", req.Port).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "端口已被使用",
		})
		return
	}

	// 验证协议
	validProtocols := []string{"vmess", "vless", "trojan", "shadowsocks"}
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

	inbound := &model.XrayInbound{
		Remark:         req.Remark,
		Port:           req.Port,
		Protocol:       req.Protocol,
		Listen:         req.Listen,
		Settings:       req.Settings,
		StreamSettings: req.StreamSettings,
		Sniffing:       req.Sniffing,
		Enable:         true,
	}

	if err := xc.db.Create(inbound).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "创建入站失败",
		})
		return
	}

	// 重新生成配置并重启
	if err := xc.service.Restart(); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "入站创建成功,但重启Xray失败: " + err.Error(),
			"data":    inbound,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "创建成功",
		"data":    inbound,
	})
}

// GetInbound 获取入站详情
func (xc *XrayController) GetInbound(c *gin.Context) {
	id := c.Param("id")

	var inbound model.XrayInbound
	if err := xc.db.First(&inbound, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "入站不存在",
		})
		return
	}

	// 查询该入站的客户端数量
	var clientCount int64
	xc.db.Model(&model.XrayClient{}).Where("inbound_id = ?", inbound.ID).Count(&clientCount)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"inbound":      inbound,
			"client_count": clientCount,
		},
	})
}

// UpdateInbound 更新入站
func (xc *XrayController) UpdateInbound(c *gin.Context) {
	id := c.Param("id")

	var req CreateInboundRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误",
		})
		return
	}

	var inbound model.XrayInbound
	if err := xc.db.First(&inbound, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "入站不存在",
		})
		return
	}

	// 更新字段
	inbound.Remark = req.Remark
	inbound.Port = req.Port
	inbound.Protocol = req.Protocol
	inbound.Listen = req.Listen
	inbound.Settings = req.Settings
	inbound.StreamSettings = req.StreamSettings
	inbound.Sniffing = req.Sniffing

	if err := xc.db.Save(&inbound).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "更新失败",
		})
		return
	}

	// 重启Xray
	xc.service.Restart()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "更新成功",
		"data":    inbound,
	})
}

// DeleteInbound 删除入站
func (xc *XrayController) DeleteInbound(c *gin.Context) {
	id := c.Param("id")

	// 先删除该入站的所有客户端
	xc.db.Where("inbound_id = ?", id).Delete(&model.XrayClient{})

	// 删除入站
	if err := xc.db.Delete(&model.XrayInbound{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "删除失败",
		})
		return
	}

	// 重启Xray
	xc.service.Restart()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "删除成功",
	})
}

// ========== 客户端管理 ==========

// ListClients 获取客户端列表
func (xc *XrayController) ListClients(c *gin.Context) {
	inboundID := c.Query("inbound_id")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

	var clients []model.XrayClient
	var total int64

	offset := (page - 1) * pageSize

	query := xc.db.Model(&model.XrayClient{})
	if inboundID != "" {
		query = query.Where("inbound_id = ?", inboundID)
	}

	query.Count(&total)
	query.Offset(offset).Limit(pageSize).Find(&clients)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"clients":   clients,
			"total":     total,
			"page":      page,
			"page_size": pageSize,
		},
	})
}

// CreateClientRequest 创建客户端请求
type CreateClientRequest struct {
	InboundID    uint   `json:"inbound_id" binding:"required"`
	Email        string `json:"email" binding:"required"`
	UUID         string `json:"uuid"`
	Password     string `json:"password"`
	TrafficLimit int64  `json:"traffic_limit"`
	ExpireTime   int64  `json:"expire_time"`
}

// CreateClient 创建客户端
func (xc *XrayController) CreateClient(c *gin.Context) {
	var req CreateClientRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误",
		})
		return
	}

	// 检查入站是否存在
	var inbound model.XrayInbound
	if err := xc.db.First(&inbound, req.InboundID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "入站不存在",
		})
		return
	}

	// 生成UUID或密码
	if req.UUID == "" && (inbound.Protocol == "vmess" || inbound.Protocol == "vless") {
		req.UUID = uuid.New().String()
	}
	if req.Password == "" && (inbound.Protocol == "trojan" || inbound.Protocol == "shadowsocks") {
		req.Password = uuid.New().String()
	}

	client := &model.XrayClient{
		InboundID:  req.InboundID,
		Email:      req.Email,
		UUID:       req.UUID,
		Password:   req.Password,
		TotalGB:    req.TrafficLimit,
		ExpireTime: req.ExpireTime,
		Enable:     true,
	}

	if err := xc.db.Create(client).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "创建客户端失败",
		})
		return
	}

	// 重启Xray
	xc.service.Restart()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "创建成功",
		"data":    client,
	})
}

// UpdateClient 更新客户端
func (xc *XrayController) UpdateClient(c *gin.Context) {
	id := c.Param("id")

	var req CreateClientRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误",
		})
		return
	}

	var client model.XrayClient
	if err := xc.db.First(&client, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "客户端不存在",
		})
		return
	}

	// 更新字段
	client.Email = req.Email
	client.TotalGB = req.TrafficLimit
	client.ExpireTime = req.ExpireTime

	if err := xc.db.Save(&client).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "更新失败",
		})
		return
	}

	// 重启Xray
	xc.service.Restart()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "更新成功",
		"data":    client,
	})
}

// DeleteClient 删除客户端
func (xc *XrayController) DeleteClient(c *gin.Context) {
	id := c.Param("id")

	if err := xc.db.Delete(&model.XrayClient{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "删除失败",
		})
		return
	}

	// 重启Xray
	xc.service.Restart()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "删除成功",
	})
}

// ========== Xray管理 ==========

// Restart 重启Xray
func (xc *XrayController) Restart(c *gin.Context) {
	if err := xc.service.Restart(); err != nil {
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

// GetStatus 获取Xray状态
func (xc *XrayController) GetStatus(c *gin.Context) {
	running := xc.service.IsRunning()
	version, _ := xc.service.GetVersion()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"running": running,
			"version": version,
			"enabled": xc.cfg.Xray.Enabled,
		},
	})
}
