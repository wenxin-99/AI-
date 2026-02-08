package controllers

import (
"fmt"
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

// ============ Tunnel Management ============

// ListTunnels 获取隧道列表
func (gc *GostController) ListTunnels(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))

	var tunnels []model.GostTunnel
	var total int64

	offset := (page - 1) * pageSize

	gc.db.Model(&model.GostTunnel{}).Count(&total)
	gc.db.Preload("Forwards").Offset(offset).Limit(pageSize).Find(&tunnels)

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
	Name      string `json:"name" binding:"required"`
	InNodeID  uint   `json:"in_node_id" binding:"required"`
	OutNodeID uint   `json:"out_node_id" binding:"required"`
	Type      int    `json:"type" binding:"required"` // 1=直连, 2=加密隧道
	Protocol  string `json:"protocol" binding:"required"`
	Remark    string `json:"remark"`
	Enable    *bool  `json:"enable"`
}

// CreateTunnel 创建隧道
func (gc *GostController) CreateTunnel(c *gin.Context) {
	var req CreateTunnelRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误: " + err.Error(),
		})
		return
	}

	// Validate nodes exist
	var inNode, outNode model.Node
	if err := gc.db.First(&inNode, req.InNodeID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "入口节点不存在",
		})
		return
	}
	if err := gc.db.First(&outNode, req.OutNodeID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "出口节点不存在",
		})
		return
	}

	// Validate type and protocol
	if req.Type != 1 && req.Type != 2 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "隧道类型必须是 1(直连) 或 2(加密隧道)",
		})
		return
	}

	validProtocols := []string{"tcp", "tls", "ws", "wss", "quic"}
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
			"message": "不支持的协议，支持: tcp, tls, ws, wss, quic",
		})
		return
	}

	tunnel := &model.GostTunnel{
		Name:      req.Name,
		InNodeID:  req.InNodeID,
		OutNodeID: req.OutNodeID,
		Type:      fmt.Sprintf("%d", req.Type),
		Protocol:  req.Protocol,
		Remark:    req.Remark,
		Enable:    true,
	}

	if err := gc.db.Create(tunnel).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "创建隧道失败",
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
	if err := gc.db.Preload("Forwards").First(&tunnel, id).Error; err != nil {
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

	enableVal := tunnel.Enable
	if req.Enable != nil {
		enableVal = *req.Enable
	}

	if err := gc.db.Exec(
		"UPDATE gost_tunnels SET name=?, in_node_id=?, out_node_id=?, type=?, protocol=?, remark=?, enable=?, updated_at=datetime('now') WHERE id=?",
		req.Name, req.InNodeID, req.OutNodeID, fmt.Sprintf("%d", req.Type), req.Protocol, req.Remark, enableVal, id,
	).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "更新失败",
		})
		return
	}

	// Reload to get fresh data
	var updated model.GostTunnel
	gc.db.Preload("Forwards").First(&updated, id)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "更新成功",
		"data":    updated,
	})
}

// DeleteTunnel 删除隧道
func (gc *GostController) DeleteTunnel(c *gin.Context) {
	id := c.Param("id")

	// Delete all forwards first
	gc.db.Where("tunnel_id = ?", id).Delete(&model.GostForward{})

	if err := gc.db.Delete(&model.GostTunnel{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "删除失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "删除成功",
	})
}

// ToggleTunnel 切换隧道状态
func (gc *GostController) ToggleTunnel(c *gin.Context) {
	id := c.Param("id")

	var tunnel model.GostTunnel
	if err := gc.db.First(&tunnel, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "隧道不存在",
		})
		return
	}

	tunnel.Enable = !tunnel.Enable
	gc.db.Save(&tunnel)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    tunnel,
	})
}

// ============ Forward Management ============

// CreateForwardRequest 创建转发规则请求
type CreateForwardRequest struct {
	TunnelID   uint   `json:"tunnel_id" binding:"required"`
	Name       string `json:"name" binding:"required"`
	InPort     int    `json:"in_port" binding:"required"`
	OutPort    int    `json:"out_port" binding:"required"`
	RemoteAddr string `json:"remote_addr" binding:"required"`
	Remark     string `json:"remark"`
	Enable     *bool  `json:"enable"`
}

// ListForwardsByTunnel 获取隧道的转发规则列表
func (gc *GostController) ListForwardsByTunnel(c *gin.Context) {
	tunnelID := c.Param("tunnel_id")

	var forwards []model.GostForward
	gc.db.Where("tunnel_id = ?", tunnelID).Find(&forwards)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    forwards,
	})
}

// ListForwards 获取转发规则列表（通过 query param 过滤）
func (gc *GostController) ListForwards(c *gin.Context) {
	tunnelID := c.Query("tunnel_id")

	var forwards []model.GostForward
	if tunnelID != "" {
		gc.db.Where("tunnel_id = ?", tunnelID).Find(&forwards)
	} else {
		gc.db.Find(&forwards)
	}
	if forwards == nil {
		forwards = []model.GostForward{}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    forwards,
	})
}

// CreateForward 创建转发规则
func (gc *GostController) CreateForward(c *gin.Context) {
	var req CreateForwardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误: " + err.Error(),
		})
		return
	}

	// Validate tunnel exists
	var tunnel model.GostTunnel
	if err := gc.db.First(&tunnel, req.TunnelID).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "隧道不存在",
		})
		return
	}

	// Check port conflict
	var count int64
	gc.db.Model(&model.GostForward{}).Where("in_port = ?", req.InPort).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "入口端口已被使用",
		})
		return
	}

	forward := &model.GostForward{
		TunnelID:   req.TunnelID,
		Name:       req.Name,
		InPort:     req.InPort,
		OutPort:    req.OutPort,
		RemoteAddr: req.RemoteAddr,
		Remark:     req.Remark,
		Enable:     true,
	}

	if err := gc.db.Create(forward).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "创建转发规则失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "创建成功",
		"data":    forward,
	})
}

// UpdateForward 更新转发规则
func (gc *GostController) UpdateForward(c *gin.Context) {
	id := c.Param("id")

	var req CreateForwardRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误",
		})
		return
	}

	var forward model.GostForward
	if err := gc.db.First(&forward, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "转发规则不存在",
		})
		return
	}

	enableVal := forward.Enable
	if req.Enable != nil {
		enableVal = *req.Enable
	}

	if err := gc.db.Exec(
		"UPDATE gost_forwards SET name=?, in_port=?, out_port=?, remote_addr=?, remark=?, enable=?, updated_at=datetime('now') WHERE id=?",
		req.Name, req.InPort, req.OutPort, req.RemoteAddr, req.Remark, enableVal, id,
	).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "更新失败",
		})
		return
	}

	// Reload fresh data
	var updated model.GostForward
	gc.db.First(&updated, id)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "更新成功",
		"data":    updated,
	})
}

// DeleteForward 删除转发规则
func (gc *GostController) DeleteForward(c *gin.Context) {
	id := c.Param("id")

	if err := gc.db.Delete(&model.GostForward{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "删除失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "删除成功",
	})
}

// ToggleForward 切换转发规则状态
func (gc *GostController) ToggleForward(c *gin.Context) {
	id := c.Param("id")

	var forward model.GostForward
	if err := gc.db.First(&forward, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "转发规则不存在",
		})
		return
	}

	forward.Enable = !forward.Enable
	gc.db.Save(&forward)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    forward,
	})
}

// ============ Gost Service Management ============

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

// PreviewConfig 预览节点Gost配置
func (gc *GostController) PreviewConfig(c *gin.Context) {
	nodeIDStr := c.Param("node_id")
	nodeID, err := strconv.ParseUint(nodeIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "节点ID无效",
		})
		return
	}

	// 暂时返回空配置，待实现 GenerateNodeGostConfig 方法
	_ = nodeID // 避免未使用变量警告
	// config, err := gc.service.GenerateNodeGostConfig(uint(nodeID))
	// if err != nil {
	// 	c.JSON(http.StatusInternalServerError, gin.H{
	// 		"success": false,
	// 		"message": "生成配置失败: " + err.Error(),
	// 	})
	// 	return
	// }
	config := map[string]interface{}{"services": []interface{}{}}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    config,
	})
}
