package controllers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/database/model"
	"github.com/uniproxy/panel/services"
	"gorm.io/gorm"
)

type NodeMonitorController struct {
	db             *gorm.DB
	monitorService *services.NodeMonitorService
}

func NewNodeMonitorController(db *gorm.DB, monitorService *services.NodeMonitorService) *NodeMonitorController {
	return &NodeMonitorController{
		db:             db,
		monitorService: monitorService,
	}
}

// GetNodeStatus 获取节点当前状态
func (c *NodeMonitorController) GetNodeStatus(ctx *gin.Context) {
	nodeID, err := strconv.ParseUint(ctx.Param("id"), 10, 32)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "无效的节点ID"})
		return
	}

	monitor, err := c.monitorService.GetNodeStatus(uint(nodeID))
	if err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "未找到监控数据"})
		return
	}

	ctx.JSON(http.StatusOK, monitor)
}

// GetNodeHistory 获取节点历史监控数据
func (c *NodeMonitorController) GetNodeHistory(ctx *gin.Context) {
	nodeID, err := strconv.ParseUint(ctx.Param("id"), 10, 32)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "无效的节点ID"})
		return
	}

	hours := 24 // 默认24小时
	if h := ctx.Query("hours"); h != "" {
		if parsed, err := strconv.Atoi(h); err == nil {
			hours = parsed
		}
	}

	monitors, err := c.monitorService.GetNodeHistory(uint(nodeID), hours)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "获取历史数据失败"})
		return
	}

	ctx.JSON(http.StatusOK, monitors)
}

// CheckNodeNow 立即检查节点
func (c *NodeMonitorController) CheckNodeNow(ctx *gin.Context) {
	nodeID, err := strconv.ParseUint(ctx.Param("id"), 10, 32)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "无效的节点ID"})
		return
	}

	if err := c.monitorService.CheckNodeNow(uint(nodeID)); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "触发检查失败"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "已触发节点检查"})
}

// GetHealthCheckConfig 获取健康检查配置
func (c *NodeMonitorController) GetHealthCheckConfig(ctx *gin.Context) {
	nodeID, err := strconv.ParseUint(ctx.Param("id"), 10, 32)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "无效的节点ID"})
		return
	}

	var config model.NodeHealthCheck
	if err := c.db.Where("node_id = ?", nodeID).First(&config).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			// 返回默认配置
			config = model.NodeHealthCheck{
				NodeID:          uint(nodeID),
				Enabled:         true,
				CheckInterval:   60,
				Timeout:         10,
				CheckXray:       true,
				CheckGost:       true,
				CheckPorts:      true,
				CheckLatency:    true,
				CheckPacketLoss: true,
			}
		} else {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "获取配置失败"})
			return
		}
	}

	ctx.JSON(http.StatusOK, config)
}

// UpdateHealthCheckConfig 更新健康检查配置
func (c *NodeMonitorController) UpdateHealthCheckConfig(ctx *gin.Context) {
	nodeID, err := strconv.ParseUint(ctx.Param("id"), 10, 32)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "无效的节点ID"})
		return
	}

	var req model.NodeHealthCheck
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求数据"})
		return
	}

	req.NodeID = uint(nodeID)

	// 查找或创建配置
	var config model.NodeHealthCheck
	result := c.db.Where("node_id = ?", nodeID).First(&config)
	
	if result.Error == gorm.ErrRecordNotFound {
		// 创建新配置
		if err := c.db.Create(&req).Error; err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "创建配置失败"})
			return
		}
		ctx.JSON(http.StatusOK, req)
	} else if result.Error != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "查询配置失败"})
		return
	} else {
		// 更新现有配置
		if err := c.db.Model(&config).Updates(&req).Error; err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "更新配置失败"})
			return
		}
		ctx.JSON(http.StatusOK, config)
	}
}

// ListAlertRules 获取告警规则列表
func (c *NodeMonitorController) ListAlertRules(ctx *gin.Context) {
	var rules []model.AlertRule
	query := c.db.Model(&model.AlertRule{})

	// 支持按节点ID筛选
	if nodeID := ctx.Query("node_id"); nodeID != "" {
		query = query.Where("node_id = ? OR node_id IS NULL", nodeID)
	}

	if err := query.Order("created_at DESC").Find(&rules).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "获取告警规则失败"})
		return
	}

	ctx.JSON(http.StatusOK, rules)
}

// CreateAlertRule 创建告警规则
func (c *NodeMonitorController) CreateAlertRule(ctx *gin.Context) {
	var rule model.AlertRule
	if err := ctx.ShouldBindJSON(&rule); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求数据"})
		return
	}

	if err := c.db.Create(&rule).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "创建告警规则失败"})
		return
	}

	ctx.JSON(http.StatusOK, rule)
}

// UpdateAlertRule 更新告警规则
func (c *NodeMonitorController) UpdateAlertRule(ctx *gin.Context) {
	ruleID, err := strconv.ParseUint(ctx.Param("id"), 10, 32)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "无效的规则ID"})
		return
	}

	var rule model.AlertRule
	if err := c.db.First(&rule, ruleID).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "告警规则不存在"})
		return
	}

	var req model.AlertRule
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "无效的请求数据"})
		return
	}

	if err := c.db.Model(&rule).Updates(&req).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "更新告警规则失败"})
		return
	}

	ctx.JSON(http.StatusOK, rule)
}

// DeleteAlertRule 删除告警规则
func (c *NodeMonitorController) DeleteAlertRule(ctx *gin.Context) {
	ruleID, err := strconv.ParseUint(ctx.Param("id"), 10, 32)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "无效的规则ID"})
		return
	}

	if err := c.db.Delete(&model.AlertRule{}, ruleID).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "删除告警规则失败"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "删除成功"})
}

// ListAlertLogs 获取告警日志列表
func (c *NodeMonitorController) ListAlertLogs(ctx *gin.Context) {
	var logs []model.AlertLog
	query := c.db.Model(&model.AlertLog{})

	// 支持按节点ID筛选
	if nodeID := ctx.Query("node_id"); nodeID != "" {
		query = query.Where("node_id = ?", nodeID)
	}

	// 支持按严重程度筛选
	if severity := ctx.Query("severity"); severity != "" {
		query = query.Where("severity = ?", severity)
	}

	// 支持按时间范围筛选
	if since := ctx.Query("since"); since != "" {
		if t, err := time.Parse(time.RFC3339, since); err == nil {
			query = query.Where("created_at >= ?", t)
		}
	}

	// 分页
	page := 1
	pageSize := 50
	if p := ctx.Query("page"); p != "" {
		if parsed, err := strconv.Atoi(p); err == nil {
			page = parsed
		}
	}
	if ps := ctx.Query("page_size"); ps != "" {
		if parsed, err := strconv.Atoi(ps); err == nil {
			pageSize = parsed
		}
	}

	var total int64
	query.Count(&total)

	offset := (page - 1) * pageSize
	if err := query.Order("created_at DESC").Offset(offset).Limit(pageSize).Find(&logs).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "获取告警日志失败"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"total":     total,
		"page":      page,
		"page_size": pageSize,
		"data":      logs,
	})
}

// ResolveAlert 标记告警为已解决
func (c *NodeMonitorController) ResolveAlert(ctx *gin.Context) {
	alertID, err := strconv.ParseUint(ctx.Param("id"), 10, 32)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "无效的告警ID"})
		return
	}

	now := time.Now()
	if err := c.db.Model(&model.AlertLog{}).Where("id = ?", alertID).Update("resolved_at", now).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "标记告警失败"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "已标记为已解决"})
}

// GetMonitorStats 获取监控统计数据
func (c *NodeMonitorController) GetMonitorStats(ctx *gin.Context) {
	var stats struct {
		TotalNodes    int64 `json:"total_nodes"`
		OnlineNodes   int64 `json:"online_nodes"`
		OfflineNodes  int64 `json:"offline_nodes"`
		DegradedNodes int64 `json:"degraded_nodes"`
		TotalAlerts   int64 `json:"total_alerts"`
		UnresolvedAlerts int64 `json:"unresolved_alerts"`
	}

	// 统计节点数量
	c.db.Model(&model.Node{}).Count(&stats.TotalNodes)
	c.db.Model(&model.Node{}).Where("status = ?", "online").Count(&stats.OnlineNodes)
	c.db.Model(&model.Node{}).Where("status = ?", "offline").Count(&stats.OfflineNodes)
	c.db.Model(&model.Node{}).Where("status = ?", "degraded").Count(&stats.DegradedNodes)

	// 统计告警数量
	c.db.Model(&model.AlertLog{}).Count(&stats.TotalAlerts)
	c.db.Model(&model.AlertLog{}).Where("resolved_at IS NULL").Count(&stats.UnresolvedAlerts)

	ctx.JSON(http.StatusOK, stats)
}
