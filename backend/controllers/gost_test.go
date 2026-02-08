package controllers

import (
	"fmt"
	"net"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/database/model"
)

// TestForwardResponse 测试转发响应
type TestForwardResponse struct {
	Success     bool   `json:"success"`
	Message     string `json:"message"`
	Latency     int64  `json:"latency"`      // 延迟（毫秒）
	PortStatus  string `json:"port_status"`  // 端口状态
	RemoteStatus string `json:"remote_status"` // 远程地址状态
	Error       string `json:"error,omitempty"`
}

// TestForward 测试Gost转发连接
func (gc *GostController) TestForward(c *gin.Context) {
	id := c.Param("id")

	var forward model.GostForward
	if err := gc.db.First(&forward, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "转发规则不存在",
		})
		return
	}

	// 测试入口端口
	portStatus := gc.testPort(forward.InPort)
	
	// 测试远程地址连通性
	remoteStatus, latency := gc.testRemoteConnection(forward.RemoteAddr, forward.OutPort)

	success := portStatus == "listening" && remoteStatus == "reachable"
	message := "测试完成"
	if success {
		message = "连接测试成功"
	} else if portStatus != "listening" {
		message = fmt.Sprintf("入口端口 %d 未监听", forward.InPort)
	} else if remoteStatus != "reachable" {
		message = fmt.Sprintf("无法连接到远程地址 %s:%d", forward.RemoteAddr, forward.OutPort)
	}

	c.JSON(http.StatusOK, TestForwardResponse{
		Success:      success,
		Message:      message,
		Latency:      latency,
		PortStatus:   portStatus,
		RemoteStatus: remoteStatus,
	})
}

// testPort 测试端口是否监听
func (gc *GostController) testPort(port int) string {
	address := fmt.Sprintf("127.0.0.1:%d", port)
	
	conn, err := net.DialTimeout("tcp", address, 3*time.Second)
	if err != nil {
		return "not_listening"
	}
	defer conn.Close()
	
	return "listening"
}

// testRemoteConnection 测试远程地址连通性
func (gc *GostController) testRemoteConnection(remoteAddr string, port int) (string, int64) {
	address := fmt.Sprintf("%s:%d", remoteAddr, port)
	
	startTime := time.Now()
	conn, err := net.DialTimeout("tcp", address, 10*time.Second)
	latency := time.Since(startTime).Milliseconds()
	
	if err != nil {
		return "unreachable", latency
	}
	defer conn.Close()
	
	return "reachable", latency
}
