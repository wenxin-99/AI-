#!/bin/bash

# UniProxy Panel 节点智能安装脚本
# 用于在远程服务器上自动安装和配置Xray/Gost

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置参数(通过环境变量传入)
PANEL_URL="${PANEL_URL:-}"
API_TOKEN="${API_TOKEN:-}"
NODE_NAME="${NODE_NAME:-$(hostname)}"
NODE_TYPE="${NODE_TYPE:-both}"  # xray, gost, both

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}UniProxy 节点智能安装脚本${NC}"
echo -e "${GREEN}================================${NC}"
echo -e "${BLUE}节点名称: ${NODE_NAME}${NC}"
echo -e "${BLUE}节点类型: ${NODE_TYPE}${NC}"
echo -e "${BLUE}面板地址: ${PANEL_URL}${NC}"
echo ""

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}请使用root用户运行此脚本${NC}"
  exit 1
fi

# 检查必需参数
if [ -z "$PANEL_URL" ] || [ -z "$API_TOKEN" ]; then
  echo -e "${RED}错误: 缺少必需参数${NC}"
  echo "使用方法: PANEL_URL=http://your-panel.com API_TOKEN=your-token bash node-install.sh"
  exit 1
fi

# 获取系统信息
get_system_info() {
  OS=$(cat /etc/os-release | grep ^ID= | cut -d'=' -f2 | tr -d '"')
  OS_VERSION=$(cat /etc/os-release | grep VERSION_ID | cut -d'=' -f2 | tr -d '"')
  ARCH=$(uname -m)
  
  echo -e "${YELLOW}[系统信息]${NC}"
  echo "  操作系统: $OS $OS_VERSION"
  echo "  架构: $ARCH"
  echo ""
}

# 安装基础依赖
install_dependencies() {
  echo -e "${YELLOW}[1/6] 安装基础依赖...${NC}"
  
  if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    apt-get update -qq
    apt-get install -y curl wget unzip jq
  elif [ "$OS" = "centos" ] || [ "$OS" = "rhel" ]; then
    yum install -y curl wget unzip jq
  else
    echo -e "${RED}不支持的操作系统: $OS${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}✓ 基础依赖安装完成${NC}"
}

# 安装Xray
install_xray() {
  if [ "$NODE_TYPE" = "gost" ]; then
    echo -e "${YELLOW}[2/6] 跳过Xray安装 (节点类型: gost)${NC}"
    return
  fi
  
  echo -e "${YELLOW}[2/6] 安装Xray...${NC}"
  
  # 下载Xray安装脚本
  bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
  
  # 创建配置目录
  mkdir -p /usr/local/etc/xray
  
  # 创建初始配置
  cat > /usr/local/etc/xray/config.json <<EOF
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [],
  "outbounds": [
    {
      "protocol": "freedom",
      "tag": "direct"
    }
  ]
}
EOF
  
  # 启动Xray服务
  systemctl enable xray
  systemctl start xray
  
  echo -e "${GREEN}✓ Xray安装完成${NC}"
}

# 安装Gost
install_gost() {
  if [ "$NODE_TYPE" = "xray" ]; then
    echo -e "${YELLOW}[3/6] 跳过Gost安装 (节点类型: xray)${NC}"
    return
  fi
  
  echo -e "${YELLOW}[3/6] 安装Gost...${NC}"
  
  # 获取最新版本
  GOST_VERSION=$(curl -s https://api.github.com/repos/go-gost/gost/releases/latest | jq -r .tag_name)
  
  # 根据架构选择下载文件
  if [ "$ARCH" = "x86_64" ]; then
    GOST_FILE="gost_${GOST_VERSION}_linux_amd64.tar.gz"
  elif [ "$ARCH" = "aarch64" ]; then
    GOST_FILE="gost_${GOST_VERSION}_linux_arm64.tar.gz"
  else
    echo -e "${RED}不支持的架构: $ARCH${NC}"
    exit 1
  fi
  
  # 下载并安装
  wget -q "https://github.com/go-gost/gost/releases/download/${GOST_VERSION}/${GOST_FILE}"
  tar -xzf "$GOST_FILE"
  mv gost /usr/local/bin/
  chmod +x /usr/local/bin/gost
  rm -f "$GOST_FILE"
  
  # 创建配置目录
  mkdir -p /etc/gost
  
  # 创建初始配置
  cat > /etc/gost/config.json <<EOF
{
  "services": []
}
EOF
  
  # 创建systemd服务
  cat > /etc/systemd/system/gost.service <<EOF
[Unit]
Description=Gost Proxy Service
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/gost -C /etc/gost/config.json
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
  
  # 启动Gost服务
  systemctl daemon-reload
  systemctl enable gost
  systemctl start gost
  
  echo -e "${GREEN}✓ Gost安装完成${NC}"
}

# 安装节点Agent
install_agent() {
  echo -e "${YELLOW}[4/6] 安装节点Agent...${NC}"
  
  # 创建Agent目录
  mkdir -p /opt/uniproxy-agent
  
  # 创建Agent配置
  cat > /opt/uniproxy-agent/config.json <<EOF
{
  "panel_url": "${PANEL_URL}",
  "api_token": "${API_TOKEN}",
  "node_name": "${NODE_NAME}",
  "node_type": "${NODE_TYPE}",
  "report_interval": 60
}
EOF
  
  # 下载Agent程序(这里假设有预编译的Agent)
  # TODO: 实际项目中需要提供Agent二进制文件
  cat > /opt/uniproxy-agent/agent.sh <<'AGENT_SCRIPT'
#!/bin/bash

# 简单的Agent脚本,用于向面板报告节点状态
CONFIG_FILE="/opt/uniproxy-agent/config.json"

# 读取配置
PANEL_URL=$(jq -r .panel_url "$CONFIG_FILE")
API_TOKEN=$(jq -r .api_token "$CONFIG_FILE")
NODE_NAME=$(jq -r .node_name "$CONFIG_FILE")
NODE_TYPE=$(jq -r .node_type "$CONFIG_FILE")
REPORT_INTERVAL=$(jq -r .report_interval "$CONFIG_FILE")

# 获取系统信息
get_system_info() {
  CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
  MEM_TOTAL=$(free -m | awk 'NR==2{print $2}')
  MEM_USED=$(free -m | awk 'NR==2{print $3}')
  DISK_TOTAL=$(df -h / | awk 'NR==2{print $2}')
  DISK_USED=$(df -h / | awk 'NR==2{print $3}')
  UPTIME=$(uptime -p)
  
  # 检查服务状态
  if [ "$NODE_TYPE" = "xray" ] || [ "$NODE_TYPE" = "both" ]; then
    XRAY_STATUS=$(systemctl is-active xray || echo "inactive")
  else
    XRAY_STATUS="disabled"
  fi
  
  if [ "$NODE_TYPE" = "gost" ] || [ "$NODE_TYPE" = "both" ]; then
    GOST_STATUS=$(systemctl is-active gost || echo "inactive")
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
  "disk_total": "$DISK_TOTAL",
  "disk_used": "$DISK_USED",
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
  curl -s -X POST "${PANEL_URL}/api/v1/node/report" \
    -H "Authorization: Bearer ${API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$SYSTEM_INFO" > /dev/null
  
  # 等待下一次报告
  sleep "$REPORT_INTERVAL"
done
AGENT_SCRIPT
  
  chmod +x /opt/uniproxy-agent/agent.sh
  
  # 创建Agent服务
  cat > /etc/systemd/system/uniproxy-agent.service <<EOF
[Unit]
Description=UniProxy Node Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/uniproxy-agent
ExecStart=/opt/uniproxy-agent/agent.sh
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF
  
  # 启动Agent服务
  systemctl daemon-reload
  systemctl enable uniproxy-agent
  systemctl start uniproxy-agent
  
  echo -e "${GREEN}✓ 节点Agent安装完成${NC}"
}

# 配置防火墙
configure_firewall() {
  echo -e "${YELLOW}[5/6] 配置防火墙...${NC}"
  
  # 检查防火墙类型
  if command -v ufw &> /dev/null; then
    # UFW (Ubuntu)
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    echo -e "${GREEN}✓ UFW防火墙配置完成${NC}"
  elif command -v firewall-cmd &> /dev/null; then
    # firewalld (CentOS)
    firewall-cmd --permanent --add-service=ssh
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
    echo -e "${GREEN}✓ firewalld防火墙配置完成${NC}"
  else
    echo -e "${YELLOW}未检测到防火墙,跳过配置${NC}"
  fi
}

# 注册到面板
register_to_panel() {
  echo -e "${YELLOW}[6/6] 注册节点到面板...${NC}"
  
  # 获取节点信息
  PUBLIC_IP=$(curl -s ifconfig.me)
  
  # 构建注册数据
  REGISTER_DATA=$(cat <<EOF
{
  "name": "${NODE_NAME}",
  "host": "${PUBLIC_IP}",
  "type": "${NODE_TYPE}",
  "api_token": "${API_TOKEN}",
  "os": "${OS}",
  "arch": "${ARCH}"
}
EOF
)
  
  # 发送注册请求
  RESPONSE=$(curl -s -X POST "${PANEL_URL}/api/v1/node/register" \
    -H "Authorization: Bearer ${API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$REGISTER_DATA")
  
  if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ 节点注册成功${NC}"
    NODE_ID=$(echo "$RESPONSE" | jq -r '.data.id')
    echo "  节点ID: $NODE_ID"
    
    # 保存节点ID到配置
    jq ".node_id = $NODE_ID" /opt/uniproxy-agent/config.json > /tmp/config.json
    mv /tmp/config.json /opt/uniproxy-agent/config.json
  else
    echo -e "${RED}✗ 节点注册失败${NC}"
    echo "$RESPONSE" | jq -r '.message'
    exit 1
  fi
}

# 显示安装结果
show_result() {
  echo ""
  echo -e "${GREEN}================================${NC}"
  echo -e "${GREEN}节点安装完成!${NC}"
  echo -e "${GREEN}================================${NC}"
  echo -e "节点名称: ${YELLOW}${NODE_NAME}${NC}"
  echo -e "节点类型: ${YELLOW}${NODE_TYPE}${NC}"
  echo -e "公网IP: ${YELLOW}$(curl -s ifconfig.me)${NC}"
  echo ""
  echo -e "${BLUE}服务状态:${NC}"
  
  if [ "$NODE_TYPE" = "xray" ] || [ "$NODE_TYPE" = "both" ]; then
    echo -e "  Xray: ${GREEN}$(systemctl is-active xray)${NC}"
  fi
  
  if [ "$NODE_TYPE" = "gost" ] || [ "$NODE_TYPE" = "both" ]; then
    echo -e "  Gost: ${GREEN}$(systemctl is-active gost)${NC}"
  fi
  
  echo -e "  Agent: ${GREEN}$(systemctl is-active uniproxy-agent)${NC}"
  echo ""
  echo -e "${BLUE}管理命令:${NC}"
  echo -e "  查看Agent日志: ${YELLOW}journalctl -u uniproxy-agent -f${NC}"
  echo -e "  重启Agent: ${YELLOW}systemctl restart uniproxy-agent${NC}"
  
  if [ "$NODE_TYPE" = "xray" ] || [ "$NODE_TYPE" = "both" ]; then
    echo -e "  查看Xray日志: ${YELLOW}journalctl -u xray -f${NC}"
    echo -e "  重启Xray: ${YELLOW}systemctl restart xray${NC}"
  fi
  
  if [ "$NODE_TYPE" = "gost" ] || [ "$NODE_TYPE" = "both" ]; then
    echo -e "  查看Gost日志: ${YELLOW}journalctl -u gost -f${NC}"
    echo -e "  重启Gost: ${YELLOW}systemctl restart gost${NC}"
  fi
  
  echo -e "${GREEN}================================${NC}"
}

# 主流程
main() {
  get_system_info
  install_dependencies
  install_xray
  install_gost
  install_agent
  configure_firewall
  register_to_panel
  show_result
}

# 执行主流程
main
