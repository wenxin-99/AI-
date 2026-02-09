# UniProxy Panel 生产环境部署指南

## 📖 简介

`deploy-production.sh` 是 UniProxy Panel 的生产环境一键部署脚本，整合了 Docker 部署、SSL 配置、域名绑定、防火墙设置等功能，让您可以快速、安全地将 UniProxy Panel 部署到生产环境。

## ✨ 功能特性

- **智能部署模式** - 支持 Docker 和传统两种部署方式
- **自动环境检测** - 检测操作系统、系统资源、依赖安装
- **Docker 集成** - 自动安装 Docker 并使用 Docker Compose 部署
- **SSL 证书配置** - 支持 Let's Encrypt 自动证书和手动证书
- **域名管理** - 自动验证域名解析并配置 Nginx
- **防火墙配置** - 自动配置 UFW 或 firewalld
- **安全加固** - 自动生成强密码、配置 HTTPS 重定向
- **部署验证** - 自动测试服务状态和 API 响应
- **详细文档** - 显示完整的访问信息和管理命令

## 🎯 适用场景

### Docker 部署（推荐）

**适用于**：
- 生产环境
- 需要容器化管理
- 需要快速部署和更新
- 需要环境隔离

**优势**：
- ✅ 环境一致性好
- ✅ 部署速度快
- ✅ 易于更新和回滚
- ✅ 资源隔离
- ✅ 便于扩展

### 传统部署

**适用于**：
- 不支持 Docker 的环境
- 需要直接访问系统资源
- 需要深度定制

**优势**：
- ✅ 性能开销小
- ✅ 配置灵活
- ✅ 便于调试

## 🚀 快速开始

### 前提条件

**系统要求**：
- 操作系统：Ubuntu 20.04+、Debian 11+、CentOS 7+、RHEL 7+
- CPU：2 核心或以上（推荐）
- 内存：2GB 或以上（推荐）
- 磁盘：10GB 可用空间或以上
- 网络：可访问互联网

**域名要求**（如果使用域名）：
- 域名已解析到服务器 IP
- 80 和 443 端口可从外网访问（SSL 需要）

### 一键部署

```bash
# 1. 下载代码
cd /root
git clone https://github.com/wenxin-99/AI-.git
cd AI-

# 2. 运行部署脚本
sudo bash deploy-production.sh
```

### 交互式配置

脚本会引导您完成以下配置：

#### 1. 选择部署模式

```
请选择部署模式：
  1. Docker 部署（推荐）
  2. 传统部署（直接安装）

请输入选项 [1-2] (默认: 1):
```

**建议**：选择 Docker 部署（选项 1）

#### 2. 配置域名

```
请输入域名 (留空则使用 IP 访问):
```

**选项**：
- 输入域名（如 `panel.example.com`）- 推荐用于生产环境
- 留空 - 使用服务器 IP 访问

**注意**：如果输入域名，脚本会自动验证域名解析

#### 3. 配置 SSL（仅当使用域名时）

```
是否配置 SSL 证书？(y/N):
```

**建议**：生产环境强烈建议启用 SSL（输入 `y`）

如果启用 SSL，会询问证书类型：

```
请选择 SSL 证书类型：
  1. Let's Encrypt (自动申请，推荐)
  2. 手动证书 (已有证书文件)

请输入选项 [1-2] (默认: 1):
```

**Let's Encrypt**（选项 1）：
- 需要输入邮箱地址
- 自动申请和续期证书
- 免费

**手动证书**（选项 2）：
- 需要提供证书文件路径
- 需要提供密钥文件路径
- 适用于已购买的商业证书

#### 4. 配置后端端口

```
请输入后端端口 (默认: 8080):
```

**建议**：使用默认端口 8080

#### 5. 配置数据库密码

```
请输入数据库 root 密码 (留空则自动生成):
```

**建议**：留空让脚本自动生成强密码

#### 6. 配置管理员密码

```
请输入管理员密码 (默认: admin123):
```

**建议**：设置一个强密码

#### 7. 确认配置

脚本会显示配置摘要：

```
配置摘要：
────────────────────────────────────────────────────────────
  部署模式: Docker
  访问地址: panel.example.com
  SSL 状态: 启用
  SSL 类型: Let's Encrypt
  后端端口: 8080
  管理员账号: admin
────────────────────────────────────────────────────────────

确认以上配置并开始部署？(y/N):
```

确认无误后输入 `y` 开始部署。

## 📋 部署流程

脚本会自动执行以下步骤：

### 步骤 1/8: 检查系统要求

- 检查 CPU 核心数
- 检查内存大小
- 检查磁盘空间

### 步骤 2/8: 安装依赖

- 更新软件包列表
- 安装基础依赖（curl、wget、git 等）

### 步骤 3/8: 安装 Docker

- 检查 Docker 是否已安装
- 如果未安装，自动安装 Docker 和 Docker Compose
- 启动并启用 Docker 服务

### 步骤 4/8: 配置部署参数

- 收集用户输入的配置信息
- 验证域名解析（如果使用域名）
- 生成配置摘要并确认

### 步骤 5/8: 配置防火墙

- 检测防火墙类型（UFW 或 firewalld）
- 开放必要端口（22、80、443）
- 重新加载防火墙规则

### 步骤 6/8: 执行部署

**Docker 部署**：
- 创建部署目录
- 生成 `.env` 环境配置文件
- 复制 `docker-compose.yml`
- 拉取 Docker 镜像
- 启动容器服务

**传统部署**：
- 运行 `setup.sh` 安装脚本

### 步骤 7/8: 配置 SSL

**Let's Encrypt**：
- 安装 certbot
- 自动申请 SSL 证书
- 配置 Nginx HTTPS
- 设置自动续期

**手动证书**：
- 复制证书文件到 `/etc/nginx/ssl/`
- 生成带 SSL 的 Nginx 配置
- 配置 HTTP 到 HTTPS 重定向

### 步骤 8/8: 部署后验证

- 等待服务完全启动
- 测试后端 API 响应
- 测试前端访问
- 显示部署结果

## 🎉 部署成功

部署成功后，脚本会显示详细的访问信息和管理命令：

```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║                  部署成功！                                ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

访问信息：
────────────────────────────────────────────────────────────
  访问地址: https://panel.example.com
  管理员账号: admin
  管理员密码: your-password
────────────────────────────────────────────────────────────

Docker 管理命令：
────────────────────────────────────────────────────────────
  查看服务状态: cd /opt/uniproxy-panel && docker compose ps
  查看日志: cd /opt/uniproxy-panel && docker compose logs -f
  重启服务: cd /opt/uniproxy-panel && docker compose restart
  停止服务: cd /opt/uniproxy-panel && docker compose down
  更新服务: cd /opt/uniproxy-panel && docker compose pull && docker compose up -d
────────────────────────────────────────────────────────────

配置文件位置：
────────────────────────────────────────────────────────────
  环境配置: /opt/uniproxy-panel/.env
  Docker Compose: /opt/uniproxy-panel/docker-compose.yml
────────────────────────────────────────────────────────────

SSL 证书信息：
────────────────────────────────────────────────────────────
  证书类型: Let's Encrypt
  自动续期: 已启用
  查看证书: certbot certificates
────────────────────────────────────────────────────────────

安全建议：
────────────────────────────────────────────────────────────
  1. 请立即修改管理员密码
  2. 定期备份数据库和配置文件
  3. 定期更新系统和应用
  4. 启用防火墙并只开放必要端口
────────────────────────────────────────────────────────────

请访问 https://panel.example.com 开始使用 UniProxy Panel
```

## 🔧 部署后管理

### Docker 部署管理

#### 查看服务状态

```bash
cd /opt/uniproxy-panel
docker compose ps
```

#### 查看日志

```bash
# 查看所有服务日志
cd /opt/uniproxy-panel
docker compose logs -f

# 查看特定服务日志
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mysql
```

#### 重启服务

```bash
# 重启所有服务
cd /opt/uniproxy-panel
docker compose restart

# 重启特定服务
docker compose restart backend
```

#### 停止服务

```bash
cd /opt/uniproxy-panel
docker compose down
```

#### 更新服务

```bash
cd /opt/uniproxy-panel

# 拉取最新镜像
docker compose pull

# 重新启动服务
docker compose up -d
```

#### 备份数据

```bash
# 备份数据库
cd /opt/uniproxy-panel
docker compose exec mysql mysqldump -u root -p uniproxy > backup_$(date +%Y%m%d).sql

# 备份配置文件
tar -czf config_backup_$(date +%Y%m%d).tar.gz /opt/uniproxy-panel/.env /opt/uniproxy-panel/docker-compose.yml
```

### 传统部署管理

#### 查看服务状态

```bash
# 查看后端服务
systemctl status uniproxy-panel

# 查看 Nginx 服务
systemctl status nginx
```

#### 查看日志

```bash
# 查看后端日志
journalctl -u uniproxy-panel -f

# 查看 Nginx 日志
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

#### 重启服务

```bash
# 重启后端服务
systemctl restart uniproxy-panel

# 重启 Nginx
systemctl restart nginx
```

#### 配置管理

```bash
# 使用配置管理工具
uniproxy-config
```

#### 备份数据

```bash
# 备份数据库
mysqldump -u root -p uniproxy > backup_$(date +%Y%m%d).sql

# 备份配置文件
tar -czf config_backup_$(date +%Y%m%d).tar.gz \
    /opt/uniproxy-panel/backend/config.yaml \
    /etc/nginx/sites-available/uniproxy-panel
```

## 🛡️ 安全加固

### 1. 修改默认密码

部署完成后，**立即**登录系统并修改管理员密码：

1. 访问 UniProxy Panel
2. 使用默认账号密码登录
3. 进入"设置" → "账号安全"
4. 修改密码

### 2. 配置 SSL 证书

如果部署时未配置 SSL，强烈建议后续配置：

```bash
# 使用配置管理工具
sudo uniproxy-config
# 选择选项 3: 配置 SSL 证书
```

### 3. 限制 SSH 访问

```bash
# 禁用 root 登录
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config

# 修改 SSH 端口（可选）
sudo sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config

# 重启 SSH 服务
sudo systemctl restart sshd
```

### 4. 配置防火墙

```bash
# UFW
sudo ufw enable
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS

# firewalld
sudo systemctl start firewalld
sudo systemctl enable firewalld
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### 5. 定期更新

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get upgrade -y

# CentOS/RHEL
sudo yum update -y
```

### 6. 配置自动备份

创建备份脚本：

```bash
sudo nano /usr/local/bin/backup-uniproxy.sh
```

添加以下内容：

```bash
#!/bin/bash
BACKUP_DIR="/backup/uniproxy"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# 备份数据库
docker compose -f /opt/uniproxy-panel/docker-compose.yml exec -T mysql \
    mysqldump -u root -p${MYSQL_ROOT_PASSWORD} uniproxy > "$BACKUP_DIR/db_$DATE.sql"

# 备份配置
tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" /opt/uniproxy-panel

# 删除 7 天前的备份
find "$BACKUP_DIR" -name "*.sql" -mtime +7 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +7 -delete
```

添加执行权限并设置定时任务：

```bash
sudo chmod +x /usr/local/bin/backup-uniproxy.sh

# 添加到 crontab（每天凌晨 2 点执行）
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-uniproxy.sh") | crontab -
```

## 🐛 故障排查

### 问题 1: 部署失败，提示"磁盘空间不足"

**原因**：可用磁盘空间小于 10GB

**解决方案**：

```bash
# 查看磁盘使用情况
df -h

# 清理不必要的文件
sudo apt-get clean
sudo apt-get autoremove

# 清理 Docker 缓存（如果已安装 Docker）
docker system prune -a
```

### 问题 2: Docker 安装失败

**原因**：网络问题或系统不支持

**解决方案**：

```bash
# 检查网络连接
ping -c 4 google.com

# 手动安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 或选择传统部署模式
sudo bash deploy-production.sh
# 选择选项 2: 传统部署
```

### 问题 3: Let's Encrypt 证书申请失败

**可能原因**：
1. 域名未解析到服务器
2. 80 端口无法从外网访问
3. 防火墙阻止了验证请求

**解决方案**：

```bash
# 1. 验证域名解析
nslookup your-domain.com

# 2. 检查 80 端口
sudo netstat -tlnp | grep :80

# 3. 检查防火墙
sudo ufw status
sudo ufw allow 80/tcp

# 4. 手动申请证书
sudo certbot --nginx -d your-domain.com --email your@email.com
```

### 问题 4: 服务启动后无法访问

**诊断步骤**：

```bash
# 1. 检查服务状态
cd /opt/uniproxy-panel
docker compose ps

# 或（传统部署）
sudo systemctl status uniproxy-panel
sudo systemctl status nginx

# 2. 查看日志
docker compose logs

# 或（传统部署）
sudo journalctl -u uniproxy-panel -n 100
sudo tail -f /var/log/nginx/error.log

# 3. 检查端口监听
sudo ss -tlnp | grep -E ':(80|443|8080)'

# 4. 测试本地访问
curl -v http://localhost
curl -v http://localhost:8080/api/v1/system/info
```

### 问题 5: 数据库连接失败

**Docker 部署**：

```bash
# 检查 MySQL 容器状态
cd /opt/uniproxy-panel
docker compose ps mysql

# 查看 MySQL 日志
docker compose logs mysql

# 进入 MySQL 容器
docker compose exec mysql mysql -u root -p

# 检查环境变量
cat .env
```

**传统部署**：

```bash
# 检查 MySQL 服务
sudo systemctl status mysql

# 测试连接
mysql -u root -p

# 检查配置文件
cat /opt/uniproxy-panel/backend/config.yaml
```

## 📚 相关文档

- [一键安装脚本使用指南](./README.md)
- [配置管理工具使用指南](./UNIPROXY_CONFIG_GUIDE.md)
- [Docker 使用文档](./DOCKER_GUIDE.md)
- [端口配置说明](./PORT_CONFIGURATION.md)
- [故障排查指南](./TROUBLESHOOTING.md)

## 💡 最佳实践

### 1. 使用域名而非 IP

- 便于记忆和分享
- 支持 SSL 证书
- 便于迁移服务器

### 2. 启用 SSL 证书

- 保护数据传输安全
- 提升用户信任度
- 符合现代 Web 标准

### 3. 选择 Docker 部署

- 环境一致性好
- 便于更新和回滚
- 易于扩展

### 4. 定期备份

- 每天自动备份数据库
- 每周备份配置文件
- 保留至少 7 天的备份

### 5. 监控服务状态

- 使用监控工具（如 Prometheus + Grafana）
- 配置告警通知
- 定期检查日志

### 6. 及时更新

- 定期更新系统软件包
- 及时更新 UniProxy Panel
- 关注安全公告

## 🆘 获取帮助

如果遇到问题，可以：

1. 查看本文档的"故障排查"部分
2. 查看 [故障排查指南](./TROUBLESHOOTING.md)
3. 在 GitHub 上提交 Issue: https://github.com/wenxin-99/AI-/issues
4. 联系技术支持

## 📝 更新日志

### v1.0.0 (2026-02-09)

**初始版本**：

- ✅ 支持 Docker 和传统两种部署模式
- ✅ 自动检测系统要求和安装依赖
- ✅ 自动安装和配置 Docker
- ✅ 支持 Let's Encrypt 和手动 SSL 证书
- ✅ 自动配置防火墙（UFW 和 firewalld）
- ✅ 域名解析验证
- ✅ 部署后自动验证
- ✅ 详细的部署结果和管理命令

---

**提示**: 使用 `sudo bash deploy-production.sh` 开始部署，按照交互式提示完成配置即可。
