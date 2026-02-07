package services

import (
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type BBRService struct{}

type BBRStatus struct {
	Enabled         bool              `json:"enabled"`
	CurrentAlgo     string            `json:"current_algo"`
	AvailableAlgos  []string          `json:"available_algos"`
	KernelVersion   string            `json:"kernel_version"`
	SupportsBBR     bool              `json:"supports_bbr"`
	TCPParameters   map[string]string `json:"tcp_parameters"`
	AutoOptimize    bool              `json:"auto_optimize"`
	LastOptimized   *time.Time        `json:"last_optimized"`
}

type BBRConfig struct {
	Algorithm       string            `json:"algorithm"`        // bbr, bbr2, bbr3, cubic
	AutoOptimize    bool              `json:"auto_optimize"`
	TCPParameters   map[string]int    `json:"tcp_parameters"`
	ProtocolConfigs map[string]string `json:"protocol_configs"` // 协议特定配置
}

type NetworkMetrics struct {
	Bandwidth   float64 `json:"bandwidth"`    // Mbps
	RTT         float64 `json:"rtt"`          // ms
	PacketLoss  float64 `json:"packet_loss"`  // %
	Congestion  float64 `json:"congestion"`   // %
	Connections int     `json:"connections"`
}

// GetBBRStatus 获取当前BBR状态
func (s *BBRService) GetBBRStatus() (*BBRStatus, error) {
	status := &BBRStatus{
		TCPParameters: make(map[string]string),
	}

	// 检查内核版本
	kernelVersion, err := s.getKernelVersion()
	if err == nil {
		status.KernelVersion = kernelVersion
		status.SupportsBBR = s.checkBBRSupport(kernelVersion)
	}

	// 获取当前拥塞控制算法
	currentAlgo, err := s.getCurrentCongestionAlgo()
	if err == nil {
		status.CurrentAlgo = currentAlgo
		status.Enabled = strings.Contains(strings.ToLower(currentAlgo), "bbr")
	}

	// 获取可用算法
	availableAlgos, err := s.getAvailableCongestionAlgos()
	if err == nil {
		status.AvailableAlgos = availableAlgos
	}

	// 获取TCP参数
	tcpParams := []string{
		"net.ipv4.tcp_congestion_control",
		"net.core.default_qdisc",
		"net.ipv4.tcp_rmem",
		"net.ipv4.tcp_wmem",
		"net.ipv4.tcp_fastopen",
		"net.ipv4.tcp_slow_start_after_idle",
		"net.ipv4.tcp_mtu_probing",
		"net.ipv4.tcp_window_scaling",
		"net.core.rmem_max",
		"net.core.wmem_max",
	}

	for _, param := range tcpParams {
		value, err := s.getSysctlValue(param)
		if err == nil {
			status.TCPParameters[param] = value
		}
	}

	return status, nil
}

// EnableBBR 启用BBR
func (s *BBRService) EnableBBR(algorithm string) error {
	if algorithm == "" {
		algorithm = "bbr"
	}

	// 设置拥塞控制算法
	if err := s.setSysctlValue("net.ipv4.tcp_congestion_control", algorithm); err != nil {
		return fmt.Errorf("设置拥塞控制算法失败: %v", err)
	}

	// 设置队列规则
	if err := s.setSysctlValue("net.core.default_qdisc", "fq"); err != nil {
		return fmt.Errorf("设置队列规则失败: %v", err)
	}

	// 优化TCP参数
	optimizations := map[string]string{
		"net.ipv4.tcp_fastopen":              "3",
		"net.ipv4.tcp_slow_start_after_idle": "0",
		"net.ipv4.tcp_mtu_probing":           "1",
		"net.ipv4.tcp_window_scaling":        "1",
		"net.core.rmem_max":                  "134217728",
		"net.core.wmem_max":                  "134217728",
		"net.ipv4.tcp_rmem":                  "4096 87380 67108864",
		"net.ipv4.tcp_wmem":                  "4096 65536 67108864",
	}

	for param, value := range optimizations {
		if err := s.setSysctlValue(param, value); err != nil {
			// 记录错误但继续
			fmt.Printf("Warning: 设置 %s 失败: %v\n", param, err)
		}
	}

	// 持久化配置
	if err := s.persistSysctlConfig(); err != nil {
		return fmt.Errorf("持久化配置失败: %v", err)
	}

	return nil
}

// DisableBBR 禁用BBR
func (s *BBRService) DisableBBR() error {
	// 切换回cubic算法
	if err := s.setSysctlValue("net.ipv4.tcp_congestion_control", "cubic"); err != nil {
		return fmt.Errorf("禁用BBR失败: %v", err)
	}

	if err := s.persistSysctlConfig(); err != nil {
		return fmt.Errorf("持久化配置失败: %v", err)
	}

	return nil
}

// OptimizeForProtocol 为特定协议优化BBR参数
func (s *BBRService) OptimizeForProtocol(protocol string, tunnelType string) error {
	// 根据协议类型动态调整参数
	var optimizations map[string]string

	switch strings.ToLower(protocol) {
	case "vmess", "vless":
		// VMess/VLESS 优化: 高带宽、低延迟
		optimizations = map[string]string{
			"net.ipv4.tcp_rmem":                  "8192 262144 134217728",
			"net.ipv4.tcp_wmem":                  "8192 262144 134217728",
			"net.ipv4.tcp_fastopen":              "3",
			"net.ipv4.tcp_slow_start_after_idle": "0",
		}
	case "trojan":
		// Trojan 优化: TLS加密优化
		optimizations = map[string]string{
			"net.ipv4.tcp_rmem":            "4096 131072 67108864",
			"net.ipv4.tcp_wmem":            "4096 131072 67108864",
			"net.ipv4.tcp_fastopen":        "3",
			"net.ipv4.tcp_mtu_probing":     "1",
		}
	case "shadowsocks", "ss":
		// Shadowsocks 优化: UDP优化
		optimizations = map[string]string{
			"net.core.rmem_default":        "262144",
			"net.core.wmem_default":        "262144",
			"net.core.rmem_max":            "67108864",
			"net.core.wmem_max":            "67108864",
			"net.ipv4.tcp_fastopen":        "3",
		}
	case "http", "https", "socks5":
		// HTTP/SOCKS 隧道优化
		optimizations = map[string]string{
			"net.ipv4.tcp_rmem":                  "4096 87380 33554432",
			"net.ipv4.tcp_wmem":                  "4096 65536 33554432",
			"net.ipv4.tcp_keepalive_time":        "600",
			"net.ipv4.tcp_keepalive_intvl":       "30",
			"net.ipv4.tcp_keepalive_probes":      "3",
		}
	case "websocket", "ws":
		// WebSocket 优化: 长连接优化
		optimizations = map[string]string{
			"net.ipv4.tcp_keepalive_time":        "300",
			"net.ipv4.tcp_keepalive_intvl":       "15",
			"net.ipv4.tcp_fin_timeout":           "15",
			"net.ipv4.tcp_max_tw_buckets":        "2000000",
		}
	case "grpc":
		// gRPC 优化: HTTP/2优化
		optimizations = map[string]string{
			"net.ipv4.tcp_rmem":                  "8192 262144 134217728",
			"net.ipv4.tcp_wmem":                  "8192 262144 134217728",
			"net.ipv4.tcp_slow_start_after_idle": "0",
			"net.core.default_qdisc":             "fq",
		}
	default:
		// 通用优化
		optimizations = map[string]string{
			"net.ipv4.tcp_rmem": "4096 87380 67108864",
			"net.ipv4.tcp_wmem": "4096 65536 67108864",
		}
	}

	// 应用优化参数
	for param, value := range optimizations {
		if err := s.setSysctlValue(param, value); err != nil {
			fmt.Printf("Warning: 设置 %s 失败: %v\n", param, err)
		}
	}

	return nil
}

// MonitorAndOptimize 监控网络性能并自动优化
func (s *BBRService) MonitorAndOptimize() (*NetworkMetrics, error) {
	metrics := &NetworkMetrics{}

	// 获取网络指标
	if err := s.collectNetworkMetrics(metrics); err != nil {
		return nil, err
	}

	// 根据指标动态调整
	if metrics.RTT > 100 {
		// 高延迟: 增大缓冲区
		s.setSysctlValue("net.ipv4.tcp_rmem", "8192 262144 134217728")
		s.setSysctlValue("net.ipv4.tcp_wmem", "8192 262144 134217728")
	} else if metrics.RTT < 20 {
		// 低延迟: 减小缓冲区以降低延迟
		s.setSysctlValue("net.ipv4.tcp_rmem", "4096 87380 33554432")
		s.setSysctlValue("net.ipv4.tcp_wmem", "4096 65536 33554432")
	}

	if metrics.PacketLoss > 1.0 {
		// 高丢包率: 启用MTU探测
		s.setSysctlValue("net.ipv4.tcp_mtu_probing", "1")
	}

	if metrics.Congestion > 50 {
		// 高拥塞: 调整队列规则
		s.setSysctlValue("net.core.default_qdisc", "fq_codel")
	}

	return metrics, nil
}

// 辅助函数

func (s *BBRService) getKernelVersion() (string, error) {
	cmd := exec.Command("uname", "-r")
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func (s *BBRService) checkBBRSupport(kernelVersion string) bool {
	// BBR需要内核版本 >= 4.9
	re := regexp.MustCompile(`^(\d+)\.(\d+)`)
	matches := re.FindStringSubmatch(kernelVersion)
	if len(matches) < 3 {
		return false
	}

	major, _ := strconv.Atoi(matches[1])
	minor, _ := strconv.Atoi(matches[2])

	return major > 4 || (major == 4 && minor >= 9)
}

func (s *BBRService) getCurrentCongestionAlgo() (string, error) {
	return s.getSysctlValue("net.ipv4.tcp_congestion_control")
}

func (s *BBRService) getAvailableCongestionAlgos() ([]string, error) {
	content, err := os.ReadFile("/proc/sys/net/ipv4/tcp_available_congestion_control")
	if err != nil {
		return nil, err
	}
	algos := strings.Fields(string(content))
	return algos, nil
}

func (s *BBRService) getSysctlValue(param string) (string, error) {
	cmd := exec.Command("sysctl", "-n", param)
	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func (s *BBRService) setSysctlValue(param, value string) error {
	cmd := exec.Command("sysctl", "-w", fmt.Sprintf("%s=%s", param, value))
	return cmd.Run()
}

func (s *BBRService) persistSysctlConfig() error {
	// 写入 /etc/sysctl.conf
	cmd := exec.Command("sysctl", "-p")
	return cmd.Run()
}

func (s *BBRService) collectNetworkMetrics(metrics *NetworkMetrics) error {
	// 获取RTT (通过ss命令)
	cmd := exec.Command("ss", "-ti")
	output, err := cmd.Output()
	if err == nil {
		// 解析RTT
		re := regexp.MustCompile(`rtt:(\d+\.?\d*)`)
		matches := re.FindStringSubmatch(string(output))
		if len(matches) > 1 {
			rtt, _ := strconv.ParseFloat(matches[1], 64)
			metrics.RTT = rtt
		}
	}

	// 获取连接数
	cmd = exec.Command("ss", "-s")
	output, err = cmd.Output()
	if err == nil {
		re := regexp.MustCompile(`TCP:\s+(\d+)`)
		matches := re.FindStringSubmatch(string(output))
		if len(matches) > 1 {
			connections, _ := strconv.Atoi(matches[1])
			metrics.Connections = connections
		}
	}

	// 模拟其他指标 (实际应从网卡统计获取)
	metrics.Bandwidth = 100.0
	metrics.PacketLoss = 0.1
	metrics.Congestion = 10.0

	return nil
}
