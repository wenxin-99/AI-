package services

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/uniproxy/panel/database/model"
	"gorm.io/gorm"
)

// SubscriptionService 订阅服务
type SubscriptionService struct {
	db *gorm.DB
}

// NewSubscriptionService 创建订阅服务
func NewSubscriptionService(db *gorm.DB) *SubscriptionService {
	return &SubscriptionService{db: db}
}

// GenerateXraySubscription 生成 Xray 订阅链接
func (s *SubscriptionService) GenerateXraySubscription(userID uint, format string) (string, error) {
	// 获取用户的所有客户端
	var clients []model.XrayClient
	if err := s.db.Where("inbound_id IN (SELECT id FROM xray_inbounds WHERE user_id = ? AND enable = ?)", userID, true).
		Where("enable = ?", true).
		Find(&clients).Error; err != nil {
		return "", err
	}

	if len(clients) == 0 {
		return "", fmt.Errorf("没有可用的客户端")
	}

	switch format {
	case "v2ray":
		return s.generateV2RayFormat(clients)
	case "clash":
		return s.generateClashFormat(clients)
	case "surge":
		return s.generateSurgeFormat(clients)
	default:
		return s.generateV2RayFormat(clients)
	}
}

// generateV2RayFormat 生成 V2Ray 格式订阅
func (s *SubscriptionService) generateV2RayFormat(clients []model.XrayClient) (string, error) {
	var links []string

	for _, client := range clients {
		// 获取入站信息
		var inbound model.XrayInbound
		if err := s.db.First(&inbound, client.InboundID).Error; err != nil {
			continue
		}

		var link string
		switch inbound.Protocol {
		case "vmess":
			link = s.generateVMessLink(client, inbound)
		case "vless":
			link = s.generateVLESSLink(client, inbound)
		case "trojan":
			link = s.generateTrojanLink(client, inbound)
		case "shadowsocks":
			link = s.generateShadowsocksLink(client, inbound)
		}

		if link != "" {
			links = append(links, link)
		}
	}

	// Base64 编码
	content := strings.Join(links, "\n")
	encoded := base64.StdEncoding.EncodeToString([]byte(content))
	return encoded, nil
}

// generateVMessLink 生成 VMess 链接
func (s *SubscriptionService) generateVMessLink(client model.XrayClient, inbound model.XrayInbound) string {
	vmess := map[string]interface{}{
		"v":    "2",
		"ps":   client.Email,
		"add":  inbound.Listen,
		"port": inbound.Port,
		"id":   client.UUID,
		"aid":  0,
		"net":  "tcp",
		"type": "none",
		"host": "",
		"path": "",
		"tls":  "",
	}

	jsonData, _ := json.Marshal(vmess)
	encoded := base64.StdEncoding.EncodeToString(jsonData)
	return "vmess://" + encoded
}

// generateVLESSLink 生成 VLESS 链接
func (s *SubscriptionService) generateVLESSLink(client model.XrayClient, inbound model.XrayInbound) string {
	params := url.Values{}
	params.Set("type", "tcp")
	params.Set("security", "none")
	params.Set("encryption", "none")

	if client.Flow != "" {
		params.Set("flow", client.Flow)
	}

	link := fmt.Sprintf("vless://%s@%s:%d?%s#%s",
		client.UUID,
		inbound.Listen,
		inbound.Port,
		params.Encode(),
		url.QueryEscape(client.Email),
	)

	return link
}

// generateTrojanLink 生成 Trojan 链接
func (s *SubscriptionService) generateTrojanLink(client model.XrayClient, inbound model.XrayInbound) string {
	params := url.Values{}
	params.Set("type", "tcp")
	params.Set("security", "tls")

	link := fmt.Sprintf("trojan://%s@%s:%d?%s#%s",
		client.Password,
		inbound.Listen,
		inbound.Port,
		params.Encode(),
		url.QueryEscape(client.Email),
	)

	return link
}

// generateShadowsocksLink 生成 Shadowsocks 链接
func (s *SubscriptionService) generateShadowsocksLink(client model.XrayClient, inbound model.XrayInbound) string {
	// method:password
	userInfo := fmt.Sprintf("aes-256-gcm:%s", client.Password)
	encoded := base64.StdEncoding.EncodeToString([]byte(userInfo))

	link := fmt.Sprintf("ss://%s@%s:%d#%s",
		encoded,
		inbound.Listen,
		inbound.Port,
		url.QueryEscape(client.Email),
	)

	return link
}

// generateClashFormat 生成 Clash 格式订阅
func (s *SubscriptionService) generateClashFormat(clients []model.XrayClient) (string, error) {
	clash := map[string]interface{}{
		"port":               7890,
		"socks-port":         7891,
		"allow-lan":          false,
		"mode":               "Rule",
		"log-level":          "info",
		"external-controller": "127.0.0.1:9090",
		"proxies":            []map[string]interface{}{},
		"proxy-groups": []map[string]interface{}{
			{
				"name":    "Proxy",
				"type":    "select",
				"proxies": []string{},
			},
		},
		"rules": []string{
			"DOMAIN-SUFFIX,google.com,Proxy",
			"DOMAIN-KEYWORD,google,Proxy",
			"MATCH,DIRECT",
		},
	}

	proxies := []map[string]interface{}{}
	proxyNames := []string{}

	for _, client := range clients {
		var inbound model.XrayInbound
		if err := s.db.First(&inbound, client.InboundID).Error; err != nil {
			continue
		}

		var proxy map[string]interface{}
		switch inbound.Protocol {
		case "vmess":
			proxy = map[string]interface{}{
				"name":           client.Email,
				"type":           "vmess",
				"server":         inbound.Listen,
				"port":           inbound.Port,
				"uuid":           client.UUID,
				"alterId":        0,
				"cipher":         "auto",
				"udp":            true,
				"skip-cert-verify": true,
			}
		case "vless":
			proxy = map[string]interface{}{
				"name":   client.Email,
				"type":   "vless",
				"server": inbound.Listen,
				"port":   inbound.Port,
				"uuid":   client.UUID,
				"udp":    true,
			}
		case "trojan":
			proxy = map[string]interface{}{
				"name":     client.Email,
				"type":     "trojan",
				"server":   inbound.Listen,
				"port":     inbound.Port,
				"password": client.Password,
				"udp":      true,
			}
		case "shadowsocks":
			proxy = map[string]interface{}{
				"name":     client.Email,
				"type":     "ss",
				"server":   inbound.Listen,
				"port":     inbound.Port,
				"cipher":   "aes-256-gcm",
				"password": client.Password,
				"udp":      true,
			}
		}

		if proxy != nil {
			proxies = append(proxies, proxy)
			proxyNames = append(proxyNames, client.Email)
		}
	}

	clash["proxies"] = proxies
	clash["proxy-groups"].([]map[string]interface{})[0]["proxies"] = proxyNames

	// 转换为 YAML 格式
	yamlData, err := json.MarshalIndent(clash, "", "  ")
	if err != nil {
		return "", err
	}

	// Base64 编码
	encoded := base64.StdEncoding.EncodeToString(yamlData)
	return encoded, nil
}

// generateSurgeFormat 生成 Surge 格式订阅
func (s *SubscriptionService) generateSurgeFormat(clients []model.XrayClient) (string, error) {
	var lines []string
	lines = append(lines, "[General]")
	lines = append(lines, "loglevel = notify")
	lines = append(lines, "")
	lines = append(lines, "[Proxy]")

	for _, client := range clients {
		var inbound model.XrayInbound
		if err := s.db.First(&inbound, client.InboundID).Error; err != nil {
			continue
		}

		var line string
		switch inbound.Protocol {
		case "vmess":
			line = fmt.Sprintf("%s = vmess, %s, %d, username=%s",
				client.Email, inbound.Listen, inbound.Port, client.UUID)
		case "shadowsocks":
			line = fmt.Sprintf("%s = ss, %s, %d, encrypt-method=aes-256-gcm, password=%s",
				client.Email, inbound.Listen, inbound.Port, client.Password)
		}

		if line != "" {
			lines = append(lines, line)
		}
	}

	lines = append(lines, "")
	lines = append(lines, "[Proxy Group]")
	lines = append(lines, "Proxy = select, " + strings.Join(getClientEmails(clients), ", "))

	content := strings.Join(lines, "\n")
	encoded := base64.StdEncoding.EncodeToString([]byte(content))
	return encoded, nil
}

// getClientEmails 获取客户端邮箱列表
func getClientEmails(clients []model.XrayClient) []string {
	emails := make([]string, len(clients))
	for i, client := range clients {
		emails[i] = client.Email
	}
	return emails
}

// CreateSubscriptionToken 创建订阅令牌
func (s *SubscriptionService) CreateSubscriptionToken(userID uint) (string, error) {
	// 生成随机令牌
	token := generateRandomString(32)

	subscription := &model.Subscription{
		UserID: userID,
		Token:  token,
		Enable: true,
	}

	if err := s.db.Create(subscription).Error; err != nil {
		return "", err
	}

	return token, nil
}

// generateRandomString 生成随机字符串
func generateRandomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[i%len(charset)]
	}
	return string(b)
}
