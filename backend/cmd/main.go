package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/uniproxy/panel/api"
	"github.com/uniproxy/panel/config"
	"github.com/uniproxy/panel/database"
)

var (
	configFile = flag.String("config", "config.yaml", "配置文件路径")
	port       = flag.Int("port", 0, "面板端口")
	showVer    = flag.Bool("version", false, "显示版本信息")
)

const (
	Version = "1.0.0"
	Name    = "UniProxy Panel"
)

func main() {
	flag.Parse()

	if *showVer {
		fmt.Printf("%s v%s\n", Name, Version)
		return
	}

	// 加载配置
	cfg, err := config.Load(*configFile)
	if err != nil {
		log.Fatalf("加载配置失败: %v", err)
	}

	// 如果命令行指定了端口,覆盖配置文件
	if *port > 0 {
		cfg.Server.Port = *port
	}

	// 初始化数据库
	db, err := database.InitDB(cfg)
	if err != nil {
		log.Fatalf("初始化数据库失败: %v", err)
	}

	// 自动迁移数据库表
	if err := database.AutoMigrate(db); err != nil {
		log.Fatalf("数据库迁移失败: %v", err)
	}

	// 初始化种子数据
	if err := database.Seed(db); err != nil {
		log.Fatalf("种子数据初始化失败: %v", err)
	}

	log.Printf("启动 %s v%s", Name, Version)
	log.Printf("监听端口: %d", cfg.Server.Port)
	log.Printf("数据库类型: %s", cfg.Database.Type)

	// 初始化路由
	router := api.SetupRouter(cfg, db)

	// 启动服务器
	go func() {
		addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
		if cfg.Server.TLS.Enabled {
			log.Printf("HTTPS 服务器启动在 https://%s", addr)
			if err := router.RunTLS(addr, cfg.Server.TLS.CertFile, cfg.Server.TLS.KeyFile); err != nil {
				log.Fatalf("启动 HTTPS 服务器失败: %v", err)
			}
		} else {
			log.Printf("HTTP 服务器启动在 http://%s", addr)
			if err := router.Run(addr); err != nil {
				log.Fatalf("启动 HTTP 服务器失败: %v", err)
			}
		}
	}()

	// 等待中断信号
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("正在关闭服务器...")
}
