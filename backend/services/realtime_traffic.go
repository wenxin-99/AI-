package services

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/uniproxy/panel/database/model"
	"gorm.io/gorm"
)

// RealtimeTrafficCollector 实时流量采集器
type RealtimeTrafficCollector struct {
	ctx    context.Context
	cancel context.CancelFunc
	mu     sync.RWMutex
	stats  map[string]*TrafficStats
	db     *gorm.DB
}

// TrafficStats 流量统计数据
type TrafficStats struct {
	Upload   int64     `json:"upload"`
	Download int64     `json:"download"`
	Speed    int64     `json:"speed"`
	LastTime time.Time `json:"last_time"`
}

var (
	realtimeCollector *RealtimeTrafficCollector
	collectorOnce     sync.Once
)

// GetRealtimeCollector 获取实时采集器单例
func GetRealtimeCollector(db *gorm.DB) *RealtimeTrafficCollector {
	collectorOnce.Do(func() {
		ctx, cancel := context.WithCancel(context.Background())
		realtimeCollector = &RealtimeTrafficCollector{
			ctx:    ctx,
			cancel: cancel,
			stats:  make(map[string]*TrafficStats),
			db:     db,
		}
		go realtimeCollector.Start()
	})
	return realtimeCollector
}

// Start 启动采集
func (c *RealtimeTrafficCollector) Start() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	log.Println("实时流量采集器已启动")

	for {
		select {
		case <-c.ctx.Done():
			log.Println("实时流量采集器已停止")
			return
		case <-ticker.C:
			c.collectStats()
		}
	}
}

// collectStats 采集统计数据
func (c *RealtimeTrafficCollector) collectStats() {
	if c.db == nil {
		return
	}

	// 获取所有用户的流量
	var users []model.User
	if err := c.db.Find(&users).Error; err != nil {
		log.Printf("查询用户失败: %v", err)
		return
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	for _, user := range users {
		key := user.Username
		if _, ok := c.stats[key]; !ok {
			c.stats[key] = &TrafficStats{}
		}

		// 计算速度 (最近5秒的流量变化)
		oldUpload := c.stats[key].Upload
		now := time.Now()
		duration := now.Sub(c.stats[key].LastTime).Seconds()

		if duration > 0 {
			uploadDiff := user.TrafficUsed - oldUpload
			c.stats[key].Speed = int64(float64(uploadDiff) / duration)
		}

		c.stats[key].Upload = user.TrafficUsed
		c.stats[key].Download = user.TrafficUsed
		c.stats[key].LastTime = now
	}
}

// GetStats 获取统计数据
func (c *RealtimeTrafficCollector) GetStats() map[string]*TrafficStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	// 复制数据避免并发问题
	result := make(map[string]*TrafficStats)
	for k, v := range c.stats {
		result[k] = &TrafficStats{
			Upload:   v.Upload,
			Download: v.Download,
			Speed:    v.Speed,
			LastTime: v.LastTime,
		}
	}

	return result
}

// GetUserStats 获取指定用户的统计
func (c *RealtimeTrafficCollector) GetUserStats(username string) *TrafficStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if stats, ok := c.stats[username]; ok {
		return &TrafficStats{
			Upload:   stats.Upload,
			Download: stats.Download,
			Speed:    stats.Speed,
			LastTime: stats.LastTime,
		}
	}

	return &TrafficStats{}
}

// Stop 停止采集
func (c *RealtimeTrafficCollector) Stop() {
	if c.cancel != nil {
		c.cancel()
	}
}
