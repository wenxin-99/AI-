package controllers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/database/model"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// UserController 用户控制器
type UserController struct {
	db *gorm.DB
}

// NewUserController 创建用户控制器
func NewUserController(db *gorm.DB) *UserController {
	return &UserController{db: db}
}

// List 获取用户列表
func (uc *UserController) List(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

	var users []model.User
	var total int64

	offset := (page - 1) * pageSize

	uc.db.Model(&model.User{}).Count(&total)
	uc.db.Offset(offset).Limit(pageSize).Find(&users)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"users": users,
			"total": total,
			"page":  page,
			"page_size": pageSize,
		},
	})
}

// CreateUserRequest 创建用户请求
type CreateUserRequest struct {
	Username     string `json:"username" binding:"required"`
	Password     string `json:"password" binding:"required"`
	Email        string `json:"email"`
	Role         string `json:"role"`
	TrafficLimit int64  `json:"traffic_limit"`
}

// Create 创建用户
func (uc *UserController) Create(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误",
		})
		return
	}

	// 检查用户名是否已存在
	var count int64
	uc.db.Model(&model.User{}).Where("username = ?", req.Username).Count(&count)
	if count > 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "用户名已存在",
		})
		return
	}

	// 密码加密
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "密码加密失败",
		})
		return
	}

	user := &model.User{
		Username:     req.Username,
		Password:     string(hashedPassword),
		Email:        req.Email,
		Role:         req.Role,
		TrafficLimit: req.TrafficLimit,
		Status:       "active",
	}

	if err := uc.db.Create(user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "创建用户失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "创建成功",
		"data":    user,
	})
}

// Get 获取用户详情
func (uc *UserController) Get(c *gin.Context) {
	id := c.Param("id")

	var user model.User
	if err := uc.db.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "用户不存在",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    user,
	})
}

// UpdateUserRequest 更新用户请求
type UpdateUserRequest struct {
	Email        string `json:"email"`
	Password     string `json:"password"`
	Role         string `json:"role"`
	Status       string `json:"status"`
	TrafficLimit int64  `json:"traffic_limit"`
}

// Update 更新用户
func (uc *UserController) Update(c *gin.Context) {
	id := c.Param("id")

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "请求参数错误",
		})
		return
	}

	var user model.User
	if err := uc.db.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "用户不存在",
		})
		return
	}

	// 更新字段
	if req.Email != "" {
		user.Email = req.Email
	}
	if req.Password != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "密码加密失败",
			})
			return
		}
		user.Password = string(hashedPassword)
	}
	if req.Role != "" {
		user.Role = req.Role
	}
	if req.Status != "" {
		user.Status = req.Status
	}
	if req.TrafficLimit > 0 {
		user.TrafficLimit = req.TrafficLimit
	}

	if err := uc.db.Save(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "更新失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "更新成功",
		"data":    user,
	})
}

// Delete 删除用户
func (uc *UserController) Delete(c *gin.Context) {
	id := c.Param("id")

	if err := uc.db.Delete(&model.User{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "删除失败",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "删除成功",
	})
}

// GetTraffic 获取用户流量
func (uc *UserController) GetTraffic(c *gin.Context) {
	id := c.Param("id")

	var user model.User
	if err := uc.db.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "用户不存在",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"traffic_limit": user.TrafficLimit,
			"traffic_used":  user.TrafficUsed,
			"traffic_remaining": user.TrafficLimit - user.TrafficUsed,
		},
	})
}

// ResetTraffic 重置用户流量
func (uc *UserController) ResetTraffic(c *gin.Context) {
	id := c.Param("id")

	var user model.User
	if err := uc.db.First(&user, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "用户不存在",
		})
		return
	}

	user.TrafficUsed = 0
	if err := uc.db.Save(&user).Error; err != nil {
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
