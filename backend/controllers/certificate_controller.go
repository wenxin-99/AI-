package controllers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/database/model"
	"github.com/uniproxy/panel/services"
	"gorm.io/gorm"
)

type CertificateController struct {
	db      *gorm.DB
	certSvc *services.CertificateService
}

func NewCertificateController(db *gorm.DB) *CertificateController {
	return &CertificateController{
		db:      db,
		certSvc: services.NewCertificateService(db),
	}
}

// ListCertificates 获取证书列表
func (c *CertificateController) ListCertificates(ctx *gin.Context) {
	var certs []model.Certificate
	if err := c.db.Find(&certs).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "获取证书列表失败"})
		return
	}

	// 更新过期状态
	for i := range certs {
		c.certSvc.UpdateCertificateStatus(&certs[i])
	}

	ctx.JSON(http.StatusOK, gin.H{
		"certificates": certs,
		"total":        len(certs),
	})
}

// GetCertificate 获取证书详情
func (c *CertificateController) GetCertificate(ctx *gin.Context) {
	id, err := strconv.ParseUint(ctx.Param("id"), 10, 32)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "无效的证书ID"})
		return
	}

	var cert model.Certificate
	if err := c.db.First(&cert, id).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			ctx.JSON(http.StatusNotFound, gin.H{"error": "证书不存在"})
		} else {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "获取证书失败"})
		}
		return
	}

	c.certSvc.UpdateCertificateStatus(&cert)
	ctx.JSON(http.StatusOK, cert)
}

// UploadCertificate 上传证书
func (c *CertificateController) UploadCertificate(ctx *gin.Context) {
	var req struct {
		Name     string `json:"name" binding:"required"`
		CertData string `json:"cert_data" binding:"required"`
		KeyData  string `json:"key_data" binding:"required"`
	}

	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误: " + err.Error()})
		return
	}

	cert, err := c.certSvc.UploadCertificate(req.Name, req.CertData, req.KeyData)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "上传证书失败: " + err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message":     "证书上传成功",
		"certificate": cert,
	})
}

// GenerateSelfSignedCert 生成自签名证书
func (c *CertificateController) GenerateSelfSignedCert(ctx *gin.Context) {
	var req struct {
		Name   string `json:"name" binding:"required"`
		Domain string `json:"domain" binding:"required"`
	}

	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误: " + err.Error()})
		return
	}

	cert, err := c.certSvc.GenerateSelfSignedCert(req.Name, req.Domain)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "生成证书失败: " + err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message":     "自签名证书生成成功",
		"certificate": cert,
	})
}

// DeleteCertificate 删除证书
func (c *CertificateController) DeleteCertificate(ctx *gin.Context) {
	id, err := strconv.ParseUint(ctx.Param("id"), 10, 32)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "无效的证书ID"})
		return
	}

	if err := c.certSvc.DeleteCertificate(uint(id)); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "删除证书失败: " + err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "证书删除成功"})
}

// CheckExpiring 检查即将过期的证书
func (c *CertificateController) CheckExpiring(ctx *gin.Context) {
	certs, err := c.certSvc.GetExpiringCertificates(30)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "检查证书失败"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"expiring_certificates": certs,
		"count":                 len(certs),
	})
}
