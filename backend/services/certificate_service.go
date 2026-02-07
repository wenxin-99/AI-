package services

import (
"crypto/rand"
"crypto/rsa"
"crypto/x509"
"crypto/x509/pkix"
"encoding/pem"
"fmt"
"math/big"
"os"
"path/filepath"
"time"

"github.com/uniproxy/panel/database/model"
"gorm.io/gorm"
)

type CertificateService struct {
db       *gorm.DB
certPath string
}

func NewCertificateService(db *gorm.DB) *CertificateService {
certPath := "/etc/uniproxy/certs"
os.MkdirAll(certPath, 0755)
return &CertificateService{
db:       db,
certPath: certPath,
}
}

// UploadCertificate 上传证书
func (s *CertificateService) UploadCertificate(name, certData, keyData string) (*model.Certificate, error) {
// 解析证书
block, _ := pem.Decode([]byte(certData))
if block == nil {
return nil, fmt.Errorf("无效的证书格式")
}

cert, err := x509.ParseCertificate(block.Bytes)
if err != nil {
return nil, fmt.Errorf("解析证书失败: %w", err)
}

// 保存证书文件
certFile := filepath.Join(s.certPath, fmt.Sprintf("%s.crt", name))
keyFile := filepath.Join(s.certPath, fmt.Sprintf("%s.key", name))

if err := os.WriteFile(certFile, []byte(certData), 0644); err != nil {
return nil, fmt.Errorf("保存证书文件失败: %w", err)
}

if err := os.WriteFile(keyFile, []byte(keyData), 0600); err != nil {
os.Remove(certFile)
return nil, fmt.Errorf("保存密钥文件失败: %w", err)
}

// 创建数据库记录
daysLeft := int(time.Until(cert.NotAfter).Hours() / 24)
status := "active"
if daysLeft < 0 {
status = "expired"
} else if daysLeft < 30 {
status = "expiring"
}

certificate := &model.Certificate{
Name:      name,
Domain:    cert.Subject.CommonName,
CertPath:  certFile,
KeyPath:   keyFile,
Issuer:    cert.Issuer.CommonName,
NotBefore: cert.NotBefore,
NotAfter:  cert.NotAfter,
DaysLeft:  daysLeft,
Type:      "uploaded",
Status:    status,
}

if err := s.db.Create(certificate).Error; err != nil {
os.Remove(certFile)
os.Remove(keyFile)
return nil, fmt.Errorf("保存证书记录失败: %w", err)
}

return certificate, nil
}

// GenerateSelfSignedCert 生成自签名证书
func (s *CertificateService) GenerateSelfSignedCert(name, domain string) (*model.Certificate, error) {
// 生成RSA密钥对
privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
if err != nil {
return nil, fmt.Errorf("生成密钥失败: %w", err)
}

// 创建证书模板
template := x509.Certificate{
SerialNumber: big.NewInt(time.Now().Unix()),
Subject: pkix.Name{
CommonName:   domain,
Organization: []string{"UniProxy Panel"},
},
NotBefore:             time.Now(),
NotAfter:              time.Now().AddDate(1, 0, 0), // 1年有效期
KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
BasicConstraintsValid: true,
}

// 生成证书
certBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &privateKey.PublicKey, privateKey)
if err != nil {
return nil, fmt.Errorf("生成证书失败: %w", err)
}

// 编码证书
certPEM := pem.EncodeToMemory(&pem.Block{
Type:  "CERTIFICATE",
Bytes: certBytes,
})

// 编码私钥
keyPEM := pem.EncodeToMemory(&pem.Block{
Type:  "RSA PRIVATE KEY",
Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
})

// 保存文件
certFile := filepath.Join(s.certPath, fmt.Sprintf("%s.crt", name))
keyFile := filepath.Join(s.certPath, fmt.Sprintf("%s.key", name))

if err := os.WriteFile(certFile, certPEM, 0644); err != nil {
return nil, fmt.Errorf("保存证书文件失败: %w", err)
}

if err := os.WriteFile(keyFile, keyPEM, 0600); err != nil {
os.Remove(certFile)
return nil, fmt.Errorf("保存密钥文件失败: %w", err)
}

// 创建数据库记录
certificate := &model.Certificate{
Name:      name,
Domain:    domain,
CertPath:  certFile,
KeyPath:   keyFile,
Issuer:    "Self-Signed",
NotBefore: template.NotBefore,
NotAfter:  template.NotAfter,
DaysLeft:  365,
Type:      "self_signed",
Status:    "active",
}

if err := s.db.Create(certificate).Error; err != nil {
os.Remove(certFile)
os.Remove(keyFile)
return nil, fmt.Errorf("保存证书记录失败: %w", err)
}

return certificate, nil
}

// DeleteCertificate 删除证书
func (s *CertificateService) DeleteCertificate(id uint) error {
var cert model.Certificate
if err := s.db.First(&cert, id).Error; err != nil {
return err
}

// 删除文件
os.Remove(cert.CertPath)
os.Remove(cert.KeyPath)

// 删除数据库记录
return s.db.Delete(&cert).Error
}

// UpdateCertificateStatus 更新证书状态
func (s *CertificateService) UpdateCertificateStatus(cert *model.Certificate) {
daysLeft := int(time.Until(cert.NotAfter).Hours() / 24)
cert.DaysLeft = daysLeft

if daysLeft < 0 {
cert.Status = "expired"
} else if daysLeft < 30 {
cert.Status = "expiring"
} else {
cert.Status = "active"
}

s.db.Save(cert)
}

// GetExpiringCertificates 获取即将过期的证书
func (s *CertificateService) GetExpiringCertificates(days int) ([]model.Certificate, error) {
var certs []model.Certificate
expiryDate := time.Now().AddDate(0, 0, days)

err := s.db.Where("not_after < ? AND not_after > ?", expiryDate, time.Now()).Find(&certs).Error
return certs, err
}

// GetCertificateByName 根据名称获取证书
func (s *CertificateService) GetCertificateByName(name string) (*model.Certificate, error) {
var cert model.Certificate
err := s.db.Where("name = ?", name).First(&cert).Error
return &cert, err
}
