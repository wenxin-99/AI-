#!/bin/bash

# UniProxy Panel 后端编译修复脚本
# 解决 "no required module provides package main.go" 错误

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}UniProxy Panel 后端编译修复${NC}"
echo -e "${GREEN}================================${NC}"

# 检查是否在正确的目录
if [ ! -d "/opt/uniproxy-panel" ]; then
    echo -e "${RED}错误：找不到 /opt/uniproxy-panel 目录${NC}"
    echo -e "${YELLOW}请先运行完整的安装脚本${NC}"
    exit 1
fi

cd /opt/uniproxy-panel

# 拉取最新代码
echo -e "${YELLOW}[1/4] 拉取最新代码...${NC}"
git pull origin main || {
    echo -e "${RED}Git pull 失败，尝试重新克隆...${NC}"
    cd /opt
    rm -rf uniproxy-panel.bak
    mv uniproxy-panel uniproxy-panel.bak
    git clone https://github.com/wenxin-99/AI-.git uniproxy-panel
    cd uniproxy-panel
}

# 检查后端目录
echo -e "${YELLOW}[2/4] 检查后端目录结构...${NC}"
if [ ! -d "backend" ]; then
    echo -e "${RED}错误：找不到 backend 目录${NC}"
    exit 1
fi

cd backend

# 显示目录结构
echo -e "${YELLOW}后端目录结构：${NC}"
ls -la

# 检查 main.go 位置
if [ -f "cmd/main.go" ]; then
    echo -e "${GREEN}✓ 找到 cmd/main.go${NC}"
    MAIN_GO_PATH="cmd/main.go"
elif [ -f "main.go" ]; then
    echo -e "${GREEN}✓ 找到 main.go${NC}"
    MAIN_GO_PATH="main.go"
else
    echo -e "${RED}错误：找不到 main.go 文件${NC}"
    echo -e "${YELLOW}当前目录内容：${NC}"
    find . -name "*.go" -type f
    exit 1
fi

# 确保 Go 环境正确
echo -e "${YELLOW}[3/4] 配置 Go 环境...${NC}"
export PATH=$PATH:/usr/local/go/bin
export GOPATH=/root/go
export GOPROXY=https://goproxy.cn,direct

# 显示 Go 版本
if command -v go &> /dev/null; then
    echo -e "${GREEN}Go 版本: $(go version)${NC}"
else
    echo -e "${RED}错误：Go 未安装或未在 PATH 中${NC}"
    echo -e "${YELLOW}尝试使用完整路径...${NC}"
fi

# 清理旧的构建文件
echo -e "${YELLOW}清理旧的构建文件...${NC}"
rm -f uniproxy-panel uniproxy

# 下载依赖
echo -e "${YELLOW}下载 Go 依赖...${NC}"
if command -v go &> /dev/null; then
    go mod download
else
    /usr/local/go/bin/go mod download
fi

# 编译后端
echo -e "${YELLOW}[4/4] 编译后端...${NC}"
echo -e "${YELLOW}使用文件: $MAIN_GO_PATH${NC}"

# 尝试多种编译方式
COMPILED=false

# 方法1：使用完整路径（修正：添加 ./ 前缀）
echo -e "${YELLOW}尝试方法1: 使用完整 Go 路径${NC}"
if /usr/local/go/bin/go build -o uniproxy-panel ./$MAIN_GO_PATH 2>/dev/null; then
    COMPILED=true
    echo -e "${GREEN}✓ 方法1 成功${NC}"
fi

# 方法2：使用环境变量中的 go
if [ "$COMPILED" = false ]; then
    echo -e "${YELLOW}尝试方法2: 使用环境变量 go${NC}"
    if go build -o uniproxy-panel ./$MAIN_GO_PATH 2>/dev/null; then
        COMPILED=true
        echo -e "${GREEN}✓ 方法2 成功${NC}"
    fi
fi

# 方法3：在 cmd 目录中编译
if [ "$COMPILED" = false ] && [ -f "cmd/main.go" ]; then
    echo -e "${YELLOW}尝试方法3: 在 cmd 目录中编译${NC}"
    cd cmd
    if /usr/local/go/bin/go build -o ../uniproxy-panel ./main.go 2>/dev/null; then
        cd ..
        COMPILED=true
        echo -e "${GREEN}✓ 方法3 成功${NC}"
    else
        cd ..
    fi
fi

# 检查编译结果
if [ "$COMPILED" = false ]; then
    echo -e "${RED}所有编译方法都失败了${NC}"
    echo -e "${YELLOW}尝试显示详细错误信息：${NC}"
    /usr/local/go/bin/go build -v -o uniproxy-panel ./$MAIN_GO_PATH
    exit 1
fi

# 验证编译结果
if [ -f "uniproxy-panel" ]; then
    echo -e "${GREEN}✓ 编译成功！${NC}"
    ls -lh uniproxy-panel
    
    # 检查配置文件
    echo -e "${YELLOW}检查配置文件...${NC}"
    if [ ! -f "/opt/uniproxy-panel/config.yaml" ]; then
        echo -e "${YELLOW}配置文件不存在，使用示例配置...${NC}"
        if [ -f "config.example.yaml" ]; then
            cp config.example.yaml /opt/uniproxy-panel/config.yaml
        elif [ -f "config.yaml" ]; then
            cp config.yaml /opt/uniproxy-panel/config.yaml
        else
            echo -e "${RED}警告：找不到配置文件${NC}"
        fi
    fi
    
    # 创建 systemd 服务文件
    echo -e "${YELLOW}创建 systemd 服务...${NC}"
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
    
    echo -e "${GREEN}✓ systemd 服务文件已创建${NC}"
    
    # 重载 systemd 并启用服务
    echo -e "${YELLOW}重载 systemd 配置...${NC}"
    systemctl daemon-reload
    systemctl enable uniproxy-panel
    
    # 重启服务
    echo -e "${YELLOW}重启后端服务...${NC}"
    systemctl restart uniproxy-panel
    
    # 检查服务状态
    sleep 2
    if systemctl is-active --quiet uniproxy-panel; then
        echo -e "${GREEN}✓ 后端服务启动成功${NC}"
    else
        echo -e "${RED}✗ 后端服务启动失败${NC}"
        echo -e "${YELLOW}查看日志: journalctl -u uniproxy-panel -n 50${NC}"
    fi
else
    echo -e "${RED}错误：编译后的文件不存在${NC}"
    exit 1
fi

echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}修复完成！${NC}"
echo -e "${GREEN}================================${NC}"
echo -e "后端可执行文件: ${YELLOW}/opt/uniproxy-panel/backend/uniproxy-panel${NC}"
echo -e "查看服务状态: ${YELLOW}systemctl status uniproxy-panel${NC}"
echo -e "查看服务日志: ${YELLOW}journalctl -u uniproxy-panel -f${NC}"
