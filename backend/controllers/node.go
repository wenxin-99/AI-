package controllers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/database/model"
	"github.com/uniproxy/panel/services"
	"gorm.io/gorm"
)

// NodeController 节点控制器
type NodeController struct {
	db          *gorm.DB
	nodeService *services.NodeService
}

// NewNodeController 创建节点控制器
func NewNodeController(db *gorm.DB) *NodeController {
	return &NodeController{
		db:          db,
		nodeService: services.NewNodeService(db),
	}
}

// CreateNode 创建节点
func (nc *NodeController) CreateNode(c *gin.Context) {
	var node model.Node
	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误: " + err.Error(),
		})
		return
	}

	if err := nc.nodeService.CreateNode(&node); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "创建节点失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "创建节点成功",
		"data":    node,
	})
}

// UpdateNode 更新节点
func (nc *NodeController) UpdateNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	var node model.Node
	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误: " + err.Error(),
		})
		return
	}

	node.ID = uint(id)
	if err := nc.nodeService.UpdateNode(&node); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "更新节点失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "更新节点成功",
		"data":    node,
	})
}

// DeleteNode 删除节点
func (nc *NodeController) DeleteNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	if err := nc.nodeService.DeleteNode(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "删除节点失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "删除节点成功",
	})
}

// GetNode 获取节点
func (nc *NodeController) GetNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	node, err := nc.nodeService.GetNode(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "节点不存在",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "获取节点成功",
		"data":    node,
	})
}

// ListNodes 获取节点列表
func (nc *NodeController) ListNodes(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

	nodes, total, err := nc.nodeService.ListNodes(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "获取节点列表失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "获取节点列表成功",
		"data": gin.H{
			"nodes": nodes,
			"total": total,
			"page":  page,
		},
	})
}

// ToggleNode 切换节点状态
func (nc *NodeController) ToggleNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	if err := nc.nodeService.ToggleNode(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "切换节点状态失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "切换节点状态成功",
	})
}

// SyncNode 同步节点配置
func (nc *NodeController) SyncNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	if err := nc.nodeService.SyncNodeConfig(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "同步节点配置失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "同步节点配置成功",
	})
}

// GetNodeStats 获取节点统计
func (nc *NodeController) GetNodeStats(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	stats, err := nc.nodeService.GetNodeStats(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "获取节点统计失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "获取节点统计成功",
		"data":    stats,
	})
}

// CheckNodeHealth 检查节点健康
func (nc *NodeController) CheckNodeHealth(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	healthy, err := nc.nodeService.CheckNodeHealth(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "检查节点健康失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "检查节点健康成功",
		"data": gin.H{
			"healthy": healthy,
		},
	})
}

// BatchSyncNodes 批量同步节点
func (nc *NodeController) BatchSyncNodes(c *gin.Context) {
	var req struct {
		NodeIDs []uint `json:"node_ids"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误: " + err.Error(),
		})
		return
	}

	if err := nc.nodeService.BatchSyncNodes(req.NodeIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "批量同步节点失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "批量同步节点成功",
	})
}
