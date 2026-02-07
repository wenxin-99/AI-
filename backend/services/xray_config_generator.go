package services

import (
"encoding/json"
"fmt"

"github.com/uniproxy/panel/database/model"
)

// XrayConfigGenerator Xray配置生成器
type XrayConfigGenerator struct {
certService *CertificateService
}

func NewXrayConfigGenerator(certService *CertificateService) *XrayConfigGenerator {
return &XrayConfigGenerator{
certService: certService,
}
}

// StreamSettings 传输层配置
type StreamSettings struct {
Network         string           `json:"network"`
Security        string           `json:"security"`
TCPSettings     *TCPSettings     `json:"tcpSettings,omitempty"`
WSSettings      *WSSettings      `json:"wsSettings,omitempty"`
HTTPSettings    *HTTPSettings    `json:"httpSettings,omitempty"`
GRPCSettings    *GRPCSettings    `json:"grpcSettings,omitempty"`
QUICSettings    *QUICSettings    `json:"quicSettings,omitempty"`
TLSSettings     *TLSSettings     `json:"tlsSettings,omitempty"`
RealitySettings *RealitySettings `json:"realitySettings,omitempty"`
SockOpt         *SockOpt         `json:"sockopt,omitempty"`
}

// TCPSettings TCP传输配置
type TCPSettings struct {
AcceptProxyProtocol bool       `json:"acceptProxyProtocol,omitempty"`
Header              *TCPHeader `json:"header,omitempty"`
}

type TCPHeader struct {
Type     string        `json:"type"`
Request  *HTTPRequest  `json:"request,omitempty"`
Response *HTTPResponse `json:"response,omitempty"`
}

type HTTPRequest struct {
Version string              `json:"version,omitempty"`
Method  string              `json:"method,omitempty"`
Path    []string            `json:"path,omitempty"`
Headers map[string][]string `json:"headers,omitempty"`
}

type HTTPResponse struct {
Version string              `json:"version,omitempty"`
Status  string              `json:"status,omitempty"`
Reason  string              `json:"reason,omitempty"`
Headers map[string][]string `json:"headers,omitempty"`
}

// WSSettings WebSocket传输配置
type WSSettings struct {
AcceptProxyProtocol bool              `json:"acceptProxyProtocol,omitempty"`
Path                string            `json:"path,omitempty"`
Headers             map[string]string `json:"headers,omitempty"`
}

// HTTPSettings HTTP/2传输配置
type HTTPSettings struct {
Host []string `json:"host,omitempty"`
Path string   `json:"path,omitempty"`
}

// GRPCSettings gRPC传输配置
type GRPCSettings struct {
ServiceName string `json:"serviceName,omitempty"`
MultiMode   bool   `json:"multiMode,omitempty"`
}

// QUICSettings QUIC传输配置
type QUICSettings struct {
Security string            `json:"security,omitempty"`
Key      string            `json:"key,omitempty"`
Header   map[string]string `json:"header,omitempty"`
}

// TLSSettings TLS配置
type TLSSettings struct {
ServerName        string    `json:"serverName,omitempty"`
Certificates      []TLSCert `json:"certificates,omitempty"`
ALPN              []string  `json:"alpn,omitempty"`
DisableSystemRoot bool      `json:"disableSystemRoot,omitempty"`
MinVersion        string    `json:"minVersion,omitempty"`
MaxVersion        string    `json:"maxVersion,omitempty"`
CipherSuites      string    `json:"cipherSuites,omitempty"`
Fingerprint       string    `json:"fingerprint,omitempty"`
}

type TLSCert struct {
CertificateFile string `json:"certificateFile"`
KeyFile         string `json:"keyFile"`
}

// RealitySettings Reality配置
type RealitySettings struct {
Show         bool     `json:"show,omitempty"`
Dest         string   `json:"dest,omitempty"`
Xver         int      `json:"xver,omitempty"`
ServerNames  []string `json:"serverNames,omitempty"`
PrivateKey   string   `json:"privateKey,omitempty"`
ShortIds     []string `json:"shortIds,omitempty"`
MinClientVer string   `json:"minClientVer,omitempty"`
MaxClientVer string   `json:"maxClientVer,omitempty"`
MaxTimeDiff  int64    `json:"maxTimeDiff,omitempty"`
Fingerprint  string   `json:"fingerprint,omitempty"`
}

// SockOpt Socket选项
type SockOpt struct {
Mark                int    `json:"mark,omitempty"`
TCPFastOpen         bool   `json:"tcpFastOpen,omitempty"`
TProxy              string `json:"tproxy,omitempty"`
AcceptProxyProtocol bool   `json:"acceptProxyProtocol,omitempty"`
}

// Sniffing 流量探测配置
type Sniffing struct {
Enabled      bool     `json:"enabled"`
DestOverride []string `json:"destOverride,omitempty"`
MetadataOnly bool     `json:"metadataOnly,omitempty"`
RouteOnly    bool     `json:"routeOnly,omitempty"`
}

// Fallback 回落配置
type Fallback struct {
Name string `json:"name,omitempty"`
ALPN string `json:"alpn,omitempty"`
Path string `json:"path,omitempty"`
Dest string `json:"dest"`
Xver int    `json:"xver,omitempty"`
}

// GenerateStreamSettings 生成传输层配置
func (g *XrayConfigGenerator) GenerateStreamSettings(inbound *model.XrayInbound, certName string) (*StreamSettings, error) {
var settings StreamSettings

// 如果已有配置,解析并返回
if inbound.StreamSettings != "" {
if err := json.Unmarshal([]byte(inbound.StreamSettings), &settings); err == nil {
return &settings, nil
}
}

// 默认TCP配置
settings.Network = "tcp"
settings.Security = "none"

// 如果指定了证书,配置TLS
if certName != "" {
cert, err := g.certService.GetCertificateByName(certName)
if err == nil {
settings.Security = "tls"
settings.TLSSettings = &TLSSettings{
ServerName: cert.Domain,
Certificates: []TLSCert{
{
CertificateFile: cert.CertPath,
KeyFile:         cert.KeyPath,
},
},
ALPN: []string{"h2", "http/1.1"},
}
}
}

return &settings, nil
}

// GenerateSniffing 生成流量探测配置
func (g *XrayConfigGenerator) GenerateSniffing(enabled bool) *Sniffing {
if !enabled {
return &Sniffing{Enabled: false}
}

return &Sniffing{
Enabled:      true,
DestOverride: []string{"http", "tls", "quic"},
MetadataOnly: false,
RouteOnly:    false,
}
}

// BuildInboundConfig 构建完整的入站配置
func (g *XrayConfigGenerator) BuildInboundConfig(inbound *model.XrayInbound) (map[string]interface{}, error) {
config := map[string]interface{}{
"listen":   inbound.Listen,
"port":     inbound.Port,
"protocol": inbound.Protocol,
"tag":      inbound.Tag,
}

// 解析Settings
if inbound.Settings != "" {
var settings map[string]interface{}
if err := json.Unmarshal([]byte(inbound.Settings), &settings); err == nil {
config["settings"] = settings
}
}

// 解析StreamSettings
if inbound.StreamSettings != "" {
var streamSettings map[string]interface{}
if err := json.Unmarshal([]byte(inbound.StreamSettings), &streamSettings); err == nil {
config["streamSettings"] = streamSettings
}
}

// 解析Sniffing
if inbound.Sniffing != "" {
var sniffing map[string]interface{}
if err := json.Unmarshal([]byte(inbound.Sniffing), &sniffing); err == nil {
config["sniffing"] = sniffing
}
}

return config, nil
}

// ValidateStreamSettings 验证传输层配置
func (g *XrayConfigGenerator) ValidateStreamSettings(settings *StreamSettings) error {
if settings.Network == "" {
return fmt.Errorf("传输协议不能为空")
}

validNetworks := map[string]bool{
"tcp": true, "ws": true, "http": true, "grpc": true, "quic": true,
}
if !validNetworks[settings.Network] {
return fmt.Errorf("不支持的传输协议: %s", settings.Network)
}

if settings.Security != "none" && settings.Security != "tls" && settings.Security != "reality" {
return fmt.Errorf("不支持的安全类型: %s", settings.Security)
}

return nil
}
