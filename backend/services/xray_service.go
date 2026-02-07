package services

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"

	"github.com/uniproxy/panel/config"
	"github.com/uniproxy/panel/database/model"
	"gorm.io/gorm"
)

// XrayService Xray服务
type XrayService struct {
	cfg    *config.Config
	db     *gorm.DB
	mu     sync.Mutex
	cmd    *exec.Cmd
	running bool
}

// NewXrayService 创建Xray服务
func NewXrayService(cfg *config.Config, db *gorm.DB) *XrayService {
	return &XrayService{
		cfg: cfg,
		db:  db,
	}
}

// XrayConfig Xray配置结构
type XrayConfig struct {
	Log       *LogConfig       `json:"log,omitempty"`
	API       *APIConfig       `json:"api,omitempty"`
	Inbounds  []InboundConfig  `json:"inbounds"`
	Outbounds []OutboundConfig `json:"outbounds"`
	Routing   *RoutingConfig   `json:"routing,omitempty"`
	Stats     *StatsConfig     `json:"stats,omitempty"`
}

// LogConfig 日志配置
type LogConfig struct {
	Access   string `json:"access,omitempty"`
	Error    string `json:"error,omitempty"`
	Loglevel string `json:"loglevel,omitempty"`
}

// APIConfig API配置
type APIConfig struct {
	Tag      string   `json:"tag"`
	Services []string `json:"services"`
}

// InboundConfig 入站配置
type InboundConfig struct {
	Tag      string                 `json:"tag"`
	Port     int                    `json:"port"`
	Protocol string                 `json:"protocol"`
	Listen   string                 `json:"listen,omitempty"`
	Settings map[string]interface{} `json:"settings,omitempty"`
	Sniffing *SniffingConfig        `json:"sniffing,omitempty"`
}

// SniffingConfig 流量嗅探配置
type SniffingConfig struct {
	Enabled      bool     `json:"enabled"`
	DestOverride []string `json:"destOverride,omitempty"`
}

// OutboundConfig 出站配置
type OutboundConfig struct {
	Tag      string                 `json:"tag"`
	Protocol string                 `json:"protocol"`
	Settings map[string]interface{} `json:"settings,omitempty"`
}

// RoutingConfig 路由配置
type RoutingConfig struct {
	DomainStrategy string        `json:"domainStrategy,omitempty"`
	Rules          []RoutingRule `json:"rules,omitempty"`
}

// RoutingRule 路由规则
type RoutingRule struct {
	Type        string   `json:"type"`
	InboundTag  []string `json:"inboundTag,omitempty"`
	OutboundTag string   `json:"outboundTag"`
}

// StatsConfig 统计配置
type StatsConfig struct{}

// GenerateConfig 生成Xray配置文件
func (xs *XrayService) GenerateConfig() error {
	xs.mu.Lock()
	defer xs.mu.Unlock()

	// 查询所有启用的入站
	var inbounds []model.XrayInbound
	if err := xs.db.Where("enabled = ?", true).Find(&inbounds).Error; err != nil {
		return fmt.Errorf("查询入站失败: %v", err)
	}

	// 构建配置
	xrayConfig := &XrayConfig{
		Log: &LogConfig{
			Access:   xs.cfg.Xray.LogPath,
			Error:    xs.cfg.Xray.LogPath,
			Loglevel: "warning",
		},
		API: &APIConfig{
			Tag:      "api",
			Services: []string{"HandlerService", "StatsService", "LoggerService"},
		},
		Inbounds:  make([]InboundConfig, 0),
		Outbounds: []OutboundConfig{
			{
				Tag:      "direct",
				Protocol: "freedom",
				Settings: map[string]interface{}{},
			},
			{
				Tag:      "blocked",
				Protocol: "blackhole",
				Settings: map[string]interface{}{},
			},
		},
		Routing: &RoutingConfig{
			DomainStrategy: "AsIs",
			Rules: []RoutingRule{
				{
					Type:        "field",
					InboundTag:  []string{"api"},
					OutboundTag: "api",
				},
			},
		},
		Stats: &StatsConfig{},
	}

	// 添加API入站
	xrayConfig.Inbounds = append(xrayConfig.Inbounds, InboundConfig{
		Tag:      "api",
		Port:     xs.cfg.Xray.APIPort,
		Protocol: "dokodemo-door",
		Listen:   "127.0.0.1",
		Settings: map[string]interface{}{
			"address": "127.0.0.1",
		},
	})

	// 添加用户入站
	for _, inbound := range inbounds {
		// 查询该入站的客户端
		var clients []model.XrayClient
		xs.db.Where("inbound_id = ? AND enabled = ?", inbound.ID, true).Find(&clients)

		// 根据协议生成配置
		inboundConfig := xs.buildInboundConfig(&inbound, clients)
		xrayConfig.Inbounds = append(xrayConfig.Inbounds, inboundConfig)
	}

	// 写入配置文件
	configData, err := json.MarshalIndent(xrayConfig, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化配置失败: %v", err)
	}

	// 确保配置目录存在
	configDir := filepath.Dir(xs.cfg.Xray.ConfigPath)
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("创建配置目录失败: %v", err)
	}

	if err := os.WriteFile(xs.cfg.Xray.ConfigPath, configData, 0644); err != nil {
		return fmt.Errorf("写入配置文件失败: %v", err)
	}

	return nil
}

// buildInboundConfig 构建入站配置
func (xs *XrayService) buildInboundConfig(inbound *model.XrayInbound, clients []model.XrayClient) InboundConfig {
	config := InboundConfig{
		Tag:      fmt.Sprintf("inbound-%d", inbound.ID),
		Port:     inbound.Port,
		Protocol: inbound.Protocol,
		Listen:   inbound.Listen,
		Sniffing: &SniffingConfig{
			Enabled:      true,
			DestOverride: []string{"http", "tls"},
		},
	}

	// 根据协议构建settings
	switch inbound.Protocol {
	case "vmess":
		config.Settings = xs.buildVMessSettings(clients)
	case "vless":
		config.Settings = xs.buildVLessSettings(clients)
	case "trojan":
		config.Settings = xs.buildTrojanSettings(clients)
	case "shadowsocks":
		config.Settings = xs.buildShadowsocksSettings(inbound, clients)
	}

	return config
}

// buildVMessSettings 构建VMess配置
func (xs *XrayService) buildVMessSettings(clients []model.XrayClient) map[string]interface{} {
	clientConfigs := make([]map[string]interface{}, 0)
	for _, client := range clients {
		clientConfigs = append(clientConfigs, map[string]interface{}{
			"id":      client.UUID,
			"alterId": 0,
			"email":   client.Email,
		})
	}

	return map[string]interface{}{
		"clients": clientConfigs,
	}
}

// buildVLessSettings 构建VLESS配置
func (xs *XrayService) buildVLessSettings(clients []model.XrayClient) map[string]interface{} {
	clientConfigs := make([]map[string]interface{}, 0)
	for _, client := range clients {
		clientConfigs = append(clientConfigs, map[string]interface{}{
			"id":    client.UUID,
			"email": client.Email,
		})
	}

	return map[string]interface{}{
		"clients":    clientConfigs,
		"decryption": "none",
	}
}

// buildTrojanSettings 构建Trojan配置
func (xs *XrayService) buildTrojanSettings(clients []model.XrayClient) map[string]interface{} {
	clientConfigs := make([]map[string]interface{}, 0)
	for _, client := range clients {
		clientConfigs = append(clientConfigs, map[string]interface{}{
			"password": client.Password,
			"email":    client.Email,
		})
	}

	return map[string]interface{}{
		"clients": clientConfigs,
	}
}

// buildShadowsocksSettings 构建Shadowsocks配置
func (xs *XrayService) buildShadowsocksSettings(inbound *model.XrayInbound, clients []model.XrayClient) map[string]interface{} {
	// Shadowsocks通常使用单一密码
	password := ""
	if len(clients) > 0 {
		password = clients[0].Password
	}

	return map[string]interface{}{
		"method":   "aes-256-gcm",
		"password": password,
		"network":  "tcp,udp",
	}
}

// Start 启动Xray
func (xs *XrayService) Start() error {
	xs.mu.Lock()
	defer xs.mu.Unlock()

	if xs.running {
		return fmt.Errorf("Xray已在运行")
	}

	// 生成配置
	if err := xs.GenerateConfig(); err != nil {
		return fmt.Errorf("生成配置失败: %v", err)
	}

	// 启动进程
	xs.cmd = exec.Command(xs.cfg.Xray.BinaryPath, "run", "-config", xs.cfg.Xray.ConfigPath)
	xs.cmd.Stdout = os.Stdout
	xs.cmd.Stderr = os.Stderr

	if err := xs.cmd.Start(); err != nil {
		return fmt.Errorf("启动Xray失败: %v", err)
	}

	xs.running = true
	return nil
}

// Stop 停止Xray
func (xs *XrayService) Stop() error {
	xs.mu.Lock()
	defer xs.mu.Unlock()

	if !xs.running || xs.cmd == nil {
		return fmt.Errorf("Xray未运行")
	}

	if err := xs.cmd.Process.Kill(); err != nil {
		return fmt.Errorf("停止Xray失败: %v", err)
	}

	xs.cmd.Wait()
	xs.running = false
	xs.cmd = nil

	return nil
}

// Restart 重启Xray
func (xs *XrayService) Restart() error {
	if xs.IsRunning() {
		if err := xs.Stop(); err != nil {
			return err
		}
	}
	return xs.Start()
}

// IsRunning 检查Xray是否运行
func (xs *XrayService) IsRunning() bool {
	xs.mu.Lock()
	defer xs.mu.Unlock()
	return xs.running
}

// GetVersion 获取Xray版本
func (xs *XrayService) GetVersion() (string, error) {
	cmd := exec.Command(xs.cfg.Xray.BinaryPath, "version")
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(output), nil
}
