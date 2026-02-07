#!/bin/bash

# UniProxy Panel 一键安装脚本
# 支持 Ubuntu 20.04/22.04, Debian 10/11, CentOS 7/8

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查是否为root用户
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "此脚本必须以root权限运行"
        exit 1
    fi
}

# 检测操作系统
detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        VER=$VERSION_ID
    else
        log_error "无法检测操作系统"
        exit 1
    fi
    
    log_info "检测到操作系统: $OS $VER"
}

# 安装依赖
install_dependencies() {
    log_step "安装系统依赖..."
    
    if [[ "$OS" == "ubuntu" ]] || [[ "$OS" == "debian" ]]; then
        apt-get update
        apt-get install -y curl wget git unzip sqlite3 nginx
    elif [[ "$OS" == "centos" ]] || [[ "$OS" == "rhel" ]]; then
        yum install -y curl wget git unzip sqlite nginx
    else
        log_error "不支持的操作系统: $OS"
        exit 1
    fi
}

# 安装 Node.js
install_nodejs() {
    log_step "安装 Node.js..."
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        log_info "Node.js 已安装: $NODE_VERSION"
    else
        curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
        apt-get install -y nodejs
        log_info "Node.js 安装完成: $(node -v)"
    fi
    
    # 安装 pnpm
    if ! command -v pnpm &> /dev/null; then
        npm install -g pnpm
        log_info "pnpm 安装完成"
    fi
}

# 安装 Go
install_golang() {
    log_step "安装 Go..."
    
    if command -v go &> /dev/null; then
        GO_VERSION=$(go version)
        log_info "Go 已安装: $GO_VERSION"
        return
    fi
    
    GO_VERSION="1.21.5"
    wget https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz
    rm go${GO_VERSION}.linux-amd64.tar.gz
    
    # 设置环境变量
    echo 'export PATH=$PATH:/usr/local/go/bin' >> /etc/profile
    export PATH=$PATH:/usr/local/go/bin
    
    log_info "Go 安装完成: $(go version)"
}

# 下载并安装 Xray
install_xray() {
    log_step "安装 Xray..."
    
    XRAY_DIR="/usr/local/xray"
    mkdir -p $XRAY_DIR
    
    # 下载最新版本
    wget -O /tmp/xray.zip https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip
    unzip -o /tmp/xray.zip -d $XRAY_DIR
    chmod +x $XRAY_DIR/xray
    rm /tmp/xray.zip
    
    log_info "Xray 安装完成: $($XRAY_DIR/xray version | head -n 1)"
}

# 下载并安装 Gost
install_gost() {
    log_step "安装 Gost..."
    
    GOST_DIR="/usr/local/gost"
    mkdir -p $GOST_DIR
    
    # 使用固定版本3.0.0-rc10 (最新稳定版)
    GOST_VERSION="3.0.0-rc10"
    wget -O /tmp/gost.tar.gz https://github.com/go-gost/gost/releases/download/v${GOST_VERSION}/gost_${GOST_VERSION}_linux_amd64.tar.gz
    tar -xzf /tmp/gost.tar.gz -C $GOST_DIR
    chmod +x $GOST_DIR/gost
    rm /tmp/gost.tar.gz
    
    log_info "Gost 安装完成: $($GOST_DIR/gost -V 2>&1 | head -n 1)"
}

# 克隆项目代码
clone_project() {
    log_step "克隆项目代码..."
    
    INSTALL_DIR="/opt/uniproxy-panel"
    
    if [[ -d "$INSTALL_DIR" ]]; then
        log_warn "目录已存在,正在备份..."
        mv $INSTALL_DIR ${INSTALL_DIR}.bak.$(date +%s)
    fi
    
    git clone https://github.com/wenxin-99/AI-.git $INSTALL_DIR/frontend
    
    # 如果有后端仓库,也克隆
    # git clone YOUR_BACKEND_REPO $INSTALL_DIR/backend
    
    log_info "项目代码克隆完成"
}

# 构建前端
build_frontend() {
    log_step "构建前端..."
    
    cd /opt/uniproxy-panel/frontend
    pnpm install
    pnpm build
    
    # 复制构建产物到nginx目录
    rm -rf /var/www/uniproxy-panel
    mkdir -p /var/www/uniproxy-panel
    cp -r dist/* /var/www/uniproxy-panel/
    
    log_info "前端构建完成"
}

# 构建后端
build_backend() {
    log_step "构建后端..."
    
    # 如果后端代码在其他位置,需要先克隆
    if [[ ! -d "/opt/uniproxy-panel/backend" ]]; then
        log_warn "后端代码不存在,跳过后端构建"
        log_warn "请手动将后端代码放置到 /opt/uniproxy-panel/backend"
        return
    fi
    
    cd /opt/uniproxy-panel/backend
    go build -o uniproxy ./cmd/main.go
    
    log_info "后端构建完成"
}

# 配置 Nginx
configure_nginx() {
    log_step "配置 Nginx..."
    
    cat > /etc/nginx/sites-available/uniproxy-panel <<EOF
server {
    listen 80;
    server_name _;
    
    root /var/www/uniproxy-panel;
    index index.html;
    
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
}
EOF
    
    ln -sf /etc/nginx/sites-available/uniproxy-panel /etc/nginx/sites-enabled/
    nginx -t && systemctl reload nginx
    
    log_info "Nginx 配置完成"
}

# 创建配置文件
create_config() {
    log_step "创建配置文件..."
    
    mkdir -p /opt/uniproxy-panel/data
    mkdir -p /opt/uniproxy-panel/logs
    mkdir -p /opt/uniproxy-panel/certs
    
    cat > /opt/uniproxy-panel/config.yaml <<EOF
server:
  host: 127.0.0.1
  port: 8080
  mode: release

database:
  type: sqlite
  path: /opt/uniproxy-panel/data/uniproxy.db

xray:
  binary_path: /usr/local/xray/xray
  config_path: /opt/uniproxy-panel/data/xray_config.json
  log_path: /opt/uniproxy-panel/logs/xray.log

gost:
  binary_path: /usr/local/gost/gost
  config_path: /opt/uniproxy-panel/data/gost_config.yaml
  log_path: /opt/uniproxy-panel/logs/gost.log

security:
  jwt_secret: $(openssl rand -base64 32)
  admin_username: admin
  admin_password: $(openssl rand -base64 12)

log:
  level: info
  path: /opt/uniproxy-panel/logs/backend.log
EOF
    
    log_info "配置文件已创建: /opt/uniproxy-panel/config.yaml"
}

# 创建 systemd 服务
create_systemd_service() {
    log_step "创建 systemd 服务..."
    
    cat > /etc/systemd/system/uniproxy-panel.service <<EOF
[Unit]
Description=UniProxy Panel Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/uniproxy-panel/backend
ExecStart=/opt/uniproxy-panel/backend/uniproxy -c /opt/uniproxy-panel/config.yaml
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable uniproxy-panel
    
    log_info "systemd 服务已创建"
}

# 启动服务
start_services() {
    log_step "启动服务..."
    
    systemctl start nginx
    systemctl enable nginx
    
    if [[ -f "/opt/uniproxy-panel/backend/uniproxy" ]]; then
        systemctl start uniproxy-panel
        log_info "后端服务已启动"
    else
        log_warn "后端未构建,跳过启动"
    fi
}

# 显示安装信息
show_info() {
    echo ""
    echo "=========================================="
    log_info "UniProxy Panel 安装完成!"
    echo "=========================================="
    echo ""
    echo "访问地址: http://$(curl -s ifconfig.me)"
    echo ""
    
    if [[ -f "/opt/uniproxy-panel/config.yaml" ]]; then
        ADMIN_USER=$(grep admin_username /opt/uniproxy-panel/config.yaml | awk '{print $2}')
        ADMIN_PASS=$(grep admin_password /opt/uniproxy-panel/config.yaml | awk '{print $2}')
        echo "管理员账号: $ADMIN_USER"
        echo "管理员密码: $ADMIN_PASS"
        echo ""
    fi
    
    echo "配置文件: /opt/uniproxy-panel/config.yaml"
    echo "数据目录: /opt/uniproxy-panel/data"
    echo "日志目录: /opt/uniproxy-panel/logs"
    echo ""
    echo "常用命令:"
    echo "  启动服务: systemctl start uniproxy-panel"
    echo "  停止服务: systemctl stop uniproxy-panel"
    echo "  重启服务: systemctl restart uniproxy-panel"
    echo "  查看状态: systemctl status uniproxy-panel"
    echo "  查看日志: journalctl -u uniproxy-panel -f"
    echo ""
    echo "=========================================="
}

# 主函数
main() {
    echo ""
    echo "=========================================="
    echo "  UniProxy Panel 一键安装脚本"
    echo "=========================================="
    echo ""
    
    check_root
    detect_os
    install_dependencies
    install_nodejs
    install_golang
    install_xray
    install_gost
    clone_project
    build_frontend
    build_backend
    configure_nginx
    create_config
    create_systemd_service
    start_services
    show_info
}

# 执行主函数
main
