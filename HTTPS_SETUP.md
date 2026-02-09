# UniProxy Panel HTTPS 配置指南

本文档介绍如何为 UniProxy Panel 配置 HTTPS 访问。

## 前提条件

1. **域名准备**：拥有一个已注册的域名
2. **DNS 解析**：将域名 A 记录解析到服务器 IP 地址
3. **端口开放**：确保服务器防火墙开放 80 和 443 端口
4. **服务运行**：UniProxy Panel 已成功部署并运行

## 方法一：使用 install.sh 一键配置（推荐）

### 1. 全新安装时配置 HTTPS

如果您还没有安装 UniProxy Panel，可以在安装时直接配置 HTTPS：

```bash
# 下载安装脚本
wget https://raw.githubusercontent.com/wenxin-99/AI-/main/install.sh
chmod +x install.sh

# 运行安装脚本
./install.sh
```

安装过程中会提示：
- **是否配置 HTTPS？** 选择 `y`
- **输入域名：** 输入您的域名（如 `panel.example.com`）

脚本会自动：
1. 安装 acme.sh 证书管理工具
2. 申请 Let's Encrypt 免费 SSL 证书
3. 配置 Nginx HTTPS
4. 设置 HTTP 自动跳转 HTTPS
5. 配置证书自动续期

### 2. 已安装系统后添加 HTTPS

如果您已经安装了 UniProxy Panel，想要添加 HTTPS 支持：

```bash
cd /opt/uniproxy-panel

# 拉取最新代码
git pull origin main

# 重新运行安装脚本（只会更新 HTTPS 配置）
bash install.sh
```

选择配置 HTTPS 并输入域名即可。

## 方法二：手动配置 HTTPS

### 1. 安装 acme.sh

```bash
curl https://get.acme.sh | sh -s email=your-email@example.com
source ~/.bashrc
```

### 2. 申请 SSL 证书

```bash
# 停止 Nginx 释放 80 端口
systemctl stop nginx

# 申请证书（替换 your-domain.com 为您的域名）
acme.sh --issue -d your-domain.com --standalone --keylength ec-256

# 创建证书目录
mkdir -p /opt/uniproxy-panel/certs

# 安装证书
acme.sh --install-cert -d your-domain.com --ecc \
  --key-file /opt/uniproxy-panel/certs/your-domain.com.key \
  --fullchain-file /opt/uniproxy-panel/certs/your-domain.com.crt \
  --reloadcmd "systemctl reload nginx"

# 设置文件权限
chmod 644 /opt/uniproxy-panel/certs/your-domain.com.crt
chmod 600 /opt/uniproxy-panel/certs/your-domain.com.key
```

### 3. 配置 Nginx

创建 Nginx 配置文件 `/etc/nginx/sites-available/uniproxy-panel`：

```nginx
# HTTP 自动跳转 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    
    # 用于 acme.sh 证书验证
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/uniproxy-panel;
    }
    
    # 其他请求跳转到 HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

# HTTPS 主配置
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    # SSL 证书配置
    ssl_certificate /opt/uniproxy-panel/certs/your-domain.com.crt;
    ssl_certificate_key /opt/uniproxy-panel/certs/your-domain.com.key;
    
    # SSL 协议配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:HIGH:!aNULL:!MD5:!RC4:!DHE;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # 安全头
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    root /var/www/uniproxy-panel;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
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
```

### 4. 启用配置并重启 Nginx

```bash
# 启用站点配置
ln -sf /etc/nginx/sites-available/uniproxy-panel /etc/nginx/sites-enabled/

# 删除默认配置
rm -f /etc/nginx/sites-enabled/default

# 测试配置
nginx -t

# 重启 Nginx
systemctl restart nginx
```

## 证书管理

### 查看证书信息

```bash
acme.sh --info -d your-domain.com --ecc
```

### 手动续期证书

```bash
acme.sh --renew -d your-domain.com --ecc --force
```

### 查看自动续期任务

```bash
crontab -l | grep acme
```

acme.sh 会自动添加 cron 任务，每天检查证书是否需要续期。

## 常见问题

### 1. 证书申请失败

**错误提示**：`Verify error: Invalid response`

**解决方法**：
- 确认域名已正确解析到服务器 IP：`ping your-domain.com`
- 确认 80 端口未被占用：`lsof -i :80`
- 确认防火墙开放 80 端口：`ufw allow 80` 或 `firewall-cmd --add-port=80/tcp --permanent`

### 2. HTTPS 无法访问

**解决方法**：
- 确认 443 端口已开放：`ufw allow 443` 或 `firewall-cmd --add-port=443/tcp --permanent`
- 检查 Nginx 配置：`nginx -t`
- 查看 Nginx 错误日志：`tail -f /var/log/nginx/error.log`
- 确认证书文件存在：`ls -la /opt/uniproxy-panel/certs/`

### 3. 证书过期

Let's Encrypt 证书有效期为 90 天，acme.sh 会自动续期。如果自动续期失败：

```bash
# 手动强制续期
acme.sh --renew -d your-domain.com --ecc --force

# 重启 Nginx
systemctl reload nginx
```

### 4. 更换域名

```bash
# 申请新域名证书
acme.sh --issue -d new-domain.com --standalone --keylength ec-256

# 安装新证书
acme.sh --install-cert -d new-domain.com --ecc \
  --key-file /opt/uniproxy-panel/certs/new-domain.com.key \
  --fullchain-file /opt/uniproxy-panel/certs/new-domain.com.crt \
  --reloadcmd "systemctl reload nginx"

# 修改 Nginx 配置中的 server_name 和证书路径
nano /etc/nginx/sites-available/uniproxy-panel

# 重启 Nginx
systemctl restart nginx
```

## 安全建议

1. **定期更新系统**：`apt update && apt upgrade -y`
2. **配置防火墙**：只开放必要的端口（80、443、8080）
3. **启用 HSTS**：已在 Nginx 配置中添加
4. **定期备份证书**：`tar -czf certs-backup.tar.gz /opt/uniproxy-panel/certs/`
5. **监控证书到期**：使用监控工具（如 Uptime Kuma）监控证书到期时间

## 参考资源

- [Let's Encrypt 官网](https://letsencrypt.org/)
- [acme.sh 文档](https://github.com/acmesh-official/acme.sh)
- [Nginx SSL 配置](https://nginx.org/en/docs/http/configuring_https_servers.html)
- [SSL Labs 测试](https://www.ssllabs.com/ssltest/) - 测试 HTTPS 配置安全性
