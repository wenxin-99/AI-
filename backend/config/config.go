package config

import (
	"fmt"
	"os"

	"github.com/spf13/viper"
)

// Config 全局配置结构
type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	Security SecurityConfig `mapstructure:"security"`
	Xray     XrayConfig     `mapstructure:"xray"`
	Gost     GostConfig     `mapstructure:"gost"`
	Notify   NotifyConfig   `mapstructure:"notify"`
}

// ServerConfig 服务器配置
type ServerConfig struct {
	Host     string    `mapstructure:"host"`
	Port     int       `mapstructure:"port"`
	BasePath string    `mapstructure:"base_path"`
	TLS      TLSConfig `mapstructure:"tls"`
	LogLevel string    `mapstructure:"log_level"`
}

// TLSConfig TLS配置
type TLSConfig struct {
	Enabled  bool   `mapstructure:"enabled"`
	CertFile string `mapstructure:"cert_file"`
	KeyFile  string `mapstructure:"key_file"`
}

// DatabaseConfig 数据库配置
type DatabaseConfig struct {
	Type   string       `mapstructure:"type"` // sqlite, mysql
	SQLite SQLiteConfig `mapstructure:"sqlite"`
	MySQL  MySQLConfig  `mapstructure:"mysql"`
}

// SQLiteConfig SQLite配置
type SQLiteConfig struct {
	Path string `mapstructure:"path"`
}

// MySQLConfig MySQL配置
type MySQLConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	Database string `mapstructure:"database"`
	Charset  string `mapstructure:"charset"`
}

// SecurityConfig 安全配置
type SecurityConfig struct {
	JWTSecret     string `mapstructure:"jwt_secret"`
	JWTExpireHour int    `mapstructure:"jwt_expire_hour"`
	TwoFactorName string `mapstructure:"two_factor_name"`
}

// XrayConfig Xray配置
type XrayConfig struct {
	Enabled    bool   `mapstructure:"enabled"`
	BinaryPath string `mapstructure:"binary_path"`
	ConfigPath string `mapstructure:"config_path"`
	LogPath    string `mapstructure:"log_path"`
	APIPort    int    `mapstructure:"api_port"`
}

// GostConfig Gost配置
type GostConfig struct {
	Enabled    bool   `mapstructure:"enabled"`
	BinaryPath string `mapstructure:"binary_path"`
	ConfigPath string `mapstructure:"config_path"`
	LogPath    string `mapstructure:"log_path"`
	APIPort    int    `mapstructure:"api_port"`
}

// NotifyConfig 通知配置
type NotifyConfig struct {
	Telegram TelegramConfig `mapstructure:"telegram"`
	Email    EmailConfig    `mapstructure:"email"`
	Webhook  WebhookConfig  `mapstructure:"webhook"`
}

// TelegramConfig Telegram配置
type TelegramConfig struct {
	Enabled bool   `mapstructure:"enabled"`
	Token   string `mapstructure:"token"`
	ChatID  string `mapstructure:"chat_id"`
}

// EmailConfig 邮件配置
type EmailConfig struct {
	Enabled  bool   `mapstructure:"enabled"`
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	From     string `mapstructure:"from"`
}

// WebhookConfig Webhook配置
type WebhookConfig struct {
	Enabled bool   `mapstructure:"enabled"`
	URL     string `mapstructure:"url"`
	Secret  string `mapstructure:"secret"`
}

// Load 加载配置文件
func Load(configFile string) (*Config, error) {
	v := viper.New()
	v.SetConfigFile(configFile)
	v.SetConfigType("yaml")

	// 设置默认值
	setDefaults(v)

	// 读取配置文件
	if err := v.ReadInConfig(); err != nil {
		// 如果配置文件不存在,创建默认配置
		if _, ok := err.(viper.ConfigFileNotFoundError); ok {
			if err := createDefaultConfig(configFile); err != nil {
				return nil, fmt.Errorf("创建默认配置失败: %w", err)
			}
			if err := v.ReadInConfig(); err != nil {
				return nil, fmt.Errorf("读取配置文件失败: %w", err)
			}
		} else {
			return nil, fmt.Errorf("读取配置文件失败: %w", err)
		}
	}

	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("解析配置失败: %w", err)
	}

	return &cfg, nil
}

// setDefaults 设置默认配置
func setDefaults(v *viper.Viper) {
	// 服务器默认配置
	v.SetDefault("server.host", "0.0.0.0")
	v.SetDefault("server.port", 2053)
	v.SetDefault("server.base_path", "/")
	v.SetDefault("server.log_level", "info")
	v.SetDefault("server.tls.enabled", false)

	// 数据库默认配置
	v.SetDefault("database.type", "sqlite")
	v.SetDefault("database.sqlite.path", "./data/uniproxy.db")
	v.SetDefault("database.mysql.port", 3306)
	v.SetDefault("database.mysql.charset", "utf8mb4")

	// 安全默认配置
	v.SetDefault("security.jwt_secret", "uniproxy-secret-key-change-me")
	v.SetDefault("security.jwt_expire_hour", 24)
	v.SetDefault("security.two_factor_name", "UniProxy Panel")

	// Xray默认配置
	v.SetDefault("xray.enabled", true)
	v.SetDefault("xray.binary_path", "/usr/local/bin/xray")
	v.SetDefault("xray.config_path", "./data/xray_config.json")
	v.SetDefault("xray.log_path", "./logs/xray.log")
	v.SetDefault("xray.api_port", 10085)

	// Gost默认配置
	v.SetDefault("gost.enabled", true)
	v.SetDefault("gost.binary_path", "/usr/local/bin/gost")
	v.SetDefault("gost.config_path", "./data/gost_config.yaml")
	v.SetDefault("gost.log_path", "./logs/gost.log")
	v.SetDefault("gost.api_port", 18080)
}

// createDefaultConfig 创建默认配置文件
func createDefaultConfig(configFile string) error {
	defaultConfig := `# UniProxy Panel 配置文件

server:
  host: 0.0.0.0
  port: 2053
  base_path: /
  log_level: info
  tls:
    enabled: false
    cert_file: ""
    key_file: ""

database:
  type: sqlite  # sqlite 或 mysql
  sqlite:
    path: ./data/uniproxy.db
  mysql:
    host: localhost
    port: 3306
    user: root
    password: ""
    database: uniproxy
    charset: utf8mb4

security:
  jwt_secret: uniproxy-secret-key-change-me
  jwt_expire_hour: 24
  two_factor_name: UniProxy Panel

xray:
  enabled: true
  binary_path: /usr/local/bin/xray
  config_path: ./data/xray_config.json
  log_path: ./logs/xray.log
  api_port: 10085

gost:
  enabled: true
  binary_path: /usr/local/bin/gost
  config_path: ./data/gost_config.yaml
  log_path: ./logs/gost.log
  api_port: 18080

notify:
  telegram:
    enabled: false
    token: ""
    chat_id: ""
  email:
    enabled: false
    host: smtp.gmail.com
    port: 587
    user: ""
    password: ""
    from: ""
  webhook:
    enabled: false
    url: ""
    secret: ""
`

	return os.WriteFile(configFile, []byte(defaultConfig), 0644)
}
