package services

import (
	"fmt"
	"sync"
	"time"

	"github.com/uniproxy/panel/database/model"
	"gorm.io/gorm"
)

// AutoBBROptimizer 自动BBR优化器
type AutoBBROptimizer struct {
	db         *gorm.DB
	bbrService *BBRService
	running    bool
	mu         sync.Mutex
	stopChan   chan struct{}
}

func NewAutoBBROptimizer(db *gorm.DB) *AutoBBROptimizer {
	return &AutoBBROptimizer{
		db:         db,
		bbrService: &BBRService{},
		stopChan:   make(chan struct{}),
	}
}

// Start 启动自动优化
func (o *AutoBBROptimizer) Start() error {
	o.mu.Lock()
	defer o.mu.Unlock()

	if o.running {
		return fmt.Errorf("优化器已在运行")
	}

	o.running = true
	go o.optimizeLoop()

	return nil
}

// Stop 停止自动优化
func (o *AutoBBROptimizer) Stop() {
	o.mu.Lock()
	defer o.mu.Unlock()

	if !o.running {
		return
	}

	o.running = false
	close(o.stopChan)
}

// optimizeLoop 优化循环
func (o *AutoBBROptimizer) optimizeLoop() {
	ticker := time.NewTicker(5 * time.Minute) // 每5分钟优化一次
	defer ticker.Stop()

	// 首次启动时立即优化
	o.performOptimization()

	for {
		select {
		case <-ticker.C:
			o.performOptimization()
		case <-o.stopChan:
			return
		}
	}
}

// performOptimization 执行优化
func (o *AutoBBROptimizer) performOptimization() {
	// 1. 启用系统级BBR
	if err := o.bbrService.EnableBBR("bbr"); err != nil {
		fmt.Printf("启用BBR失败: %v\n", err)
	}

	// 2. 获取所有活跃的Xray入站
	var xrayInbounds []model.XrayInbound
	if err := o.db.Where("enable = ?", true).Find(&xrayInbounds).Error; err == nil {
		for _, inbound := range xrayInbounds {
			o.optimizeXrayInbound(&inbound)
		}
	}

	// 3. 获取所有活跃的Gost隧道
	var gostTunnels []model.GostTunnel
	if err := o.db.Where("enable = ?", true).Find(&gostTunnels).Error; err == nil {
		for _, tunnel := range gostTunnels {
			o.optimizeGostTunnel(&tunnel)
		}
	}

	// 4. 监控并优化网络性能
	if metrics, err := o.bbrService.MonitorAndOptimize(); err == nil {
		fmt.Printf("网络性能监控: RTT=%.2fms, 带宽=%.2fMbps, 丢包率=%.2f%%\n",
			metrics.RTT, metrics.Bandwidth, metrics.PacketLoss)
	}
}

// optimizeXrayInbound 优化Xray入站
func (o *AutoBBROptimizer) optimizeXrayInbound(inbound *model.XrayInbound) {
	protocol := inbound.Protocol
	streamSettings := inbound.StreamSettings

	// 解析传输协议
	tunnelType := "tcp" // 默认
	if streamSettings != "" {
		// 这里应该解析JSON获取network类型
		// 简化处理，实际应使用JSON解析
		if contains(streamSettings, "ws") {
			tunnelType = "ws"
		} else if contains(streamSettings, "grpc") {
			tunnelType = "grpc"
		} else if contains(streamSettings, "kcp") {
			tunnelType = "kcp"
		} else if contains(streamSettings, "http") {
			tunnelType = "http"
		}
	}

	// 应用协议优化
	if err := o.bbrService.OptimizeForProtocol(protocol, tunnelType); err != nil {
		fmt.Printf("优化Xray入站 %s 失败: %v\n", inbound.Tag, err)
	} else {
		fmt.Printf("已优化Xray入站: %s (协议=%s, 传输=%s)\n", inbound.Tag, protocol, tunnelType)
	}
}

// optimizeGostTunnel 优化Gost隧道
func (o *AutoBBROptimizer) optimizeGostTunnel(tunnel *model.GostTunnel) {
	protocol := tunnel.Protocol
	if protocol == "" {
		protocol = "tcp"
	}

	// 应用协议优化
	if err := o.bbrService.OptimizeForProtocol(protocol, ""); err != nil {
		fmt.Printf("优化Gost隧道 %s 失败: %v\n", tunnel.Name, err)
	} else {
		fmt.Printf("已优化Gost隧道: %s (协议=%s)\n", tunnel.Name, protocol)
	}
}

// OptimizeAllProtocols 优化所有协议
func (o *AutoBBROptimizer) OptimizeAllProtocols() error {
	protocols := []struct {
		name       string
		tunnelType string
	}{
		{"vmess", "tcp"},
		{"vmess", "ws"},
		{"vmess", "grpc"},
		{"vless", "tcp"},
		{"vless", "ws"},
		{"vless", "grpc"},
		{"trojan", "tcp"},
		{"trojan", "ws"},
		{"shadowsocks", "tcp"},
		{"http", "tcp"},
		{"https", "tcp"},
		{"socks5", "tcp"},
	}

	for _, p := range protocols {
		if err := o.bbrService.OptimizeForProtocol(p.name, p.tunnelType); err != nil {
			fmt.Printf("优化 %s/%s 失败: %v\n", p.name, p.tunnelType, err)
		}
	}

	return nil
}

// GetOptimizationStatus 获取优化状态
func (o *AutoBBROptimizer) GetOptimizationStatus() map[string]interface{} {
	o.mu.Lock()
	defer o.mu.Unlock()

	// 获取BBR状态
	bbrStatus, _ := o.bbrService.GetBBRStatus()

	// 统计优化的入站和隧道数量
	var xrayCount, gostCount int64
	o.db.Model(&model.XrayInbound{}).Where("enable = ?", true).Count(&xrayCount)
	o.db.Model(&model.GostTunnel{}).Where("enable = ?", true).Count(&gostCount)

	return map[string]interface{}{
		"running":             o.running,
		"bbr_enabled":         bbrStatus.Enabled,
		"bbr_algorithm":       bbrStatus.CurrentAlgo,
		"optimized_xray":      xrayCount,
		"optimized_gost":      gostCount,
		"kernel_version":      bbrStatus.KernelVersion,
		"supports_bbr":        bbrStatus.SupportsBBR,
	}
}

// 辅助函数
func contains(s, substr string) bool {
	return len(s) > 0 && len(substr) > 0 && s != substr && len(s) >= len(substr) && s[0:len(substr)] == substr || len(s) > len(substr) && s[len(s)-len(substr):] == substr || len(s) > len(substr)*2 && s[len(s)/2-len(substr)/2:len(s)/2+len(substr)/2+len(substr)%2] == substr
}
