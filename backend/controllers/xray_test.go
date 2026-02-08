package controllers

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/uniproxy/panel/database/model"
)

// TestInboundResponse 测试入站响应
type TestInboundResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Latency int64  `json:"latency"` // 延迟（毫秒）
	Error   string `json:"error,omitempty"`
}

// TestInbound 测试Xray入站连接
func (xc *XrayController) TestInbound(c *gin.Context) {
	id := c.Param("id")

	var inbound model.XrayInbound
	if err := xc.db.First(&inbound, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "入站不存在",
		})
		return
	}

	// 生成测试客户端配置
	clientConfig, err := xc.generateTestClientConfig(&inbound)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "生成测试配置失败",
			"error":   err.Error(),
		})
		return
	}

	// 执行连接测试
	result := xc.executeConnectionTest(clientConfig)

	c.JSON(http.StatusOK, result)
}

// generateTestClientConfig 生成测试客户端配置
func (xc *XrayController) generateTestClientConfig(inbound *model.XrayInbound) (string, error) {
	// 解析入站配置
	var settings map[string]interface{}
	if err := json.Unmarshal([]byte(inbound.Settings), &settings); err != nil {
		return "", fmt.Errorf("解析入站配置失败: %v", err)
	}

	var streamSettings map[string]interface{}
	if err := json.Unmarshal([]byte(inbound.StreamSettings), &streamSettings); err != nil {
		return "", fmt.Errorf("解析传输层配置失败: %v", err)
	}

	// 生成测试用户ID/密码
	testID := uuid.New().String()
	
	// 构建客户端配置
	clientConfig := map[string]interface{}{
		"log": map[string]interface{}{
			"loglevel": "warning",
		},
		"inbounds": []map[string]interface{}{
			{
				"port":     10808,
				"protocol": "socks",
				"settings": map[string]interface{}{
					"udp": true,
				},
			},
		},
		"outbounds": []map[string]interface{}{
			{
				"protocol": inbound.Protocol,
				"settings": xc.buildClientSettings(inbound.Protocol, testID, settings),
				"streamSettings": streamSettings,
			},
		},
	}

	// 转换为JSON
	configJSON, err := json.MarshalIndent(clientConfig, "", "  ")
	if err != nil {
		return "", fmt.Errorf("生成JSON配置失败: %v", err)
	}

	return string(configJSON), nil
}

// buildClientSettings 构建客户端设置
func (xc *XrayController) buildClientSettings(protocol string, testID string, serverSettings map[string]interface{}) map[string]interface{} {
	// 获取服务器地址
	serverAddr := "127.0.0.1" // 本地测试
	
	switch protocol {
	case "vmess":
		return map[string]interface{}{
			"vnext": []map[string]interface{}{
				{
					"address": serverAddr,
					"port":    serverSettings["port"],
					"users": []map[string]interface{}{
						{
							"id":       testID,
							"alterId":  0,
							"security": "auto",
						},
					},
				},
			},
		}
	case "vless":
		return map[string]interface{}{
			"vnext": []map[string]interface{}{
				{
					"address": serverAddr,
					"port":    serverSettings["port"],
					"users": []map[string]interface{}{
						{
							"id":         testID,
							"encryption": "none",
						},
					},
				},
			},
		}
	case "trojan":
		return map[string]interface{}{
			"servers": []map[string]interface{}{
				{
					"address":  serverAddr,
					"port":     serverSettings["port"],
					"password": testID,
				},
			},
		}
	case "shadowsocks":
		method := "aes-256-gcm"
		if m, ok := serverSettings["method"].(string); ok {
			method = m
		}
		return map[string]interface{}{
			"servers": []map[string]interface{}{
				{
					"address":  serverAddr,
					"port":     serverSettings["port"],
					"method":   method,
					"password": testID,
				},
			},
		}
	default:
		return map[string]interface{}{}
	}
}

// executeConnectionTest 执行连接测试
func (xc *XrayController) executeConnectionTest(clientConfig string) TestInboundResponse {
	// 创建临时配置文件
	tmpDir := os.TempDir()
	configFile := filepath.Join(tmpDir, fmt.Sprintf("xray_test_%d.json", time.Now().UnixNano()))
	
	if err := os.WriteFile(configFile, []byte(clientConfig), 0644); err != nil {
		return TestInboundResponse{
			Success: false,
			Message: "创建临时配置文件失败",
			Error:   err.Error(),
		}
	}
	defer os.Remove(configFile)

	// 启动Xray客户端
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "xray", "run", "-c", configFile)
	if err := cmd.Start(); err != nil {
		return TestInboundResponse{
			Success: false,
			Message: "启动Xray客户端失败",
			Error:   err.Error(),
		}
	}
	defer cmd.Process.Kill()

	// 等待客户端启动
	time.Sleep(2 * time.Second)

	// 测试连接和延迟
	startTime := time.Now()
	
	// 尝试通过SOCKS5代理连接
	dialer, err := net.Dial("tcp", "127.0.0.1:10808")
	if err != nil {
		return TestInboundResponse{
			Success: false,
			Message: "无法连接到代理端口",
			Error:   err.Error(),
		}
	}
	defer dialer.Close()

	// 测试HTTP请求（通过代理）
	transport := &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("tcp", "127.0.0.1:10808")
		},
	}
	client := &http.Client{
		Transport: transport,
		Timeout:   10 * time.Second,
	}

	resp, err := client.Get("http://www.google.com/generate_204")
	if err != nil {
		return TestInboundResponse{
			Success: false,
			Message: "代理连接测试失败",
			Error:   err.Error(),
		}
	}
	defer resp.Body.Close()

	latency := time.Since(startTime).Milliseconds()

	if resp.StatusCode == 204 || resp.StatusCode == 200 {
		return TestInboundResponse{
			Success: true,
			Message: "连接测试成功",
			Latency: latency,
		}
	}

	return TestInboundResponse{
		Success: false,
		Message: fmt.Sprintf("连接测试失败，HTTP状态码: %d", resp.StatusCode),
		Latency: latency,
	}
}
