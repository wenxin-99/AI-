# UniProxy Panel 部署指南

## 快速部署（推荐）

### 方法一：使用 deploy.sh（适用于已安装环境）

如果您的服务器已经安装了 Node.js、Go、Nginx 等基础环境，使用此脚本可以快速更新和部署：

```bash
# 下载最新的部署脚本
wget https://raw.githubusercontent.com/wenxin-99/AI-/main/deploy.sh

# 添加执行权限
chmod +x deploy.sh

# 运行部署脚本
./deploy.sh
```

**特点**：
- ✅ 自动检测 `cmd/main.go` 或 `main.go` 位置
- ✅ 自动从 GitHub 拉取最新代码
- ✅ 自动构建前端和后端
- ✅ 自动配置 Nginx 和 systemd 服务
- ✅ 适合快速更新和重新部署

---

### 方法二：使用 install.sh（全新安装）

如果您的服务器是全新的，没有安装任何依赖，使用此脚本可以一键完成所有安装：

```bash
# 下载安装脚本
wget https://raw.githubusercontent.com/wenxin-99/AI-/main/install.sh

# 添加执行权限
chmod +x install.sh

# 运行安装脚本（会询问是否配置 HTTPS）
./install.sh
```

**特点**：
- ✅ 自动安装所有依赖（Node.js、Go、Nginx、Xray、Gost、acme.sh）
- ✅ 支持 HTTPS 自动配置（Let's Encrypt 免费证书）
- ✅ 自动配置证书续期
- ✅ 完整的错误处理和回退机制
- ✅ 适合生产环境首次部署

**HTTPS 配置要求**：
1. 域名已解析到服务器 IP
2. 防火墙开放 80 和 443 端口
3. 没有其他服务占用 80 端口

---

## 常见问题

### 1. 后端编译失败：`no required module provides package main.go`

**原因**：Go 构建命令路径不正确或环境变量未加载

**解决方案**：
```bash
# 确保使用完整路径
cd /opt/uniproxy-panel/backend
/usr/local/go/bin/go build -o uniproxy-panel cmd/main.go

# 或者设置环境变量
export PATH=$PATH:/usr/local/go/bin
source /root/.bashrc
go build -o uniproxy-panel cmd/main.go
```

### 2. 前端构建警告：`%VITE_ANALYTICS_ENDPOINT% is not defined`

**说明**：这是正常的警告，不影响部署。这些是 Manus 平台的分析变量，在生产环境中不需要。

### 3. 服务启动失败

**检查日志**：
```bash
# 查看后端服务日志
journalctl -u uniproxy-panel -n 50 --no-pager

# 查看 Nginx 日志
tail -f /var/log/nginx/error.log
```

**常见原因**：
- 配置文件路径错误
- 端口被占用（8080）
- 数据库文件权限问题

### 4. 证书申请失败

**检查清单**：
```bash
# 1. 检查域名解析
ping your-domain.com

# 2. 检查端口开放
netstat -tlnp | grep :80
netstat -tlnp | grep :443

# 3. 手动申请证书
/root/.acme.sh/acme.sh --issue -d your-domain.com --standalone --force

# 4. 查看 acme.sh 日志
/root/.acme.sh/acme.sh --list
```

---

## 服务管理

### 后端服务

```bash
# 启动服务
systemctl start uniproxy-panel

# 停止服务
systemctl stop uniproxy-panel

# 重启服务
systemctl restart uniproxy-panel

# 查看状态
systemctl status uniproxy-panel

# 查看日志
journalctl -u uniproxy-panel -f
```

### Nginx 服务

```bash
# 重载配置
systemctl reload nginx

# 重启 Nginx
systemctl restart nginx

# 测试配置
nginx -t

# 查看错误日志
tail -f /var/log/nginx/error.log
```

### 证书管理（HTTPS）

```bash
# 查看证书列表
/root/.acme.sh/acme.sh --list

# 手动续期证书
/root/.acme.sh/acme.sh --renew -d your-domain.com --force

# 查看证书到期时间
/root/.acme.sh/acme.sh --info -d your-domain.com
```

---

## 目录结构

```
/opt/uniproxy-panel/          # 项目根目录
├── backend/                   # 后端代码
│   ├── cmd/main.go           # 主程序入口
│   ├── uniproxy-panel        # 编译后的可执行文件
│   └── ...
├── dist/                      # 前端构建输出
│   └── public/               # 静态文件
├── data/                      # 数据目录
│   └── uniproxy.db           # SQLite 数据库
├── logs/                      # 日志目录
├── certs/                     # SSL 证书目录
└── config.yaml               # 配置文件

/var/www/uniproxy-panel/      # Nginx 静态文件目录
├── index.html
└── assets/

/etc/nginx/sites-available/   # Nginx 配置
└── uniproxy-panel

/etc/systemd/system/          # systemd 服务
└── uniproxy-panel.service
```

---

## 访问信息

- **HTTP 访问**：`http://服务器IP`
- **HTTPS 访问**（如已配置）：`https://your-domain.com`
- **默认账号**：`admin`
- **默认密码**：见 `/opt/uniproxy-panel/config.yaml` 中的 `admin_password`

---

## 更新部署

```bash
# 拉取最新代码
cd /opt/uniproxy-panel
git pull

# 重新运行部署脚本
bash deploy.sh
```

---

## 技术支持

- GitHub Issues: https://github.com/wenxin-99/AI-/issues
- 文档：查看项目 README.md
