#!/bin/bash

# UniProxy Panel 生产环境一键部署脚本
# 整合 Docker、SSL 配置、域名绑定、防火墙设置

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# 配置变量
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="/opt/uniproxy-panel"
DOCKER_COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$DEPLOY_DIR/.env"

# 打印函数
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                                                            ║${NC}"
    echo -e "${CYAN}║        ${MAGENTA}UniProxy Panel 生产环境一键部署${CYAN}                ║${NC}"
    echo -e "${CYAN}║                                                            ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    local step=$1
    local desc=$2
    echo ""
    echo -e "${MAGENTA}[步骤 $step]${NC} ${CYAN}$desc${NC}"
    echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
}

# 检查是否为 root 用户
check_root() {
    if [ "$EUID" -ne 0 ]; then
        print_error "请使用 root 用户或 sudo 运行此脚本"
        exit 1
    fi
}

# 检测操作系统
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
    else
        print_error "无法检测操作系统"
        exit 1
    fi
    
    print_info "检测到操作系统: $OS $OS_VERSION"
}

# 检查系统要求
check_system_requirements() {
    print_step "1/8" "检查系统要求"
    
    # 检查 CPU 核心数
    CPU_CORES=$(nproc)
    print_info "CPU 核心数: $CPU_CORES"
    if [ "$CPU_CORES" -lt 2 ]; then
        print_warning "建议至少 2 核 CPU，当前只有 $CPU_CORES 核"
    fi
    
    # 检查内存
    TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
    print_info "总内存: ${TOTAL_MEM}MB"
    if [ "$TOTAL_MEM" -lt 2048 ]; then
        print_warning "建议至少 2GB 内存，当前只有 ${TOTAL_MEM}MB"
    fi
    
    # 检查磁盘空间
    DISK_AVAIL=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
    print_info "可用磁盘空间: ${DISK_AVAIL}GB"
    if [ "$DISK_AVAIL" -lt 10 ]; then
        print_error "磁盘空间不足，至少需要 10GB，当前只有 ${DISK_AVAIL}GB"
        exit 1
    fi
    
    print_success "系统要求检查通过"
}

# 安装依赖
install_dependencies() {
    print_step "2/8" "安装依赖"
    
    detect_os
    
    case "$OS" in
        ubuntu|debian)
            print_info "更新软件包列表..."
            apt-get update -qq
            
            print_info "安装基础依赖..."
            apt-get install -y -qq \
                curl \
                wget \
                git \
                ca-certificates \
                gnupg \
                lsb-release
            ;;
        centos|rhel|fedora)
            print_info "安装基础依赖..."
            yum install -y -q \
                curl \
                wget \
                git \
                ca-certificates
            ;;
        *)
            print_error "不支持的操作系统: $OS"
            exit 1
            ;;
    esac
    
    print_success "依赖安装完成"
}

# 安装 Docker
install_docker() {
    print_step "3/8" "安装 Docker"
    
    # 检查 Docker 是否已安装
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version | awk '{print $3}' | tr -d ',')
        print_info "Docker 已安装: $DOCKER_VERSION"
        
        # 检查 Docker 服务状态
        if systemctl is-active --quiet docker; then
            print_success "Docker 服务运行正常"
        else
            print_info "启动 Docker 服务..."
            systemctl start docker
            systemctl enable docker
        fi
        
        return
    fi
    
    print_info "开始安装 Docker..."
    
    case "$OS" in
        ubuntu|debian)
            # 添加 Docker 官方 GPG 密钥
            install -m 0755 -d /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            chmod a+r /etc/apt/keyrings/docker.gpg
            
            # 添加 Docker 仓库
            echo \
                "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS \
                $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
            
            # 安装 Docker
            apt-get update -qq
            apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        centos|rhel)
            # 添加 Docker 仓库
            yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
            
            # 安装 Docker
            yum install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            ;;
        *)
            print_error "不支持的操作系统: $OS"
            exit 1
            ;;
    esac
    
    # 启动 Docker 服务
    systemctl start docker
    systemctl enable docker
    
    # 验证安装
    if docker --version &> /dev/null; then
        print_success "Docker 安装成功: $(docker --version)"
    else
        print_error "Docker 安装失败"
        exit 1
    fi
}

# 配置部署参数
configure_deployment() {
    print_step "4/8" "配置部署参数"
    
    # 询问部署模式
    echo ""
    echo -e "${CYAN}请选择部署模式：${NC}"
    echo -e "  ${GREEN}1.${NC} Docker 部署（推荐）"
    echo -e "  ${GREEN}2.${NC} 传统部署（直接安装）"
    echo ""
    echo -ne "${CYAN}请输入选项 [1-2] (默认: 1):${NC} "
    read DEPLOY_MODE
    DEPLOY_MODE=${DEPLOY_MODE:-1}
    
    # 询问域名
    echo ""
    echo -ne "${CYAN}请输入域名 (留空则使用 IP 访问):${NC} "
    read DOMAIN
    
    if [ -z "$DOMAIN" ]; then
        SERVER_IP=$(hostname -I | awk '{print $1}')
        print_info "将使用 IP 地址访问: $SERVER_IP"
        USE_DOMAIN=false
    else
        print_info "将使用域名访问: $DOMAIN"
        USE_DOMAIN=true
        
        # 验证域名解析
        print_info "验证域名解析..."
        DOMAIN_IP=$(dig +short "$DOMAIN" | tail -1)
        SERVER_IP=$(hostname -I | awk '{print $1}')
        
        if [ "$DOMAIN_IP" = "$SERVER_IP" ]; then
            print_success "域名解析正确"
        else
            print_warning "域名解析可能不正确"
            print_info "域名解析到: $DOMAIN_IP"
            print_info "服务器 IP: $SERVER_IP"
            echo -ne "${CYAN}是否继续？(y/N):${NC} "
            read CONTINUE
            if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
                exit 1
            fi
        fi
    fi
    
    # 询问是否配置 SSL
    if [ "$USE_DOMAIN" = true ]; then
        echo ""
        echo -ne "${CYAN}是否配置 SSL 证书？(y/N):${NC} "
        read ENABLE_SSL
        
        if [ "$ENABLE_SSL" = "y" ] || [ "$ENABLE_SSL" = "Y" ]; then
            ENABLE_SSL=true
            
            echo ""
            echo -e "${CYAN}请选择 SSL 证书类型：${NC}"
            echo -e "  ${GREEN}1.${NC} Let's Encrypt (自动申请，推荐)"
            echo -e "  ${GREEN}2.${NC} 手动证书 (已有证书文件)"
            echo ""
            echo -ne "${CYAN}请输入选项 [1-2] (默认: 1):${NC} "
            read SSL_TYPE
            SSL_TYPE=${SSL_TYPE:-1}
            
            if [ "$SSL_TYPE" = "2" ]; then
                echo -ne "${CYAN}请输入证书文件路径:${NC} "
                read SSL_CERT_PATH
                echo -ne "${CYAN}请输入密钥文件路径:${NC} "
                read SSL_KEY_PATH
                
                if [ ! -f "$SSL_CERT_PATH" ] || [ ! -f "$SSL_KEY_PATH" ]; then
                    print_error "证书文件不存在"
                    exit 1
                fi
            else
                echo -ne "${CYAN}请输入邮箱地址 (用于 Let's Encrypt 通知):${NC} "
                read SSL_EMAIL
                
                if [ -z "$SSL_EMAIL" ]; then
                    print_error "邮箱地址不能为空"
                    exit 1
                fi
            fi
        else
            ENABLE_SSL=false
        fi
    else
        ENABLE_SSL=false
    fi
    
    # 询问后端端口
    echo ""
    echo -ne "${CYAN}请输入后端端口 (默认: 8080):${NC} "
    read BACKEND_PORT
    BACKEND_PORT=${BACKEND_PORT:-8080}
    
    # 询问数据库密码
    echo ""
    echo -ne "${CYAN}请输入数据库 root 密码 (留空则自动生成):${NC} "
    read -s DB_ROOT_PASSWORD
    echo ""
    
    if [ -z "$DB_ROOT_PASSWORD" ]; then
        DB_ROOT_PASSWORD=$(openssl rand -base64 16)
        print_info "已自动生成数据库密码"
    fi
    
    # 询问管理员密码
    echo -ne "${CYAN}请输入管理员密码 (默认: admin123):${NC} "
    read -s ADMIN_PASSWORD
    echo ""
    ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin123}
    
    # 显示配置摘要
    echo ""
    echo -e "${CYAN}配置摘要：${NC}"
    echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
    echo -e "  部署模式: $([ "$DEPLOY_MODE" = "1" ] && echo "Docker" || echo "传统")"
    echo -e "  访问地址: $([ "$USE_DOMAIN" = true ] && echo "$DOMAIN" || echo "$SERVER_IP")"
    echo -e "  SSL 状态: $([ "$ENABLE_SSL" = true ] && echo "启用" || echo "禁用")"
    [ "$ENABLE_SSL" = true ] && echo -e "  SSL 类型: $([ "$SSL_TYPE" = "1" ] && echo "Let's Encrypt" || echo "手动证书")"
    echo -e "  后端端口: $BACKEND_PORT"
    echo -e "  管理员账号: admin"
    echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
    echo ""
    echo -ne "${CYAN}确认以上配置并开始部署？(y/N):${NC} "
    read CONFIRM
    
    if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
        print_info "部署已取消"
        exit 0
    fi
}

# 配置防火墙
configure_firewall() {
    print_step "5/8" "配置防火墙"
    
    # 检测防火墙类型
    if command -v ufw &> /dev/null; then
        FIREWALL_TYPE="ufw"
    elif command -v firewall-cmd &> /dev/null; then
        FIREWALL_TYPE="firewalld"
    else
        print_warning "未检测到防火墙，跳过配置"
        return
    fi
    
    print_info "检测到防火墙: $FIREWALL_TYPE"
    
    case "$FIREWALL_TYPE" in
        ufw)
            # 启用 UFW
            if ! ufw status | grep -q "Status: active"; then
                print_info "启用 UFW..."
                echo "y" | ufw enable
            fi
            
            # 开放必要端口
            print_info "开放端口 22 (SSH)..."
            ufw allow 22/tcp
            
            print_info "开放端口 80 (HTTP)..."
            ufw allow 80/tcp
            
            if [ "$ENABLE_SSL" = true ]; then
                print_info "开放端口 443 (HTTPS)..."
                ufw allow 443/tcp
            fi
            
            # 重新加载防火墙
            ufw reload
            ;;
        firewalld)
            # 启动 firewalld
            if ! systemctl is-active --quiet firewalld; then
                print_info "启动 firewalld..."
                systemctl start firewalld
                systemctl enable firewalld
            fi
            
            # 开放必要端口
            print_info "开放端口 22 (SSH)..."
            firewall-cmd --permanent --add-service=ssh
            
            print_info "开放端口 80 (HTTP)..."
            firewall-cmd --permanent --add-service=http
            
            if [ "$ENABLE_SSL" = true ]; then
                print_info "开放端口 443 (HTTPS)..."
                firewall-cmd --permanent --add-service=https
            fi
            
            # 重新加载防火墙
            firewall-cmd --reload
            ;;
    esac
    
    print_success "防火墙配置完成"
}

# Docker 部署
deploy_with_docker() {
    print_step "6/8" "Docker 部署"
    
    # 创建部署目录
    mkdir -p "$DEPLOY_DIR"
    cd "$DEPLOY_DIR"
    
    # 生成 .env 文件
    print_info "生成环境配置文件..."
    cat > "$ENV_FILE" <<EOF
# 数据库配置
MYSQL_ROOT_PASSWORD=$DB_ROOT_PASSWORD
MYSQL_DATABASE=uniproxy
MYSQL_USER=uniproxy
MYSQL_PASSWORD=$(openssl rand -base64 16)

# 后端配置
BACKEND_PORT=$BACKEND_PORT
JWT_SECRET=$(openssl rand -base64 32)

# 管理员配置
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$ADMIN_PASSWORD

# 域名配置
DOMAIN=${DOMAIN:-localhost}
EOF
    
    # 复制 docker-compose.yml
    if [ -f "$DOCKER_COMPOSE_FILE" ]; then
        print_info "复制 Docker Compose 配置..."
        cp "$DOCKER_COMPOSE_FILE" "$DEPLOY_DIR/"
    else
        print_error "找不到 docker-compose.yml 文件"
        exit 1
    fi
    
    # 拉取镜像
    print_info "拉取 Docker 镜像..."
    docker compose pull
    
    # 启动服务
    print_info "启动服务..."
    docker compose up -d
    
    # 等待服务启动
    print_info "等待服务启动..."
    sleep 10
    
    # 验证服务状态
    print_info "验证服务状态..."
    if docker compose ps | grep -q "Up"; then
        print_success "Docker 服务启动成功"
    else
        print_error "Docker 服务启动失败"
        docker compose logs
        exit 1
    fi
}

# 传统部署
deploy_traditional() {
    print_step "6/8" "传统部署"
    
    # 运行安装脚本
    if [ -f "$SCRIPT_DIR/setup.sh" ]; then
        print_info "运行安装脚本..."
        bash "$SCRIPT_DIR/setup.sh"
    else
        print_error "找不到 setup.sh 文件"
        exit 1
    fi
}

# 配置 SSL
configure_ssl() {
    print_step "7/8" "配置 SSL 证书"
    
    if [ "$ENABLE_SSL" != true ]; then
        print_info "跳过 SSL 配置"
        return
    fi
    
    if [ "$SSL_TYPE" = "1" ]; then
        # Let's Encrypt
        print_info "安装 certbot..."
        
        case "$OS" in
            ubuntu|debian)
                apt-get install -y -qq certbot python3-certbot-nginx
                ;;
            centos|rhel)
                yum install -y -q certbot python3-certbot-nginx
                ;;
        esac
        
        print_info "申请 SSL 证书..."
        certbot --nginx -d "$DOMAIN" --email "$SSL_EMAIL" --agree-tos --non-interactive --redirect
        
        if [ $? -eq 0 ]; then
            print_success "SSL 证书申请成功"
            print_info "证书将自动续期"
        else
            print_error "SSL 证书申请失败"
            print_warning "请检查域名解析和网络连接"
        fi
    else
        # 手动证书
        print_info "配置手动 SSL 证书..."
        
        # 复制证书文件
        mkdir -p /etc/nginx/ssl
        cp "$SSL_CERT_PATH" /etc/nginx/ssl/
        cp "$SSL_KEY_PATH" /etc/nginx/ssl/
        
        # 更新 Nginx 配置
        NGINX_CONFIG="/etc/nginx/sites-available/uniproxy-panel"
        
        if [ -f "$NGINX_CONFIG" ]; then
            # 生成带 SSL 的配置
            cat > "$NGINX_CONFIG" <<EOF
# HTTP 重定向到 HTTPS
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

# HTTPS 配置
server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    # SSL 证书配置
    ssl_certificate /etc/nginx/ssl/$(basename $SSL_CERT_PATH);
    ssl_certificate_key /etc/nginx/ssl/$(basename $SSL_KEY_PATH);
    
    # SSL 优化配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # 前端静态文件
    location / {
        root /var/www/uniproxy-panel;
        try_files \$uri \$uri/ /index.html;
        index index.html;
    }

    # API 代理到后端
    location /api {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket 支持
    location /ws {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
            
            # 测试并重新加载 Nginx
            if nginx -t 2>/dev/null; then
                systemctl reload nginx
                print_success "SSL 配置成功"
            else
                print_error "Nginx 配置测试失败"
            fi
        else
            print_warning "找不到 Nginx 配置文件，跳过 SSL 配置"
        fi
    fi
}

# 部署后验证
post_deployment_verification() {
    print_step "8/8" "部署后验证"
    
    # 等待服务完全启动
    print_info "等待服务完全启动..."
    sleep 5
    
    # 确定访问地址
    if [ "$USE_DOMAIN" = true ]; then
        if [ "$ENABLE_SSL" = true ]; then
            ACCESS_URL="https://$DOMAIN"
        else
            ACCESS_URL="http://$DOMAIN"
        fi
    else
        ACCESS_URL="http://$SERVER_IP"
    fi
    
    # 测试后端 API
    print_info "测试后端 API..."
    if [ "$DEPLOY_MODE" = "1" ]; then
        # Docker 部署
        API_URL="http://localhost:$BACKEND_PORT/api/v1/system/info"
    else
        # 传统部署
        API_URL="http://127.0.0.1:$BACKEND_PORT/api/v1/system/info"
    fi
    
    if curl -s -f -m 10 "$API_URL" > /dev/null 2>&1; then
        print_success "后端 API 响应正常"
    else
        print_warning "后端 API 暂无响应，可能需要等待服务完全启动"
    fi
    
    # 测试前端访问
    print_info "测试前端访问..."
    if curl -s -f -m 10 "$ACCESS_URL" > /dev/null 2>&1; then
        print_success "前端访问正常"
    else
        print_warning "前端访问异常，请检查 Nginx 配置"
    fi
    
    print_success "部署验证完成"
}

# 显示部署结果
show_deployment_result() {
    echo ""
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                            ║${NC}"
    echo -e "${GREEN}║                  ${CYAN}部署成功！${GREEN}                             ║${NC}"
    echo -e "${GREEN}║                                                            ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # 确定访问地址
    if [ "$USE_DOMAIN" = true ]; then
        if [ "$ENABLE_SSL" = true ]; then
            ACCESS_URL="https://$DOMAIN"
        else
            ACCESS_URL="http://$DOMAIN"
        fi
    else
        ACCESS_URL="http://$SERVER_IP"
    fi
    
    echo -e "${CYAN}访问信息：${NC}"
    echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
    echo -e "  ${YELLOW}访问地址:${NC} $ACCESS_URL"
    echo -e "  ${YELLOW}管理员账号:${NC} admin"
    echo -e "  ${YELLOW}管理员密码:${NC} $ADMIN_PASSWORD"
    echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
    echo ""
    
    if [ "$DEPLOY_MODE" = "1" ]; then
        echo -e "${CYAN}Docker 管理命令：${NC}"
        echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
        echo -e "  ${YELLOW}查看服务状态:${NC} cd $DEPLOY_DIR && docker compose ps"
        echo -e "  ${YELLOW}查看日志:${NC} cd $DEPLOY_DIR && docker compose logs -f"
        echo -e "  ${YELLOW}重启服务:${NC} cd $DEPLOY_DIR && docker compose restart"
        echo -e "  ${YELLOW}停止服务:${NC} cd $DEPLOY_DIR && docker compose down"
        echo -e "  ${YELLOW}更新服务:${NC} cd $DEPLOY_DIR && docker compose pull && docker compose up -d"
        echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
    else
        echo -e "${CYAN}系统管理命令：${NC}"
        echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
        echo -e "  ${YELLOW}查看后端状态:${NC} systemctl status uniproxy-panel"
        echo -e "  ${YELLOW}查看后端日志:${NC} journalctl -u uniproxy-panel -f"
        echo -e "  ${YELLOW}重启后端:${NC} systemctl restart uniproxy-panel"
        echo -e "  ${YELLOW}重启 Nginx:${NC} systemctl restart nginx"
        echo -e "  ${YELLOW}配置管理:${NC} uniproxy-config"
        echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}配置文件位置：${NC}"
    echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
    if [ "$DEPLOY_MODE" = "1" ]; then
        echo -e "  ${YELLOW}环境配置:${NC} $ENV_FILE"
        echo -e "  ${YELLOW}Docker Compose:${NC} $DEPLOY_DIR/docker-compose.yml"
    else
        echo -e "  ${YELLOW}后端配置:${NC} /opt/uniproxy-panel/backend/config.yaml"
        echo -e "  ${YELLOW}Nginx 配置:${NC} /etc/nginx/sites-available/uniproxy-panel"
    fi
    echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
    echo ""
    
    if [ "$ENABLE_SSL" = true ]; then
        echo -e "${CYAN}SSL 证书信息：${NC}"
        echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
        if [ "$SSL_TYPE" = "1" ]; then
            echo -e "  ${YELLOW}证书类型:${NC} Let's Encrypt"
            echo -e "  ${YELLOW}自动续期:${NC} 已启用"
            echo -e "  ${YELLOW}查看证书:${NC} certbot certificates"
        else
            echo -e "  ${YELLOW}证书类型:${NC} 手动证书"
            echo -e "  ${YELLOW}证书位置:${NC} /etc/nginx/ssl/"
        fi
        echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
        echo ""
    fi
    
    echo -e "${CYAN}安全建议：${NC}"
    echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
    echo -e "  ${YELLOW}1.${NC} 请立即修改管理员密码"
    echo -e "  ${YELLOW}2.${NC} 定期备份数据库和配置文件"
    echo -e "  ${YELLOW}3.${NC} 定期更新系统和应用"
    echo -e "  ${YELLOW}4.${NC} 启用防火墙并只开放必要端口"
    if [ "$ENABLE_SSL" != true ]; then
        echo -e "  ${YELLOW}5.${NC} 建议配置 SSL 证书以保护数据传输"
    fi
    echo -e "${CYAN}────────────────────────────────────────────────────────────${NC}"
    echo ""
    
    print_info "请访问 $ACCESS_URL 开始使用 UniProxy Panel"
    echo ""
}

# 主程序
main() {
    print_header
    
    # 检查 root 权限
    check_root
    
    # 检查系统要求
    check_system_requirements
    
    # 安装依赖
    install_dependencies
    
    # 安装 Docker
    install_docker
    
    # 配置部署参数
    configure_deployment
    
    # 配置防火墙
    configure_firewall
    
    # 执行部署
    if [ "$DEPLOY_MODE" = "1" ]; then
        deploy_with_docker
    else
        deploy_traditional
    fi
    
    # 配置 SSL
    configure_ssl
    
    # 部署后验证
    post_deployment_verification
    
    # 显示部署结果
    show_deployment_result
}

# 运行主程序
main
