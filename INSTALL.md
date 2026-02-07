# UniProxy Panel 安装和使用指南

## 快速安装

### 一键安装(推荐)

在您的VPS上执行以下命令:

```bash
wget -O install.sh https://raw.githubusercontent.com/wenxin-99/AI-/main/install.sh
chmod +x install.sh
sudo ./install.sh
```

或者使用curl:

```bash
curl -fsSL https://raw.githubusercontent.com/wenxin-99/AI-/main/install.sh | sudo bash
```

### 系统要求

- **操作系统**: Ubuntu 20.04/22.04, Debian 10/11, CentOS 7/8
- **内存**: 至少 1GB RAM
- **磁盘**: 至少 10GB 可用空间
- **网络**: 需要能够访问GitHub和相关下载源

### 安装过程

安装脚本会自动完成以下步骤:

1. ✅ 检测操作系统
2. ✅ 安装系统依赖 (curl, wget, git, nginx等)
3. ✅ 安装 Node.js 18.x 和 pnpm
4. ✅ 安装 Go 1.21.5
5. ✅ 下载并安装 Xray-core
6. ✅ 下载并安装 Gost
7. ✅ 克隆项目代码
8. ✅ 构建前端和后端
9. ✅ 配置 Nginx 反向代理
10. ✅ 创建配置文件和systemd服务
11. ✅ 启动所有服务

## 安装后配置

### 访问面板

安装完成后,在浏览器中访问:

```
http://您的服务器IP
```

### 默认账号

安装脚本会自动生成管理员账号和密码,在安装完成时会显示:

```
管理员账号: admin
管理员密码: (随机生成的密码)
```

**重要**: 请立即修改默认密码!

### 配置文件位置

主配置文件位于: `/opt/uniproxy-panel/config.yaml`

```yaml
server:
  host: 127.0.0.1
  port: 8080
  mode: release

database:
  type: sqlite
  path: /opt/uniproxy-panel/data/uniproxy.db

xray:
  binary_path: /usr/local/xray/xray
  config_path: /opt/uniproxy-panel/data/xray_config.json
  log_path: /opt/uniproxy-panel/logs/xray.log

gost:
  binary_path: /usr/local/gost/gost
  config_path: /opt/uniproxy-panel/data/gost_config.yaml
  log_path: /opt/uniproxy-panel/logs/gost.log

security:
  jwt_secret: (自动生成)
  admin_username: admin
  admin_password: (自动生成)

log:
  level: info
  path: /opt/uniproxy-panel/logs/backend.log
```

## 服务管理

### systemd 命令

```bash
# 启动服务
systemctl start uniproxy-panel

# 停止服务
systemctl stop uniproxy-panel

# 重启服务
systemctl restart uniproxy-panel

# 查看状态
systemctl status uniproxy-panel

# 开机自启
systemctl enable uniproxy-panel

# 禁用自启
systemctl disable uniproxy-panel

# 查看实时日志
journalctl -u uniproxy-panel -f
```

### Nginx 管理

```bash
# 重启 Nginx
systemctl restart nginx

# 测试配置
nginx -t

# 查看错误日志
tail -f /var/log/nginx/error.log
```

## 目录结构

```
/opt/uniproxy-panel/
├── frontend/           # 前端源代码
├── backend/            # 后端源代码
├── data/               # 数据目录
│   ├── uniproxy.db    # SQLite数据库
│   ├── xray_config.json
│   └── gost_config.yaml
├── logs/               # 日志目录
│   ├── backend.log
│   ├── xray.log
│   └── gost.log
├── certs/              # 证书目录
└── config.yaml         # 主配置文件

/var/www/uniproxy-panel/  # 前端构建产物(Nginx服务目录)

/usr/local/xray/          # Xray安装目录
└── xray                  # Xray可执行文件

/usr/local/gost/          # Gost安装目录
└── gost                  # Gost可执行文件
```

## 使用指南

### 1. 证书管理

#### 上传自定义证书

1. 进入"证书管理"页面
2. 点击"上传证书"
3. 填写证书信息:
   - 证书名称
   - 域名
   - 证书文件(.crt或.pem)
   - 私钥文件(.key)
4. 点击"上传"

#### 生成自签名证书

1. 进入"证书管理"页面
2. 点击"生成自签名证书"
3. 填写域名和有效期
4. 点击"生成"

### 2. Xray 入站管理

#### 创建入站

1. 进入"Xray管理"页面
2. 点击"创建入站"
3. 配置基础信息:
   - 备注名称
   - 监听端口
   - 协议类型(VMess/VLESS/Trojan/Shadowsocks)
   - 监听地址

4. 配置传输层(可选):
   - 传输协议: TCP/WebSocket/HTTP/2/gRPC
   - TLS设置: 选择证书,配置SNI
   - WebSocket路径
   - gRPC服务名

5. 配置高级选项(可选):
   - 启用流量探测(Sniffing)
   - 其他高级参数

#### 添加客户端

1. 在入站列表中点击"客户端"
2. 点击"添加客户端"
3. 填写客户端信息:
   - 邮箱/备注
   - UUID(自动生成或手动输入)
   - 流量限制
   - 过期时间

### 3. Gost 隧道管理

#### 创建隧道

1. 进入"Gost管理"页面
2. 点击"创建隧道"
3. 配置基础信息:
   - 隧道名称
   - 协议类型(TCP/UDP/HTTP/SOCKS5)
   - 本地端口
   - 远程地址

4. 配置认证(可选):
   - 用户名
   - 密码

5. 配置限速(可选):
   - 上传限速(MB/s)
   - 下载限速(MB/s)

6. 配置TLS加密(可选):
   - 启用TLS
   - 选择证书
   - TLS服务器名称
   - 跳过证书验证

### 4. 系统监控

在"仪表盘"页面可以查看:

- Xray入站数量和状态
- Gost隧道数量和状态
- 系统资源使用情况
- 最近的操作日志

## 常见问题

### 1. 安装失败

**问题**: 安装过程中出现错误

**解决方案**:
- 检查网络连接是否正常
- 确认系统满足最低要求
- 查看安装日志定位具体错误
- 尝试手动执行失败的步骤

### 2. 无法访问面板

**问题**: 浏览器无法打开面板

**解决方案**:
```bash
# 检查Nginx状态
systemctl status nginx

# 检查后端服务状态
systemctl status uniproxy-panel

# 检查防火墙
ufw status
# 如果启用了防火墙,开放80端口
ufw allow 80/tcp
```

### 3. Xray/Gost 无法启动

**问题**: 代理服务无法正常工作

**解决方案**:
```bash
# 查看Xray日志
tail -f /opt/uniproxy-panel/logs/xray.log

# 查看Gost日志
tail -f /opt/uniproxy-panel/logs/gost.log

# 检查配置文件语法
/usr/local/xray/xray -test -config /opt/uniproxy-panel/data/xray_config.json
```

### 4. 端口冲突

**问题**: 提示端口已被占用

**解决方案**:
```bash
# 查看端口占用
netstat -tlnp | grep :端口号

# 或使用lsof
lsof -i :端口号

# 修改配置文件中的端口
vi /opt/uniproxy-panel/config.yaml
```

### 5. 证书过期

**问题**: TLS证书已过期

**解决方案**:
1. 进入"证书管理"页面
2. 删除过期证书
3. 重新上传或生成新证书
4. 在Xray/Gost配置中更新证书引用

## 升级指南

### 升级前端

```bash
cd /opt/uniproxy-panel/frontend
git pull
pnpm install
pnpm build
rm -rf /var/www/uniproxy-panel/*
cp -r dist/* /var/www/uniproxy-panel/
```

### 升级后端

```bash
cd /opt/uniproxy-panel/backend
git pull
go build -o uniproxy ./cmd/main.go
systemctl restart uniproxy-panel
```

### 升级 Xray

```bash
cd /tmp
wget https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip
unzip -o Xray-linux-64.zip -d /usr/local/xray
chmod +x /usr/local/xray/xray
rm Xray-linux-64.zip
```

### 升级 Gost

```bash
GOST_VERSION=$(curl -s https://api.github.com/repos/ginuerzh/gost/releases/latest | grep tag_name | cut -d '"' -f 4)
wget -O /tmp/gost.gz https://github.com/ginuerzh/gost/releases/download/${GOST_VERSION}/gost-linux-amd64-${GOST_VERSION}.gz
gunzip -c /tmp/gost.gz > /usr/local/gost/gost
chmod +x /usr/local/gost/gost
rm /tmp/gost.gz
```

## 卸载

如需完全卸载UniProxy Panel:

```bash
# 停止服务
systemctl stop uniproxy-panel
systemctl disable uniproxy-panel

# 删除systemd服务
rm /etc/systemd/system/uniproxy-panel.service
systemctl daemon-reload

# 删除Nginx配置
rm /etc/nginx/sites-enabled/uniproxy-panel
rm /etc/nginx/sites-available/uniproxy-panel
systemctl reload nginx

# 删除程序文件
rm -rf /opt/uniproxy-panel
rm -rf /var/www/uniproxy-panel
rm -rf /usr/local/xray
rm -rf /usr/local/gost
```

## 安全建议

1. **修改默认密码**: 安装后立即修改管理员密码
2. **启用HTTPS**: 配置SSL证书,使用HTTPS访问
3. **防火墙配置**: 只开放必要的端口
4. **定期备份**: 备份数据库和配置文件
5. **及时更新**: 定期更新系统和组件到最新版本
6. **限制访问**: 使用IP白名单限制管理面板访问

## 备份和恢复

### 备份

```bash
# 创建备份目录
mkdir -p /backup/uniproxy-panel

# 备份数据库
cp /opt/uniproxy-panel/data/uniproxy.db /backup/uniproxy-panel/

# 备份配置文件
cp /opt/uniproxy-panel/config.yaml /backup/uniproxy-panel/

# 备份证书
cp -r /opt/uniproxy-panel/certs /backup/uniproxy-panel/

# 打包备份
cd /backup
tar -czf uniproxy-panel-backup-$(date +%Y%m%d).tar.gz uniproxy-panel/
```

### 恢复

```bash
# 解压备份
cd /backup
tar -xzf uniproxy-panel-backup-YYYYMMDD.tar.gz

# 恢复数据库
cp uniproxy-panel/uniproxy.db /opt/uniproxy-panel/data/

# 恢复配置
cp uniproxy-panel/config.yaml /opt/uniproxy-panel/

# 恢复证书
cp -r uniproxy-panel/certs /opt/uniproxy-panel/

# 重启服务
systemctl restart uniproxy-panel
```

## 技术支持

如遇到问题,请:

1. 查看本文档的"常见问题"部分
2. 检查日志文件获取详细错误信息
3. 在GitHub仓库提交Issue: https://github.com/wenxin-99/AI-/issues

## 许可证

本项目采用 MIT 许可证
