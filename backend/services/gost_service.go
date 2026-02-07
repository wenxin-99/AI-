package services

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"

	"github.com/uniproxy/panel/config"
	"github.com/uniproxy/panel/database/model"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

// GostService Gost服务
type GostService struct {
	cfg     *config.Config
	db      *gorm.DB
	mu      sync.Mutex
	cmd     *exec.Cmd
	running bool
}

// NewGostService 创建Gost服务
func NewGostService(cfg *config.Config, db *gorm.DB) *GostService {
	return &GostService{
		cfg: cfg,
		db:  db,
	}
}

// GostConfig Gost配置结构
type GostConfig struct {
	Services []GostServiceConfig `yaml:"services"`
}

// GostServiceConfig Gost服务配置
type GostServiceConfig struct {
	Name     string              `yaml:"name"`
	Addr     string              `yaml:"addr"`
	Handler  GostHandlerConfig   `yaml:"handler"`
	Listener GostListenerConfig  `yaml:"listener,omitempty"`
	Forwarder *GostForwarderConfig `yaml:"forwarder,omitempty"`
}

// GostHandlerConfig 处理器配置
type GostHandlerConfig struct {
	Type string                 `yaml:"type"`
	Auth *GostAuthConfig        `yaml:"auth,omitempty"`
	Limiter *GostLimiterConfig  `yaml:"limiter,omitempty"`
}

// GostListenerConfig 监听器配置
type GostListenerConfig struct {
	Type string             `yaml:"type"`
	TLS  *GostTLSConfig     `yaml:"tls,omitempty"`
}

// GostTLSConfig TLS配置
type GostTLSConfig struct {
	CertFile   string `yaml:"certFile,omitempty"`
	KeyFile    string `yaml:"keyFile,omitempty"`
	CAFile     string `yaml:"caFile,omitempty"`
	ServerName string `yaml:"serverName,omitempty"`
	Secure     bool   `yaml:"secure,omitempty"`
}

// GostForwarderConfig 转发器配置
type GostForwarderConfig struct {
	Nodes []GostNodeConfig `yaml:"nodes"`
}

// GostNodeConfig 节点配置
type GostNodeConfig struct {
	Name      string         `yaml:"name"`
	Addr      string         `yaml:"addr"`
	Connector *GostConnectorConfig `yaml:"connector,omitempty"`
}

// GostConnectorConfig 连接器配置
type GostConnectorConfig struct {
	Type string         `yaml:"type"`
	TLS  *GostTLSConfig `yaml:"tls,omitempty"`
}

// GostAuthConfig 认证配置
type GostAuthConfig struct {
	Username string `yaml:"username,omitempty"`
	Password string `yaml:"password,omitempty"`
}

// GostLimiterConfig 限速配置
type GostLimiterConfig struct {
	In  string `yaml:"in,omitempty"`
	Out string `yaml:"out,omitempty"`
}

// GenerateConfig 生成Gost配置文件
func (gs *GostService) GenerateConfig() error {
	gs.mu.Lock()
	defer gs.mu.Unlock()

	// 查询所有启用的隧道
	var tunnels []model.GostTunnel
	if err := gs.db.Where("enabled = ?", true).Find(&tunnels).Error; err != nil {
		return fmt.Errorf("查询隧道失败: %v", err)
	}

	// 构建配置
	gostConfig := &GostConfig{
		Services: make([]GostServiceConfig, 0),
	}

	// 添加隧道配置
	for _, tunnel := range tunnels {
		serviceConfig := gs.buildServiceConfig(&tunnel)
		gostConfig.Services = append(gostConfig.Services, serviceConfig)
	}

	// 写入配置文件
	configData, err := yaml.Marshal(gostConfig)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %v", err)
	}

	// 确保配置目录存在
	configDir := filepath.Dir(gs.cfg.Gost.ConfigPath)
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return fmt.Errorf("创建配置目录失败: %v", err)
	}

	if err := os.WriteFile(gs.cfg.Gost.ConfigPath, configData, 0644); err != nil {
		return fmt.Errorf("写入配置文件失败: %v", err)
	}

	return nil
}

// buildServiceConfig 构建服务配置
func (gs *GostService) buildServiceConfig(tunnel *model.GostTunnel) GostServiceConfig {
	config := GostServiceConfig{
		Name: fmt.Sprintf("tunnel-%d", tunnel.ID),
		Addr: fmt.Sprintf(":%d", tunnel.LocalPort),
		Handler: GostHandlerConfig{
			Type: tunnel.Protocol,
		},
	}

	// 添加认证
	if tunnel.Username != "" && tunnel.Password != "" {
		config.Handler.Auth = &GostAuthConfig{
			Username: tunnel.Username,
			Password: tunnel.Password,
		}
	}

	// 添加限速
	if tunnel.SpeedLimit > 0 {
		limitStr := fmt.Sprintf("%dMB", tunnel.SpeedLimit)
		config.Handler.Limiter = &GostLimiterConfig{
			In:  limitStr,
			Out: limitStr,
		}
	}

	// 添加转发目标
	if tunnel.RemoteAddr != "" {
		nodeConfig := GostNodeConfig{
			Name: "target",
			Addr: tunnel.RemoteAddr,
		}

		// 如果启用TLS
		if tunnel.EnableTLS {
			// 查询证书
			var cert model.Certificate
			if tunnel.CertificateID > 0 {
				if err := gs.db.First(&cert, tunnel.CertificateID).Error; err == nil {
					// 配置TLS连接器
					nodeConfig.Connector = &GostConnectorConfig{
						Type: "tls",
						TLS: &GostTLSConfig{
							CertFile:   cert.CertPath,
							KeyFile:    cert.KeyPath,
							ServerName: tunnel.TLSServerName,
							Secure:     !tunnel.SkipVerify,
						},
					}
				}
			} else {
				// 没有证书但启用了TLS，使用默认配置
				nodeConfig.Connector = &GostConnectorConfig{
					Type: "tls",
					TLS: &GostTLSConfig{
						ServerName: tunnel.TLSServerName,
						Secure:     !tunnel.SkipVerify,
					},
				}
			}
		}

		config.Forwarder = &GostForwarderConfig{
			Nodes: []GostNodeConfig{nodeConfig},
		}
	}

	return config
}

// Start 启动Gost
func (gs *GostService) Start() error {
	gs.mu.Lock()
	defer gs.mu.Unlock()

	if gs.running {
		return fmt.Errorf("Gost已在运行")
	}

	// 生成配置
	if err := gs.GenerateConfig(); err != nil {
		return fmt.Errorf("生成配置失败: %v", err)
	}

	// 启动进程
	gs.cmd = exec.Command(gs.cfg.Gost.BinaryPath, "-C", gs.cfg.Gost.ConfigPath)
	gs.cmd.Stdout = os.Stdout
	gs.cmd.Stderr = os.Stderr

	if err := gs.cmd.Start(); err != nil {
		return fmt.Errorf("启动Gost失败: %v", err)
	}

	gs.running = true
	return nil
}

// Stop 停止Gost
func (gs *GostService) Stop() error {
	gs.mu.Lock()
	defer gs.mu.Unlock()

	if !gs.running || gs.cmd == nil {
		return fmt.Errorf("Gost未运行")
	}

	if err := gs.cmd.Process.Kill(); err != nil {
		return fmt.Errorf("停止Gost失败: %v", err)
	}

	gs.cmd.Wait()
	gs.running = false
	gs.cmd = nil

	return nil
}

// Restart 重启Gost
func (gs *GostService) Restart() error {
	if gs.IsRunning() {
		if err := gs.Stop(); err != nil {
			return err
		}
	}
	return gs.Start()
}

// IsRunning 检查Gost是否运行
func (gs *GostService) IsRunning() bool {
	gs.mu.Lock()
	defer gs.mu.Unlock()
	return gs.running
}

// GetVersion 获取Gost版本
func (gs *GostService) GetVersion() (string, error) {
	cmd := exec.Command(gs.cfg.Gost.BinaryPath, "-V")
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(output), nil
}
