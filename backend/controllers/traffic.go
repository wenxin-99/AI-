package controllers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/services"
	"gorm.io/gorm"
)

// TrafficController 流量统计控制器
type TrafficController struct {
	db      *gorm.DB
	service *services.TrafficService
}

// NewTrafficController 创建流量统计控制器
func NewTrafficController(db *gorm.DB) *TrafficController {
	return &TrafficController{
		db:      db,
		service: services.NewTrafficService(db),
	}
}

// GetUserTraffic 获取用户流量统计
func (tc *TrafficController) GetUserTraffic(c *gin.Context) {
	userID, _ := strconv.ParseUint(c.Param("user_id"), 10, 32)
	
	// 解析时间参数
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	
	var startTime, endTime time.Time
	if startTimeStr != "" {
		startTime, _ = time.Parse("2006-01-02", startTimeStr)
	}
	if endTimeStr != "" {
		endTime, _ = time.Parse("2006-01-02", endTimeStr)
	}
	
	traffic, err := tc.service.GetUserTraffic(uint(userID), startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "查询失败",
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    traffic,
	})
}

// GetInboundTraffic 获取入站流量统计
func (tc *TrafficController) GetInboundTraffic(c *gin.Context) {
	inbound := c.Param("inbound")
	
	// 解析时间参数
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	
	var startTime, endTime time.Time
	if startTimeStr != "" {
		startTime, _ = time.Parse("2006-01-02", startTimeStr)
	}
	if endTimeStr != "" {
		endTime, _ = time.Parse("2006-01-02", endTimeStr)
	}
	
	traffic, err := tc.service.GetInboundTraffic(inbound, startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "查询失败",
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    traffic,
	})
}

// GetSystemTraffic 获取系统总流量统计
func (tc *TrafficController) GetSystemTraffic(c *gin.Context) {
	// 解析时间参数
	startTimeStr := c.Query("start_time")
	endTimeStr := c.Query("end_time")
	
	var startTime, endTime time.Time
	if startTimeStr != "" {
		startTime, _ = time.Parse("2006-01-02", startTimeStr)
	}
	if endTimeStr != "" {
		endTime, _ = time.Parse("2006-01-02", endTimeStr)
	}
	
	traffic, err := tc.service.GetSystemTraffic(startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "查询失败",
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    traffic,
	})
}

// GetTrafficTrend 获取流量趋势
func (tc *TrafficController) GetTrafficTrend(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	
	if days < 1 || days > 90 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "天数范围: 1-90",
		})
		return
	}
	
	trend, err := tc.service.GetTrafficTrend(days)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "查询失败",
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    trend,
	})
}

// ResetUserTraffic 重置用户流量
func (tc *TrafficController) ResetUserTraffic(c *gin.Context) {
	userID, _ := strconv.ParseUint(c.Param("user_id"), 10, 32)
	
	if err := tc.service.ResetUserTraffic(uint(userID)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "重置失败",
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "流量已重置",
	})
}

// ResetAllUserTraffic 重置所有用户流量
func (tc *TrafficController) ResetAllUserTraffic(c *gin.Context) {
	if err := tc.service.ResetAllUserTraffic(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "重置失败",
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "所有用户流量已重置",
	})
}

// CleanOldLogs 清理旧日志
func (tc *TrafficController) CleanOldLogs(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	
	if days < 1 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "天数必须大于0",
		})
		return
	}
	
	if err := tc.service.CleanOldLogs(days); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "清理失败",
		})
		return
	}
	
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "旧日志已清理",
	})
}
