#!/bin/bash

# UniProxy Panel 完整一键安装脚本
# 支持首次安装和更新部署
# 包含端口智能检测和自动修复功能

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 打印标题
print_header() {
    echo ""
    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}================================${NC}"
}

# 打印步骤
print_step() {
    echo -e "${BLUE}[$1] $2${NC}"
}

# 打印信息
print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# 打印成功
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# 打印错误
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# 打印警告
print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_header "UniProxy Panel 一键安装脚本"

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then 
    print_error "请使用 root 用户运行此脚本"
    echo -e "${YELLOW}使用命令: sudo bash $0${NC}"
    exit 1
fi

# 安装目录
INSTALL_DIR="/opt/uniproxy-panel"
WEB_DIR="/var/www/uniproxy-panel"

# 检查是否为首次安装
IS_FIRST_INSTALL=false
if [ ! -d "$INSTALL_DIR" ]; then
    IS_FIRST_INSTALL=true
    print_info "检测到首次安装"
else
    print_info "检测到已安装，将执行更新"
fi

# ============================================
# 步骤 1: 安装系统依赖
# ============================================
if [ "$IS_FIRST_INSTALL" = true ]; then
    print_step "1/8" "安装系统依赖..."
    
    # 检测操作系统
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        print_error "无法检测操作系统"
        exit 1
    fi
    
    case $OS in
        ubuntu|debian)
            print_info "检测到 $OS 系统"
            apt-get update -qq
            apt-get install -y git curl wget nginx sqlite3 build-essential
            ;;
        centos|rhel|fedora)
            print_info "检测到 $OS 系统"
            yum install -y git curl wget nginx sqlite gcc gcc-c++ make
            ;;
        *)
            print_error "不支持的操作系统: $OS"
            exit 1
            ;;
    esac
    
    print_success "系统依赖安装完成"
else
    print_step "1/8" "跳过系统依赖安装（已安装）"
fi

# ============================================
# 步骤 2: 安装 Go 环境
# ============================================
if [ "$IS_FIRST_INSTALL" = true ]; then
    print_step "2/8" "安装 Go 环境..."
    
    if ! command -v go &> /dev/null; then
        print_info "下载 Go 1.21..."
        cd /tmp
        wget -q https://go.dev/dl/go1.21.0.linux-amd64.tar.gz
        rm -rf /usr/local/go
        tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz
        rm go1.21.0.linux-amd64.tar.gz
        
        # 配置环境变量
        export PATH=$PATH:/usr/local/go/bin
        export GOPATH=/root/go
        export GOPROXY=https://goproxy.cn,direct
        
        print_success "Go 环境安装完成 ($(go version))"
    else
        print_success "Go 环境已安装 ($(go version))"
    fi
else
    print_step "2/8" "跳过 Go 环境安装（已安装）"
fi

# 配置 Go 环境变量（无论是否首次安装都需要）
export PATH=$PATH:/usr/local/go/bin
export GOPATH=/root/go
export GOPROXY=https://goproxy.cn,direct

# ============================================
# 步骤 3: 安装 Node.js 和 pnpm
# ============================================
if [ "$IS_FIRST_INSTALL" = true ]; then
    print_step "3/8" "安装 Node.js 和 pnpm..."
    
    if ! command -v node &> /dev/null; then
        print_info "安装 Node.js 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
        
        print_info "安装 pnpm..."
        npm install -g pnpm
        
        print_success "Node.js 和 pnpm 安装完成"
    else
        print_success "Node.js 已安装 ($(node -v))"
    fi
else
    print_step "3/8" "跳过 Node.js 安装（已安装）"
fi

# ============================================
# 步骤 4: 克隆或更新代码
# ============================================
if [ "$IS_FIRST_INSTALL" = true ]; then
    print_step "4/8" "克隆项目代码..."
    
    if [ -d "$INSTALL_DIR" ]; then
        print_warning "目录 $INSTALL_DIR 已存在，将先备份"
        mv "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    print_info "克隆代码仓库..."
    git clone https://github.com/wenxin-99/AI-.git "$INSTALL_DIR"
    
    print_success "代码克隆完成"
else
    print_step "4/8" "更新项目代码..."
    
    cd "$INSTALL_DIR"
    print_info "拉取最新代码..."
    git pull origin main || {
        print_warning "Git pull 失败，尝试重置..."
        git fetch origin
        git reset --hard origin/main
    }
    
    print_success "代码更新完成"
fi

cd "$INSTALL_DIR"

# ============================================
# 步骤 5: 编译前端
# ============================================
print_step "5/8" "编译前端..."

cd client

if [ ! -d "node_modules" ]; then
    print_info "安装前端依赖..."
    pnpm install
fi

print_info "构建前端..."
pnpm build

# 部署前端到 Nginx
print_info "部署前端文件..."
rm -rf "$WEB_DIR"
mkdir -p "$WEB_DIR"
cp -r dist/public/* "$WEB_DIR/"

print_success "前端编译完成"

cd "$INSTALL_DIR"

# ============================================
# 步骤 6: 编译后端
# ============================================
print_step "6/8" "编译后端..."

cd backend

# 检测 main.go 位置
if [ -f "cmd/main.go" ]; then
    MAIN_GO_PATH="./cmd/main.go"
    print_info "检测到 cmd/main.go"
elif [ -f "main.go" ]; then
    MAIN_GO_PATH="./main.go"
    print_info "检测到 main.go"
else
    print_error "找不到 main.go 文件"
    exit 1
fi

# 下载依赖
print_info "下载 Go 依赖..."
/usr/local/go/bin/go mod download

# 编译
print_info "编译后端程序..."
rm -f uniproxy-panel uniproxy
if /usr/local/go/bin/go build -o uniproxy-panel $MAIN_GO_PATH; then
    print_success "后端编译成功 ($(ls -lh uniproxy-panel | awk '{print $5}'))"
else
    print_error "后端编译失败"
    exit 1
fi

cd "$INSTALL_DIR"

# ============================================
# 步骤 7: 智能端口配置
# ============================================
print_step "7/8" "智能检测和配置端口..."

CONFIG_FILE="$INSTALL_DIR/config.yaml"
BACKEND_CONFIG="$INSTALL_DIR/backend/config.yaml"

# 确定配置文件
if [ -f "$CONFIG_FILE" ]; then
    ACTIVE_CONFIG="$CONFIG_FILE"
elif [ -f "$BACKEND_CONFIG" ]; then
    ACTIVE_CONFIG="$BACKEND_CONFIG"
else
    print_error "找不到配置文件"
    exit 1
fi

# 智能端口分配策略
print_info "开始智能端口分配..."

# 目标端口列表（按优先级）
TARGET_PORTS=(8080 8081 8082 8083 8084 8085 9000 9001)
CONFIG_PORT=""

# 检查端口是否被占用
check_port_available() {
    local port=$1
    if command -v ss &> /dev/null; then
        if ss -tlnp 2>/dev/null | grep -q ":$port "; then
            return 1
        fi
    elif command -v netstat &> /dev/null; then
        if netstat -tlnp 2>/dev/null | grep -q ":$port "; then
            return 1
        fi
    fi
    return 0
}

# 遍历目标端口列表
for port in "${TARGET_PORTS[@]}"; do
    if check_port_available $port; then
        CONFIG_PORT=$port
        print_success "选择可用端口: $CONFIG_PORT"
        break
    else
        print_warning "端口 $port 已被占用"
    fi
done

# 如果所有端口都被占用
if [ -z "$CONFIG_PORT" ]; then
    CONFIG_PORT="8080"
    print_warning "所有预设端口都被占用，使用默认端口 8080"
fi

# 备份配置文件
cp "$ACTIVE_CONFIG" "${ACTIVE_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

# 修改端口配置（只修改 server 块中的 port）
print_info "更新配置文件端口为: $CONFIG_PORT"

awk -v port="$CONFIG_PORT" '
/^server:/ { in_server=1 }
in_server && /^  port:/ && !port_replaced { 
    print "  port: " port
    port_replaced=1
    next
}
/^[a-z]/ && !/^server:/ { in_server=0 }
{ print }
' "$ACTIVE_CONFIG" > "${ACTIVE_CONFIG}.tmp" && mv "${ACTIVE_CONFIG}.tmp" "$ACTIVE_CONFIG"

# 验证修改
NEW_PORT=$(awk '/^server:/,/^[a-z]/ { if (/^  port:/) print $2 }' "$ACTIVE_CONFIG" | head -1)
if [ "$NEW_PORT" = "$CONFIG_PORT" ]; then
    print_success "端口配置更新成功: $NEW_PORT"
else
    print_error "端口配置更新失败"
    exit 1
fi

export BACKEND_PORT=$CONFIG_PORT

# ============================================
# 步骤 8: 配置服务
# ============================================
print_step "8/8" "配置系统服务..."

# 创建 systemd 服务
print_info "创建 systemd 服务..."

cat > /etc/systemd/system/uniproxy-panel.service <<EOF
[Unit]
Description=UniProxy Panel Backend Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR/backend
ExecStart=$INSTALL_DIR/backend/uniproxy-panel -config $INSTALL_DIR/config.yaml
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable uniproxy-panel

print_success "systemd 服务已创建"

# 配置 Nginx
print_info "配置 Nginx..."

cat > /etc/nginx/sites-available/uniproxy-panel <<EOF
server {
    listen 80;
    server_name _;

    # 前端静态文件
    location / {
        root $WEB_DIR;
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

# 启用配置
ln -sf /etc/nginx/sites-available/uniproxy-panel /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试 Nginx 配置
if nginx -t 2>/dev/null; then
    print_success "Nginx 配置正确"
else
    print_error "Nginx 配置测试失败"
    exit 1
fi

# 启动服务
print_info "启动后端服务..."
systemctl restart uniproxy-panel
sleep 3

# 检查后端服务
if systemctl is-active --quiet uniproxy-panel; then
    print_success "后端服务运行正常"
    
    # 验证端口监听
    print_info "验证端口监听状态..."
    sleep 2
    
    LISTENING_PORT=""
    if command -v ss &> /dev/null; then
        LISTENING_PORT=$(ss -tlnp 2>/dev/null | grep uniproxy-panel | grep -oP ':\K[0-9]+' | head -1)
    elif command -v netstat &> /dev/null; then
        LISTENING_PORT=$(netstat -tlnp 2>/dev/null | grep uniproxy-panel | grep -oP ':\K[0-9]+' | head -1)
    fi
    
    if [ -n "$LISTENING_PORT" ]; then
        print_success "后端实际监听端口: $LISTENING_PORT"
        
        # 如果实际监听端口与配置不一致，自动修复 Nginx 配置
        if [ "$LISTENING_PORT" != "$BACKEND_PORT" ]; then
            print_warning "检测到端口不一致，正在自动修复..."
            
            sed -i "s/127\.0\.0\.1:[0-9]\+/127.0.0.1:$LISTENING_PORT/g" /etc/nginx/sites-available/uniproxy-panel
            
            if nginx -t 2>/dev/null; then
                systemctl reload nginx
                print_success "Nginx 配置已自动更新为端口 $LISTENING_PORT"
                BACKEND_PORT=$LISTENING_PORT
            else
                print_error "Nginx 配置更新失败"
            fi
        fi
    else
        print_warning "无法检测到后端监听端口"
    fi
    
    # 测试后端 API
    print_info "测试后端 API 响应..."
    sleep 1
    if curl -s -f -m 5 "http://127.0.0.1:$BACKEND_PORT/api/v1/system/info" > /dev/null 2>&1; then
        print_success "后端 API 响应正常"
    else
        print_warning "后端 API 暂无响应（可能需要等待服务完全启动）"
    fi
else
    print_error "后端服务启动失败"
    print_info "查看日志: journalctl -u uniproxy-panel -n 50"
    exit 1
fi

# 启动 Nginx
print_info "启动 Nginx 服务..."
systemctl restart nginx

if systemctl is-active --quiet nginx; then
    print_success "Nginx 服务运行正常"
    
    # 测试 Nginx 代理
    print_info "测试 Nginx 代理..."
    sleep 1
    if curl -s -f -m 5 "http://localhost/api/v1/system/info" > /dev/null 2>&1; then
        print_success "Nginx 代理工作正常"
    else
        print_warning "Nginx 代理暂无响应"
    fi
else
    print_error "Nginx 服务启动失败"
    exit 1
fi

# ============================================
# 完成
# ============================================
print_header "部署完成！"

# 获取服务器 IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo ""
print_success "UniProxy Panel 已成功部署"
echo ""
echo -e "${CYAN}访问信息：${NC}"
echo -e "  ${GREEN}前端地址:${NC} http://$SERVER_IP"
echo -e "  ${GREEN}后端端口:${NC} $BACKEND_PORT"
echo -e "  ${GREEN}默认账号:${NC} admin"
echo -e "  ${GREEN}默认密码:${NC} admin123"
echo ""
echo -e "${CYAN}服务管理：${NC}"
echo -e "  查看后端状态: ${YELLOW}systemctl status uniproxy-panel${NC}"
echo -e "  查看后端日志: ${YELLOW}journalctl -u uniproxy-panel -f${NC}"
echo -e "  重启后端服务: ${YELLOW}systemctl restart uniproxy-panel${NC}"
echo -e "  查看 Nginx 日志: ${YELLOW}tail -f /var/log/nginx/error.log${NC}"
echo ""
echo -e "${CYAN}配置管理：${NC}"
echo -e "  配置文件: ${YELLOW}$ACTIVE_CONFIG${NC}"
echo -e "  配置工具: ${YELLOW}uniproxy-config${NC}"
echo ""
echo -e "${CYAN}健康检查：${NC}"
echo -e "  后端 API: ${YELLOW}curl http://127.0.0.1:$BACKEND_PORT/api/v1/system/info${NC}"
echo -e "  Nginx 代理: ${YELLOW}curl http://localhost/api/v1/system/info${NC}"
echo ""
print_success "安装完成！请访问 http://$SERVER_IP 开始使用"
echo ""
