#!/bin/bash

# UniProxy Panel 一键部署脚本
# 整合所有修复步骤：后端编译 + 端口配置 + Nginx 配置

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印标题
print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

# 打印步骤
print_step() {
    echo -e "${YELLOW}[$1] $2${NC}"
}

# 打印成功
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# 打印错误
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_header "UniProxy Panel 一键部署脚本"

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then 
    print_error "请使用 root 用户运行此脚本"
    exit 1
fi

# 检查项目目录
if [ ! -d "/opt/uniproxy-panel" ]; then
    print_error "找不到 /opt/uniproxy-panel 目录"
    echo -e "${YELLOW}请先运行 install.sh 或 deploy.sh 安装项目${NC}"
    exit 1
fi

cd /opt/uniproxy-panel

# ============================================
# 步骤 1: 拉取最新代码
# ============================================
print_step "1/6" "拉取最新代码..."
git pull origin main || {
    print_error "Git pull 失败"
    exit 1
}
print_success "代码已更新"

# ============================================
# 步骤 2: 编译后端
# ============================================
print_step "2/6" "编译后端服务..."

cd backend

# 配置 Go 环境
export PATH=$PATH:/usr/local/go/bin
export GOPATH=/root/go
export GOPROXY=https://goproxy.cn,direct

# 使用 Makefile 编译（如果存在）
if [ -f "Makefile" ]; then
    print_info "使用 Makefile 编译..."
    if make clean build; then
        print_success "后端编译成功 ($(ls -lh uniproxy-panel | awk '{print $5}'))"
    else
        print_error "Makefile 编译失败，尝试直接编译..."
        # 回退到直接编译
        if [ -f "cmd/main.go" ]; then
            MAIN_GO_PATH="./cmd/main.go"
        elif [ -f "main.go" ]; then
            MAIN_GO_PATH="./main.go"
        else
            print_error "找不到 main.go 文件"
            exit 1
        fi
        /usr/local/go/bin/go mod download
        rm -f uniproxy-panel uniproxy
        if /usr/local/go/bin/go build -o uniproxy-panel $MAIN_GO_PATH; then
            print_success "后端编译成功 ($(ls -lh uniproxy-panel | awk '{print $5}'))"
        else
            print_error "后端编译失败"
            exit 1
        fi
    fi
else
    # 没有 Makefile，使用传统方式
    print_info "使用传统方式编译..."
    if [ -f "cmd/main.go" ]; then
        MAIN_GO_PATH="./cmd/main.go"
        print_success "检测到 cmd/main.go"
    elif [ -f "main.go" ]; then
        MAIN_GO_PATH="./main.go"
        print_success "检测到 main.go"
    else
        print_error "找不到 main.go 文件"
        exit 1
    fi
    
    print_info "下载 Go 依赖..."
    /usr/local/go/bin/go mod download
    
    rm -f uniproxy-panel uniproxy
    
    print_info "编译后端程序..."
    if /usr/local/go/bin/go build -o uniproxy-panel $MAIN_GO_PATH; then
        print_success "后端编译成功 ($(ls -lh uniproxy-panel | awk '{print $5}'))"
    else
        print_error "后端编译失败"
        print_error "请检查 Go 版本和依赖是否正确安装"
        exit 1
    fi
fi

cd /opt/uniproxy-panel

# ============================================
# 步骤 3: 智能端口配置
# ============================================
print_step "3/6" "智能检测和配置端口..."

CONFIG_FILE="/opt/uniproxy-panel/config.yaml"
BACKEND_CONFIG="/opt/uniproxy-panel/backend/config.yaml"

# 确定配置文件
if [ -f "$CONFIG_FILE" ]; then
    ACTIVE_CONFIG="$CONFIG_FILE"
elif [ -f "$BACKEND_CONFIG" ]; then
    ACTIVE_CONFIG="$BACKEND_CONFIG"
else
    print_error "找不到配置文件"
    exit 1
fi

# 智能端口分配策略：优先使用 8080，如果被占用则尝试备用端口
print_info "开始智能端口分配..."

# 检测配置文件中的原始端口
ORIGINAL_PORT=$(grep -E "^  port:" "$ACTIVE_CONFIG" | awk '{print $2}' | head -1)
if [ -n "$ORIGINAL_PORT" ]; then
    print_info "配置文件原始端口: $ORIGINAL_PORT"
fi

# 目标端口列表（按优先级）
TARGET_PORTS=(8080 8081 8082 8083 8084 8085 9000 9001)
CONFIG_PORT=""

# 检查端口是否被占用的函数
check_port_available() {
    local port=$1
    if command -v ss &> /dev/null; then
        if ss -tlnp 2>/dev/null | grep -q ":$port "; then
            return 1  # 端口被占用
        fi
    elif command -v netstat &> /dev/null; then
        if netstat -tlnp 2>/dev/null | grep -q ":$port "; then
            return 1  # 端口被占用
        fi
    fi
    return 0  # 端口可用
}

# 遍历目标端口列表，找到第一个可用端口
for port in "${TARGET_PORTS[@]}"; do
    if check_port_available $port; then
        CONFIG_PORT=$port
        print_success "选择可用端口: $CONFIG_PORT"
        break
    else
        print_warning "端口 $port 已被占用，尝试下一个..."
    fi
done

# 如果所有端口都被占用，使用默认端口并提示用户
if [ -z "$CONFIG_PORT" ]; then
    CONFIG_PORT="8080"
    print_error "所有预设端口都被占用，强制使用 8080（可能导致冲突）"
    print_warning "请手动停止占用 8080 端口的服务，或修改配置文件使用其他端口"
fi

# 备份配置文件
cp "$ACTIVE_CONFIG" "${ACTIVE_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

# 修改端口配置（使用更精确的匹配）
print_info "更新配置文件端口为: $CONFIG_PORT"

# 只替换 server 部分的 port 配置
sed -i "/^server:/,/^[a-z]/ s/^  port: *[0-9]\+/  port: $CONFIG_PORT/" "$ACTIVE_CONFIG"

# 验证修改是否成功
NEW_PORT=$(grep -E "^  port:" "$ACTIVE_CONFIG" | awk '{print $2}' | head -1)
if [ "$NEW_PORT" = "$CONFIG_PORT" ]; then
    print_success "端口配置更新成功: $NEW_PORT"
else
    print_error "端口配置更新失败，当前值: $NEW_PORT"
    exit 1
fi

# 保存端口到环境变量供后续使用
export BACKEND_PORT=$CONFIG_PORT

print_success "后端端口已配置为 $CONFIG_PORT"

# ============================================
# 步骤 4: 创建 systemd 服务
# ============================================
print_step "4/6" "创建 systemd 服务..."

cat > /etc/systemd/system/uniproxy-panel.service <<EOF
[Unit]
Description=UniProxy Panel Backend Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/uniproxy-panel/backend
ExecStart=/opt/uniproxy-panel/backend/uniproxy-panel -config /opt/uniproxy-panel/config.yaml
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable uniproxy-panel

print_success "systemd 服务已创建"

# ============================================
# 步骤 5: 配置 Nginx
# ============================================
print_step "5/6" "配置 Nginx..."

# 检查 Nginx 是否安装
if ! command -v nginx &> /dev/null; then
    print_error "Nginx 未安装，正在安装..."
    apt-get update -qq
    apt-get install -y nginx
fi

# 创建 Nginx 配置（使用动态端口）
print_info "配置 Nginx 代理到后端端口: $BACKEND_PORT"

cat > /etc/nginx/sites-available/uniproxy-panel <<EOF
server {
    listen 80;
    server_name _;

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
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # WebSocket 支持
    location /ws {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 启用配置
ln -sf /etc/nginx/sites-available/uniproxy-panel /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试配置
if nginx -t; then
    print_success "Nginx 配置正确"
else
    print_error "Nginx 配置测试失败"
    exit 1
fi

# ============================================
# 步骤 6: 启动服务
# ============================================
print_step "6/6" "启动服务..."

# 重启后端服务
print_info "重启后端服务..."
systemctl restart uniproxy-panel
sleep 3

# 检查后端服务
if systemctl is-active --quiet uniproxy-panel; then
    print_success "后端服务运行正常"
    
    # 验证端口监听
    print_info "验证端口监听状态..."
    sleep 2
    
    if command -v ss &> /dev/null; then
        LISTENING_PORT=$(ss -tlnp 2>/dev/null | grep uniproxy-panel | grep -oP ':\K[0-9]+' | head -1)
        if [ -n "$LISTENING_PORT" ]; then
            print_success "后端实际监听端口: $LISTENING_PORT"
            if [ "$LISTENING_PORT" != "$BACKEND_PORT" ]; then
                print_error "警告：实际监听端口 ($LISTENING_PORT) 与配置端口 ($BACKEND_PORT) 不一致！"
                print_warning "请检查后端日志: journalctl -u uniproxy-panel -n 50"
            fi
        else
            print_warning "无法检测到后端监听端口"
        fi
    fi
    
    # 测试后端 API
    print_info "测试后端 API 响应..."
    if curl -s -f -m 5 "http://127.0.0.1:$BACKEND_PORT/api/v1/system/info" > /dev/null 2>&1; then
        print_success "后端 API 响应正常"
    else
        print_warning "后端 API 暂无响应，可能需要等待服务完全启动"
    fi
else
    print_error "后端服务启动失败"
    print_info "查看最近 50 条日志："
    journalctl -u uniproxy-panel -n 50 --no-pager
    exit 1
fi

# 重启 Nginx
systemctl restart nginx

# 检查 Nginx 服务
if systemctl is-active --quiet nginx; then
    print_success "Nginx 服务运行正常"
    
    # 测试 Nginx 代理
    print_info "测试 Nginx 代理功能..."
    if curl -s -f -m 5 "http://localhost/api/v1/system/info" > /dev/null 2>&1; then
        print_success "Nginx 代理工作正常"
    else
        print_warning "Nginx 代理暂无响应，请检查配置"
        print_info "Nginx 配置的后端地址: http://127.0.0.1:$BACKEND_PORT"
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
echo -e "${GREEN}✓ 所有服务已成功启动${NC}"
echo ""
echo -e "${BLUE}访问信息：${NC}"
echo -e "  前端地址: ${YELLOW}http://$SERVER_IP${NC}"
echo -e "  后端端口: ${YELLOW}$BACKEND_PORT${NC}"
echo -e "  默认账号: ${YELLOW}admin${NC}"
echo -e "  默认密码: ${YELLOW}admin 或 admin123${NC}"
echo ""
echo -e "${BLUE}服务管理：${NC}"
echo -e "  查看后端状态: ${YELLOW}systemctl status uniproxy-panel${NC}"
echo -e "  查看后端日志: ${YELLOW}journalctl -u uniproxy-panel -f${NC}"
echo -e "  查看 Nginx 状态: ${YELLOW}systemctl status nginx${NC}"
echo -e "  查看 Nginx 日志: ${YELLOW}tail -f /var/log/nginx/error.log${NC}"
echo ""
echo -e "${BLUE}健康检查：${NC}"
echo -e "  后端 API 测试: ${YELLOW}curl http://127.0.0.1:$BACKEND_PORT/api/v1/system/info${NC}"
echo -e "  Nginx 代理测试: ${YELLOW}curl http://localhost/api/v1/system/info${NC}"
echo -e "  端口配置检查: ${YELLOW}bash /root/AI-/fix-port-smart.sh${NC}"
echo ""
print_header "请刷新浏览器页面开始使用！"
