package controllers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/services"
	"gorm.io/gorm"
)

// SubscriptionController 订阅控制器
type SubscriptionController struct {
	db                    *gorm.DB
	subscriptionService   *services.SubscriptionService
}

// NewSubscriptionController 创建订阅控制器
func NewSubscriptionController(db *gorm.DB) *SubscriptionController {
	return &SubscriptionController{
		db:                  db,
		subscriptionService: services.NewSubscriptionService(db),
	}
}

// GenerateSubscription 生成订阅
func (sc *SubscriptionController) GenerateSubscription(c *gin.Context) {
	userID, _ := c.Get("user_id")
	format := c.DefaultQuery("format", "v2ray") // v2ray, clash, surge

	subscription, err := sc.subscriptionService.GenerateXraySubscription(userID.(uint), format)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "生成订阅失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "生成订阅成功",
		"data": gin.H{
			"subscription": subscription,
			"format":       format,
		},
	})
}

// GetSubscriptionLink 获取订阅链接
func (sc *SubscriptionController) GetSubscriptionLink(c *gin.Context) {
	userID, _ := c.Get("user_id")

	// 创建或获取订阅令牌
	token, err := sc.subscriptionService.CreateSubscriptionToken(userID.(uint))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "创建订阅令牌失败: " + err.Error(),
		})
		return
	}

	// 生成订阅链接
	baseURL := c.Request.Host
	scheme := "http"
	if c.Request.TLS != nil {
		scheme = "https"
	}

	links := gin.H{
		"v2ray": scheme + "://" + baseURL + "/api/v1/sub/" + token + "?format=v2ray",
		"clash": scheme + "://" + baseURL + "/api/v1/sub/" + token + "?format=clash",
		"surge": scheme + "://" + baseURL + "/api/v1/sub/" + token + "?format=surge",
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "获取订阅链接成功",
		"data": gin.H{
			"token": token,
			"links": links,
		},
	})
}

// GetSubscriptionByToken 通过令牌获取订阅
func (sc *SubscriptionController) GetSubscriptionByToken(c *gin.Context) {
	token := c.Param("token")
	format := c.DefaultQuery("format", "v2ray")

	// 查找订阅
	var subscription struct {
		UserID uint
		Enable bool
	}

	if err := sc.db.Table("subscriptions").
		Where("token = ? AND enable = ?", token, true).
		First(&subscription).Error; err != nil {
		c.String(http.StatusNotFound, "订阅不存在或已禁用")
		return
	}

	// 生成订阅内容
	content, err := sc.subscriptionService.GenerateXraySubscription(subscription.UserID, format)
	if err != nil {
		c.String(http.StatusInternalServerError, "生成订阅失败: "+err.Error())
		return
	}

	// 根据格式设置响应头
	switch format {
	case "clash":
		c.Header("Content-Type", "application/x-yaml")
		c.Header("Content-Disposition", "attachment; filename=clash.yaml")
	case "surge":
		c.Header("Content-Type", "text/plain")
		c.Header("Content-Disposition", "attachment; filename=surge.conf")
	default:
		c.Header("Content-Type", "text/plain")
		c.Header("Content-Disposition", "attachment; filename=v2ray.txt")
	}

	c.Header("Subscription-Userinfo", "upload=0; download=0; total=0; expire=0")
	c.String(http.StatusOK, content)
}

// ListSubscriptions 获取订阅列表
func (sc *SubscriptionController) ListSubscriptions(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var subscriptions []struct {
		ID        uint   `json:"id"`
		Token     string `json:"token"`
		Enable    bool   `json:"enable"`
		CreatedAt string `json:"created_at"`
	}

	if err := sc.db.Table("subscriptions").
		Where("user_id = ?", userID).
		Find(&subscriptions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "获取订阅列表失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "获取订阅列表成功",
		"data":    subscriptions,
	})
}

// ToggleSubscription 切换订阅状态
func (sc *SubscriptionController) ToggleSubscription(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userID, _ := c.Get("user_id")

	var subscription struct {
		Enable bool
	}

	if err := sc.db.Table("subscriptions").
		Where("id = ? AND user_id = ?", id, userID).
		First(&subscription).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "订阅不存在",
		})
		return
	}

	// 切换状态
	newStatus := !subscription.Enable
	if err := sc.db.Table("subscriptions").
		Where("id = ?", id).
		Update("enable", newStatus).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "切换订阅状态失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "切换订阅状态成功",
		"data": gin.H{
			"enable": newStatus,
		},
	})
}

// DeleteSubscription 删除订阅
func (sc *SubscriptionController) DeleteSubscription(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userID, _ := c.Get("user_id")

	if err := sc.db.Table("subscriptions").
		Where("id = ? AND user_id = ?", id, userID).
		Delete(nil).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "删除订阅失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "删除订阅成功",
	})
}
