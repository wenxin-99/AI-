package controllers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/uniproxy/panel/database/model"
	"github.com/uniproxy/panel/services"
	"gorm.io/gorm"
)

// NodeController 节点控制器
type NodeController struct {
	db          *gorm.DB
	nodeService *services.NodeService
}

// NewNodeController 创建节点控制器
func NewNodeController(db *gorm.DB) *NodeController {
	return &NodeController{
		db:          db,
		nodeService: services.NewNodeService(db),
	}
}

// HeartbeatRequest 心跳请求
type HeartbeatRequest struct {
	NodeName    string  `json:"node_name"`
	CPUUsage    float64 `json:"cpu_usage"`
	MemoryTotal int64   `json:"memory_total"`
	MemoryUsed  int64   `json:"memory_used"`
	MemoryUsage float64 `json:"memory_usage"`
	DiskTotal   string  `json:"disk_total"`
	DiskUsed    string  `json:"disk_used"`
	DiskUsage   float64 `json:"disk_usage"`
	TrafficUp   int64   `json:"traffic_up"`
	TrafficDown int64   `json:"traffic_down"`
	Uptime      string  `json:"uptime"`
	XrayStatus  string  `json:"xray_status"`
	GostStatus  string  `json:"gost_status"`
	Timestamp   int64   `json:"timestamp"`
}

// Heartbeat 节点心跳（使用API Token认证）
func (nc *NodeController) Heartbeat(c *gin.Context) {
	nodeInterface, exists := c.Get("node")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "节点认证失败",
		})
		return
	}

	node := nodeInterface.(*model.Node)

	var req HeartbeatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误: " + err.Error(),
		})
		return
	}

	// 更新节点状态
	if err := nc.nodeService.UpdateNodeStatus(node.ID, "online", req.CPUUsage, req.MemoryUsage, 0); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "更新节点状态失败: " + err.Error(),
		})
		return
	}

	// 更新心跳时间和流量
	now := time.Now()
	node.LastHeartbeat = &now
	node.TrafficUp += req.TrafficUp
	node.TrafficDown += req.TrafficDown
	if err := nc.db.Save(node).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "保存节点信息失败: " + err.Error(),
		})
		return
	}

	// 检查是否有新配置需要下发 (暂时返回空配置)
	// gostService := services.NewGostService(nil, nc.db)
	// gostConfig, _ := gostService.GenerateNodeGostConfig(node.ID)
	var gostConfig interface{} = nil

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "心跳上报成功",
		"data": gin.H{
			"node_id":        node.ID,
			"config_updated": true,
			"gost_config":    gostConfig,
		},
	})
}

// GetNodeConfig 获取节点配置（Xray + Gost，使用API Token认证）
func (nc *NodeController) GetNodeConfig(c *gin.Context) {
	nodeInterface, exists := c.Get("node")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"message": "节点认证失败",
		})
		return
	}

	node := nodeInterface.(*model.Node)

	// 生成该节点的Xray配置 (暂时返回空配置)
	// xrayConfig, err := nc.nodeService.GenerateNodeXrayConfig(node.ID)
	// if err != nil {
	// 	c.JSON(http.StatusInternalServerError, gin.H{
	// 		"success": false,
	// 		"message": "生成Xray配置失败: " + err.Error(),
	// 	})
	// 	return
	// }
	xrayConfig := map[string]interface{}{"inbounds": []interface{}{}}

	configJSON, err := json.MarshalIndent(xrayConfig, "", "  ")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "序列化Xray配置失败: " + err.Error(),
		})
		return
	}

	// 生成该节点的Gost配置 (暂时返回空配置)
	// gostService := services.NewGostService(nil, nc.db)
	// gostConfig, _ := gostService.GenerateNodeGostConfig(node.ID)
	var gostConfig interface{} = nil

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "获取配置成功",
		"data": gin.H{
			"node_id":     node.ID,
			"config":      json.RawMessage(configJSON),
			"config_type": "xray",
			"gost_config": gostConfig,
		},
	})
}

// RegisterNode 节点自注册（使用API Token认证）
func (nc *NodeController) RegisterNode(c *gin.Context) {
	var req struct {
		Name       string `json:"name"`
		Host       string `json:"host"`
		Port       int    `json:"port"`
		Type       string `json:"type"`
		APIToken   string `json:"api_token"`
		Domain     string `json:"domain"`
		SSLEnabled bool   `json:"ssl_enabled"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误: " + err.Error(),
		})
		return
	}

	var existingNode model.Node
	if err := nc.db.Where("api_token = ?", req.APIToken).First(&existingNode).Error; err == nil {
		existingNode.Name = req.Name
		existingNode.Host = req.Host
		existingNode.Port = req.Port
		existingNode.Type = req.Type
		existingNode.Status = "online"

		if err := nc.nodeService.UpdateNode(&existingNode); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"message": "更新节点失败: " + err.Error(),
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "节点更新成功",
			"data":    existingNode,
		})
		return
	}

	node := model.Node{
		Name:     req.Name,
		Host:     req.Host,
		Port:     req.Port,
		Type:     req.Type,
		APIToken: req.APIToken,
		Status:   "online",
	}

	if err := nc.nodeService.CreateNode(&node); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "创建节点失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "节点注册成功",
		"data":    node,
	})
}

// CreateNode 创建节点
func (nc *NodeController) CreateNode(c *gin.Context) {
	var node model.Node
	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误: " + err.Error(),
		})
		return
	}

	// 如果没有提供 API Token，自动生成一个
	if node.APIToken == "" {
		token := make([]byte, 16)
		rand.Read(token)
		node.APIToken = hex.EncodeToString(token)
	}

	if err := nc.nodeService.CreateNode(&node); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "创建节点失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "创建节点成功",
		"data":    node,
	})
}

// UpdateNode 更新节点
func (nc *NodeController) UpdateNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	var node model.Node
	if err := c.ShouldBindJSON(&node); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误: " + err.Error(),
		})
		return
	}

	node.ID = uint(id)
	if err := nc.nodeService.UpdateNode(&node); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "更新节点失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "更新节点成功",
		"data":    node,
	})
}

// DeleteNode 删除节点
func (nc *NodeController) DeleteNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	if err := nc.nodeService.DeleteNode(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "删除节点失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "删除节点成功",
	})
}

// GetNode 获取节点
func (nc *NodeController) GetNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	node, err := nc.nodeService.GetNode(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"message": "节点不存在",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "获取节点成功",
		"data":    node,
	})
}

// ListNodes 获取节点列表
func (nc *NodeController) ListNodes(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))

	nodes, total, err := nc.nodeService.ListNodes(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "获取节点列表失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "获取节点列表成功",
		"data": gin.H{
			"nodes": nodes,
			"total": total,
			"page":  page,
		},
	})
}

// ToggleNode 切换节点状态
func (nc *NodeController) ToggleNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	if err := nc.nodeService.ToggleNode(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "切换节点状态失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "切换节点状态成功",
	})
}

// SyncNode 同步节点配置
func (nc *NodeController) SyncNode(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	if err := nc.nodeService.SyncNodeConfig(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "同步节点配置失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "同步节点配置成功",
	})
}

// GetNodeStats 获取节点统计
func (nc *NodeController) GetNodeStats(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	stats, err := nc.nodeService.GetNodeStats(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "获取节点统计失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "获取节点统计成功",
		"data":    stats,
	})
}

// CheckNodeHealth 检查节点健康
func (nc *NodeController) CheckNodeHealth(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	healthy, err := nc.nodeService.CheckNodeHealth(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "检查节点健康失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "检查节点健康成功",
		"data": gin.H{
			"healthy": healthy,
		},
	})
}

// BatchSyncNodes 批量同步节点
func (nc *NodeController) BatchSyncNodes(c *gin.Context) {
	var req struct {
		NodeIDs []uint `json:"node_ids"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "参数错误: " + err.Error(),
		})
		return
	}

	if err := nc.nodeService.BatchSyncNodes(req.NodeIDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "批量同步节点失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "批量同步节点成功",
	})
}

// GenerateInstallScript 生成节点一键安装脚本
func (nc *NodeController) GenerateInstallScript(c *gin.Context) {
	var req struct {
		NodeName string `json:"node_name"`
		NodeType string `json:"node_type"` // xray, gost, both
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		// 使用默认值
		req.NodeName = ""
		req.NodeType = "both"
	}

	if req.NodeType == "" {
		req.NodeType = "both"
	}

	// 生成唯一的 API Token
	token := make([]byte, 16)
	rand.Read(token)
	apiToken := hex.EncodeToString(token)

	// 获取面板地址 - 从请求 Host 推断（支持 Nginx 反向代理 TLS 终止）
	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	panelURL := fmt.Sprintf("%s://%s", scheme, c.Request.Host)

	// 生成安装脚本
	script := generateInstallScript(panelURL, apiToken, req.NodeName, req.NodeType)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "安装脚本生成成功",
		"data": gin.H{
			"api_token": apiToken,
			"node_type": req.NodeType,
			"node_name": req.NodeName,
			"panel_url": panelURL,
			"script":    script,
			"one_liner": fmt.Sprintf("bash <(curl -fsSL %s/api/v1/node-script/install?token=%s&type=%s)", panelURL, apiToken, req.NodeType),
		},
	})
}

// GetInstallScriptRaw 获取原始安装脚本（供 curl 直接执行）
func (nc *NodeController) GetInstallScriptRaw(c *gin.Context) {
	apiToken := c.Query("token")
	nodeType := c.DefaultQuery("type", "both")
	nodeName := c.DefaultQuery("name", "")

	if apiToken == "" {
		c.String(http.StatusBadRequest, "echo 'Error: missing token parameter'")
		return
	}

	scheme := "http"
	if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}
	panelURL := fmt.Sprintf("%s://%s", scheme, c.Request.Host)

	script := generateInstallScript(panelURL, apiToken, nodeName, nodeType)
	c.Header("Content-Type", "text/plain; charset=utf-8")
	c.String(http.StatusOK, script)
}

// GenerateAPIToken 生成新的 API Token
func (nc *NodeController) GenerateAPIToken(c *gin.Context) {
	token := make([]byte, 16)
	rand.Read(token)
	apiToken := hex.EncodeToString(token)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Token生成成功",
		"data": gin.H{
			"api_token": apiToken,
		},
	})
}

// generateInstallScript 生成安装脚本内容（支持国内/国外网络自动切换）
func generateInstallScript(panelURL, apiToken, nodeName, nodeType string) string {
	var sb strings.Builder

	sb.WriteString("#!/bin/bash\n")
	sb.WriteString("# UniProxy Panel - 节点一键安装脚本\n")
	sb.WriteString("# 自动检测网络环境，支持国内/国外 VPS\n")
	sb.WriteString("# 自动安装 Xray/Gost 并注册到面板\n\n")

	sb.WriteString("set -e\n\n")

	sb.WriteString("# ===== 配置参数 =====\n")
	sb.WriteString(fmt.Sprintf("PANEL_URL=\"%s\"\n", panelURL))
	sb.WriteString(fmt.Sprintf("API_TOKEN=\"%s\"\n", apiToken))
	if nodeName != "" {
		sb.WriteString(fmt.Sprintf("NODE_NAME=\"%s\"\n", nodeName))
	} else {
		sb.WriteString("NODE_NAME=\"${NODE_NAME:-$(hostname)}\"\n")
	}
	sb.WriteString(fmt.Sprintf("NODE_TYPE=\"%s\"\n", nodeType))
	sb.WriteString("NODE_PORT=10001\n\n")

	// 颜色输出
	sb.WriteString("# ===== 颜色输出 =====\n")
	sb.WriteString("RED='\\033[0;31m'\n")
	sb.WriteString("GREEN='\\033[0;32m'\n")
	sb.WriteString("YELLOW='\\033[1;33m'\n")
	sb.WriteString("CYAN='\\033[0;36m'\n")
	sb.WriteString("NC='\\033[0m'\n\n")

	sb.WriteString("info() { echo -e \"${CYAN}[INFO]${NC} $1\"; }\n")
	sb.WriteString("success() { echo -e \"${GREEN}[OK]${NC} $1\"; }\n")
	sb.WriteString("warn() { echo -e \"${YELLOW}[WARN]${NC} $1\"; }\n")
	sb.WriteString("error() { echo -e \"${RED}[ERROR]${NC} $1\"; exit 1; }\n\n")

	// Root 检查
	sb.WriteString("# ===== 检查 root 权限 =====\n")
	sb.WriteString("[[ $EUID -ne 0 ]] && error \"请使用 root 用户运行此脚本\"\n\n")

	// 架构检测
	sb.WriteString("# ===== 检测系统架构 =====\n")
	sb.WriteString("ARCH=$(uname -m)\n")
	sb.WriteString("case $ARCH in\n")
	sb.WriteString("  x86_64|amd64) ARCH=\"amd64\" ;;\n")
	sb.WriteString("  aarch64|arm64) ARCH=\"arm64\" ;;\n")
	sb.WriteString("  *) error \"不支持的架构: $ARCH\" ;;\n")
	sb.WriteString("esac\n")
	sb.WriteString("info \"系统架构: $ARCH\"\n\n")

	// 网络环境检测 - 核心改进
	sb.WriteString("# ===== 检测网络环境（国内/国外）=====\n")
	sb.WriteString("info \"检测网络环境...\"\n")
	sb.WriteString("IS_CN=false\n")
	sb.WriteString("# 尝试连接 Google，超时 3 秒判定为国内\n")
	sb.WriteString("if ! curl -sf --connect-timeout 3 -o /dev/null https://www.google.com 2>/dev/null; then\n")
	sb.WriteString("  IS_CN=true\n")
	sb.WriteString("  success \"检测到国内网络环境，将使用镜像加速下载\"\n")
	sb.WriteString("else\n")
	sb.WriteString("  success \"检测到国外网络环境，直接从 GitHub 下载\"\n")
	sb.WriteString("fi\n\n")

	// GitHub 加速函数
	sb.WriteString("# ===== GitHub 下载加速 =====\n")
	sb.WriteString("# 国内镜像列表（按优先级排序）\n")
	sb.WriteString("CN_MIRRORS=(\n")
	sb.WriteString("  \"https://gh-proxy.com/\"\n")
	sb.WriteString("  \"https://ghproxy.net/\"\n")
	sb.WriteString("  \"https://mirror.ghproxy.com/\"\n")
	sb.WriteString("  \"https://ghps.cc/\"\n")
	sb.WriteString(")\n\n")

	sb.WriteString("# 智能下载函数：国内自动尝试多个镜像，国外直接下载\n")
	sb.WriteString("smart_download() {\n")
	sb.WriteString("  local url=\"$1\"\n")
	sb.WriteString("  local output=\"$2\"\n")
	sb.WriteString("  local desc=\"$3\"\n")
	sb.WriteString("  \n")
	sb.WriteString("  if [[ \"$IS_CN\" == \"false\" ]]; then\n")
	sb.WriteString("    info \"下载 ${desc}...\"\n")
	sb.WriteString("    wget -qO \"$output\" \"$url\" --timeout=60 && return 0\n")
	sb.WriteString("    curl -fsSL -o \"$output\" \"$url\" --connect-timeout 30 && return 0\n")
	sb.WriteString("    error \"下载 ${desc} 失败: $url\"\n")
	sb.WriteString("  fi\n")
	sb.WriteString("  \n")
	sb.WriteString("  # 国内：依次尝试多个镜像\n")
	sb.WriteString("  for mirror in \"${CN_MIRRORS[@]}\"; do\n")
	sb.WriteString("    local mirror_url=\"${mirror}${url}\"\n")
	sb.WriteString("    info \"尝试镜像下载 ${desc}: ${mirror}...\"\n")
	sb.WriteString("    if wget -qO \"$output\" \"$mirror_url\" --timeout=120 2>/dev/null; then\n")
	sb.WriteString("      # 检查文件是否有效（大于 1KB）\n")
	sb.WriteString("      local fsize=$(stat -c%s \"$output\" 2>/dev/null || echo 0)\n")
	sb.WriteString("      if [[ $fsize -gt 1024 ]]; then\n")
	sb.WriteString("        success \"通过镜像下载 ${desc} 成功\"\n")
	sb.WriteString("        return 0\n")
	sb.WriteString("      fi\n")
	sb.WriteString("    fi\n")
	sb.WriteString("    if curl -fsSL -o \"$output\" \"$mirror_url\" --connect-timeout 30 2>/dev/null; then\n")
	sb.WriteString("      local fsize=$(stat -c%s \"$output\" 2>/dev/null || echo 0)\n")
	sb.WriteString("      if [[ $fsize -gt 1024 ]]; then\n")
	sb.WriteString("        success \"通过镜像下载 ${desc} 成功\"\n")
	sb.WriteString("        return 0\n")
	sb.WriteString("      fi\n")
	sb.WriteString("    fi\n")
	sb.WriteString("    warn \"镜像 ${mirror} 下载失败，尝试下一个...\"\n")
	sb.WriteString("  done\n")
	sb.WriteString("  \n")
	sb.WriteString("  # 最后尝试直连\n")
	sb.WriteString("  warn \"所有镜像失败，尝试直连 GitHub...\"\n")
	sb.WriteString("  wget -qO \"$output\" \"$url\" --timeout=120 && return 0\n")
	sb.WriteString("  curl -fsSL -o \"$output\" \"$url\" --connect-timeout 60 && return 0\n")
	sb.WriteString("  error \"下载 ${desc} 失败，请检查网络或手动下载: $url\"\n")
	sb.WriteString("}\n\n")

	// 智能执行远程脚本函数
	sb.WriteString("# 智能执行远程脚本：国内自动加速\n")
	sb.WriteString("smart_bash_remote() {\n")
	sb.WriteString("  local url=\"$1\"\n")
	sb.WriteString("  shift\n")
	sb.WriteString("  local args=\"$@\"\n")
	sb.WriteString("  \n")
	sb.WriteString("  if [[ \"$IS_CN\" == \"false\" ]]; then\n")
	sb.WriteString("    bash <(curl -fsSL \"$url\" --connect-timeout 30) $args && return 0\n")
	sb.WriteString("  fi\n")
	sb.WriteString("  \n")
	sb.WriteString("  # 国内：下载到本地再执行\n")
	sb.WriteString("  local tmpscript=$(mktemp /tmp/install_XXXXXX.sh)\n")
	sb.WriteString("  for mirror in \"${CN_MIRRORS[@]}\"; do\n")
	sb.WriteString("    if curl -fsSL -o \"$tmpscript\" \"${mirror}${url}\" --connect-timeout 30 2>/dev/null; then\n")
	sb.WriteString("      local fsize=$(stat -c%s \"$tmpscript\" 2>/dev/null || echo 0)\n")
	sb.WriteString("      if [[ $fsize -gt 100 ]]; then\n")
	sb.WriteString("        bash \"$tmpscript\" $args\n")
	sb.WriteString("        local ret=$?\n")
	sb.WriteString("        rm -f \"$tmpscript\"\n")
	sb.WriteString("        return $ret\n")
	sb.WriteString("      fi\n")
	sb.WriteString("    fi\n")
	sb.WriteString("  done\n")
	sb.WriteString("  \n")
	sb.WriteString("  # 最后尝试直连\n")
	sb.WriteString("  bash <(curl -fsSL \"$url\" --connect-timeout 60) $args\n")
	sb.WriteString("}\n\n")

	// 获取公网 IP - 支持国内
	sb.WriteString("# ===== 获取公网 IP =====\n")
	sb.WriteString("info \"获取公网 IP...\"\n")
	sb.WriteString("if [[ \"$IS_CN\" == \"true\" ]]; then\n")
	sb.WriteString("  # 国内优先使用国内 IP 检测服务\n")
	sb.WriteString("  PUBLIC_IP=$(\n")
	sb.WriteString("    curl -s4 --connect-timeout 5 ip.sb 2>/dev/null ||\n")
	sb.WriteString("    curl -s4 --connect-timeout 5 ifconfig.me 2>/dev/null ||\n")
	sb.WriteString("    curl -s4 --connect-timeout 5 ipinfo.io/ip 2>/dev/null ||\n")
	sb.WriteString("    curl -s4 --connect-timeout 5 myip.ipip.net 2>/dev/null | grep -oP '\\d+\\.\\d+\\.\\d+\\.\\d+' ||\n")
	sb.WriteString("    curl -s4 --connect-timeout 5 cip.cc 2>/dev/null | grep -oP 'IP\\s*:\\s*\\K[\\d.]+' ||\n")
	sb.WriteString("    hostname -I | awk '{print $1}'\n")
	sb.WriteString("  )\n")
	sb.WriteString("else\n")
	sb.WriteString("  PUBLIC_IP=$(\n")
	sb.WriteString("    curl -s4 --connect-timeout 5 ifconfig.me 2>/dev/null ||\n")
	sb.WriteString("    curl -s4 --connect-timeout 5 ip.sb 2>/dev/null ||\n")
	sb.WriteString("    curl -s4 --connect-timeout 5 ipinfo.io/ip 2>/dev/null\n")
	sb.WriteString("  )\n")
	sb.WriteString("fi\n")
	sb.WriteString("[[ -z \"$PUBLIC_IP\" ]] && error \"无法获取公网 IP\"\n")
	sb.WriteString("success \"公网 IP: $PUBLIC_IP\"\n\n")

	// 安装依赖
	sb.WriteString("# ===== 安装依赖 =====\n")
	sb.WriteString("info \"安装依赖...\"\n")
	sb.WriteString("if command -v apt-get &>/dev/null; then\n")
	sb.WriteString("  apt-get update -qq && apt-get install -y -qq curl wget unzip jq\n")
	sb.WriteString("elif command -v yum &>/dev/null; then\n")
	sb.WriteString("  yum install -y -q curl wget unzip jq\n")
	sb.WriteString("elif command -v dnf &>/dev/null; then\n")
	sb.WriteString("  dnf install -y -q curl wget unzip jq\n")
	sb.WriteString("fi\n")
	sb.WriteString("success \"依赖安装完成\"\n\n")

	// 创建工作目录
	sb.WriteString("# ===== 创建工作目录 =====\n")
	sb.WriteString("INSTALL_DIR=\"/opt/uniproxy-node\"\n")
	sb.WriteString("mkdir -p $INSTALL_DIR/{bin,config,logs}\n\n")

	// 安装 Gost - 使用智能下载
	sb.WriteString("# ===== 安装 Gost =====\n")
	sb.WriteString("if [[ \"$NODE_TYPE\" == \"gost\" || \"$NODE_TYPE\" == \"both\" ]]; then\n")
	sb.WriteString("  if [[ -f $INSTALL_DIR/bin/gost ]]; then\n")
	sb.WriteString("    success \"Gost 已安装: $($INSTALL_DIR/bin/gost -V 2>&1 | head -1)\"\n")
	sb.WriteString("  else\n")
	sb.WriteString("    info \"安装 Gost v3...\"\n")
	sb.WriteString("    GOST_VERSION=\"3.0.0-rc10\"\n")
	sb.WriteString("    GOST_URL=\"https://github.com/go-gost/gost/releases/download/v${GOST_VERSION}/gost_${GOST_VERSION}_linux_${ARCH}.tar.gz\"\n")
	sb.WriteString("    smart_download \"$GOST_URL\" \"/tmp/gost.tar.gz\" \"Gost v${GOST_VERSION}\"\n")
	sb.WriteString("    tar -xzf /tmp/gost.tar.gz -C $INSTALL_DIR/bin/ gost\n")
	sb.WriteString("    chmod +x $INSTALL_DIR/bin/gost\n")
	sb.WriteString("    rm -f /tmp/gost.tar.gz\n")
	sb.WriteString("    success \"Gost 安装完成: $($INSTALL_DIR/bin/gost -V 2>&1 | head -1)\"\n")
	sb.WriteString("  fi\n")
	sb.WriteString("fi\n\n")

	// 安装 Xray - 直接下载二进制，避免 GitHub API 在国内 403
	sb.WriteString("# ===== 安装 Xray =====\n")
	sb.WriteString("if [[ \"$NODE_TYPE\" == \"xray\" || \"$NODE_TYPE\" == \"both\" ]]; then\n")
	sb.WriteString("  if command -v xray &>/dev/null; then\n")
	sb.WriteString("    success \"Xray 已安装: $(xray version 2>&1 | head -1)\"\n")
	sb.WriteString("  else\n")
	sb.WriteString("    info \"安装 Xray...\n\"\n")
	sb.WriteString("    XRAY_VERSION=\"24.12.18\"\n")
	sb.WriteString("    XRAY_ARCH=$ARCH\n")
	sb.WriteString("    if [[ \"$XRAY_ARCH\" == \"amd64\" ]]; then XRAY_ARCH=\"64\"; fi\n")
	sb.WriteString("    if [[ \"$XRAY_ARCH\" == \"arm64\" ]]; then XRAY_ARCH=\"arm64-v8a\"; fi\n")
	sb.WriteString("    XRAY_URL=\"https://github.com/XTLS/Xray-core/releases/download/v${XRAY_VERSION}/Xray-linux-${XRAY_ARCH}.zip\"\n")
	sb.WriteString("    smart_download \"$XRAY_URL\" \"/tmp/xray.zip\" \"Xray v${XRAY_VERSION}\"\n")
	sb.WriteString("    mkdir -p /usr/local/bin /usr/local/share/xray /var/log/xray\n")
	sb.WriteString("    unzip -o /tmp/xray.zip -d /tmp/xray_extract/ >/dev/null 2>&1\n")
	sb.WriteString("    cp /tmp/xray_extract/xray /usr/local/bin/xray\n")
	sb.WriteString("    chmod +x /usr/local/bin/xray\n")
	sb.WriteString("    cp /tmp/xray_extract/geoip.dat /usr/local/share/xray/ 2>/dev/null\n")
	sb.WriteString("    cp /tmp/xray_extract/geosite.dat /usr/local/share/xray/ 2>/dev/null\n")
	sb.WriteString("    rm -rf /tmp/xray.zip /tmp/xray_extract/\n")
	sb.WriteString("    # 创建 systemd 服务\n")
	sb.WriteString("    cat > /etc/systemd/system/xray.service << XRAY_SVC_EOF\n")
	sb.WriteString("[Unit]\n")
	sb.WriteString("Description=Xray Service\n")
	sb.WriteString("Documentation=https://github.com/xtls\n")
	sb.WriteString("After=network.target nss-lookup.target\n")
	sb.WriteString("[Service]\n")
	sb.WriteString("User=root\n")
	sb.WriteString("ExecStart=/usr/local/bin/xray run -config /usr/local/etc/xray/config.json\n")
	sb.WriteString("Restart=on-failure\n")
	sb.WriteString("RestartPreventExitStatus=23\n")
	sb.WriteString("LimitNPROC=10000\n")
	sb.WriteString("LimitNOFILE=1000000\n")
	sb.WriteString("[Install]\n")
	sb.WriteString("WantedBy=multi-user.target\n")
	sb.WriteString("XRAY_SVC_EOF\n")
	sb.WriteString("    mkdir -p /usr/local/etc/xray\n")
	sb.WriteString("    systemctl daemon-reload\n")
	sb.WriteString("    if xray version &>/dev/null; then\n")
	sb.WriteString("      success \"Xray 安装完成: $(xray version 2>&1 | head -1)\"\n")
	sb.WriteString("    else\n")
	sb.WriteString("      error \"Xray 安装失败\"\n")
	sb.WriteString("    fi\n")
	sb.WriteString("  fi\n")
	sb.WriteString("fi\n\n")

	// 创建 Agent 脚本
	sb.WriteString("# ===== 创建节点 Agent =====\n")
	sb.WriteString("info \"创建节点 Agent...\"\n")
	sb.WriteString("cat > $INSTALL_DIR/agent.sh << 'AGENT_EOF'\n")
	sb.WriteString("#!/bin/bash\n")
	sb.WriteString("# UniProxy Node Agent - 自动心跳和配置同步\n\n")
	sb.WriteString("INSTALL_DIR=\"/opt/uniproxy-node\"\n")
	sb.WriteString("source $INSTALL_DIR/config/env.conf\n\n")

	// 初始化日志文件
	sb.WriteString("# 初始化日志文件\n")
	sb.WriteString("mkdir -p $INSTALL_DIR/logs\n")
	sb.WriteString("touch $INSTALL_DIR/logs/agent.log\n")
	sb.WriteString("touch $INSTALL_DIR/logs/gost.log\n")
	sb.WriteString("echo \"[$(date)] Agent 启动\" >> $INSTALL_DIR/logs/agent.log\n\n")

	sb.WriteString("# 获取系统信息\n")
	sb.WriteString("get_cpu_usage() {\n")
	sb.WriteString("  top -bn1 | grep 'Cpu(s)' | awk '{print $2}' 2>/dev/null || echo \"0\"\n")
	sb.WriteString("}\n\n")

	sb.WriteString("get_mem_usage() {\n")
	sb.WriteString("  free | awk '/Mem:/ {printf \"%.1f\", $3/$2*100}' 2>/dev/null || echo \"0\"\n")
	sb.WriteString("}\n\n")

	sb.WriteString("# 发送心跳\n")
	sb.WriteString("send_heartbeat() {\n")
	sb.WriteString("  local cpu=$(get_cpu_usage)\n")
	sb.WriteString("  local mem=$(get_mem_usage)\n")
	sb.WriteString("  curl -sfL -X POST \"${PANEL_URL}/api/v1/node/heartbeat\" \\\n")
	sb.WriteString("    -H \"X-API-Token: ${API_TOKEN}\" \\\n")
	sb.WriteString("    -H \"Content-Type: application/json\" \\\n")
	sb.WriteString("    -d \"{\\\"cpu_usage\\\": $cpu, \\\"memory_usage\\\": $mem, \\\"node_name\\\": \\\"${NODE_NAME}\\\"}\" \\\n")
	sb.WriteString("    2>/dev/null\n")
	sb.WriteString("}\n\n")

	sb.WriteString("# 拉取并应用 Gost 配置\n")
	sb.WriteString("sync_gost_config() {\n")
	sb.WriteString("  local response=$(curl -sfL \"${PANEL_URL}/api/v1/node/config\" \\\n")
	sb.WriteString("    -H \"X-API-Token: ${API_TOKEN}\" 2>/dev/null)\n")
	sb.WriteString("  \n")
	sb.WriteString("  if [[ -z \"$response\" ]]; then return 1; fi\n")
	sb.WriteString("  \n")
	sb.WriteString("  local gost_config=$(echo \"$response\" | jq -r '.data.gost_config // empty')\n")
	sb.WriteString("  if [[ -n \"$gost_config\" && \"$gost_config\" != \"null\" ]]; then\n")
	sb.WriteString("    local new_hash=$(echo \"$gost_config\" | md5sum | awk '{print $1}')\n")
	sb.WriteString("    local old_hash=\"\"\n")
	sb.WriteString("    [[ -f $INSTALL_DIR/config/gost.hash ]] && old_hash=$(cat $INSTALL_DIR/config/gost.hash)\n")
	sb.WriteString("    \n")
	sb.WriteString("    if [[ \"$new_hash\" != \"$old_hash\" ]]; then\n")
	sb.WriteString("      echo \"$gost_config\" > $INSTALL_DIR/config/gost.yaml\n")
	sb.WriteString("      echo \"$new_hash\" > $INSTALL_DIR/config/gost.hash\n")
	sb.WriteString("      # 重启 Gost\n")
	sb.WriteString("      pkill -f \"$INSTALL_DIR/bin/gost\" 2>/dev/null || true\n")
	sb.WriteString("      sleep 1\n")
	sb.WriteString("      nohup $INSTALL_DIR/bin/gost -C $INSTALL_DIR/config/gost.yaml > $INSTALL_DIR/logs/gost.log 2>&1 &\n")
	sb.WriteString("      echo \"[$(date)] Gost 配置已更新并重启\" >> $INSTALL_DIR/logs/agent.log\n")
	sb.WriteString("    fi\n")
	sb.WriteString("  fi\n")
	sb.WriteString("}\n\n")

	sb.WriteString("# 主循环\n")
	sb.WriteString("while true; do\n")
	sb.WriteString("  send_heartbeat\n")
	sb.WriteString("  sync_gost_config\n")
	sb.WriteString("  sleep 30\n")
	sb.WriteString("done\n")
	sb.WriteString("AGENT_EOF\n")
	sb.WriteString("chmod +x $INSTALL_DIR/agent.sh\n\n")

	// 写入配置
	sb.WriteString("# ===== 写入配置 =====\n")
	sb.WriteString("cat > $INSTALL_DIR/config/env.conf << EOF\n")
	sb.WriteString("PANEL_URL=\"$PANEL_URL\"\n")
	sb.WriteString("API_TOKEN=\"$API_TOKEN\"\n")
	sb.WriteString("NODE_NAME=\"$NODE_NAME\"\n")
	sb.WriteString("NODE_TYPE=\"$NODE_TYPE\"\n")
	sb.WriteString("EOF\n\n")

	// 创建 systemd 服务
	sb.WriteString("# ===== 创建 systemd 服务 =====\n")
	sb.WriteString("info \"创建 Agent 服务...\"\n")
	sb.WriteString("cat > /etc/systemd/system/uniproxy-agent.service << EOF\n")
	sb.WriteString("[Unit]\n")
	sb.WriteString("Description=UniProxy Node Agent\n")
	sb.WriteString("After=network.target\n\n")
	sb.WriteString("[Service]\n")
	sb.WriteString("Type=simple\n")
	sb.WriteString("ExecStart=/bin/bash $INSTALL_DIR/agent.sh\n")
	sb.WriteString("Restart=always\n")
	sb.WriteString("RestartSec=5\n\n")
	sb.WriteString("[Install]\n")
	sb.WriteString("WantedBy=multi-user.target\n")
	sb.WriteString("EOF\n\n")

	sb.WriteString("systemctl daemon-reload\n")
	sb.WriteString("systemctl enable uniproxy-agent\n")
	sb.WriteString("systemctl start uniproxy-agent\n")
	sb.WriteString("success \"Agent 服务已启动\"\n\n")

	// 注册节点
	sb.WriteString("# ===== 注册节点到面板 =====\n")
	sb.WriteString("info \"注册节点到面板...\"\n")
	sb.WriteString("info \"面板地址: ${PANEL_URL}\"\n")
	sb.WriteString("info \"API Token: ${API_TOKEN:0:8}...\"\n")
	sb.WriteString("info \"节点名称: ${NODE_NAME}\"\n")
	sb.WriteString("info \"公网 IP: ${PUBLIC_IP}\"\n\n")

	sb.WriteString("# 执行注册请求，显示详细错误\n")
	sb.WriteString("HTTP_CODE=$(curl -s -w '%{http_code}' -o /tmp/register_response.json -X POST \"${PANEL_URL}/api/v1/node/register\" \\\n")
	sb.WriteString("  -H \"X-API-Token: ${API_TOKEN}\" \\\n")
	sb.WriteString("  -H \"Content-Type: application/json\" \\\n")
	sb.WriteString("  -d \"{\\\"name\\\": \\\"${NODE_NAME}\\\", \\\"host\\\": \\\"${PUBLIC_IP}\\\", \\\"port\\\": ${NODE_PORT}, \\\"type\\\": \\\"${NODE_TYPE}\\\", \\\"api_token\\\": \\\"${API_TOKEN}\\\"}\")\n\n")

	sb.WriteString("REGISTER_RESULT=$(cat /tmp/register_response.json 2>/dev/null || echo '{\"success\": false, \"message\": \"请求失败\"}')\n")
	sb.WriteString("info \"HTTP 状态码: $HTTP_CODE\"\n")
	sb.WriteString("info \"响应内容: $REGISTER_RESULT\"\n\n")

	sb.WriteString("# 提取最后 3 位数字作为 HTTP 状态码（避免 curl 进度信息干扰）\n")
	sb.WriteString("HTTP_CODE=${HTTP_CODE: -3}\n")
	sb.WriteString("if [[ \"$HTTP_CODE\" == \"200\" ]] && echo \"$REGISTER_RESULT\" | jq -e '.success' &>/dev/null; then\n")
	sb.WriteString("  success \"节点注册成功!\"\n")
	sb.WriteString("  NODE_ID=$(echo \"$REGISTER_RESULT\" | jq -r '.data.id // empty')\n")
	sb.WriteString("  [[ -n \"$NODE_ID\" ]] && info \"节点 ID: $NODE_ID\"\n")
	sb.WriteString("else\n")
	sb.WriteString("  warn \"节点注册失败（HTTP $HTTP_CODE）\"\n")
	sb.WriteString("  ERROR_MSG=$(echo \"$REGISTER_RESULT\" | jq -r '.message // \"\u672a\u77e5\u9519\u8bef\"')\n")
	sb.WriteString("  warn \"错误信息: $ERROR_MSG\"\n")
	sb.WriteString("  warn \"请检查 API Token 是否正确，或手动在面板添加节点\"\n")
	sb.WriteString("fi\n")
	sb.WriteString("rm -f /tmp/register_response.json\n\n")

	// 完成信息
	sb.WriteString("# ===== 完成 =====\n")
	sb.WriteString("echo \"\"\n")
	sb.WriteString("echo -e \"${GREEN}========================================${NC}\"\n")
	sb.WriteString("echo -e \"${GREEN}  UniProxy 节点安装完成!${NC}\"\n")
	sb.WriteString("echo -e \"${GREEN}========================================${NC}\"\n")
	sb.WriteString("echo -e \"  节点名称: ${CYAN}${NODE_NAME}${NC}\"\n")
	sb.WriteString("echo -e \"  节点类型: ${CYAN}${NODE_TYPE}${NC}\"\n")
	sb.WriteString("echo -e \"  公网 IP:  ${CYAN}${PUBLIC_IP}${NC}\"\n")
	sb.WriteString("echo -e \"  面板地址: ${CYAN}${PANEL_URL}${NC}\"\n")
	sb.WriteString("echo -e \"  安装目录: ${CYAN}${INSTALL_DIR}${NC}\"\n")
	sb.WriteString("echo -e \"  网络环境: ${CYAN}$(if [[ \"$IS_CN\" == \"true\" ]]; then echo '国内'; else echo '国外'; fi)${NC}\"\n")
	sb.WriteString("echo -e \"  Agent 状态: $(systemctl is-active uniproxy-agent)\"\n")
	sb.WriteString("echo -e \"${GREEN}========================================${NC}\"\n")
	sb.WriteString("echo \"\"\n")
	sb.WriteString("echo -e \"管理命令:\"\n")
	sb.WriteString("echo -e \"  查看状态: ${CYAN}systemctl status uniproxy-agent${NC}\"\n")
	sb.WriteString("echo -e \"  查看日志: ${CYAN}tail -f ${INSTALL_DIR}/logs/agent.log${NC}\"\n")
	sb.WriteString("echo -e \"  查看Gost日志: ${CYAN}tail -f ${INSTALL_DIR}/logs/gost.log${NC}\"\n")
	sb.WriteString("echo -e \"  重启服务: ${CYAN}systemctl restart uniproxy-agent${NC}\"\n")
	sb.WriteString("echo -e \"  卸载节点: ${CYAN}systemctl stop uniproxy-agent && systemctl disable uniproxy-agent && rm -rf ${INSTALL_DIR}${NC}\"\n")

	return sb.String()
}
