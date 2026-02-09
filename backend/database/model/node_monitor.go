package model

import (
	"time"
)

// NodeMonitor 节点监控记录
type NodeMonitor struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	NodeID uint   `gorm:"index;not null" json:"node_id"` // 关联的节点ID
	Status string `gorm:"size:20" json:"status"`         // online, offline, degraded

	// 服务状态
	XrayStatus bool `json:"xray_status"` // Xray服务是否运行
	GostStatus bool `json:"gost_status"` // Gost服务是否运行

	// 端口监听状态
	PortsListening []int `gorm:"serializer:json" json:"ports_listening"` // 正在监听的端口列表

	// 线路质量指标
	Latency    float64 `json:"latency"`     // 延迟 (ms)
	Jitter     float64 `json:"jitter"`      // 抖动/波动 (ms)
	PacketLoss float64 `json:"packet_loss"` // 丢包率 (%)

	// 错误信息
	ErrorMessage string `gorm:"type:text" json:"error_message,omitempty"`
}

func (NodeMonitor) TableName() string {
	return "node_monitors"
}

// AlertRule 告警规则
type AlertRule struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	Name        string `gorm:"size:100;not null" json:"name"`        // 规则名称
	Description string `gorm:"type:text" json:"description"`         // 规则描述
	Enabled     bool   `gorm:"default:true" json:"enabled"`          // 是否启用
	NodeID      *uint  `gorm:"index" json:"node_id,omitempty"`       // 关联节点ID (null表示全局规则)
	
	// 触发条件
	TriggerType  string  `gorm:"size:50;not null" json:"trigger_type"`  // offline, service_down, high_latency, high_packet_loss, high_jitter
	Threshold    float64 `json:"threshold,omitempty"`                   // 阈值 (根据类型不同有不同含义)
	Duration     int     `json:"duration"`                              // 持续时间(秒)，超过此时间才触发
	
	// 通知方式
	NotifyWebhook bool   `gorm:"default:false" json:"notify_webhook"`
	WebhookURL    string `gorm:"type:text" json:"webhook_url,omitempty"`
	NotifyEmail   bool   `gorm:"default:false" json:"notify_email"`
	EmailTo       string `gorm:"size:255" json:"email_to,omitempty"`
	
	// 冷却时间 (分钟)，避免频繁告警
	CooldownMinutes int `gorm:"default:30" json:"cooldown_minutes"`
}

func (AlertRule) TableName() string {
	return "alert_rules"
}

// AlertLog 告警日志
type AlertLog struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`

	NodeID      uint   `gorm:"index;not null" json:"node_id"`
	NodeName    string `gorm:"size:100" json:"node_name"`
	RuleID      uint   `gorm:"index" json:"rule_id"`
	RuleName    string `gorm:"size:100" json:"rule_name"`
	
	AlertType   string `gorm:"size:50;not null" json:"alert_type"` // 告警类型
	Severity    string `gorm:"size:20;not null" json:"severity"`   // critical, warning, info
	Message     string `gorm:"type:text;not null" json:"message"`  // 告警消息
	
	// 触发时的指标值
	MetricValue float64 `json:"metric_value,omitempty"`
	
	// 通知状态
	NotifiedWebhook bool      `json:"notified_webhook"`
	NotifiedEmail   bool      `json:"notified_email"`
	ResolvedAt      *time.Time `json:"resolved_at,omitempty"` // 恢复时间
}

func (AlertLog) TableName() string {
	return "alert_logs"
}

// NodeHealthCheck 节点健康检查配置
type NodeHealthCheck struct {
	ID        uint      `gorm:"primarykey" json:"id"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	NodeID uint `gorm:"uniqueIndex;not null" json:"node_id"` // 关联节点ID
	
	// 检查配置
	Enabled         bool `gorm:"default:true" json:"enabled"`          // 是否启用健康检查
	CheckInterval   int  `gorm:"default:60" json:"check_interval"`     // 检查间隔(秒)
	Timeout         int  `gorm:"default:10" json:"timeout"`            // 超时时间(秒)
	
	// 检查方式
	CheckXray       bool `gorm:"default:true" json:"check_xray"`       // 检查Xray服务
	CheckGost       bool `gorm:"default:true" json:"check_gost"`       // 检查Gost服务
	CheckPorts      bool `gorm:"default:true" json:"check_ports"`      // 检查端口监听
	CheckLatency    bool `gorm:"default:true" json:"check_latency"`    // 检查延迟
	CheckPacketLoss bool `gorm:"default:true" json:"check_packet_loss"` // 检查丢包率
	
	// 最后检查结果
	LastCheckAt     *time.Time `json:"last_check_at,omitempty"`
	LastCheckStatus string     `gorm:"size:20" json:"last_check_status,omitempty"` // success, failed
	ConsecutiveFails int       `json:"consecutive_fails"` // 连续失败次数
}

func (NodeHealthCheck) TableName() string {
	return "node_health_checks"
}
