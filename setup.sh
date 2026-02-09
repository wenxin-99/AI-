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

# 检测 main.go 位置
if [ -f "cmd/main.go" ]; then
    MAIN_GO_PATH="cmd/main.go"
    print_success "检测到 cmd/main.go"
elif [ -f "main.go" ]; then
    MAIN_GO_PATH="main.go"
    print_success "检测到 main.go"
else
    print_error "找不到 main.go 文件"
    exit 1
fi

# 下载依赖
/usr/local/go/bin/go mod download

# 清理旧文件
rm -f uniproxy-panel uniproxy

# 编译
if /usr/local/go/bin/go build -o uniproxy-panel $MAIN_GO_PATH; then
    print_success "后端编译成功"
    ls -lh uniproxy-panel
else
    print_error "后端编译失败"
    exit 1
fi

cd /opt/uniproxy-panel

# ============================================
# 步骤 3: 配置端口
# ============================================
print_step "3/6" "配置后端端口..."

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

# 备份配置文件
cp "$ACTIVE_CONFIG" "${ACTIVE_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

# 修改端口为 8080
sed -i 's/port: *2053/port: 8080/g' "$ACTIVE_CONFIG"
sed -i 's/listen: *2053/listen: 8080/g' "$ACTIVE_CONFIG"

print_success "端口已配置为 8080"

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

# 创建 Nginx 配置
cat > /etc/nginx/sites-available/uniproxy-panel <<'EOF'
server {
    listen 80;
    server_name _;

    # 前端静态文件
    location / {
        root /var/www/uniproxy-panel;
        try_files $uri $uri/ /index.html;
        index index.html;
    }

    # API 代理到后端
    location /api {
        proxy_pass http://127.0.0.1:8080;
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
        proxy_pass http://127.0.0.1:8080;
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
systemctl restart uniproxy-panel
sleep 3

# 检查后端服务
if systemctl is-active --quiet uniproxy-panel; then
    print_success "后端服务运行正常"
else
    print_error "后端服务启动失败"
    journalctl -u uniproxy-panel -n 20 --no-pager
    exit 1
fi

# 重启 Nginx
systemctl restart nginx

# 检查 Nginx 服务
if systemctl is-active --quiet nginx; then
    print_success "Nginx 服务运行正常"
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
echo -e "  后端健康检查: ${YELLOW}curl http://127.0.0.1:8080/api/health${NC}"
echo -e "  API 代理测试: ${YELLOW}curl http://127.0.0.1/api/health${NC}"
echo ""
print_header "请刷新浏览器页面开始使用！"
