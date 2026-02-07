package database

import (
	"fmt"
	"time"

	"github.com/uniproxy/panel/database/model"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Seed 初始化种子数据
func Seed(db *gorm.DB) error {
	// 检查是否已有admin用户
	var count int64
	if err := db.Model(&model.User{}).Where("username = ?", "admin").Count(&count).Error; err != nil {
		return fmt.Errorf("检查管理员用户失败: %w", err)
	}

	if count > 0 {
		fmt.Println("管理员用户已存在,跳过种子数据初始化")
		return nil
	}

	// 创建默认管理员账户
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("密码加密失败: %w", err)
	}

	admin := &model.User{
		Username:     "admin",
		Password:     string(hashedPassword),
		Email:        "admin@uniproxy.local",
		IsAdmin:      true,
		TrafficLimit: 1099511627776, // 1TB
		TrafficUsed:  0,
		ExpireTime:   func() *time.Time { t := time.Now().AddDate(10, 0, 0); return &t }(), // 10年后过期
		Enabled:      true,
	}

	if err := db.Create(admin).Error; err != nil {
		return fmt.Errorf("创建管理员用户失败: %w", err)
	}

	fmt.Println("默认管理员账户创建成功:")
	fmt.Println("  用户名: admin")
	fmt.Println("  密码: admin")
	fmt.Println("  请登录后立即修改密码!")

	// 创建默认系统设置
	settings := []model.SystemSetting{
		{
			Key:   "panel_name",
			Value: "UniProxy Panel",
		},
		{
			Key:   "panel_version",
			Value: "1.0.0",
		},
		{
			Key:   "traffic_reset_day",
			Value: "1",
		},
		{
			Key:   "enable_registration",
			Value: "false",
		},
	}

	for _, setting := range settings {
		if err := db.Create(&setting).Error; err != nil {
			return fmt.Errorf("创建系统设置失败: %w", err)
		}
	}

	fmt.Println("种子数据初始化完成")
	return nil
}
