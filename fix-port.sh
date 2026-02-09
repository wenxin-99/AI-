#!/bin/bash

# UniProxy Panel 端口配置修复脚本
# 将后端端口从 2053 改为 8080

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}UniProxy Panel 端口配置修复${NC}"
echo -e "${GREEN}================================${NC}"

# 检查配置文件
CONFIG_FILE="/opt/uniproxy-panel/config.yaml"
BACKEND_CONFIG="/opt/uniproxy-panel/backend/config.yaml"

if [ ! -f "$CONFIG_FILE" ] && [ ! -f "$BACKEND_CONFIG" ]; then
    echo -e "${RED}错误：找不到配置文件${NC}"
    echo -e "${YELLOW}尝试查找配置文件...${NC}"
    find /opt/uniproxy-panel -name "config.yaml" -o -name "config.yml"
    exit 1
fi

# 确定使用哪个配置文件
if [ -f "$CONFIG_FILE" ]; then
    ACTIVE_CONFIG="$CONFIG_FILE"
elif [ -f "$BACKEND_CONFIG" ]; then
    ACTIVE_CONFIG="$BACKEND_CONFIG"
fi

echo -e "${YELLOW}当前配置文件: ${ACTIVE_CONFIG}${NC}"

# 备份配置文件
echo -e "${YELLOW}备份配置文件...${NC}"
cp "$ACTIVE_CONFIG" "${ACTIVE_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
echo -e "${GREEN}✓ 备份完成${NC}"

# 显示当前端口配置
echo -e "${YELLOW}当前端口配置：${NC}"
grep -E "port:|listen:" "$ACTIVE_CONFIG" || echo "未找到端口配置"

# 修改端口配置
echo -e "${YELLOW}修改端口为 8080...${NC}"

# 使用 sed 修改配置文件
# 匹配常见的端口配置格式
sed -i 's/port: *2053/port: 8080/g' "$ACTIVE_CONFIG"
sed -i 's/listen: *2053/listen: 8080/g' "$ACTIVE_CONFIG"
sed -i 's/Port: *2053/Port: 8080/g' "$ACTIVE_CONFIG"
sed -i 's/Listen: *2053/Listen: 8080/g' "$ACTIVE_CONFIG"
sed -i 's/PORT: *2053/PORT: 8080/g' "$ACTIVE_CONFIG"
sed -i 's/LISTEN: *2053/LISTEN: 8080/g' "$ACTIVE_CONFIG"

echo -e "${GREEN}✓ 端口配置已修改${NC}"

# 显示修改后的端口配置
echo -e "${YELLOW}修改后的端口配置：${NC}"
grep -E "port:|listen:" "$ACTIVE_CONFIG" || echo "未找到端口配置"

# 检查是否有进程占用 8080 端口
echo -e "${YELLOW}检查 8080 端口占用情况...${NC}"
if lsof -i :8080 > /dev/null 2>&1; then
    echo -e "${RED}警告：8080 端口已被占用${NC}"
    lsof -i :8080
    echo -e "${YELLOW}是否要停止占用 8080 端口的进程？(y/n)${NC}"
    read -r response
    if [ "$response" = "y" ]; then
        lsof -ti :8080 | xargs kill -9
        echo -e "${GREEN}✓ 已停止占用进程${NC}"
    fi
else
    echo -e "${GREEN}✓ 8080 端口未被占用${NC}"
fi

# 重启后端服务
echo -e "${YELLOW}重启后端服务...${NC}"
systemctl restart uniproxy-panel

# 等待服务启动
sleep 3

# 检查服务状态
if systemctl is-active --quiet uniproxy-panel; then
    echo -e "${GREEN}✓ 后端服务启动成功！${NC}"
    
    # 检查端口监听
    if netstat -tlnp | grep :8080 > /dev/null 2>&1; then
        echo -e "${GREEN}✓ 服务正在监听 8080 端口${NC}"
        netstat -tlnp | grep :8080
    else
        echo -e "${RED}✗ 服务未监听 8080 端口${NC}"
    fi
else
    echo -e "${RED}✗ 后端服务启动失败${NC}"
    echo -e "${YELLOW}查看错误日志：${NC}"
    journalctl -u uniproxy-panel -n 20 --no-pager
    exit 1
fi

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}端口配置修复完成！${NC}"
echo -e "${GREEN}================================${NC}"
echo -e "后端服务现在运行在: ${YELLOW}http://127.0.0.1:8080${NC}"
echo -e "请刷新浏览器页面测试登录功能"
echo -e ""
echo -e "查看服务状态: ${YELLOW}systemctl status uniproxy-panel${NC}"
echo -e "查看服务日志: ${YELLOW}journalctl -u uniproxy-panel -f${NC}"
