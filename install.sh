#!/bin/bash

# UniProxy Panel 一键安装脚本
# 支持 Ubuntu 20.04/22.04/24.04, Debian 10/11, CentOS 7/8

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

# 错误处理
error_exit() {
    log_error "$1"
    exit 1
}

# 检查是否为root用户
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "此脚本必须以root权限运行"
    fi
}

# 检测操作系统
detect_os() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID
        VER=$VERSION_ID
    else
        error_exit "无法检测操作系统"
    fi
    
    log_info "检测到操作系统: $OS $VER"
}

# 禁用IPv6(解决某些VPS的IPv6连接问题)
disable_ipv6_if_needed() {
    log_step "检查网络配置..."
    
    # 测试IPv6连接
    if ping6 -c 1 google.com &> /dev/null; then
        log_info "IPv6连接正常"
    else
        log_warn "IPv6连接失败,优先使用IPv4"
        # 临时禁用IPv6
        sysctl -w net.ipv6.conf.all.disable_ipv6=1 &> /dev/null || true
        sysctl -w net.ipv6.conf.default.disable_ipv6=1 &> /dev/null || true
    fi
}

# 安装依赖
install_dependencies() {
    log_step "安装系统依赖..."
    
    if [[ "$OS" == "ubuntu" ]] || [[ "$OS" == "debian" ]]; then
        export DEBIAN_FRONTEND=noninteractive
        apt-get update || error_exit "apt-get update 失败"
        apt-get install -y curl wget git unzip sqlite3 nginx || error_exit "依赖安装失败"
    elif [[ "$OS" == "centos" ]] || [[ "$OS" == "rhel" ]]; then
        yum install -y curl wget git unzip sqlite nginx || error_exit "依赖安装失败"
    else
        error_exit "不支持的操作系统: $OS"
    fi
}

# 安装 Node.js
install_nodejs() {
    log_step "安装 Node.js..."
    
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v)
        log_info "Node.js 已安装: $NODE_VERSION"
    else
        log_info "正在安装 Node.js 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - || error_exit "Node.js 安装失败"
        apt-get install -y nodejs || error_exit "Node.js 安装失败"
        log_info "Node.js 安装完成: $(node -v)"
    fi
    
    # 安装 pnpm (带重试)
    if ! command -v pnpm &> /dev/null; then
        log_info "正在安装 pnpm..."
        local retry=0
        local max_retry=3
        
        while [ $retry -lt $max_retry ]; do
            if npm install -g pnpm; then
                log_info "pnpm 安装完成"
                break
            else
                retry=$((retry + 1))
                if [ $retry -lt $max_retry ]; then
                    log_warn "pnpm 安装失败,重试 $retry/$max_retry..."
                    sleep 2
                else
                    error_exit "pnpm 安装失败,请检查网络连接"
                fi
            fi
        done
    else
        log_info "pnpm 已安装"
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
    log_info "正在下载 Go ${GO_VERSION}..."
    
    # 带重试的下载
    local retry=0
    local max_retry=3
    
    while [ $retry -lt $max_retry ]; do
        if wget -O go${GO_VERSION}.linux-amd64.tar.gz https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz; then
            break
        else
            retry=$((retry + 1))
            if [ $retry -lt $max_retry ]; then
                log_warn "Go 下载失败,重试 $retry/$max_retry..."
                sleep 2
            else
                error_exit "Go 下载失败"
            fi
        fi
    done
    
    rm -rf /usr/local/go
    tar -C /usr/local -xzf go${GO_VERSION}.linux-amd64.tar.gz || error_exit "Go 解压失败"
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
    
    log_info "正在下载 Xray..."
    
    # 带重试的下载
    local retry=0
    local max_retry=3
    
    while [ $retry -lt $max_retry ]; do
        if wget -O /tmp/xray.zip https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip; then
            break
        else
            retry=$((retry + 1))
            if [ $retry -lt $max_retry ]; then
                log_warn "Xray 下载失败,重试 $retry/$max_retry..."
                sleep 2
            else
                error_exit "Xray 下载失败"
            fi
        fi
    done
    
    unzip -o /tmp/xray.zip -d $XRAY_DIR || error_exit "Xray 解压失败"
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
    log_info "正在下载 Gost ${GOST_VERSION}..."
    
    # 带重试的下载
    local retry=0
    local max_retry=3
    
    while [ $retry -lt $max_retry ]; do
        if wget -O /tmp/gost.tar.gz https://github.com/go-gost/gost/releases/download/v${GOST_VERSION}/gost_${GOST_VERSION}_linux_amd64.tar.gz; then
            break
        else
            retry=$((retry + 1))
            if [ $retry -lt $max_retry ]; then
                log_warn "Gost 下载失败,重试 $retry/$max_retry..."
                sleep 2
            else
                error_exit "Gost 下载失败"
            fi
        fi
    done
    
    tar -xzf /tmp/gost.tar.gz -C $GOST_DIR || error_exit "Gost 解压失败"
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
    
    # 克隆代码(包含前端和后端)
    log_info "正在从GitHub克隆代码..."
    
    local retry=0
    local max_retry=3
    
    while [ $retry -lt $max_retry ]; do
        if git clone https://github.com/wenxin-99/AI-.git $INSTALL_DIR; then
            log_info "项目代码克隆完成"
            return
        else
            retry=$((retry + 1))
            if [ $retry -lt $max_retry ]; then
                log_warn "代码克隆失败,重试 $retry/$max_retry..."
                rm -rf $INSTALL_DIR
                sleep 2
            else
                error_exit "代码克隆失败,请检查网络连接"
            fi
        fi
    done
}

# 构建前端
build_frontend() {
    log_step "构建前端..."
    
    cd /opt/uniproxy-panel || error_exit "无法进入项目目录"
    
    log_info "正在安装前端依赖..."
    pnpm install || error_exit "前端依赖安装失败"
    
    log_info "正在构建前端..."
    pnpm build || error_exit "前端构建失败"
    
    # 复制构建产物到nginx目录
    rm -rf /var/www/uniproxy-panel
    mkdir -p /var/www/uniproxy-panel
    cp -r dist/* /var/www/uniproxy-panel/ || error_exit "前端部署失败"
    
    # 设置正确的文件权限
    chown -R www-data:www-data /var/www/uniproxy-panel
    chmod -R 755 /var/www/uniproxy-panel
    
    log_info "前端构建完成"
}

# 构建后端
build_backend() {
    log_step "构建后端..."
    
    if [[ ! -d "/opt/uniproxy-panel/backend" ]]; then
        error_exit "后端代码不存在"
    fi
    
    cd /opt/uniproxy-panel/backend || error_exit "无法进入后端目录"
    
    log_info "正在下载后端依赖..."
    go mod download || error_exit "后端依赖下载失败"
    
    log_info "正在编译后端..."
    go build -o uniproxy ./cmd/main.go || error_exit "后端编译失败"
    
    log_info "后端构建完成"
}

# 配置 Nginx
configure_nginx() {
    log_step "配置 Nginx..."
    
    # 删除默认站点
    rm -f /etc/nginx/sites-enabled/default
    
    # 设置正确的文件权限
    chown -R www-data:www-data /var/www/uniproxy-panel
    chmod -R 755 /var/www/uniproxy-panel
    
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
    nginx -t || error_exit "Nginx 配置测试失败"
    systemctl reload nginx || error_exit "Nginx 重载失败"
    
    log_info "Nginx 配置完成"
}

# 创建配置文件
create_config() {
    log_step "创建配置文件..."
    
    mkdir -p /opt/uniproxy-panel/data
    mkdir -p /opt/uniproxy-panel/logs
    mkdir -p /opt/uniproxy-panel/certs
    
    # 生成随机密码
    ADMIN_PASSWORD=$(openssl rand -base64 12)
    JWT_SECRET=$(openssl rand -base64 32)
    
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
  jwt_secret: $JWT_SECRET
  admin_username: admin
  admin_password: $ADMIN_PASSWORD

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
    
    # 启动Nginx
    systemctl start nginx || true
    systemctl enable nginx
    
    # 启动后端
    if [[ -f "/opt/uniproxy-panel/backend/uniproxy" ]]; then
        systemctl start uniproxy-panel || error_exit "后端服务启动失败"
        log_info "后端服务已启动"
    else
        log_warn "后端未构建,跳过启动"
    fi
}

# 显示安装信息
show_info() {
    # 获取公网IP
    PUBLIC_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "无法获取")
    
    echo ""
    echo "=========================================="
    log_info "UniProxy Panel 安装完成!"
    echo "=========================================="
    echo ""
    echo "访问地址: http://${PUBLIC_IP}"
    echo ""
    
    if [[ -f "/opt/uniproxy-panel/config.yaml" ]]; then
        ADMIN_USER=$(grep admin_username /opt/uniproxy-panel/config.yaml | awk '{print $2}')
        ADMIN_PASS=$(grep admin_password /opt/uniproxy-panel/config.yaml | awk '{print $2}')
        echo "管理员账号: $ADMIN_USER"
        echo "管理员密码: $ADMIN_PASS"
        echo ""
        log_warn "请立即修改默认密码!"
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
    disable_ipv6_if_needed
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
