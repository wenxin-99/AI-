package database

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/uniproxy/panel/config"
	"github.com/uniproxy/panel/database/model"
	"golang.org/x/crypto/bcrypt"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// InitDB 初始化数据库连接
func InitDB(cfg *config.Config) (*gorm.DB, error) {
	var dialector gorm.Dialector

	switch cfg.Database.Type {
	case "sqlite":
		// 确保数据目录存在
		dbPath := cfg.Database.SQLite.Path
		dbDir := filepath.Dir(dbPath)
		if err := os.MkdirAll(dbDir, 0755); err != nil {
			return nil, fmt.Errorf("创建数据库目录失败: %w", err)
		}
			// 使用 glebarez/sqlite 驱动 (纯 Go 实现,不需要 CGO)
			dialector = sqlite.Open(dbPath)
		log.Printf("使用 SQLite 数据库: %s", dbPath)

	case "mysql":
		dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=%s&parseTime=True&loc=Local",
			cfg.Database.MySQL.User,
			cfg.Database.MySQL.Password,
			cfg.Database.MySQL.Host,
			cfg.Database.MySQL.Port,
			cfg.Database.MySQL.Database,
			cfg.Database.MySQL.Charset,
		)
		dialector = mysql.Open(dsn)
		log.Printf("使用 MySQL 数据库: %s:%d/%s",
			cfg.Database.MySQL.Host,
			cfg.Database.MySQL.Port,
			cfg.Database.MySQL.Database,
		)

	default:
		return nil, fmt.Errorf("不支持的数据库类型: %s", cfg.Database.Type)
	}

	// GORM 配置
	gormConfig := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
		NowFunc: func() time.Time {
			return time.Now().Local()
		},
	}

	db, err := gorm.Open(dialector, gormConfig)
	if err != nil {
		return nil, fmt.Errorf("连接数据库失败: %w", err)
	}

	// 配置连接池
	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("获取数据库实例失败: %w", err)
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	return db, nil
}

// AutoMigrate 自动迁移数据库表
func AutoMigrate(db *gorm.DB) error {
	log.Println("开始数据库迁移...")

	err := db.AutoMigrate(
		&model.User{},
		&model.XrayInbound{},
		&model.XrayClient{},
		&model.GostTunnel{},
		&model.Node{},
		&model.TrafficLog{},
		&model.Setting{},
		&model.Subscription{},
		&model.Certificate{},
		&model.NodeMonitor{},
		&model.AlertRule{},
		&model.AlertLog{},
		&model.NodeHealthCheck{},
	)

	if err != nil {
		return fmt.Errorf("数据库迁移失败: %w", err)
	}

	log.Println("数据库迁移完成")

	// 初始化默认数据
	if err := initDefaultData(db); err != nil {
		return fmt.Errorf("初始化默认数据失败: %w", err)
	}

	return nil
}

// initDefaultData 初始化默认数据
func initDefaultData(db *gorm.DB) error {
	// 检查是否已存在管理员用户
	var count int64
	if err := db.Model(&model.User{}).Count(&count).Error; err != nil {
		return err
	}

	// 如果没有用户,创建默认管理员
	if count == 0 {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("生成密码哈希失败: %w", err)
		}

		adminUser := &model.User{
			Username: "admin",
			Password: string(hashedPassword),
			Email:    "admin@uniproxy.local",
			Role:     "admin",
			Status:   "active",
		}

		if err := db.Create(adminUser).Error; err != nil {
			return fmt.Errorf("创建管理员用户失败: %w", err)
		}

		log.Println("已创建默认管理员用户:")
		log.Println("  用户名: admin")
		log.Println("  密码: admin")
		log.Println("  ⚠️  请立即登录并修改默认密码!")
	}

	// 初始化默认系统设置
	defaultSettings := map[string]string{
		"panel_name":        "UniProxy Panel",
		"panel_version":     "1.0.0",
		"traffic_reset_day": "1", // 每月1号重置流量
	}

	for key, value := range defaultSettings {
		var setting model.Setting
		result := db.Where("key = ?", key).First(&setting)
		if result.Error == gorm.ErrRecordNotFound {
			setting = model.Setting{
				Key:   key,
				Value: value,
			}
			if err := db.Create(&setting).Error; err != nil {
				return fmt.Errorf("创建默认设置失败: %w", err)
			}
		}
	}

	return nil
}

// GetDB 获取数据库实例(用于依赖注入)
type Database struct {
	DB *gorm.DB
}

// NewDatabase 创建数据库实例
func NewDatabase(db *gorm.DB) *Database {
	return &Database{DB: db}
}
