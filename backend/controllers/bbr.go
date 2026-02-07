package controllers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/services"
)

type BBRController struct {
	bbrService *services.BBRService
}

func NewBBRController() *BBRController {
	return &BBRController{
		bbrService: &services.BBRService{},
	}
}

// GetStatus 获取BBR状态
func (c *BBRController) GetStatus(ctx *gin.Context) {
	status, err := c.bbrService.GetBBRStatus()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "获取BBR状态失败: " + err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    status,
	})
}

// Enable 启用BBR
func (c *BBRController) Enable(ctx *gin.Context) {
	var req struct {
		Algorithm string `json:"algorithm"` // bbr, bbr2, bbr3
	}

	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误",
		})
		return
	}

	if req.Algorithm == "" {
		req.Algorithm = "bbr"
	}

	if err := c.bbrService.EnableBBR(req.Algorithm); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "启用BBR失败: " + err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "BBR已启用",
	})
}

// Disable 禁用BBR
func (c *BBRController) Disable(ctx *gin.Context) {
	if err := c.bbrService.DisableBBR(); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "禁用BBR失败: " + err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "BBR已禁用",
	})
}

// OptimizeProtocol 为协议优化BBR
func (c *BBRController) OptimizeProtocol(ctx *gin.Context) {
	var req struct {
		Protocol   string `json:"protocol"`    // vmess, vless, trojan, ss, http, ws, grpc
		TunnelType string `json:"tunnel_type"` // tcp, kcp, ws, http, grpc
	}

	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误",
		})
		return
	}

	if err := c.bbrService.OptimizeForProtocol(req.Protocol, req.TunnelType); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "优化失败: " + err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "协议优化完成",
	})
}

// GetMetrics 获取网络性能指标
func (c *BBRController) GetMetrics(ctx *gin.Context) {
	metrics, err := c.bbrService.MonitorAndOptimize()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "获取指标失败: " + err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    metrics,
	})
}

// AutoOptimize 自动优化
func (c *BBRController) AutoOptimize(ctx *gin.Context) {
	// 启用BBR
	if err := c.bbrService.EnableBBR("bbr"); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "自动优化失败: " + err.Error(),
		})
		return
	}

	// 监控并优化
	metrics, err := c.bbrService.MonitorAndOptimize()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "性能监控失败: " + err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "自动优化完成",
		"data":    metrics,
	})
}
