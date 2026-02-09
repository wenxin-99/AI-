#!/bin/bash

# UniProxy Panel Nginx 配置修复脚本
# 创建正确的 Nginx 配置并重启服务

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}UniProxy Panel Nginx 配置修复${NC}"
echo -e "${GREEN}================================${NC}"

# 检查 Nginx 是否安装
if ! command -v nginx &> /dev/null; then
    echo -e "${RED}错误：Nginx 未安装${NC}"
    echo -e "${YELLOW}正在安装 Nginx...${NC}"
    apt-get update -qq
    apt-get install -y nginx
fi

# 创建 Nginx 配置文件
echo -e "${YELLOW}创建 Nginx 配置文件...${NC}"

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

    # WebSocket 支持（如果需要）
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

echo -e "${GREEN}✓ Nginx 配置文件已创建${NC}"

# 启用配置
echo -e "${YELLOW}启用 Nginx 配置...${NC}"
ln -sf /etc/nginx/sites-available/uniproxy-panel /etc/nginx/sites-enabled/

# 删除默认配置（如果存在）
if [ -f /etc/nginx/sites-enabled/default ]; then
    echo -e "${YELLOW}删除默认 Nginx 配置...${NC}"
    rm -f /etc/nginx/sites-enabled/default
fi

# 测试 Nginx 配置
echo -e "${YELLOW}测试 Nginx 配置...${NC}"
if nginx -t; then
    echo -e "${GREEN}✓ Nginx 配置测试通过${NC}"
else
    echo -e "${RED}✗ Nginx 配置测试失败${NC}"
    exit 1
fi

# 重启 Nginx
echo -e "${YELLOW}重启 Nginx 服务...${NC}"
systemctl restart nginx

# 检查 Nginx 状态
sleep 2
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✓ Nginx 服务运行正常${NC}"
else
    echo -e "${RED}✗ Nginx 服务启动失败${NC}"
    systemctl status nginx --no-pager
    exit 1
fi

# 测试 API 代理
echo -e "${YELLOW}测试 API 代理...${NC}"
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/api/v1/auth/login | grep -q "404\|401\|200"; then
    echo -e "${GREEN}✓ API 代理配置正常（收到后端响应）${NC}"
else
    echo -e "${YELLOW}⚠ API 代理可能有问题，请检查后端服务${NC}"
fi

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}Nginx 配置修复完成！${NC}"
echo -e "${GREEN}================================${NC}"
echo -e "前端访问地址: ${YELLOW}http://$(hostname -I | awk '{print $1}')${NC}"
echo -e "API 代理: ${YELLOW}/api -> http://127.0.0.1:8080${NC}"
echo -e ""
echo -e "请刷新浏览器页面（Ctrl+F5）测试登录功能"
echo -e ""
echo -e "查看 Nginx 配置: ${YELLOW}cat /etc/nginx/sites-available/uniproxy-panel${NC}"
echo -e "查看 Nginx 日志: ${YELLOW}tail -f /var/log/nginx/error.log${NC}"
