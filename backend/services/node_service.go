package services

import (
	"fmt"
	"time"

	"github.com/uniproxy/panel/database/model"
	"gorm.io/gorm"
)

// NodeService 节点服务
type NodeService struct {
	db *gorm.DB
}

// NewNodeService 创建节点服务
func NewNodeService(db *gorm.DB) *NodeService {
	return &NodeService{db: db}
}

// CreateNode 创建节点
func (ns *NodeService) CreateNode(node *model.Node) error {
	return ns.db.Create(node).Error
}

// UpdateNode 更新节点
func (ns *NodeService) UpdateNode(node *model.Node) error {
	return ns.db.Save(node).Error
}

// DeleteNode 删除节点
func (ns *NodeService) DeleteNode(id uint) error {
	return ns.db.Delete(&model.Node{}, id).Error
}

// GetNode 获取节点
func (ns *NodeService) GetNode(id uint) (*model.Node, error) {
	var node model.Node
	if err := ns.db.First(&node, id).Error; err != nil {
		return nil, err
	}
	return &node, nil
}

// ListNodes 获取节点列表
func (ns *NodeService) ListNodes(page, pageSize int) ([]model.Node, int64, error) {
	var nodes []model.Node
	var total int64

	offset := (page - 1) * pageSize

	if err := ns.db.Model(&model.Node{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := ns.db.Offset(offset).Limit(pageSize).Find(&nodes).Error; err != nil {
		return nil, 0, err
	}

	return nodes, total, nil
}

// ToggleNode 切换节点状态
func (ns *NodeService) ToggleNode(id uint) error {
	var node model.Node
	if err := ns.db.First(&node, id).Error; err != nil {
		return err
	}

	// Node 模型没有 Enable 字段，使用 Status 字段代替
	if node.Status == "online" {
		node.Status = "offline"
	} else {
		node.Status = "online"
	}
	return ns.db.Save(&node).Error
}

// UpdateNodeStatus 更新节点状态
func (ns *NodeService) UpdateNodeStatus(id uint, status string, cpu, memory, disk float64) error {
	updates := map[string]interface{}{
		"status":     status,
		"cpu_usage":  cpu,
		"mem_usage":  memory,
		"disk_usage": disk,
		"updated_at": time.Now(),
	}

	return ns.db.Model(&model.Node{}).Where("id = ?", id).Updates(updates).Error
}

// GetNodesByType 根据类型获取节点
func (ns *NodeService) GetNodesByType(nodeType string) ([]model.Node, error) {
	var nodes []model.Node
	if err := ns.db.Where("type = ? AND enable = ?", nodeType, true).Find(&nodes).Error; err != nil {
		return nil, err
	}
	return nodes, nil
}

// SyncNodeConfig 同步节点配置
func (ns *NodeService) SyncNodeConfig(nodeID uint) error {
	node, err := ns.GetNode(nodeID)
	if err != nil {
		return err
	}

	if node.Status == "offline" {
		return fmt.Errorf("节点已离线")
	}

	// TODO: 实现配置同步逻辑
	// 1. 获取该节点的所有入站配置
	// 2. 生成配置文件
	// 3. 通过 API 或 SSH 推送到远程节点
	// 4. 重启远程节点服务

	return nil
}

// GetNodeStats 获取节点统计信息
func (ns *NodeService) GetNodeStats(nodeID uint) (map[string]interface{}, error) {
	var stats map[string]interface{}

	// 获取节点信息
	node, err := ns.GetNode(nodeID)
	if err != nil {
		return nil, err
	}

	// 获取节点的入站数量
	var inboundCount int64
	if node.Type == "xray" {
		ns.db.Model(&model.XrayInbound{}).Where("node_id = ?", nodeID).Count(&inboundCount)
	} else if node.Type == "gost" {
		ns.db.Model(&model.GostTunnel{}).Where("node_id = ?", nodeID).Count(&inboundCount)
	}

	// 获取节点的流量统计
	var totalUp, totalDown int64
	ns.db.Model(&model.TrafficLog{}).
		Where("node_id = ?", nodeID).
		Select("COALESCE(SUM(upload), 0) as total_up, COALESCE(SUM(download), 0) as total_down").
		Row().Scan(&totalUp, &totalDown)

	stats = map[string]interface{}{
		"node_id":       nodeID,
		"name":          node.Name,
		"type":          node.Type,
		"status":        node.Status,
		"inbound_count": inboundCount,
		"traffic_up":    totalUp,
		"traffic_down":  totalDown,
		"cpu_usage":     node.CPUUsage,
		"memory_usage":  node.MemoryUsage,
	}

	return stats, nil
}

// CheckNodeHealth 检查节点健康状态
func (ns *NodeService) CheckNodeHealth(nodeID uint) (bool, error) {
	node, err := ns.GetNode(nodeID)
	if err != nil {
		return false, err
	}

	if node.Status == "offline" {
		return false, nil
	}

	// TODO: 实现健康检查逻辑
	// 1. Ping 节点
	// 2. 检查 API 端口
	// 3. 检查服务状态

	// 更新节点状态
	status := "online"
	if err := ns.UpdateNodeStatus(nodeID, status, 0, 0, 0); err != nil {
		return false, err
	}

	return true, nil
}

// BatchSyncNodes 批量同步节点
func (ns *NodeService) BatchSyncNodes(nodeIDs []uint) error {
	for _, nodeID := range nodeIDs {
		if err := ns.SyncNodeConfig(nodeID); err != nil {
			return fmt.Errorf("同步节点 %d 失败: %v", nodeID, err)
		}
	}
	return nil
}
