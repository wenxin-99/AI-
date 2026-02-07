package services

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/uniproxy/panel/database/model"
	"gorm.io/gorm"
)

// TrafficCollector 流量采集器
type TrafficCollector struct {
	db          *gorm.DB
	xrayAPIURL  string
	ticker      *time.Ticker
	stopChan    chan bool
}

// NewTrafficCollector 创建流量采集器
func NewTrafficCollector(db *gorm.DB, xrayAPIURL string) *TrafficCollector {
	return &TrafficCollector{
		db:         db,
		xrayAPIURL: xrayAPIURL,
		stopChan:   make(chan bool),
	}
}

// Start 启动流量采集
func (tc *TrafficCollector) Start(interval time.Duration) {
	tc.ticker = time.NewTicker(interval)
	
	go func() {
		for {
			select {
			case <-tc.ticker.C:
				tc.collectXrayTraffic()
			case <-tc.stopChan:
				tc.ticker.Stop()
				return
			}
		}
	}()
	
	log.Printf("流量采集器已启动,采集间隔: %v", interval)
}

// Stop 停止流量采集
func (tc *TrafficCollector) Stop() {
	tc.stopChan <- true
	log.Println("流量采集器已停止")
}

// XrayStatsResponse Xray Stats API 响应
type XrayStatsResponse struct {
	Stat []struct {
		Name  string `json:"name"`
		Value int64  `json:"value"`
	} `json:"stat"`
}

// collectXrayTraffic 采集 Xray 流量数据
func (tc *TrafficCollector) collectXrayTraffic() {
	// 调用 Xray Stats API
	resp, err := http.Get(tc.xrayAPIURL + "/stats/query")
	if err != nil {
		log.Printf("获取 Xray 流量数据失败: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("Xray API 返回错误状态码: %d", resp.StatusCode)
		return
	}

	var statsResp XrayStatsResponse
	if err := json.NewDecoder(resp.Body).Decode(&statsResp); err != nil {
		log.Printf("解析 Xray 流量数据失败: %v", err)
		return
	}

	// 解析流量数据并记录
	trafficMap := make(map[string]*TrafficData)
	
	for _, stat := range statsResp.Stat {
		// 解析统计名称: user>>>email>>>traffic>>>uplink/downlink
		email, trafficType := parseStatName(stat.Name)
		if email == "" {
			continue
		}

		if _, exists := trafficMap[email]; !exists {
			trafficMap[email] = &TrafficData{
				Email: email,
			}
		}

		if trafficType == "uplink" {
			trafficMap[email].Upload = stat.Value
		} else if trafficType == "downlink" {
			trafficMap[email].Download = stat.Value
		}
	}

	// 保存到数据库
	for email, traffic := range trafficMap {
		// 查找用户
		var client model.XrayClient
		if err := tc.db.Where("email = ?", email).First(&client).Error; err != nil {
			continue
		}

		// 创建流量日志
		trafficLog := &model.TrafficLog{
			UserID:     client.InboundID, // 使用 InboundID 作为 UserID
			Inbound:    fmt.Sprintf("xray-%d", client.InboundID),
			Upload:     traffic.Upload,
			Download:   traffic.Download,
			RecordedAt: time.Now(),
		}

		if err := tc.db.Create(trafficLog).Error; err != nil {
			log.Printf("保存流量日志失败: %v", err)
		}

		// 更新客户端已用流量
		client.TrafficUp += traffic.Upload
		client.TrafficDown += traffic.Download
		if err := tc.db.Save(&client).Error; err != nil {
			log.Printf("更新客户端流量失败: %v", err)
		}
	}

	log.Printf("已采集 %d 个客户端的流量数据", len(trafficMap))
}

// TrafficData 流量数据
type TrafficData struct {
	Email    string
	Upload   int64
	Download int64
}

// parseStatName 解析统计名称
func parseStatName(name string) (email string, trafficType string) {
	// 格式: user>>>email>>>traffic>>>uplink
	// 或: user>>>email>>>traffic>>>downlink
	
	// 简化实现:提取 email 和流量类型
	// 实际应该使用正则表达式或字符串分割
	
	// 这里返回空,实际需要根据 Xray Stats API 的实际格式解析
	return "", ""
}

// CollectGostTraffic 采集 Gost 流量数据
func (tc *TrafficCollector) CollectGostTraffic() {
	// Gost 没有内置的 Stats API
	// 需要从日志文件解析或使用其他方式
	// 这里暂不实现
	log.Println("Gost 流量采集暂未实现")
}
