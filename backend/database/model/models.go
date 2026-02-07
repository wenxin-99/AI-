package model

import (
	"time"

	"gorm.io/gorm"
)

// User 用户模型
type User struct {
	ID               uint           `gorm:"primaryKey" json:"id"`
	Username         string         `gorm:"uniqueIndex;size:50;not null" json:"username"`
	Password         string         `gorm:"size:255;not null" json:"-"`
	Email            string         `gorm:"size:100" json:"email"`
	IsAdmin          bool           `gorm:"default:false" json:"is_admin"`
	Enabled          bool           `gorm:"default:true" json:"enabled"`
	Role             string         `gorm:"size:20;default:user" json:"role"` // admin, user, node_admin
	Status           string         `gorm:"size:20;default:active" json:"status"` // active, disabled, suspended
	TrafficLimit     int64          `gorm:"default:0" json:"traffic_limit"`
	TrafficUsed      int64          `gorm:"default:0" json:"traffic_used"`
	ExpireTime       *time.Time     `json:"expire_time"`
	TwoFactorEnabled bool           `gorm:"default:false" json:"two_factor_enabled"`
	TwoFactorSecret  string         `gorm:"size:100" json:"-"`
	APIToken         string         `gorm:"size:100" json:"api_token,omitempty"`
	CreatedAt        time.Time      `json:"created_at"`
	UpdatedAt        time.Time      `json:"updated_at"`
	DeletedAt        gorm.DeletedAt `gorm:"index" json:"-"`
}

// XrayInbound Xray入站配置
type XrayInbound struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	UserID         uint           `json:"user_id"`
	Remark         string         `gorm:"size:100" json:"remark"`
	Enable         bool           `gorm:"default:true" json:"enable"`
	Listen         string         `gorm:"size:50" json:"listen"`
	Port           int            `json:"port"`
	Protocol       string         `gorm:"size:50" json:"protocol"` // vless, vmess, trojan, shadowsocks
	Settings       string         `gorm:"type:text" json:"settings"` // JSON配置
	StreamSettings string         `gorm:"type:text" json:"stream_settings"` // 传输配置JSON
	Sniffing       string         `gorm:"type:text" json:"sniffing"` // 流量探测JSON
	Tag            string         `gorm:"size:100" json:"tag"`
	TrafficUp      int64          `gorm:"default:0" json:"traffic_up"`
	TrafficDown    int64          `gorm:"default:0" json:"traffic_down"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
	
	// 关联
	Clients []XrayClient `gorm:"foreignKey:InboundID" json:"clients,omitempty"`
}

// XrayClient Xray客户端
type XrayClient struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	InboundID   uint           `json:"inbound_id"`
	Email       string         `gorm:"size:100" json:"email"`
	UUID        string         `gorm:"size:100" json:"uuid"`
	Password    string         `gorm:"size:100" json:"password,omitempty"`
	Flow        string         `gorm:"size:50" json:"flow,omitempty"`
	LimitIP     int            `gorm:"default:0" json:"limit_ip"`
	TotalGB     int64          `gorm:"default:0" json:"total_gb"`
	ExpireTime  int64          `gorm:"default:0" json:"expire_time"`
	Enable      bool           `gorm:"default:true" json:"enable"`
	TrafficUp   int64          `gorm:"default:0" json:"traffic_up"`
	TrafficDown int64          `gorm:"default:0" json:"traffic_down"`
	ResetDay    int            `gorm:"default:0" json:"reset_day"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// GostTunnel Gost隧道
type GostTunnel struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `json:"user_id"`
	Name        string         `gorm:"size:100" json:"name"`
	Protocol    string         `gorm:"size:20" json:"protocol"` // tcp, udp, http, https, socks5
	Type        string         `gorm:"size:20" json:"type"` // tcp, udp
	Mode        string         `gorm:"size:20" json:"mode"` // port_forward, tunnel
	LocalPort   int            `json:"local_port"`
	RemoteAddr  string         `gorm:"size:255" json:"remote_addr"` // host:port
	RemoteHost  string         `gorm:"size:255" json:"remote_host"`
	RemotePort  int            `json:"remote_port"`
	Username    string         `gorm:"size:100" json:"username"`
	Password       string         `gorm:"size:100" json:"password"`
	EnableTLS      bool           `gorm:"default:false" json:"enable_tls"`
	CertificateID  uint           `gorm:"default:0" json:"certificate_id"`
	TLSServerName  string         `gorm:"size:255" json:"tls_server_name"`
	SkipVerify     bool           `gorm:"default:false" json:"skip_verify"`
	Enable         bool           `gorm:"default:true" json:"enable"`
	SpeedLimit  int            `gorm:"default:0" json:"speed_limit"` // KB/s
	TrafficMode string         `gorm:"size:20;default:both" json:"traffic_mode"` // upload, download, both
	TrafficUp   int64          `gorm:"default:0" json:"traffic_up"`
	TrafficDown int64          `gorm:"default:0" json:"traffic_down"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// Node 节点
type Node struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	Name          string         `gorm:"size:100" json:"name"`
	Host          string         `gorm:"size:255" json:"host"`
	Port          int            `json:"port"`
	APIToken      string         `gorm:"size:100" json:"api_token"`
	Type          string         `gorm:"size:20" json:"type"` // xray, gost, both
	Status        string         `gorm:"size:20;default:offline" json:"status"` // online, offline, error
	CPUUsage      float64        `gorm:"default:0" json:"cpu_usage"`
	MemoryUsage   float64        `gorm:"default:0" json:"memory_usage"`
	TrafficUp     int64          `gorm:"default:0" json:"traffic_up"`
	TrafficDown   int64          `gorm:"default:0" json:"traffic_down"`
	LastHeartbeat *time.Time     `json:"last_heartbeat"`
	CreatedAt     time.Time      `json:"created_at"`
	UpdatedAt     time.Time      `json:"updated_at"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

// TrafficLog 流量日志
type TrafficLog struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `json:"user_id"`
	Inbound      string    `gorm:"size:100" json:"inbound"` // 入站标识
	ResourceType string    `gorm:"size:20" json:"resource_type"` // xray_inbound, xray_client, gost_tunnel
	ResourceID   uint      `json:"resource_id"`
	Upload       int64     `json:"upload"`
	Download     int64     `json:"download"`
	TrafficUp    int64     `json:"traffic_up"`
	TrafficDown  int64     `json:"traffic_down"`
	RecordedAt   time.Time `gorm:"index" json:"recorded_at"`
}

// Setting 系统设置
type Setting struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Key       string    `gorm:"uniqueIndex;size:100;not null" json:"key"`
	Value     string    `gorm:"type:text" json:"value"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Subscription 订阅
type Subscription struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `json:"user_id"`
	Token       string         `gorm:"uniqueIndex;size:100" json:"token"`
	Remark      string         `gorm:"size:100" json:"remark"`
	Enable      bool           `gorm:"default:true" json:"enable"`
	AccessCount int            `gorm:"default:0" json:"access_count"`
	LastAccess  *time.Time     `json:"last_access"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// TableName 指定表名
func (User) TableName() string           { return "users" }
func (XrayInbound) TableName() string    { return "xray_inbounds" }
func (XrayClient) TableName() string     { return "xray_clients" }
func (GostTunnel) TableName() string     { return "gost_tunnels" }
func (Node) TableName() string           { return "nodes" }
func (TrafficLog) TableName() string     { return "traffic_logs" }
func (Setting) TableName() string        { return "settings" }
func (Subscription) TableName() string   { return "subscriptions" }
