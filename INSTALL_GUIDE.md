# UniProxy Panel 安装指南

## 🚀 一键安装（推荐）

使用全新的 `install-all.sh` 脚本，真正实现一键安装，无需任何手动配置：

```bash
# 下载并运行安装脚本
curl -fsSL https://raw.githubusercontent.com/wenxin-99/AI-/main/install-all.sh | sudo bash
```

或者先下载再运行：

```bash
# 下载脚本
wget https://raw.githubusercontent.com/wenxin-99/AI-/main/install-all.sh

# 运行安装
sudo bash install-all.sh
```

## ✨ 功能特性

### 智能化安装

- ✅ **自动检测环境** - 支持 Ubuntu、Debian、CentOS 等主流 Linux 发行版
- ✅ **自动安装依赖** - 自动安装 Go、Node.js、Nginx、SQLite 等所有依赖
- ✅ **智能端口分配** - 自动检测端口占用，选择可用端口（8080-8085, 9000-9001）
- ✅ **自动端口修复** - 部署后自动验证端口配置，检测到不一致时自动修复
- ✅ **首次安装和更新** - 自动识别是首次安装还是更新，执行相应流程

### 零配置部署

- 🎯 **真正的一键安装** - 无需任何手动配置，运行一条命令即可完成部署
- 🎯 **自动服务配置** - 自动创建 systemd 服务和 Nginx 配置
- 🎯 **自动健康检查** - 部署后自动测试服务状态和 API 响应
- 🎯 **详细的安装日志** - 彩色输出，清晰显示每个步骤的执行状态

## 📋 系统要求

### 操作系统

- Ubuntu 20.04 / 22.04 / 24.04
- Debian 10 / 11 / 12
- CentOS 7 / 8
- 其他基于 systemd 的 Linux 发行版

### 硬件要求

- CPU: 1 核心（推荐 2 核心以上）
- 内存: 512MB（推荐 1GB 以上）
- 磁盘: 1GB 可用空间（推荐 5GB 以上）

### 网络要求

- 需要访问 GitHub、Go 官方源、Node.js 官方源
- 建议使用国内服务器或配置代理（脚本已配置 Go 国内镜像）

## 🔧 安装步骤

### 1. 准备服务器

确保服务器满足系统要求，并且可以访问互联网。

### 2. 运行安装脚本

```bash
# 方式 1: 直接运行（推荐）
curl -fsSL https://raw.githubusercontent.com/wenxin-99/AI-/main/install-all.sh | sudo bash

# 方式 2: 下载后运行
wget https://raw.githubusercontent.com/wenxin-99/AI-/main/install-all.sh
sudo bash install-all.sh

# 方式 3: 克隆仓库后运行
git clone https://github.com/wenxin-99/AI-.git
cd AI-
sudo bash install-all.sh
```

### 3. 等待安装完成

脚本会自动执行以下步骤：

1. ✅ 安装系统依赖（Git、Curl、Nginx、SQLite 等）
2. ✅ 安装 Go 1.21 环境
3. ✅ 安装 Node.js 20.x 和 pnpm
4. ✅ 克隆项目代码
5. ✅ 编译前端（React + Vite）
6. ✅ 编译后端（Go + Gin）
7. ✅ 智能检测和配置端口
8. ✅ 配置 systemd 服务和 Nginx

### 4. 访问系统

安装完成后，脚本会显示访问信息：

```
================================
部署完成！
================================

访问信息：
  前端地址: http://YOUR_SERVER_IP
  后端端口: 8080
  默认账号: admin
  默认密码: admin123
```

在浏览器中访问 `http://YOUR_SERVER_IP` 即可使用。

## 🔄 更新部署

如果已经安装过，再次运行 `install-all.sh` 会自动执行更新：

```bash
sudo bash install-all.sh
```

脚本会自动：
- 拉取最新代码
- 重新编译前端和后端
- 验证并修复端口配置
- 重启服务

## 🛠️ 服务管理

### 查看服务状态

```bash
# 查看后端服务状态
systemctl status uniproxy-panel

# 查看 Nginx 服务状态
systemctl status nginx
```

### 查看日志

```bash
# 查看后端实时日志
journalctl -u uniproxy-panel -f

# 查看 Nginx 错误日志
tail -f /var/log/nginx/error.log

# 查看 Nginx 访问日志
tail -f /var/log/nginx/access.log
```

### 重启服务

```bash
# 重启后端服务
systemctl restart uniproxy-panel

# 重启 Nginx 服务
systemctl restart nginx

# 重启所有服务
systemctl restart uniproxy-panel nginx
```

### 停止服务

```bash
# 停止后端服务
systemctl stop uniproxy-panel

# 停止 Nginx 服务
systemctl stop nginx
```

## 🔍 健康检查

### 检查后端 API

```bash
# 获取后端监听端口
BACKEND_PORT=$(ss -tlnp | grep uniproxy-panel | grep -oP ':\K[0-9]+' | head -1)

# 测试后端 API
curl http://127.0.0.1:$BACKEND_PORT/api/v1/system/info
```

### 检查 Nginx 代理

```bash
# 测试 Nginx 代理
curl http://localhost/api/v1/system/info
```

### 检查端口配置

```bash
# 查看后端配置的端口
grep "port:" /opt/uniproxy-panel/config.yaml

# 查看后端实际监听的端口
ss -tlnp | grep uniproxy-panel

# 查看 Nginx 配置的端口
grep "proxy_pass" /etc/nginx/sites-available/uniproxy-panel
```

## 🐛 故障排查

### 问题 1: 502 Bad Gateway

**症状**: 访问前端时显示 502 Bad Gateway

**原因**: 后端服务未启动或端口配置不一致

**解决方案**:

```bash
# 1. 检查后端服务状态
systemctl status uniproxy-panel

# 2. 如果服务未运行，启动服务
systemctl start uniproxy-panel

# 3. 检查端口配置
BACKEND_PORT=$(ss -tlnp | grep uniproxy-panel | grep -oP ':\K[0-9]+' | head -1)
echo "后端实际监听端口: $BACKEND_PORT"

# 4. 修复 Nginx 配置
sudo sed -i "s/127\.0\.0\.1:[0-9]\+/127.0.0.1:$BACKEND_PORT/g" /etc/nginx/sites-available/uniproxy-panel
sudo nginx -t
sudo systemctl reload nginx
```

### 问题 2: 端口被占用

**症状**: 安装时提示"所有预设端口都被占用"

**解决方案**:

```bash
# 1. 查看占用端口的进程
sudo ss -tlnp | grep :8080

# 2. 停止占用端口的服务
sudo systemctl stop <service-name>

# 3. 或者手动指定其他端口
# 编辑配置文件
sudo nano /opt/uniproxy-panel/config.yaml
# 修改 server.port 为未被占用的端口（如 10001）

# 4. 重新运行安装脚本
sudo bash install-all.sh
```

### 问题 3: 编译失败

**症状**: 前端或后端编译失败

**解决方案**:

```bash
# 1. 检查 Go 版本
go version  # 应该是 1.21.x

# 2. 检查 Node.js 版本
node -v  # 应该是 v20.x

# 3. 清理缓存后重试
cd /opt/uniproxy-panel/client
rm -rf node_modules pnpm-lock.yaml
pnpm install

cd /opt/uniproxy-panel/backend
go clean -cache
go mod download

# 4. 重新运行安装脚本
cd /opt/uniproxy-panel
sudo bash install-all.sh
```

### 问题 4: 无法访问

**症状**: 浏览器无法访问服务器 IP

**解决方案**:

```bash
# 1. 检查防火墙
sudo ufw status

# 2. 如果防火墙开启，允许 80 端口
sudo ufw allow 80/tcp
sudo ufw reload

# 3. 检查云服务器安全组
# 登录云服务商控制台，确保安全组开放了 80 端口

# 4. 检查 Nginx 是否监听 80 端口
sudo ss -tlnp | grep :80
```

## 📚 配置文件

### 后端配置文件

位置: `/opt/uniproxy-panel/config.yaml`

主要配置项:

```yaml
server:
  host: 0.0.0.0
  port: 8080        # 后端监听端口

database:
  type: sqlite
  host: localhost
  port: 3306
  name: uniproxy_panel
  user: root
  password: ""
  path: ./data/uniproxy.db

jwt:
  secret: "your-secret-key"
  expire: 7200
```

### Nginx 配置文件

位置: `/etc/nginx/sites-available/uniproxy-panel`

主要配置项:

```nginx
server {
    listen 80;
    server_name _;

    # 前端静态文件
    location / {
        root /var/www/uniproxy-panel;
        try_files $uri $uri/ /index.html;
    }

    # API 代理到后端
    location /api {
        proxy_pass http://127.0.0.1:8080;  # 后端地址
        # ... 其他代理配置
    }
}
```

## 🔐 安全建议

### 1. 修改默认密码

首次登录后，立即修改默认密码：

1. 登录系统（admin / admin123）
2. 进入"设置"页面
3. 修改管理员密码

### 2. 配置 SSL 证书

使用 Let's Encrypt 免费证书：

```bash
# 使用配置管理工具
sudo uniproxy-config
# 选择选项 3: 配置 SSL 证书

# 或使用生产部署脚本
sudo bash deploy-production.sh
```

### 3. 配置防火墙

```bash
# 只开放必要的端口
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

### 4. 定期更新

```bash
# 定期运行更新
sudo bash install-all.sh
```

## 📖 相关文档

- [端口自动检测说明](./PORT_AUTO_DETECTION.md)
- [配置管理工具使用指南](./UNIPROXY_CONFIG_GUIDE.md)
- [生产环境部署指南](./PRODUCTION_DEPLOYMENT_GUIDE.md)
- [Docker 部署指南](./DOCKER_GUIDE.md)
- [CI/CD 配置指南](./CI_CD_GUIDE.md)

## 🆘 获取帮助

如果遇到问题:

1. 查看本文档的"故障排查"部分
2. 查看详细的日志信息
3. 在 GitHub 上提交 Issue: https://github.com/wenxin-99/AI-/issues

## 📝 更新日志

### v2.0.0 (2026-02-09)

- ✨ 全新的一键安装脚本 `install-all.sh`
- ✨ 智能端口检测和自动分配
- ✨ 部署后自动验证和修复
- ✨ 支持首次安装和更新部署
- 🗑️ 移除旧版本脚本（install.sh, deploy.sh）

### v1.0.0

- 初始版本

---

**提示**: 推荐使用 `install-all.sh` 进行安装和更新，它包含了所有最新的优化和自动修复功能。
