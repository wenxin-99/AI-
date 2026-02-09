# UniProxy Panel 配置管理工具使用指南

## 📖 简介

`uniproxy-config` 是 UniProxy Panel 的交互式配置管理工具，提供友好的命令行界面来管理系统配置，无需手动编辑配置文件。

## ✨ 功能特性

- **端口管理** - 修改后端服务端口，自动检测端口占用并同步 Nginx 配置
- **路径管理** - 修改前端文件路径，支持自动复制现有文件
- **SSL 配置** - 支持手动证书和 Let's Encrypt 自动证书
- **系统状态** - 实时查看服务状态、端口监听、API 响应等
- **服务管理** - 快速重启后端服务或 Nginx
- **配置备份** - 自动备份配置文件，支持一键恢复
- **安全验证** - 所有修改前都会进行配置测试和确认

## 🚀 安装

### 方法 1：从 GitHub 下载

```bash
# 下载最新代码
cd /root
git clone https://github.com/wenxin-99/AI-.git
cd AI-

# 安装到系统路径
sudo cp uniproxy-config /usr/local/bin/
sudo chmod +x /usr/local/bin/uniproxy-config

# 验证安装
uniproxy-config --help 2>/dev/null || uniproxy-config
```

### 方法 2：直接下载单个文件

```bash
# 下载工具
sudo curl -o /usr/local/bin/uniproxy-config https://raw.githubusercontent.com/wenxin-99/AI-/main/uniproxy-config

# 添加执行权限
sudo chmod +x /usr/local/bin/uniproxy-config

# 验证安装
uniproxy-config
```

## 📝 使用方法

### 启动工具

```bash
# 使用 sudo 运行（需要 root 权限）
sudo uniproxy-config
```

### 主菜单

启动后会显示主菜单：

```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║           UniProxy Panel 配置管理工具                      ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝

当前配置：
────────────────────────────────────────────────────────────
  后端端口: 8080
  前端路径: /var/www/uniproxy-panel
  SSL 状态: 否
────────────────────────────────────────────────────────────

请选择操作：

  1. 修改后端端口
  2. 修改前端路径
  3. 配置 SSL 证书
  4. 查看系统状态
  5. 重启服务
  6. 备份配置
  7. 恢复配置
  0. 退出

请输入选项 [0-7]:
```

## 🔧 功能详解

### 1. 修改后端端口

**用途**：更改后端服务监听的端口

**步骤**：

1. 选择菜单选项 `1`
2. 输入新端口号（1024-65535）
3. 工具会自动检测端口是否被占用
4. 确认修改后，工具会：
   - 修改后端配置文件
   - 更新 Nginx 代理配置
   - 重启后端服务
   - 重新加载 Nginx
   - 验证端口监听和 API 响应

**示例**：

```
当前端口: 8080

请输入新端口 (1024-65535) 或按 Enter 取消: 9000

将要进行以下修改：
  旧端口: 8080
  新端口: 9000

确认修改？(y/N): y

[INFO] 正在修改配置...
[INFO] 重启后端服务...
[INFO] 重新加载 Nginx...
[INFO] 验证配置...
[SUCCESS] 端口修改成功！
```

**注意事项**：

- 端口范围必须在 1024-65535 之间
- 避免使用系统保留端口（如 3306、5432 等）
- 如果端口被占用，工具会提示是否继续
- 修改前会自动备份配置文件

### 2. 修改前端路径

**用途**：更改前端静态文件的存储路径

**步骤**：

1. 选择菜单选项 `2`
2. 输入新的绝对路径
3. 如果路径不存在，工具会询问是否创建
4. 确认修改后，工具会：
   - 更新 Nginx 配置中的 root 路径
   - 可选：复制现有前端文件到新路径
   - 重新加载 Nginx

**示例**：

```
当前路径: /var/www/uniproxy-panel

请输入新路径 (绝对路径) 或按 Enter 取消: /opt/uniproxy-frontend

将要进行以下修改：
  旧路径: /var/www/uniproxy-panel
  新路径: /opt/uniproxy-frontend

确认修改？(y/N): y

[INFO] 正在修改配置...
是否复制现有前端文件到新路径？(y/N): y
[INFO] 复制文件...
[SUCCESS] 文件已复制
[INFO] 重新加载 Nginx...
[SUCCESS] 前端路径修改成功！
```

**注意事项**：

- 必须使用绝对路径（以 `/` 开头）
- 确保新路径有足够的磁盘空间
- 建议复制现有文件，避免前端无法访问
- 修改前会自动备份 Nginx 配置

### 3. 配置 SSL 证书

**用途**：为网站启用 HTTPS 加密访问

**子菜单**：

```
请选择操作：

  1. 启用 SSL (使用现有证书)
  2. 启用 SSL (使用 Let's Encrypt)
  3. 禁用 SSL
  0. 返回
```

#### 3.1 使用现有证书

**适用场景**：已有 SSL 证书文件（如购买的商业证书）

**步骤**：

1. 选择子菜单选项 `1`
2. 输入证书文件路径（.crt 或 .pem）
3. 输入密钥文件路径（.key）
4. 输入域名
5. 确认后，工具会：
   - 生成带 SSL 的 Nginx 配置
   - 配置 HTTP 到 HTTPS 的自动重定向
   - 重新加载 Nginx

**示例**：

```
请输入证书文件路径 (.crt 或 .pem): /etc/ssl/certs/example.com.crt
请输入密钥文件路径 (.key): /etc/ssl/private/example.com.key
请输入域名 (例如: example.com): example.com

SSL 配置信息：
  证书: /etc/ssl/certs/example.com.crt
  密钥: /etc/ssl/private/example.com.key
  域名: example.com

确认配置？(y/N): y

[INFO] 正在配置 SSL...
[INFO] 重新加载 Nginx...
[SUCCESS] SSL 配置成功！
[INFO] 现在可以通过 https://example.com 访问
```

#### 3.2 使用 Let's Encrypt

**适用场景**：自动申请免费 SSL 证书

**前提条件**：

- 域名已解析到服务器 IP
- 80 端口可以从外网访问
- 服务器可以访问 Let's Encrypt 服务器

**步骤**：

1. 选择子菜单选项 `2`
2. 如果 certbot 未安装，工具会询问是否安装
3. 输入域名
4. 输入邮箱地址（用于证书到期提醒）
5. 确认后，工具会：
   - 自动申请 SSL 证书
   - 配置 Nginx
   - 设置自动续期

**示例**：

```
请输入域名 (例如: example.com): example.com
请输入邮箱地址 (用于证书通知): admin@example.com

Let's Encrypt 配置信息：
  域名: example.com
  邮箱: admin@example.com

注意：
  1. 请确保域名已解析到本服务器
  2. 请确保 80 端口可以从外网访问

确认配置？(y/N): y

[INFO] 正在申请证书...
[SUCCESS] SSL 配置成功！
[INFO] 证书将自动续期
[INFO] 现在可以通过 https://example.com 访问
```

#### 3.3 禁用 SSL

**用途**：移除 SSL 配置，恢复 HTTP 访问

**步骤**：

1. 选择子菜单选项 `3`
2. 确认禁用
3. 工具会生成不带 SSL 的 Nginx 配置

**示例**：

```
警告：禁用 SSL 后，网站将只能通过 HTTP 访问

确认禁用 SSL？(y/N): y

[INFO] 正在禁用 SSL...
[INFO] 重新加载 Nginx...
[SUCCESS] SSL 已禁用
```

### 4. 查看系统状态

**用途**：实时查看服务运行状态和系统资源

**显示信息**：

- 后端服务状态（运行/停止）
- 后端监听端口
- 后端 API 响应状态
- Nginx 服务状态
- Nginx 代理响应状态
- 磁盘使用情况
- 内存使用情况

**示例**：

```
═══ 系统状态 ═══

后端服务：
  状态: 运行中
  监听端口: 8080
  API 响应: 正常

Nginx 服务：
  状态: 运行中
  代理响应: 正常

磁盘使用：
  总容量: 50G  已用: 15G  可用: 35G  使用率: 30%

内存使用：
  总内存: 4.0G  已用: 2.1G  可用: 1.9G
```

### 5. 重启服务

**用途**：快速重启服务，无需手动执行 systemctl 命令

**子菜单**：

```
请选择要重启的服务：

  1. 重启后端服务
  2. 重启 Nginx
  3. 重启所有服务
  0. 返回
```

**示例**：

```
请输入选项 [0-3]: 3

[INFO] 重启所有服务...
[SUCCESS] 所有服务重启成功
```

### 6. 备份配置

**用途**：创建配置文件的备份，便于恢复

**备份内容**：

- 后端配置文件（config.yaml）
- Nginx 配置文件
- 备份信息文件（包含备份时间和配置详情）

**备份位置**：`/opt/uniproxy-panel/backups/`

**示例**：

```
[INFO] 正在备份配置...
[SUCCESS] 配置已备份到: /opt/uniproxy-panel/backups/config_backup_20260209_120000.tar.gz
```

### 7. 恢复配置

**用途**：从备份恢复配置文件

**步骤**：

1. 选择菜单选项 `7`
2. 工具会列出所有可用的备份
3. 选择要恢复的备份
4. 确认后，工具会：
   - 解压备份文件
   - 恢复配置文件
   - 重启服务

**示例**：

```
可用的备份：

  1. 2026-02-09 12:00:00
  2. 2026-02-08 18:30:00
  3. 2026-02-07 10:15:00

请选择要恢复的备份 (1-3) 或按 0 取消: 1

警告：恢复配置将覆盖当前配置

确认恢复？(y/N): y

[INFO] 正在恢复配置...
[INFO] 重启服务...
[SUCCESS] 配置已恢复
```

## 🛡️ 安全特性

### 1. Root 权限检查

工具启动时会检查是否为 root 用户，非 root 用户无法执行配置修改。

### 2. 自动备份

所有配置修改前都会自动创建备份文件，格式为：

```
config.yaml.backup.20260209_120000
nginx_config.backup.20260209_120000
```

### 3. 配置验证

- 端口号范围验证（1024-65535）
- 路径存在性检查
- Nginx 配置语法测试（`nginx -t`）
- SSL 证书文件存在性验证

### 4. 操作确认

所有重要操作（修改端口、修改路径、配置 SSL 等）都需要用户明确确认。

### 5. 回滚机制

如果配置测试失败，工具会自动恢复备份文件。

## 📋 常见问题

### Q1: 工具提示"请使用 root 用户或 sudo 运行"

**原因**：配置管理需要修改系统文件和重启服务，必须使用 root 权限。

**解决方案**：

```bash
sudo uniproxy-config
```

### Q2: 修改端口后，前端仍然显示 502 错误

**可能原因**：

1. 后端服务未正常启动
2. 防火墙阻止了新端口
3. 配置文件修改不完整

**诊断步骤**：

```bash
# 1. 检查后端服务状态
sudo systemctl status uniproxy-panel

# 2. 查看后端日志
sudo journalctl -u uniproxy-panel -n 50

# 3. 检查端口监听
sudo ss -tlnp | grep uniproxy-panel

# 4. 检查 Nginx 配置
grep "proxy_pass" /etc/nginx/sites-available/uniproxy-panel

# 5. 使用工具查看系统状态
sudo uniproxy-config
# 选择选项 4 查看系统状态
```

### Q3: Let's Encrypt 证书申请失败

**可能原因**：

1. 域名未解析到服务器
2. 80 端口无法从外网访问
3. 防火墙阻止了 Let's Encrypt 验证

**解决方案**：

```bash
# 1. 检查域名解析
nslookup your-domain.com

# 2. 检查 80 端口是否开放
sudo netstat -tlnp | grep :80

# 3. 检查防火墙规则
sudo ufw status
# 如果 80 端口被阻止，开放它：
sudo ufw allow 80/tcp

# 4. 测试外网访问
curl -I http://your-domain.com
```

### Q4: 恢复配置后服务无法启动

**可能原因**：

1. 备份文件损坏
2. 配置文件格式错误
3. 端口被占用

**解决方案**：

```bash
# 1. 查看服务日志
sudo journalctl -u uniproxy-panel -n 100

# 2. 检查配置文件语法
sudo nginx -t

# 3. 尝试恢复到更早的备份
sudo uniproxy-config
# 选择选项 7，选择更早的备份

# 4. 如果所有备份都失败，重新运行安装脚本
cd /root/AI-
git pull
sudo bash setup.sh
```

### Q5: 工具提示"找不到配置文件"

**原因**：UniProxy Panel 未正确安装或配置文件被删除。

**解决方案**：

```bash
# 1. 检查配置文件是否存在
ls -la /opt/uniproxy-panel/backend/config.yaml
ls -la /etc/nginx/sites-available/uniproxy-panel

# 2. 如果文件不存在，重新运行安装脚本
cd /root/AI-
git pull
sudo bash setup.sh
```

## 🔄 更新工具

### 方法 1：从 GitHub 更新

```bash
cd /root/AI-
git pull
sudo cp uniproxy-config /usr/local/bin/
```

### 方法 2：直接下载最新版本

```bash
sudo curl -o /usr/local/bin/uniproxy-config https://raw.githubusercontent.com/wenxin-99/AI-/main/uniproxy-config
sudo chmod +x /usr/local/bin/uniproxy-config
```

## 📚 相关文档

- [一键安装脚本使用指南](./README.md)
- [端口配置说明](./PORT_CONFIGURATION.md)
- [端口智能检测修复指南](./PORT_FIX_GUIDE.md)
- [故障排查指南](./TROUBLESHOOTING.md)

## 💡 最佳实践

### 1. 定期备份配置

建议在进行重要修改前手动创建备份：

```bash
sudo uniproxy-config
# 选择选项 6 备份配置
```

### 2. 测试修改效果

修改配置后，使用"查看系统状态"功能验证：

```bash
sudo uniproxy-config
# 选择选项 4 查看系统状态
```

### 3. 记录配置变更

建议在修改配置时记录变更原因和时间，便于后续排查问题。

### 4. 使用 SSL 证书

强烈建议为生产环境启用 SSL 证书，保护数据传输安全。

### 5. 监控证书有效期

如果使用 Let's Encrypt，证书会自动续期。如果使用商业证书，请注意证书有效期：

```bash
# 查看证书有效期
openssl x509 -in /path/to/cert.crt -noout -dates
```

## 🆘 获取帮助

如果遇到问题，可以：

1. 查看本文档的"常见问题"部分
2. 查看 [故障排查指南](./TROUBLESHOOTING.md)
3. 在 GitHub 上提交 Issue: https://github.com/wenxin-99/AI-/issues
4. 联系技术支持

## 📝 更新日志

### v1.0.0 (2026-02-09)

**初始版本**：

- ✅ 交互式配置管理界面
- ✅ 端口管理功能
- ✅ 前端路径管理
- ✅ SSL 证书配置（手动和 Let's Encrypt）
- ✅ 系统状态查看
- ✅ 服务管理
- ✅ 配置备份和恢复
- ✅ 自动验证和回滚机制

---

**提示**: 使用 `sudo uniproxy-config` 启动工具，按照提示操作即可轻松管理 UniProxy Panel 配置。
