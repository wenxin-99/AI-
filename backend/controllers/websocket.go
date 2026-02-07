package controllers

import (
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/uniproxy/panel/services"
	"gorm.io/gorm"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // 允许所有来源
	},
}

// WebSocketController WebSocket 控制器
type WebSocketController struct {
	db             *gorm.DB
	trafficService *services.TrafficService
}

// NewWebSocketController 创建 WebSocket 控制器
func NewWebSocketController(db *gorm.DB) *WebSocketController {
	return &WebSocketController{
		db:             db,
		trafficService: services.NewTrafficService(db),
	}
}

// HandleRealtimeTraffic 处理实时流量推送
func (wc *WebSocketController) HandleRealtimeTraffic(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket 升级失败: %v", err)
		return
	}
	defer conn.Close()

	log.Println("实时流量 WebSocket 客户端已连接")

	// 获取实时采集器
	collector := services.GetRealtimeCollector(wc.db)

	// 创建定时器,每秒推送一次数据
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// 获取实时统计数据
			stats := collector.GetStats()

			// 发送数据
			if err := conn.WriteJSON(stats); err != nil {
				log.Printf("发送数据失败: %v", err)
				return
			}
		}
	}
}



// HandleTrafficStream 处理流量数据流
func (wc *WebSocketController) HandleTrafficStream(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket 升级失败: %v", err)
		return
	}
	defer conn.Close()

	log.Println("WebSocket 客户端已连接")

	// 创建定时器,每秒推送一次数据
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// 获取系统流量统计
			now := time.Now()
			startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
			stats, err := wc.trafficService.GetSystemTraffic(startOfDay, now)
			if err != nil {
				log.Printf("获取系统流量失败: %v", err)
				continue
			}

			// 发送数据
			if err := conn.WriteJSON(stats); err != nil{
				log.Printf("发送 WebSocket 消息失败: %v", err)
				return
			}
		}
	}
}

// HandleSystemStatus 处理系统状态流
func (wc *WebSocketController) HandleSystemStatus(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket 升级失败: %v", err)
		return
	}
	defer conn.Close()

	log.Println("系统状态 WebSocket 客户端已连接")

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// 获取系统状态
			status := map[string]interface{}{
				"timestamp": time.Now().Unix(),
				"xray": map[string]interface{}{
					"running": true, // 实际应该检查进程状态
					"uptime":  3600,
				},
				"gost": map[string]interface{}{
					"running": false,
					"uptime":  0,
				},
			}

			// 发送数据
			if err := conn.WriteJSON(status); err != nil {
				log.Printf("发送 WebSocket 消息失败: %v", err)
				return
			}
		}
	}
}
