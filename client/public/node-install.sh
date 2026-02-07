#!/bin/bash

# UniProxy Panel 节点智能安装脚本 v2.0
# 用于在远程服务器上自动安装和配置Xray/Gost
# 支持: 自动配置防火墙、SSL证书申请、systemd服务管理

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 配置参数(通过环境变量传入)
PANEL_URL="${PANEL_URL:-}"
API_TOKEN="${API_TOKEN:-}"
NODE_NAME="${NODE_NAME:-$(hostname)}"
NODE_TYPE="${NODE_TYPE:-both}"  # xray, gost, both
NODE_DOMAIN="${NODE_DOMAIN:-}"  # 可选: 节点域名,用于申请SSL证书
ENABLE_SSL="${ENABLE_SSL:-false}"  # 是否启用SSL证书
ENABLE_BBR="${ENABLE_BBR:-true}"  # 是否启用BBR加速

# 端口配置
XRAY_PORTS="${XRAY_PORTS:-10000-10100}"  # Xray使用的端口范围
GOST_PORTS="${GOST_PORTS:-20000-20100}"  # Gost使用的端口范围
AGENT_PORT="${AGENT_PORT:-9999}"  # Agent API端口

echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  UniProxy 节点智能安装脚本 v2.0       ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
echo -e "${BLUE}节点名称:${NC} ${YELLOW}${NODE_NAME}${NC}"
echo -e "${BLUE}节点类型:${NC} ${YELLOW}${NODE_TYPE}${NC}"
echo -e "${BLUE}面板地址:${NC} ${YELLOW}${PANEL_URL}${NC}"
if [ -n "$NODE_DOMAIN" ]; then
  echo -e "${BLUE}节点域名:${NC} ${YELLOW}${NODE_DOMAIN}${NC}"
  echo -e "${BLUE}SSL证书:${NC} ${YELLOW}${ENABLE_SSL}${NC}"
fi
echo -e "${BLUE}BBR加速:${NC} ${YELLOW}${ENABLE_BBR}${NC}"
echo ""

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}❌ 请使用root用户运行此脚本${NC}"
  exit 1
fi

# 检查必需参数
if [ -z "$PANEL_URL" ] || [ -z "$API_TOKEN" ]; then
  echo -e "${RED}❌ 错误: 缺少必需参数${NC}"
  echo ""
  echo -e "${YELLOW}使用方法:${NC}"
  echo "  基础安装:"
  echo "    PANEL_URL=http://your-panel.com API_TOKEN=your-token bash node-install.sh"
  echo ""
  echo "  带SSL证书:"
  echo "    PANEL_URL=http://your-panel.com API_TOKEN=your-token \\"
  echo "    NODE_DOMAIN=node1.example.com ENABLE_SSL=true bash node-install.sh"
  echo ""
  echo "  自定义端口:"
  echo "    PANEL_URL=http://your-panel.com API_TOKEN=your-token \\"
  echo "    XRAY_PORTS=10000-10100 GOST_PORTS=20000-20100 bash node-install.sh"
  exit 1
fi

# 获取系统信息
get_system_info() {
  echo -e "${CYAN}[系统检测]${NC}"
  
  OS=$(cat /etc/os-release | grep ^ID= | cut -d'=' -f2 | tr -d '"')
  OS_VERSION=$(cat /etc/os-release | grep VERSION_ID | cut -d'=' -f2 | tr -d '"')
  ARCH=$(uname -m)
  KERNEL=$(uname -r)
  
  echo -e "  操作系统: ${GREEN}$OS $OS_VERSION${NC}"
  echo -e "  内核版本: ${GREEN}$KERNEL${NC}"
  echo -e "  系统架构: ${GREEN}$ARCH${NC}"
  echo ""
}

# 安装基础依赖
install_dependencies() {
  echo -e "${CYAN}[1/8] 安装基础依赖...${NC}"
  
  if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq curl wget unzip jq socat cron > /dev/null 2>&1
  elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
    yum install -y -q curl wget unzip jq socat cronie > /dev/null 2>&1
  else
    echo -e "${RED}❌ 不支持的操作系统: $OS${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}✓ 基础依赖安装完成${NC}"
}

# 启用BBR加速
enable_bbr() {
  if [ "$ENABLE_BBR" != "true" ]; then
    echo -e "${CYAN}[2/8] 跳过BBR加速配置${NC}"
    return
  fi
  
  echo -e "${CYAN}[2/8] 启用BBR加速...${NC}"
  
  # 检查内核版本
  KERNEL_VERSION=$(uname -r | cut -d. -f1)
  if [ "$KERNEL_VERSION" -lt 4 ]; then
    echo -e "${YELLOW}⚠ 内核版本过低,跳过BBR配置${NC}"
    return
  fi
  
  # 检查BBR是否已启用
  if sysctl net.ipv4.tcp_congestion_control | grep -q bbr; then
    echo -e "${GREEN}✓ BBR已启用${NC}"
    return
  fi
  
  # 启用BBR
  cat >> /etc/sysctl.conf <<EOF
# BBR加速
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
EOF
  
  sysctl -p > /dev/null 2>&1
  
  echo -e "${GREEN}✓ BBR加速已启用${NC}"
}

# 配置防火墙
configure_firewall() {
  echo -e "${CYAN}[3/8] 配置防火墙...${NC}"
  
  # 解析端口范围
  XRAY_PORT_START=$(echo "$XRAY_PORTS" | cut -d'-' -f1)
  XRAY_PORT_END=$(echo "$XRAY_PORTS" | cut -d'-' -f2)
  GOST_PORT_START=$(echo "$GOST_PORTS" | cut -d'-' -f1)
  GOST_PORT_END=$(echo "$GOST_PORTS" | cut -d'-' -f2)
  
  # 检查防火墙类型
  if command -v ufw &> /dev/null; then
    # UFW (Ubuntu/Debian)
    echo -e "  使用UFW防火墙..."
    
    # 基础端口
    ufw allow 22/tcp comment 'SSH' > /dev/null 2>&1
    ufw allow 80/tcp comment 'HTTP' > /dev/null 2>&1
    ufw allow 443/tcp comment 'HTTPS' > /dev/null 2>&1
    ufw allow ${AGENT_PORT}/tcp comment 'UniProxy Agent' > /dev/null 2>&1
    
    # Xray端口范围
    if [ "$NODE_TYPE" = "xray" ] || [ "$NODE_TYPE" = "both" ]; then
      ufw allow ${XRAY_PORT_START}:${XRAY_PORT_END}/tcp comment 'Xray' > /dev/null 2>&1
      ufw allow ${XRAY_PORT_START}:${XRAY_PORT_END}/udp comment 'Xray' > /dev/null 2>&1
    fi
    
    # Gost端口范围
    if [ "$NODE_TYPE" = "gost" ] || [ "$NODE_TYPE" = "both" ]; then
      ufw allow ${GOST_PORT_START}:${GOST_PORT_END}/tcp comment 'Gost' > /dev/null 2>&1
      ufw allow ${GOST_PORT_START}:${GOST_PORT_END}/udp comment 'Gost' > /dev/null 2>&1
    fi
    
    # 启用UFW(如果未启用)
    if ! ufw status | grep -q "Status: active"; then
      echo "y" | ufw enable > /dev/null 2>&1
    else
      ufw reload > /dev/null 2>&1
    fi
    
    echo -e "${GREEN}✓ UFW防火墙配置完成${NC}"
    
  elif command -v firewall-cmd &> /dev/null; then
    # firewalld (CentOS/RHEL)
    echo -e "  使用firewalld防火墙..."
    
    # 基础服务
    firewall-cmd --permanent --add-service=ssh > /dev/null 2>&1
    firewall-cmd --permanent --add-service=http > /dev/null 2>&1
    firewall-cmd --permanent --add-service=https > /dev/null 2>&1
    firewall-cmd --permanent --add-port=${AGENT_PORT}/tcp > /dev/null 2>&1
    
    # Xray端口范围
    if [ "$NODE_TYPE" = "xray" ] || [ "$NODE_TYPE" = "both" ]; then
      firewall-cmd --permanent --add-port=${XRAY_PORTS}/tcp > /dev/null 2>&1
      firewall-cmd --permanent --add-port=${XRAY_PORTS}/udp > /dev/null 2>&1
    fi
    
    # Gost端口范围
    if [ "$NODE_TYPE" = "gost" ] || [ "$NODE_TYPE" = "both" ]; then
      firewall-cmd --permanent --add-port=${GOST_PORTS}/tcp > /dev/null 2>&1
      firewall-cmd --permanent --add-port=${GOST_PORTS}/udp > /dev/null 2>&1
    fi
    
    firewall-cmd --reload > /dev/null 2>&1
    
    echo -e "${GREEN}✓ firewalld防火墙配置完成${NC}"
    
  else
    echo -e "${YELLOW}⚠ 未检测到防火墙,跳过配置${NC}"
    echo -e "${YELLOW}⚠ 请手动开放以下端口:${NC}"
    echo -e "  - SSH: 22"
    echo -e "  - HTTP: 80"
    echo -e "  - HTTPS: 443"
    echo -e "  - Agent: ${AGENT_PORT}"
    if [ "$NODE_TYPE" = "xray" ] || [ "$NODE_TYPE" = "both" ]; then
      echo -e "  - Xray: ${XRAY_PORTS}"
    fi
    if [ "$NODE_TYPE" = "gost" ] || [ "$NODE_TYPE" = "both" ]; then
      echo -e "  - Gost: ${GOST_PORTS}"
    fi
  fi
}

# 申请SSL证书
install_ssl_certificate() {
  if [ "$ENABLE_SSL" != "true" ] || [ -z "$NODE_DOMAIN" ]; then
    echo -e "${CYAN}[4/8] 跳过SSL证书申请${NC}"
    return
  fi
  
  echo -e "${CYAN}[4/8] 申请SSL证书...${NC}"
  
  # 检查域名解析
  echo -e "  检查域名解析..."
  PUBLIC_IP=$(curl -s ifconfig.me)
  DOMAIN_IP=$(dig +short "$NODE_DOMAIN" | tail -n1)
  
  if [ "$PUBLIC_IP" != "$DOMAIN_IP" ]; then
    echo -e "${YELLOW}⚠ 警告: 域名解析不匹配${NC}"
    echo -e "  公网IP: ${PUBLIC_IP}"
    echo -e "  域名IP: ${DOMAIN_IP}"
    echo -e "${YELLOW}⚠ 跳过SSL证书申请,请先配置域名解析${NC}"
    return
  fi
  
  # 安装acme.sh
  if [ ! -f ~/.acme.sh/acme.sh ]; then
    echo -e "  安装acme.sh..."
    curl -s https://get.acme.sh | sh > /dev/null 2>&1
    source ~/.bashrc
  fi
  
  # 申请证书
  echo -e "  申请证书: ${NODE_DOMAIN}..."
  ~/.acme.sh/acme.sh --issue -d "$NODE_DOMAIN" --standalone --force > /dev/null 2>&1
  
  # 安装证书
  mkdir -p /etc/ssl/uniproxy
  ~/.acme.sh/acme.sh --install-cert -d "$NODE_DOMAIN" \
    --key-file /etc/ssl/uniproxy/key.pem \
    --fullchain-file /etc/ssl/uniproxy/cert.pem > /dev/null 2>&1
  
  # 设置自动续期
  ~/.acme.sh/acme.sh --upgrade --auto-upgrade > /dev/null 2>&1
  
  echo -e "${GREEN}✓ SSL证书申请完成${NC}"
  echo -e "  证书路径: /etc/ssl/uniproxy/cert.pem"
  echo -e "  密钥路径: /etc/ssl/uniproxy/key.pem"
}

# 安装Xray
install_xray() {
  if [ "$NODE_TYPE" = "gost" ]; then
    echo -e "${CYAN}[5/8] 跳过Xray安装 (节点类型: gost)${NC}"
    return
  fi
  
  echo -e "${CYAN}[5/8] 安装Xray...${NC}"
  
  # 下载Xray安装脚本
  echo -e "  下载Xray..."
  
  # 使用国内镜像加速
  if ! bash -c "$(curl -L --max-time 60 https://ghproxy.com/https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install > /dev/null 2>&1; then
    echo -e "  ${YELLOW}镜像下载失败,尝试直连...${NC}"
    if ! bash -c "$(curl -L --max-time 120 https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install > /dev/null 2>&1; then
      echo -e "${RED}❌ Xray安装失败${NC}"
      exit 1
    fi
  fi
  
  echo -e "  ${GREEN}下载完成${NC}"
  
  # 创建配置目录
  mkdir -p /usr/local/etc/xray
  
  # 创建初始配置
  cat > /usr/local/etc/xray/config.json <<EOF
{
  "log": {
    "loglevel": "warning",
    "access": "/var/log/xray/access.log",
    "error": "/var/log/xray/error.log"
  },
  "inbounds": [],
  "outbounds": [
    {
      "protocol": "freedom",
      "tag": "direct"
    },
    {
      "protocol": "blackhole",
      "tag": "block"
    }
  ],
  "routing": {
    "domainStrategy": "IPIfNonMatch",
    "rules": [
      {
        "type": "field",
        "ip": ["geoip:private"],
        "outboundTag": "block"
      }
    ]
  }
}
EOF
  
  # 创建日志目录
  mkdir -p /var/log/xray
  
  # 配置systemd服务
  systemctl daemon-reload
  systemctl enable xray > /dev/null 2>&1
  systemctl start xray
  
  # 检查服务状态
  if systemctl is-active --quiet xray; then
    echo -e "${GREEN}✓ Xray安装完成并已启动${NC}"
  else
    echo -e "${RED}❌ Xray启动失败${NC}"
    journalctl -u xray --no-pager -n 10
    exit 1
  fi
}

# 安装Gost
install_gost() {
  if [ "$NODE_TYPE" = "xray" ]; then
    echo -e "${CYAN}[6/8] 跳过Gost安装 (节点类型: xray)${NC}"
    return
  fi
  
  echo -e "${CYAN}[6/8] 安装Gost...${NC}"
  
  # 获取最新版本
  echo -e "  获取最新版本..."
  GOST_VERSION=$(curl -s --max-time 10 https://api.github.com/repos/go-gost/gost/releases/latest | jq -r .tag_name)
  
  # 如果获取失败,使用固定版本
  if [ -z "$GOST_VERSION" ] || [ "$GOST_VERSION" = "null" ]; then
    echo -e "  ${YELLOW}无法获取最新版本,使用v3.0.0${NC}"
    GOST_VERSION="v3.0.0"
  else
    echo -e "  ${GREEN}最新版本: $GOST_VERSION${NC}"
  fi
  
  # 根据架构选择下载文件
  if [ "$ARCH" = "x86_64" ]; then
    GOST_FILE="gost_${GOST_VERSION}_linux_amd64.tar.gz"
  elif [ "$ARCH" = "aarch64" ]; then
    GOST_FILE="gost_${GOST_VERSION}_linux_arm64.tar.gz"
  else
    echo -e "${RED}❌ 不支持的架构: $ARCH${NC}"
    exit 1
  fi
  
  # 下载并安装
  echo -e "  下载Gost ${GOST_VERSION}..."
  
  # 使用国内镜像加速下载
  DOWNLOAD_URL="https://github.com/go-gost/gost/releases/download/${GOST_VERSION}/${GOST_FILE}"
  MIRROR_URL="https://ghproxy.com/${DOWNLOAD_URL}"
  
  # 尝试从镜像下载
  if ! wget --timeout=30 --tries=3 -q "$MIRROR_URL" -O "$GOST_FILE" 2>/dev/null; then
    echo -e "  ${YELLOW}镜像下载失败,尝试直连...${NC}"
    # 尝试直连下载
    if ! wget --timeout=60 --tries=3 -q "$DOWNLOAD_URL" -O "$GOST_FILE" 2>/dev/null; then
      echo -e "${RED}❌ Gost下载失败${NC}"
      echo -e "${YELLOW}请检查网络连接或手动下载: $DOWNLOAD_URL${NC}"
      exit 1
    fi
  fi
  
  echo -e "  ${GREEN}下载完成,正在解压...${NC}"
  tar -xzf "$GOST_FILE"
  mv gost /usr/local/bin/
  chmod +x /usr/local/bin/gost
  rm -f "$GOST_FILE"
  
  # 创建配置目录
  mkdir -p /etc/gost
  mkdir -p /var/log/gost
  
  # 创建初始配置
  cat > /etc/gost/config.json <<EOF
{
  "services": [],
  "log": {
    "level": "info",
    "output": "/var/log/gost/gost.log"
  }
}
EOF
  
  # 创建systemd服务
  cat > /etc/systemd/system/gost.service <<EOF
[Unit]
Description=Gost Proxy Service
Documentation=https://gost.run
After=network.target nss-lookup.target

[Service]
Type=simple
User=root
WorkingDirectory=/etc/gost
ExecStart=/usr/local/bin/gost -C /etc/gost/config.json
ExecReload=/bin/kill -HUP \$MAINPID
Restart=on-failure
RestartSec=5s
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
  
  # 启动Gost服务
  systemctl daemon-reload
  systemctl enable gost > /dev/null 2>&1
  systemctl start gost
  
  # 检查服务状态
  if systemctl is-active --quiet gost; then
    echo -e "${GREEN}✓ Gost安装完成并已启动${NC}"
  else
    echo -e "${RED}❌ Gost启动失败${NC}"
    journalctl -u gost --no-pager -n 10
    exit 1
  fi
}

# 安装节点Agent
install_agent() {
  echo -e "${CYAN}[7/8] 安装节点Agent...${NC}"
  
  # 创建Agent目录
  mkdir -p /opt/uniproxy-agent
  mkdir -p /var/log/uniproxy-agent
  
  # 创建Agent配置
  cat > /opt/uniproxy-agent/config.json <<EOF
{
  "panel_url": "${PANEL_URL}",
  "api_token": "${API_TOKEN}",
  "node_name": "${NODE_NAME}",
  "node_type": "${NODE_TYPE}",
  "node_domain": "${NODE_DOMAIN}",
  "agent_port": ${AGENT_PORT},
  "report_interval": 60,
  "ssl_enabled": ${ENABLE_SSL},
  "ssl_cert": "/etc/ssl/uniproxy/cert.pem",
  "ssl_key": "/etc/ssl/uniproxy/key.pem"
}
EOF
  
  # 创建Agent脚本
  cat > /opt/uniproxy-agent/agent.sh <<'AGENT_SCRIPT'
#!/bin/bash

# UniProxy Node Agent
# 用于向面板报告节点状态和接收配置更新

CONFIG_FILE="/opt/uniproxy-agent/config.json"
LOG_FILE="/var/log/uniproxy-agent/agent.log"

# 日志函数
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 读取配置
PANEL_URL=$(jq -r .panel_url "$CONFIG_FILE")
API_TOKEN=$(jq -r .api_token "$CONFIG_FILE")
NODE_NAME=$(jq -r .node_name "$CONFIG_FILE")
NODE_TYPE=$(jq -r .node_type "$CONFIG_FILE")
REPORT_INTERVAL=$(jq -r .report_interval "$CONFIG_FILE")

log "Agent启动: $NODE_NAME ($NODE_TYPE)"

# 获取系统信息
get_system_info() {
  # CPU使用率
  CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
  
  # 内存信息
  MEM_TOTAL=$(free -m | awk 'NR==2{print $2}')
  MEM_USED=$(free -m | awk 'NR==2{print $3}')
  MEM_USAGE=$(awk "BEGIN {printf \"%.2f\", ($MEM_USED/$MEM_TOTAL)*100}")
  
  # 磁盘信息
  DISK_TOTAL=$(df -h / | awk 'NR==2{print $2}')
  DISK_USED=$(df -h / | awk 'NR==2{print $3}')
  DISK_USAGE=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
  
  # 网络流量(累计)
  TRAFFIC_UP=$(cat /sys/class/net/eth0/statistics/tx_bytes 2>/dev/null || echo 0)
  TRAFFIC_DOWN=$(cat /sys/class/net/eth0/statistics/rx_bytes 2>/dev/null || echo 0)
  
  # 运行时间
  UPTIME=$(uptime -p)
  
  # 检查服务状态
  if [ "$NODE_TYPE" = "xray" ] || [ "$NODE_TYPE" = "both" ]; then
    XRAY_STATUS=$(systemctl is-active xray 2>/dev/null || echo "inactive")
  else
    XRAY_STATUS="disabled"
  fi
  
  if [ "$NODE_TYPE" = "gost" ] || [ "$NODE_TYPE" = "both" ]; then
    GOST_STATUS=$(systemctl is-active gost 2>/dev/null || echo "inactive")
  else
    GOST_STATUS="disabled"
  fi
  
  # 构建JSON数据
  cat <<EOF
{
  "node_name": "$NODE_NAME",
  "cpu_usage": $CPU_USAGE,
  "memory_total": $MEM_TOTAL,
  "memory_used": $MEM_USED,
  "memory_usage": $MEM_USAGE,
  "disk_total": "$DISK_TOTAL",
  "disk_used": "$DISK_USED",
  "disk_usage": $DISK_USAGE,
  "traffic_up": $TRAFFIC_UP,
  "traffic_down": $TRAFFIC_DOWN,
  "uptime": "$UPTIME",
  "xray_status": "$XRAY_STATUS",
  "gost_status": "$GOST_STATUS",
  "timestamp": $(date +%s)
}
EOF
}

# 主循环
while true; do
  # 获取系统信息
  SYSTEM_INFO=$(get_system_info)
  
  # 发送到面板
  RESPONSE=$(curl -s -X POST "${PANEL_URL}/api/v1/node/heartbeat" \
    -H "Authorization: Bearer ${API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$SYSTEM_INFO")
  
  # 检查响应
  if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    log "心跳上报成功"
    
    # 检查是否有配置更新
    if echo "$RESPONSE" | jq -e '.data.config_updated' > /dev/null 2>&1; then
      log "检测到配置更新,重新加载服务..."
      
      if [ "$NODE_TYPE" = "xray" ] || [ "$NODE_TYPE" = "both" ]; then
        systemctl reload xray
      fi
      
      if [ "$NODE_TYPE" = "gost" ] || [ "$NODE_TYPE" = "both" ]; then
        systemctl reload gost
      fi
    fi
  else
    log "心跳上报失败: $(echo "$RESPONSE" | jq -r '.message')"
  fi
  
  # 等待下一次报告
  sleep "$REPORT_INTERVAL"
done
AGENT_SCRIPT
  
  chmod +x /opt/uniproxy-agent/agent.sh
  
  # 创建Agent服务
  cat > /etc/systemd/system/uniproxy-agent.service <<EOF
[Unit]
Description=UniProxy Node Agent
Documentation=https://github.com/wenxin-99/uniproxy-panel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/uniproxy-agent
ExecStart=/opt/uniproxy-agent/agent.sh
Restart=always
RestartSec=10s
StandardOutput=append:/var/log/uniproxy-agent/agent.log
StandardError=append:/var/log/uniproxy-agent/agent.log

[Install]
WantedBy=multi-user.target
EOF
  
  # 启动Agent服务
  systemctl daemon-reload
  systemctl enable uniproxy-agent > /dev/null 2>&1
  systemctl start uniproxy-agent
  
  # 检查服务状态
  sleep 2
  if systemctl is-active --quiet uniproxy-agent; then
    echo -e "${GREEN}✓ 节点Agent安装完成并已启动${NC}"
  else
    echo -e "${RED}❌ Agent启动失败${NC}"
    journalctl -u uniproxy-agent --no-pager -n 10
    exit 1
  fi
}

# 注册到面板
register_to_panel() {
  echo -e "${CYAN}[8/8] 注册节点到面板...${NC}"
  
  # 获取节点信息
  PUBLIC_IP=$(curl -s ifconfig.me)
  
  # 构建注册数据
  REGISTER_DATA=$(cat <<EOF
{
  "name": "${NODE_NAME}",
  "host": "${PUBLIC_IP}",
  "port": ${AGENT_PORT},
  "type": "${NODE_TYPE}",
  "api_token": "${API_TOKEN}",
  "domain": "${NODE_DOMAIN}",
  "ssl_enabled": ${ENABLE_SSL}
}
EOF
)
  
  # 发送注册请求
  echo -e "  发送注册请求..."
  RESPONSE=$(curl -s -X POST "${PANEL_URL}/api/v1/node" \
    -H "Authorization: Bearer ${API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$REGISTER_DATA")
  
  if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 节点注册成功${NC}"
    NODE_ID=$(echo "$RESPONSE" | jq -r '.data.id')
    echo -e "  节点ID: ${YELLOW}$NODE_ID${NC}"
    
    # 保存节点ID到配置
    jq ".node_id = $NODE_ID" /opt/uniproxy-agent/config.json > /tmp/config.json
    mv /tmp/config.json /opt/uniproxy-agent/config.json
  else
    echo -e "${YELLOW}⚠ 节点注册失败(可能已存在): $(echo "$RESPONSE" | jq -r '.message')${NC}"
    echo -e "${YELLOW}⚠ 继续安装流程...${NC}"
  fi
}

# 显示安装结果
show_result() {
  echo ""
  echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║         节点安装完成!                  ║${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${BLUE}节点信息:${NC}"
  echo -e "  名称: ${YELLOW}${NODE_NAME}${NC}"
  echo -e "  类型: ${YELLOW}${NODE_TYPE}${NC}"
  echo -e "  公网IP: ${YELLOW}$(curl -s ifconfig.me)${NC}"
  if [ -n "$NODE_DOMAIN" ]; then
    echo -e "  域名: ${YELLOW}${NODE_DOMAIN}${NC}"
  fi
  echo ""
  
  echo -e "${BLUE}服务状态:${NC}"
  
  if [ "$NODE_TYPE" = "xray" ] || [ "$NODE_TYPE" = "both" ]; then
    XRAY_STATUS=$(systemctl is-active xray)
    if [ "$XRAY_STATUS" = "active" ]; then
      echo -e "  Xray: ${GREEN}●${NC} ${XRAY_STATUS}"
    else
      echo -e "  Xray: ${RED}●${NC} ${XRAY_STATUS}"
    fi
  fi
  
  if [ "$NODE_TYPE" = "gost" ] || [ "$NODE_TYPE" = "both" ]; then
    GOST_STATUS=$(systemctl is-active gost)
    if [ "$GOST_STATUS" = "active" ]; then
      echo -e "  Gost: ${GREEN}●${NC} ${GOST_STATUS}"
    else
      echo -e "  Gost: ${RED}●${NC} ${GOST_STATUS}"
    fi
  fi
  
  AGENT_STATUS=$(systemctl is-active uniproxy-agent)
  if [ "$AGENT_STATUS" = "active" ]; then
    echo -e "  Agent: ${GREEN}●${NC} ${AGENT_STATUS}"
  else
    echo -e "  Agent: ${RED}●${NC} ${AGENT_STATUS}"
  fi
  
  echo ""
  echo -e "${BLUE}管理命令:${NC}"
  echo -e "  查看Agent日志: ${YELLOW}journalctl -u uniproxy-agent -f${NC}"
  echo -e "  重启Agent: ${YELLOW}systemctl restart uniproxy-agent${NC}"
  echo -e "  查看Agent状态: ${YELLOW}systemctl status uniproxy-agent${NC}"
  echo ""
  
  if [ "$NODE_TYPE" = "xray" ] || [ "$NODE_TYPE" = "both" ]; then
    echo -e "  查看Xray日志: ${YELLOW}journalctl -u xray -f${NC}"
    echo -e "  重启Xray: ${YELLOW}systemctl restart xray${NC}"
    echo -e "  Xray配置: ${YELLOW}/usr/local/etc/xray/config.json${NC}"
    echo ""
  fi
  
  if [ "$NODE_TYPE" = "gost" ] || [ "$NODE_TYPE" = "both" ]; then
    echo -e "  查看Gost日志: ${YELLOW}journalctl -u gost -f${NC}"
    echo -e "  重启Gost: ${YELLOW}systemctl restart gost${NC}"
    echo -e "  Gost配置: ${YELLOW}/etc/gost/config.json${NC}"
    echo ""
  fi
  
  if [ "$ENABLE_SSL" = "true" ] && [ -n "$NODE_DOMAIN" ]; then
    echo -e "${BLUE}SSL证书:${NC}"
    echo -e "  证书路径: ${YELLOW}/etc/ssl/uniproxy/cert.pem${NC}"
    echo -e "  密钥路径: ${YELLOW}/etc/ssl/uniproxy/key.pem${NC}"
    echo -e "  自动续期: ${GREEN}已启用${NC}"
    echo ""
  fi
  
  echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  安装完成!请在面板中查看节点状态      ║${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
}

# 主流程
main() {
  get_system_info
  install_dependencies
  enable_bbr
  configure_firewall
  install_ssl_certificate
  install_xray
  install_gost
  install_agent
  register_to_panel
  show_result
}

# 捕获错误
trap 'echo -e "${RED}❌ 安装过程中出现错误,请检查日志${NC}"; exit 1' ERR

# 执行主流程
main
