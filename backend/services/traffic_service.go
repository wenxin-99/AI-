package services

import (
	"fmt"
	"time"

	"github.com/uniproxy/panel/database/model"
	"gorm.io/gorm"
)

// TrafficService 流量统计服务
type TrafficService struct {
	db *gorm.DB
}

// NewTrafficService 创建流量统计服务
func NewTrafficService(db *gorm.DB) *TrafficService {
	return &TrafficService{db: db}
}

// RecordTraffic 记录流量
func (ts *TrafficService) RecordTraffic(userID uint, inbound string, upload, download int64) error {
	// 创建流量日志
	log := &model.TrafficLog{
		UserID:   userID,
		Inbound:  inbound,
		Upload:   upload,
		Download: download,
	}

	if err := ts.db.Create(log).Error; err != nil {
		return fmt.Errorf("创建流量日志失败: %v", err)
	}

	// 更新用户已用流量
	return ts.db.Model(&model.User{}).
		Where("id = ?", userID).
		Update("traffic_used", gorm.Expr("traffic_used + ?", upload+download)).
		Error
}

// GetUserTraffic 获取用户流量统计
func (ts *TrafficService) GetUserTraffic(userID uint, startTime, endTime time.Time) (map[string]interface{}, error) {
	var logs []model.TrafficLog
	
	query := ts.db.Where("user_id = ?", userID)
	if !startTime.IsZero() {
		query = query.Where("created_at >= ?", startTime)
	}
	if !endTime.IsZero() {
		query = query.Where("created_at <= ?", endTime)
	}
	
	if err := query.Find(&logs).Error; err != nil {
		return nil, err
	}

	var totalUpload, totalDownload int64
	for _, log := range logs {
		totalUpload += log.Upload
		totalDownload += log.Download
	}

	return map[string]interface{}{
		"total_upload":   totalUpload,
		"total_download": totalDownload,
		"total":          totalUpload + totalDownload,
		"logs":           logs,
	}, nil
}

// GetInboundTraffic 获取入站流量统计
func (ts *TrafficService) GetInboundTraffic(inbound string, startTime, endTime time.Time) (map[string]interface{}, error) {
	var logs []model.TrafficLog
	
	query := ts.db.Where("inbound = ?", inbound)
	if !startTime.IsZero() {
		query = query.Where("created_at >= ?", startTime)
	}
	if !endTime.IsZero() {
		query = query.Where("created_at <= ?", endTime)
	}
	
	if err := query.Find(&logs).Error; err != nil {
		return nil, err
	}

	var totalUpload, totalDownload int64
	userTraffic := make(map[uint]int64)
	
	for _, log := range logs {
		totalUpload += log.Upload
		totalDownload += log.Download
		userTraffic[log.UserID] += log.Upload + log.Download
	}

	return map[string]interface{}{
		"total_upload":   totalUpload,
		"total_download": totalDownload,
		"total":          totalUpload + totalDownload,
		"user_count":     len(userTraffic),
		"user_traffic":   userTraffic,
	}, nil
}

// GetSystemTraffic 获取系统总流量统计
func (ts *TrafficService) GetSystemTraffic(startTime, endTime time.Time) (map[string]interface{}, error) {
	var logs []model.TrafficLog
	
	query := ts.db.Model(&model.TrafficLog{})
	if !startTime.IsZero() {
		query = query.Where("created_at >= ?", startTime)
	}
	if !endTime.IsZero() {
		query = query.Where("created_at <= ?", endTime)
	}
	
	if err := query.Find(&logs).Error; err != nil {
		return nil, err
	}

	var totalUpload, totalDownload int64
	inboundTraffic := make(map[string]int64)
	
	for _, log := range logs {
		totalUpload += log.Upload
		totalDownload += log.Download
		inboundTraffic[log.Inbound] += log.Upload + log.Download
	}

	return map[string]interface{}{
		"total_upload":     totalUpload,
		"total_download":   totalDownload,
		"total":            totalUpload + totalDownload,
		"inbound_count":    len(inboundTraffic),
		"inbound_traffic":  inboundTraffic,
	}, nil
}

// GetTrafficTrend 获取流量趋势
func (ts *TrafficService) GetTrafficTrend(days int) ([]map[string]interface{}, error) {
	startTime := time.Now().AddDate(0, 0, -days)
	
	var result []map[string]interface{}
	
	for i := 0; i < days; i++ {
		dayStart := startTime.AddDate(0, 0, i)
		dayEnd := dayStart.Add(24 * time.Hour)
		
		var totalUpload, totalDownload int64
		ts.db.Model(&model.TrafficLog{}).
			Where("created_at >= ? AND created_at < ?", dayStart, dayEnd).
			Select("COALESCE(SUM(upload), 0) as total_upload, COALESCE(SUM(download), 0) as total_download").
			Row().
			Scan(&totalUpload, &totalDownload)
		
		result = append(result, map[string]interface{}{
			"date":     dayStart.Format("2006-01-02"),
			"upload":   totalUpload,
			"download": totalDownload,
			"total":    totalUpload + totalDownload,
		})
	}
	
	return result, nil
}

// CleanOldLogs 清理旧日志
func (ts *TrafficService) CleanOldLogs(days int) error {
	cutoffTime := time.Now().AddDate(0, 0, -days)
	return ts.db.Where("created_at < ?", cutoffTime).Delete(&model.TrafficLog{}).Error
}

// CheckUserQuota 检查用户配额
func (ts *TrafficService) CheckUserQuota(userID uint) (bool, error) {
	var user model.User
	if err := ts.db.First(&user, userID).Error; err != nil {
		return false, err
	}

	// 如果没有限制,返回true
	if user.TrafficLimit == 0 {
		return true, nil
	}

	// 检查是否超过配额
	return user.TrafficUsed < user.TrafficLimit, nil
}

// ResetUserTraffic 重置用户流量
func (ts *TrafficService) ResetUserTraffic(userID uint) error {
	return ts.db.Model(&model.User{}).
		Where("id = ?", userID).
		Update("traffic_used", 0).
		Error
}

// ResetAllUserTraffic 重置所有用户流量
func (ts *TrafficService) ResetAllUserTraffic() error {
	return ts.db.Model(&model.User{}).
		Update("traffic_used", 0).
		Error
}
