package controllers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp/totp"
	"github.com/uniproxy/panel/config"
	"github.com/uniproxy/panel/database/model"
	"github.com/uniproxy/panel/middleware"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// AuthController 认证控制器
type AuthController struct {
	cfg *config.Config
	db  *gorm.DB
}

// NewAuthController 创建认证控制器
func NewAuthController(cfg *config.Config, db *gorm.DB) *AuthController {
	return &AuthController{
		cfg: cfg,
		db:  db,
	}
}

// LoginRequest 登录请求
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	TwoFA    string `json:"two_fa"`
}

// Login 用户登录
func (ac *AuthController) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误",
		})
		return
	}

	// 查询用户
	var user model.User
	if err := ac.db.Where("username = ?", req.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "用户名或密码错误",
		})
		return
	}

	// 验证密码
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "用户名或密码错误",
		})
		return
	}

	// 检查用户状态
	if user.Status != "active" {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "用户已被禁用",
		})
		return
	}

	// 验证双因素认证
	if user.TwoFactorEnabled {
		if req.TwoFA == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": "需要双因素认证码",
				"require_2fa": true,
			})
			return
		}

		if !totp.Validate(req.TwoFA, user.TwoFactorSecret) {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": "双因素认证码错误",
			})
			return
		}
	}

	// 生成JWT令牌
	token, err := middleware.GenerateToken(user.ID, user.Username, user.Role, ac.cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "生成令牌失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "登录成功",
		"data": gin.H{
			"token": token,
			"user": gin.H{
				"id":       user.ID,
				"username": user.Username,
				"email":    user.Email,
				"role":     user.Role,
			},
		},
	})
}

// Logout 用户登出
func (ac *AuthController) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "登出成功",
	})
}

// RefreshToken 刷新令牌
func (ac *AuthController) RefreshToken(c *gin.Context) {
	userID, _ := c.Get("user_id")
	username, _ := c.Get("username")
	role, _ := c.Get("role")

	token, err := middleware.GenerateToken(userID.(uint), username.(string), role.(string), ac.cfg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "刷新令牌失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "刷新成功",
		"data": gin.H{
			"token": token,
		},
	})
}

// GetProfile 获取用户信息
func (ac *AuthController) GetProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var user model.User
	if err := ac.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "用户不存在",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"id":                 user.ID,
			"username":           user.Username,
			"email":              user.Email,
			"role":               user.Role,
			"status":             user.Status,
			"traffic_limit":      user.TrafficLimit,
			"traffic_used":       user.TrafficUsed,
			"expire_time":        user.ExpireTime,
			"two_factor_enabled": user.TwoFactorEnabled,
			"created_at":         user.CreatedAt,
		},
	})
}

// UpdateProfileRequest 更新用户信息请求
type UpdateProfileRequest struct {
	Email       string `json:"email"`
	OldPassword string `json:"old_password"`
	NewPassword string `json:"new_password"`
}

// UpdateProfile 更新用户信息
func (ac *AuthController) UpdateProfile(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误",
		})
		return
	}

	var user model.User
	if err := ac.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "用户不存在",
		})
		return
	}

	// 更新邮箱
	if req.Email != "" {
		user.Email = req.Email
	}

	// 更新密码
	if req.NewPassword != "" {
		if req.OldPassword == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": "请提供原密码",
			})
			return
		}

		// 验证原密码
		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.OldPassword)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"message": "原密码错误",
			})
			return
		}

		// 生成新密码哈希
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "密码加密失败",
			})
			return
		}
		user.Password = string(hashedPassword)
	}

	if err := ac.db.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "更新失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "更新成功",
	})
}

// Enable2FA 启用双因素认证
func (ac *AuthController) Enable2FA(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var user model.User
	if err := ac.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "用户不存在",
		})
		return
	}

	if user.TwoFactorEnabled {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "双因素认证已启用",
		})
		return
	}

	// 生成TOTP密钥
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      ac.cfg.Security.TwoFactorName,
		AccountName: user.Username,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "生成密钥失败",
		})
		return
	}

	user.TwoFactorSecret = key.Secret()
	user.TwoFactorEnabled = true

	if err := ac.db.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "保存失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "双因素认证已启用",
		"data": gin.H{
			"secret": key.Secret(),
			"qr_url": key.URL(),
		},
	})
}

// Verify2FARequest 验证双因素认证请求
type Verify2FARequest struct {
	Code string `json:"code" binding:"required"`
}

// Verify2FA 验证双因素认证
func (ac *AuthController) Verify2FA(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req Verify2FARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误",
		})
		return
	}

	var user model.User
	if err := ac.db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "用户不存在",
		})
		return
	}

	if !user.TwoFactorEnabled {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "双因素认证未启用",
		})
		return
	}

	if !totp.Validate(req.Code, user.TwoFactorSecret) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "验证码错误",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "验证成功",
	})
}
