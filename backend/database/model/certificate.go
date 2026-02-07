package model

import (
	"time"

	"gorm.io/gorm"
)

// Certificate TLS证书模型
type Certificate struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Name      string         `gorm:"size:100;uniqueIndex" json:"name"`
	Domain    string         `gorm:"size:255" json:"domain"`
	CertPath  string         `gorm:"size:500" json:"cert_path"`
	KeyPath   string         `gorm:"size:500" json:"key_path"`
	Issuer    string         `gorm:"size:255" json:"issuer"`
	NotBefore time.Time      `json:"not_before"`
	NotAfter  time.Time      `json:"not_after"`
	DaysLeft  int            `json:"days_left"`
	AutoRenew bool           `gorm:"default:false" json:"auto_renew"`
	Type      string         `gorm:"size:50;default:uploaded" json:"type"` // uploaded, self_signed, letsencrypt
	Status    string         `gorm:"size:20;default:active" json:"status"` // active, expired, expiring
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}
