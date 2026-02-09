#!/bin/bash

# UniProxy Panel 一键部署脚本
# 适用于 Ubuntu 22.04+ / Debian 11+

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}UniProxy Panel 一键部署脚本${NC}"
echo -e "${GREEN}================================${NC}"

# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}请使用root用户运行此脚本${NC}"
  exit 1
fi

# 更新系统
echo -e "${YELLOW}[1/8] 更新系统软件包...${NC}"
apt-get update -qq

# 安装基础依赖
echo -e "${YELLOW}[2/8] 安装基础依赖...${NC}"
apt-get install -y curl wget git nginx sqlite3

# 安装Node.js (如果未安装)
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}[3/8] 安装Node.js 20.x...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo -e "${GREEN}[3/8] Node.js 已安装,跳过${NC}"
fi

# 安装pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${YELLOW}[4/8] 安装pnpm...${NC}"
    npm install -g pnpm
else
    echo -e "${GREEN}[4/8] pnpm 已安装,跳过${NC}"
fi

# 安装Go (如果未安装)
if ! command -v go &> /dev/null; then
    echo -e "${YELLOW}[5/8] 安装Go 1.21...${NC}"
    wget -q https://go.dev/dl/go1.21.0.linux-amd64.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz
    rm go1.21.0.linux-amd64.tar.gz
    export PATH=$PATH:/usr/local/go/bin
    echo 'export PATH=$PATH:/usr/local/go/bin' >> /root/.bashrc
else
    echo -e "${GREEN}[5/8] Go 已安装,跳过${NC}"
fi

# 克隆项目
echo -e "${YELLOW}[6/8] 克隆项目代码...${NC}"
if [ -d "/opt/uniproxy-panel" ]; then
    echo -e "${YELLOW}项目目录已存在,执行更新...${NC}"
    cd /opt/uniproxy-panel
    git pull
else
    git clone https://github.com/wenxin-99/AI-.git /opt/uniproxy-panel
    cd /opt/uniproxy-panel
fi

# 构建前端
echo -e "${YELLOW}[7/8] 构建前端项目...${NC}"
pnpm install
pnpm build

# 部署前端到Nginx
echo -e "${YELLOW}部署前端文件到Nginx...${NC}"
mkdir -p /var/www/uniproxy-panel
rm -rf /var/www/uniproxy-panel/*
cp -r dist/public/* /var/www/uniproxy-panel/
chown -R www-data:www-data /var/www/uniproxy-panel
chmod -R 755 /var/www/uniproxy-panel

# 构建后端
echo -e "${YELLOW}构建后端服务...${NC}"
cd backend
/usr/local/go/bin/go mod download

# 自动检测 main.go 位置
if [ -f "cmd/main.go" ]; then
    echo -e "${GREEN}检测到 cmd/main.go，使用标准结构构建${NC}"
    /usr/local/go/bin/go build -o uniproxy-panel cmd/main.go
elif [ -f "main.go" ]; then
    echo -e "${GREEN}检测到 main.go，使用简化结构构建${NC}"
    /usr/local/go/bin/go build -o uniproxy-panel main.go
else
    echo -e "${RED}错误：找不到 main.go 文件${NC}"
    echo -e "${RED}请检查后端目录结构${NC}"
    exit 1
fi

# 创建后端systemd服务
echo -e "${YELLOW}创建后端systemd服务...${NC}"
cat > /etc/systemd/system/uniproxy-panel.service <<EOF
[Unit]
Description=UniProxy Panel Backend Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/uniproxy-panel/backend
ExecStart=/opt/uniproxy-panel/backend/uniproxy-panel
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

# 配置Nginx
echo -e "${YELLOW}配置Nginx...${NC}"
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

    # API代理到后端
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
    }
}
EOF

# 启用Nginx配置
ln -sf /etc/nginx/sites-available/uniproxy-panel /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试Nginx配置
nginx -t

# 重启服务
echo -e "${YELLOW}[8/8] 启动服务...${NC}"
systemctl daemon-reload
systemctl enable uniproxy-panel
systemctl restart uniproxy-panel
systemctl reload nginx

# 检查服务状态
sleep 2
if systemctl is-active --quiet uniproxy-panel; then
    echo -e "${GREEN}✓ 后端服务启动成功${NC}"
else
    echo -e "${RED}✗ 后端服务启动失败,请检查日志: journalctl -u uniproxy-panel -n 50${NC}"
fi

if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✓ Nginx服务运行正常${NC}"
else
    echo -e "${RED}✗ Nginx服务异常,请检查配置${NC}"
fi

# 显示访问信息
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}部署完成!${NC}"
echo -e "${GREEN}================================${NC}"
echo -e "访问地址: ${YELLOW}http://$(hostname -I | awk '{print $1}')${NC}"
echo -e "默认账号: ${YELLOW}admin${NC}"
echo -e "默认密码: ${YELLOW}admin123${NC}"
echo -e ""
echo -e "查看后端日志: ${YELLOW}journalctl -u uniproxy-panel -f${NC}"
echo -e "查看Nginx日志: ${YELLOW}tail -f /var/log/nginx/error.log${NC}"
echo -e "${GREEN}================================${NC}"
