#!/bin/bash

# UniProxy Panel 端口智能修复脚本
# 自动检测后端实际端口并同步 Nginx 配置

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# 检查是否为 root 用户
if [ "$EUID" -ne 0 ]; then
    print_error "请使用 root 用户或 sudo 运行此脚本"
    exit 1
fi

print_header "UniProxy Panel 端口智能修复"

# ============================================
# 步骤 1: 检测后端配置端口
# ============================================
print_info "检测后端配置端口..."

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

print_info "使用配置文件: $ACTIVE_CONFIG"

# 读取配置端口
CONFIG_PORT=$(grep -E "^  port:" "$ACTIVE_CONFIG" | awk '{print $2}' | head -1)
if [ -z "$CONFIG_PORT" ]; then
    print_error "无法读取配置端口"
    exit 1
fi

print_success "配置端口: $CONFIG_PORT"

# ============================================
# 步骤 2: 检测实际监听端口
# ============================================
print_info "检测后端实际监听端口..."

# 尝试多种方法检测端口
ACTUAL_PORT=""

# 方法 1: 使用 ss 命令
if command -v ss &> /dev/null; then
    ACTUAL_PORT=$(ss -tlnp | grep uniproxy-panel | grep -oP ':\K[0-9]+' | head -1)
fi

# 方法 2: 使用 netstat 命令
if [ -z "$ACTUAL_PORT" ] && command -v netstat &> /dev/null; then
    ACTUAL_PORT=$(netstat -tlnp | grep uniproxy-panel | grep -oP ':\K[0-9]+' | head -1)
fi

# 方法 3: 使用 lsof 命令
if [ -z "$ACTUAL_PORT" ] && command -v lsof &> /dev/null; then
    ACTUAL_PORT=$(lsof -i -P -n | grep uniproxy-panel | grep LISTEN | grep -oP ':\K[0-9]+' | head -1)
fi

if [ -z "$ACTUAL_PORT" ]; then
    print_warning "无法检测到后端实际监听端口，使用配置端口: $CONFIG_PORT"
    ACTUAL_PORT=$CONFIG_PORT
else
    print_success "实际监听端口: $ACTUAL_PORT"
fi

# ============================================
# 步骤 3: 检查端口一致性
# ============================================
print_info "检查端口一致性..."

if [ "$CONFIG_PORT" != "$ACTUAL_PORT" ]; then
    print_warning "配置端口 ($CONFIG_PORT) 与实际监听端口 ($ACTUAL_PORT) 不一致"
    print_info "将使用实际监听端口: $ACTUAL_PORT"
    BACKEND_PORT=$ACTUAL_PORT
else
    print_success "端口配置一致"
    BACKEND_PORT=$CONFIG_PORT
fi

# ============================================
# 步骤 4: 检查 Nginx 配置
# ============================================
print_info "检查 Nginx 配置..."

NGINX_CONFIG="/etc/nginx/sites-available/uniproxy-panel"

if [ ! -f "$NGINX_CONFIG" ]; then
    print_error "找不到 Nginx 配置文件: $NGINX_CONFIG"
    exit 1
fi

# 读取 Nginx 中配置的端口
NGINX_PORT=$(grep "proxy_pass" "$NGINX_CONFIG" | grep -oP ':\K[0-9]+' | head -1)

if [ -z "$NGINX_PORT" ]; then
    print_error "无法读取 Nginx 配置端口"
    exit 1
fi

print_info "Nginx 配置端口: $NGINX_PORT"

# ============================================
# 步骤 5: 修复 Nginx 配置
# ============================================
if [ "$NGINX_PORT" != "$BACKEND_PORT" ]; then
    print_warning "Nginx 端口 ($NGINX_PORT) 与后端端口 ($BACKEND_PORT) 不一致"
    print_info "正在修复 Nginx 配置..."
    
    # 备份配置
    cp "$NGINX_CONFIG" "${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
    print_info "已备份配置文件"
    
    # 替换所有端口引用
    sed -i "s/127.0.0.1:$NGINX_PORT/127.0.0.1:$BACKEND_PORT/g" "$NGINX_CONFIG"
    
    print_success "Nginx 配置已更新"
    
    # 测试配置
    print_info "测试 Nginx 配置..."
    if nginx -t; then
        print_success "Nginx 配置测试通过"
    else
        print_error "Nginx 配置测试失败"
        print_info "正在恢复备份..."
        cp "${NGINX_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)" "$NGINX_CONFIG"
        exit 1
    fi
    
    # 重新加载 Nginx
    print_info "重新加载 Nginx..."
    systemctl reload nginx
    print_success "Nginx 已重新加载"
else
    print_success "Nginx 端口配置正确，无需修复"
fi

# ============================================
# 步骤 6: 验证修复结果
# ============================================
print_info "验证修复结果..."

# 测试后端连接
print_info "测试后端 API..."
if curl -s -f -m 5 "http://127.0.0.1:$BACKEND_PORT/api/v1/system/info" > /dev/null; then
    print_success "后端 API 响应正常"
else
    print_warning "后端 API 无响应，可能需要重启后端服务"
    print_info "尝试重启后端服务..."
    systemctl restart uniproxy-panel
    sleep 3
    if curl -s -f -m 5 "http://127.0.0.1:$BACKEND_PORT/api/v1/system/info" > /dev/null; then
        print_success "后端服务重启后响应正常"
    else
        print_error "后端服务仍然无响应，请检查日志: journalctl -u uniproxy-panel -n 50"
    fi
fi

# 测试 Nginx 代理
print_info "测试 Nginx 代理..."
if curl -s -f -m 5 "http://localhost/api/v1/system/info" > /dev/null; then
    print_success "Nginx 代理工作正常"
else
    print_error "Nginx 代理无响应，请检查配置"
fi

# ============================================
# 完成
# ============================================
print_header "修复完成！"

echo ""
echo -e "${GREEN}✓ 端口配置已修复${NC}"
echo ""
echo -e "${BLUE}配置信息：${NC}"
echo -e "  后端监听端口: ${YELLOW}$BACKEND_PORT${NC}"
echo -e "  Nginx 代理端口: ${YELLOW}$BACKEND_PORT${NC}"
echo -e "  配置文件: ${YELLOW}$ACTIVE_CONFIG${NC}"
echo ""
echo -e "${BLUE}验证命令：${NC}"
echo -e "  测试后端: ${YELLOW}curl http://127.0.0.1:$BACKEND_PORT/api/v1/system/info${NC}"
echo -e "  测试代理: ${YELLOW}curl http://localhost/api/v1/system/info${NC}"
echo -e "  查看日志: ${YELLOW}journalctl -u uniproxy-panel -f${NC}"
echo ""
