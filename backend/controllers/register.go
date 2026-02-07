package controllers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/config"
	"github.com/uniproxy/panel/database/model"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// RegisterController 注册控制器
type RegisterController struct {
	cfg *config.Config
	db  *gorm.DB
}

// NewRegisterController 创建注册控制器
func NewRegisterController(cfg *config.Config, db *gorm.DB) *RegisterController {
	return &RegisterController{
		cfg: cfg,
		db:  db,
	}
}

// Register 用户注册
func (rc *RegisterController) Register(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required,min=3,max=20"`
		Password string `json:"password" binding:"required,min=6"`
		Email    string `json:"email" binding:"required,email"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误: " + err.Error(),
		})
		return
	}

	// 检查用户名是否已存在
	var count int64
	rc.db.Model(&model.User{}).Where("username = ?", req.Username).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "用户名已存在",
		})
		return
	}

	// 检查邮箱是否已存在
	rc.db.Model(&model.User{}).Where("email = ?", req.Email).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "邮箱已被注册",
		})
		return
	}

	// 加密密码
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "密码加密失败",
		})
		return
	}

	// 创建用户
	user := &model.User{
		Username:  req.Username,
		Password:  string(hashedPassword),
		Email:     req.Email,
		Role:         "user", // 默认角色为普通用户
		IsAdmin:      false,
		Enabled:      true,
		Status:       "active",
		TrafficLimit: 10 * 1024 * 1024 * 1024, // 默认10GB流量
		ExpireTime:   &[]time.Time{time.Now().AddDate(0, 1, 0)}[0], // 默认1个月有效期
	}

	if err := rc.db.Create(user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "创建用户失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "注册成功",
		"data": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
		},
	})
}

// CheckUsername 检查用户名是否可用
func (rc *RegisterController) CheckUsername(c *gin.Context) {
	username := c.Query("username")
	if username == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "用户名不能为空",
		})
		return
	}

	var count int64
	rc.db.Model(&model.User{}).Where("username = ?", username).Count(&count)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"available": count == 0,
		},
	})
}

// CheckEmail 检查邮箱是否可用
func (rc *RegisterController) CheckEmail(c *gin.Context) {
	email := c.Query("email")
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "邮箱不能为空",
		})
		return
	}

	var count int64
	rc.db.Model(&model.User{}).Where("email = ?", email).Count(&count)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"available": count == 0,
		},
	})
}
