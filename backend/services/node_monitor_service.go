package services

import (
	"fmt"
	"log"
	"net"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/uniproxy/panel/database/model"
	"gorm.io/gorm"
)

// NodeMonitorService 节点监控服务
type NodeMonitorService struct {
	db       *gorm.DB
	running  bool
	mu       sync.Mutex
	stopChan chan struct{}
}

func NewNodeMonitorService(db *gorm.DB) *NodeMonitorService {
	return &NodeMonitorService{
		db:       db,
		stopChan: make(chan struct{}),
	}
}

// Start 启动监控服务
func (s *NodeMonitorService) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return fmt.Errorf("监控服务已在运行")
	}

	s.running = true
	go s.monitorLoop()

	log.Println("节点监控服务已启动")
	return nil
}

// Stop 停止监控服务
func (s *NodeMonitorService) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	s.running = false
	close(s.stopChan)
	log.Println("节点监控服务已停止")
}

// monitorLoop 监控循环
func (s *NodeMonitorService) monitorLoop() {
	ticker := time.NewTicker(30 * time.Second) // 每30秒检查一次
	defer ticker.Stop()

	// 首次启动时立即执行一次
	s.checkAllNodes()

	for {
		select {
		case <-ticker.C:
			s.checkAllNodes()
		case <-s.stopChan:
			return
		}
	}
}

// checkAllNodes 检查所有节点
func (s *NodeMonitorService) checkAllNodes() {
	var healthChecks []model.NodeHealthCheck
	if err := s.db.Where("enabled = ?", true).Find(&healthChecks).Error; err != nil {
		log.Printf("获取健康检查配置失败: %v", err)
		return
	}

	for _, check := range healthChecks {
		// 检查是否到达检查间隔
		if check.LastCheckAt != nil {
			nextCheck := check.LastCheckAt.Add(time.Duration(check.CheckInterval) * time.Second)
			if time.Now().Before(nextCheck) {
				continue
			}
		}

		go s.checkNode(&check)
	}
}

// checkNode 检查单个节点
func (s *NodeMonitorService) checkNode(healthCheck *model.NodeHealthCheck) {
	// 获取节点信息
	var node model.Node
	if err := s.db.First(&node, healthCheck.NodeID).Error; err != nil {
		log.Printf("获取节点信息失败: %v", err)
		return
	}

	log.Printf("开始检查节点: %s (%s)", node.Name, node.Host)

	monitor := &model.NodeMonitor{
		NodeID:    node.ID,
		Status:    "online",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	var errors []string

	// 检查 Xray 服务
	if healthCheck.CheckXray {
		if running, err := s.checkServiceStatus(node.Host, "xray"); err != nil {
			errors = append(errors, fmt.Sprintf("Xray检查失败: %v", err))
			monitor.XrayStatus = false
		} else {
			monitor.XrayStatus = running
			if !running {
				errors = append(errors, "Xray服务未运行")
			}
		}
	}

	// 检查 Gost 服务
	if healthCheck.CheckGost {
		if running, err := s.checkServiceStatus(node.Host, "gost"); err != nil {
			errors = append(errors, fmt.Sprintf("Gost检查失败: %v", err))
			monitor.GostStatus = false
		} else {
			monitor.GostStatus = running
			if !running {
				errors = append(errors, "Gost服务未运行")
			}
		}
	}

	// 检查端口监听
	if healthCheck.CheckPorts {
		ports, err := s.checkListeningPorts(node.Host)
		if err != nil {
			errors = append(errors, fmt.Sprintf("端口检查失败: %v", err))
		} else {
			monitor.PortsListening = ports
		}
	}

	// 检查延迟和丢包率
	if healthCheck.CheckLatency || healthCheck.CheckPacketLoss {
		latency, jitter, packetLoss, err := s.checkNetworkQuality(node.Host, 10)
		if err != nil {
			errors = append(errors, fmt.Sprintf("网络质量检查失败: %v", err))
			monitor.Status = "offline"
		} else {
			monitor.Latency = latency
			monitor.Jitter = jitter
			monitor.PacketLoss = packetLoss

			// 判断节点状态
			if packetLoss > 50 {
				monitor.Status = "offline"
			} else if packetLoss > 10 || latency > 500 {
				monitor.Status = "degraded"
			}
		}
	}

	// 设置错误信息
	if len(errors) > 0 {
		monitor.ErrorMessage = strings.Join(errors, "; ")
		if monitor.Status == "online" {
			monitor.Status = "degraded"
		}
	}

	// 保存监控记录
	if err := s.db.Create(monitor).Error; err != nil {
		log.Printf("保存监控记录失败: %v", err)
	}

	// 更新节点状态
	s.db.Model(&node).Updates(map[string]interface{}{
		"status":         monitor.Status,
		"last_heartbeat": time.Now(),
	})

	// 更新健康检查记录
	now := time.Now()
	updates := map[string]interface{}{
		"last_check_at": now,
	}

	if monitor.Status == "online" {
		updates["last_check_status"] = "success"
		updates["consecutive_fails"] = 0
	} else {
		updates["last_check_status"] = "failed"
		updates["consecutive_fails"] = gorm.Expr("consecutive_fails + 1")
	}

	s.db.Model(healthCheck).Updates(updates)

	// 检查告警规则
	s.checkAlertRules(&node, monitor)

	log.Printf("节点检查完成: %s - 状态: %s, 延迟: %.2fms, 丢包: %.2f%%",
		node.Name, monitor.Status, monitor.Latency, monitor.PacketLoss)
}

// checkServiceStatus 检查服务状态
func (s *NodeMonitorService) checkServiceStatus(host, serviceName string) (bool, error) {
	// 如果是本地节点，直接检查服务
	if host == "localhost" || host == "127.0.0.1" || host == "" {
		cmd := exec.Command("systemctl", "is-active", serviceName)
		output, err := cmd.Output()
		if err != nil {
			return false, nil // 服务未运行
		}
		return strings.TrimSpace(string(output)) == "active", nil
	}

	// 远程节点需要通过 SSH 检查 (需要配置 SSH 密钥)
	// 这里简化处理，假设远程节点有 API 接口
	return true, nil // 暂时返回 true
}

// checkListeningPorts 检查监听端口
func (s *NodeMonitorService) checkListeningPorts(host string) ([]int, error) {
	var ports []int

	// 如果是本地节点
	if host == "localhost" || host == "127.0.0.1" || host == "" {
		cmd := exec.Command("ss", "-tlnp")
		output, err := cmd.Output()
		if err != nil {
			return nil, err
		}

		// 解析输出
		re := regexp.MustCompile(`:(\d+)\s`)
		matches := re.FindAllStringSubmatch(string(output), -1)
		portMap := make(map[int]bool)

		for _, match := range matches {
			if len(match) > 1 {
				port, err := strconv.Atoi(match[1])
				if err == nil && !portMap[port] {
					ports = append(ports, port)
					portMap[port] = true
				}
			}
		}
	}

	return ports, nil
}

// checkNetworkQuality 检查网络质量（延迟、抖动、丢包率）
func (s *NodeMonitorService) checkNetworkQuality(host string, count int) (latency, jitter, packetLoss float64, err error) {
	// 使用 ping 命令检测
	cmd := exec.Command("ping", "-c", fmt.Sprintf("%d", count), "-W", "2", host)
	output, err := cmd.Output()
	if err != nil {
		return 0, 0, 100, fmt.Errorf("ping 失败: %v", err)
	}

	outputStr := string(output)

	// 解析丢包率
	// 例如: "10 packets transmitted, 8 received, 20% packet loss"
	lossRe := regexp.MustCompile(`(\d+)% packet loss`)
	lossMatches := lossRe.FindStringSubmatch(outputStr)
	if len(lossMatches) > 1 {
		packetLoss, _ = strconv.ParseFloat(lossMatches[1], 64)
	}

	// 解析延迟统计
	// 例如: "rtt min/avg/max/mdev = 10.123/15.456/20.789/2.345 ms"
	rttRe := regexp.MustCompile(`rtt min/avg/max/mdev = ([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+)`)
	rttMatches := rttRe.FindStringSubmatch(outputStr)
	if len(rttMatches) > 4 {
		latency, _ = strconv.ParseFloat(rttMatches[2], 64)  // avg
		jitter, _ = strconv.ParseFloat(rttMatches[4], 64)   // mdev (标准差，即抖动)
	}

	return latency, jitter, packetLoss, nil
}

// checkAlertRules 检查告警规则
func (s *NodeMonitorService) checkAlertRules(node *model.Node, monitor *model.NodeMonitor) {
	var rules []model.AlertRule
	s.db.Where("enabled = ? AND (node_id IS NULL OR node_id = ?)", true, node.ID).Find(&rules)

	for _, rule := range rules {
		shouldAlert := false
		var alertMessage string
		var metricValue float64

		switch rule.TriggerType {
		case "offline":
			if monitor.Status == "offline" {
				shouldAlert = true
				alertMessage = fmt.Sprintf("节点 %s 离线", node.Name)
			}

		case "service_down":
			if !monitor.XrayStatus || !monitor.GostStatus {
				shouldAlert = true
				services := []string{}
				if !monitor.XrayStatus {
					services = append(services, "Xray")
				}
				if !monitor.GostStatus {
					services = append(services, "Gost")
				}
				alertMessage = fmt.Sprintf("节点 %s 服务异常: %s", node.Name, strings.Join(services, ", "))
			}

		case "high_latency":
			if monitor.Latency > rule.Threshold {
				shouldAlert = true
				metricValue = monitor.Latency
				alertMessage = fmt.Sprintf("节点 %s 延迟过高: %.2fms (阈值: %.0fms)", node.Name, monitor.Latency, rule.Threshold)
			}

		case "high_packet_loss":
			if monitor.PacketLoss > rule.Threshold {
				shouldAlert = true
				metricValue = monitor.PacketLoss
				alertMessage = fmt.Sprintf("节点 %s 丢包率过高: %.2f%% (阈值: %.0f%%)", node.Name, monitor.PacketLoss, rule.Threshold)
			}

		case "high_jitter":
			if monitor.Jitter > rule.Threshold {
				shouldAlert = true
				metricValue = monitor.Jitter
				alertMessage = fmt.Sprintf("节点 %s 网络抖动过大: %.2fms (阈值: %.0fms)", node.Name, monitor.Jitter, rule.Threshold)
			}
		}

		if shouldAlert {
			s.triggerAlert(node, &rule, alertMessage, metricValue)
		}
	}
}

// triggerAlert 触发告警
func (s *NodeMonitorService) triggerAlert(node *model.Node, rule *model.AlertRule, message string, metricValue float64) {
	// 检查冷却时间
	var lastAlert model.AlertLog
	cooldownTime := time.Now().Add(-time.Duration(rule.CooldownMinutes) * time.Minute)
	
	err := s.db.Where("node_id = ? AND rule_id = ? AND created_at > ?", node.ID, rule.ID, cooldownTime).
		Order("created_at DESC").
		First(&lastAlert).Error

	if err == nil {
		// 在冷却期内，不发送告警
		log.Printf("告警在冷却期内，跳过: %s", message)
		return
	}

	// 创建告警日志
	alertLog := &model.AlertLog{
		NodeID:      node.ID,
		NodeName:    node.Name,
		RuleID:      rule.ID,
		RuleName:    rule.Name,
		AlertType:   rule.TriggerType,
		Severity:    s.getSeverity(rule.TriggerType),
		Message:     message,
		MetricValue: metricValue,
		CreatedAt:   time.Now(),
	}

	// 发送 Webhook 通知
	if rule.NotifyWebhook && rule.WebhookURL != "" {
		if err := s.sendWebhookNotification(rule.WebhookURL, alertLog); err != nil {
			log.Printf("发送 Webhook 通知失败: %v", err)
		} else {
			alertLog.NotifiedWebhook = true
		}
	}

	// 发送邮件通知
	if rule.NotifyEmail && rule.EmailTo != "" {
		if err := s.sendEmailNotification(rule.EmailTo, alertLog); err != nil {
			log.Printf("发送邮件通知失败: %v", err)
		} else {
			alertLog.NotifiedEmail = true
		}
	}

	// 保存告警日志
	if err := s.db.Create(alertLog).Error; err != nil {
		log.Printf("保存告警日志失败: %v", err)
	}

	log.Printf("触发告警: %s", message)
}

// getSeverity 获取告警严重程度
func (s *NodeMonitorService) getSeverity(alertType string) string {
	switch alertType {
	case "offline", "service_down":
		return "critical"
	case "high_latency", "high_packet_loss", "high_jitter":
		return "warning"
	default:
		return "info"
	}
}

// sendWebhookNotification 发送 Webhook 通知
func (s *NodeMonitorService) sendWebhookNotification(webhookURL string, alert *model.AlertLog) error {
	// TODO: 实现 Webhook 通知
	// 可以使用 HTTP POST 发送 JSON 数据到指定的 Webhook URL
	log.Printf("发送 Webhook 通知到: %s", webhookURL)
	return nil
}

// sendEmailNotification 发送邮件通知
func (s *NodeMonitorService) sendEmailNotification(emailTo string, alert *model.AlertLog) error {
	// TODO: 实现邮件通知
	// 可以使用 SMTP 发送邮件
	log.Printf("发送邮件通知到: %s", emailTo)
	return nil
}

// GetNodeStatus 获取节点当前状态
func (s *NodeMonitorService) GetNodeStatus(nodeID uint) (*model.NodeMonitor, error) {
	var monitor model.NodeMonitor
	err := s.db.Where("node_id = ?", nodeID).Order("created_at DESC").First(&monitor).Error
	return &monitor, err
}

// GetNodeHistory 获取节点历史监控数据
func (s *NodeMonitorService) GetNodeHistory(nodeID uint, hours int) ([]model.NodeMonitor, error) {
	var monitors []model.NodeMonitor
	since := time.Now().Add(-time.Duration(hours) * time.Hour)
	
	err := s.db.Where("node_id = ? AND created_at > ?", nodeID, since).
		Order("created_at DESC").
		Find(&monitors).Error
	
	return monitors, err
}

// CheckNodeNow 立即检查节点
func (s *NodeMonitorService) CheckNodeNow(nodeID uint) error {
	var healthCheck model.NodeHealthCheck
	if err := s.db.Where("node_id = ?", nodeID).First(&healthCheck).Error; err != nil {
		// 如果没有配置，创建默认配置
		healthCheck = model.NodeHealthCheck{
			NodeID:          nodeID,
			Enabled:         true,
			CheckInterval:   60,
			Timeout:         10,
			CheckXray:       true,
			CheckGost:       true,
			CheckPorts:      true,
			CheckLatency:    true,
			CheckPacketLoss: true,
		}
		if err := s.db.Create(&healthCheck).Error; err != nil {
			return err
		}
	}

	go s.checkNode(&healthCheck)
	return nil
}

// TestConnection 测试节点连接
func (s *NodeMonitorService) TestConnection(host string, port int) error {
	address := net.JoinHostPort(host, strconv.Itoa(port))
	conn, err := net.DialTimeout("tcp", address, 5*time.Second)
	if err != nil {
		return err
	}
	conn.Close()
	return nil
}
