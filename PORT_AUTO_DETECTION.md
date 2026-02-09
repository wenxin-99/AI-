# 端口自动检测和智能分配功能说明

## 📖 概述

一键安装脚本 `setup.sh` 已集成**端口自动检测和智能分配**功能，可以自动解决端口冲突和配置不一致的问题。

## ✨ 功能特性

### 1. 智能端口分配

脚本会按照优先级自动选择可用端口：

**优先级列表**：
1. 8080（默认）
2. 8081
3. 8082
4. 8083
5. 8084
6. 8085
7. 9000
8. 9001

**工作流程**：
1. 检测每个端口是否被占用
2. 选择第一个可用端口
3. 更新后端配置文件
4. 同步 Nginx 代理配置

### 2. 精确配置修改

使用 `awk` 精确匹配，确保只修改 `server` 块中的 `port` 配置，避免误修改数据库端口等其他配置。

**配置文件示例**：

```yaml
server:
  host: 0.0.0.0
  port: 8080        # ← 只修改这个端口

database:
  host: localhost
  port: 3306        # ← 不会修改这个端口
```

### 3. 部署后自动验证

部署完成后，脚本会自动验证：

1. **检测实际监听端口**
   - 使用 `ss` 或 `netstat` 检测后端实际监听的端口
   - 显示实际监听端口信息

2. **检测配置一致性**
   - 比对配置端口和实际监听端口
   - 如果不一致，自动修复

3. **自动修复 Nginx 配置**
   - 如果检测到端口不一致
   - 自动更新 Nginx 配置为实际监听端口
   - 重新加载 Nginx 服务

4. **测试 API 响应**
   - 测试后端 API 是否正常响应
   - 测试 Nginx 代理是否工作正常

## 🚀 使用方法

### 方式 1: 重新运行一键安装脚本

```bash
cd /root/AI-
git pull origin main
sudo bash setup.sh
```

脚本会自动：
- 选择可用端口
- 更新配置文件
- 验证端口一致性
- 自动修复配置

### 方式 2: 使用配置管理工具

```bash
sudo uniproxy-config
# 选择选项 1: 修改后端端口
```

### 方式 3: 手动修复（如果自动修复失败）

```bash
# 1. 检测后端实际监听端口
sudo ss -tlnp | grep uniproxy-panel

# 假设输出显示监听在 2053 端口
# LISTEN 0  65535  *:2053  *:*  users:(("uniproxy-panel",pid=12345,fd=6))

# 2. 更新 Nginx 配置
sudo sed -i 's/127\.0\.0\.1:[0-9]\+/127.0.0.1:2053/g' /etc/nginx/sites-available/uniproxy-panel

# 3. 测试并重新加载 Nginx
sudo nginx -t
sudo systemctl reload nginx

# 4. 验证修复
curl -v http://localhost/api/v1/system/info
```

## 🔍 问题诊断

### 问题 1: 端口仍然不一致

**症状**：
- 部署完成后仍然出现 502 Bad Gateway
- 后端日志显示监听在某个端口，但 Nginx 配置是另一个端口

**诊断步骤**：

```bash
# 1. 查看后端配置的端口
grep "port:" /opt/uniproxy-panel/backend/config.yaml

# 2. 查看后端实际监听的端口
sudo ss -tlnp | grep uniproxy-panel

# 3. 查看 Nginx 配置的端口
grep "proxy_pass" /etc/nginx/sites-available/uniproxy-panel

# 4. 查看后端日志
sudo journalctl -u uniproxy-panel -n 50
```

**解决方案**：

如果配置文件、实际监听、Nginx 配置三者不一致，说明自动修复未生效。手动执行：

```bash
# 获取实际监听端口
ACTUAL_PORT=$(sudo ss -tlnp | grep uniproxy-panel | grep -oP ':\K[0-9]+' | head -1)
echo "实际监听端口: $ACTUAL_PORT"

# 更新 Nginx 配置
sudo sed -i "s/127\.0\.0\.1:[0-9]\+/127.0.0.1:$ACTUAL_PORT/g" /etc/nginx/sites-available/uniproxy-panel

# 重新加载 Nginx
sudo nginx -t && sudo systemctl reload nginx
```

### 问题 2: 配置文件有多个 port 字段

**症状**：
- 脚本修改了错误的 port 字段
- 后端启动时使用了错误的端口

**原因**：
配置文件中有多个 `port` 字段（如数据库端口、服务器端口），脚本误修改了数据库端口。

**解决方案**：

最新版本的脚本已使用 `awk` 精确匹配，只修改 `server` 块中的 `port`。如果仍有问题，手动编辑配置文件：

```bash
sudo nano /opt/uniproxy-panel/backend/config.yaml
```

确保 `server` 块中的 `port` 是期望的端口：

```yaml
server:
  host: 0.0.0.0
  port: 8080        # ← 修改为期望的端口
```

保存后重启服务：

```bash
sudo systemctl restart uniproxy-panel
```

### 问题 3: 所有端口都被占用

**症状**：
- 脚本提示"所有预设端口都被占用"
- 强制使用 8080 但仍然冲突

**解决方案**：

**方案 1**: 停止占用端口的服务

```bash
# 查看占用 8080 端口的进程
sudo ss -tlnp | grep :8080

# 假设输出显示进程 PID 为 12345
# 停止该进程
sudo kill 12345

# 或停止对应的服务
sudo systemctl stop <service-name>
```

**方案 2**: 手动指定其他端口

编辑配置文件，使用一个未被占用的端口：

```bash
# 查找可用端口
for port in {10000..10100}; do
    if ! sudo ss -tlnp | grep -q ":$port "; then
        echo "端口 $port 可用"
        break
    fi
done

# 假设找到 10001 可用
sudo nano /opt/uniproxy-panel/backend/config.yaml
# 修改 server.port 为 10001

# 更新 Nginx 配置
sudo sed -i 's/127\.0\.0\.1:[0-9]\+/127.0.0.1:10001/g' /etc/nginx/sites-available/uniproxy-panel

# 重启服务
sudo systemctl restart uniproxy-panel
sudo systemctl reload nginx
```

## 📊 验证部署成功

部署完成后，执行以下命令验证：

```bash
# 1. 检查后端服务状态
sudo systemctl status uniproxy-panel

# 2. 检查后端监听端口
sudo ss -tlnp | grep uniproxy-panel

# 3. 检查 Nginx 配置
grep "proxy_pass" /etc/nginx/sites-available/uniproxy-panel

# 4. 测试后端 API
BACKEND_PORT=$(sudo ss -tlnp | grep uniproxy-panel | grep -oP ':\K[0-9]+' | head -1)
curl -v http://127.0.0.1:$BACKEND_PORT/api/v1/system/info

# 5. 测试 Nginx 代理
curl -v http://localhost/api/v1/system/info

# 6. 测试前端访问
curl -v http://localhost/
```

**预期结果**：
- 后端服务状态：`active (running)`
- 后端 API 返回：HTTP 200 或 JSON 响应
- Nginx 代理返回：HTTP 200 或 JSON 响应
- 前端访问返回：HTML 页面

## 🛠️ 技术细节

### 端口检测方法

脚本使用两种方法检测端口占用：

**方法 1: ss 命令**（推荐）

```bash
ss -tlnp 2>/dev/null | grep ":$port "
```

**方法 2: netstat 命令**（备用）

```bash
netstat -tlnp 2>/dev/null | grep ":$port "
```

### 配置文件修改方法

**旧方法**（有问题）：

```bash
sed -i "/^server:/,/^[a-z]/ s/^  port: *[0-9]\+/  port: $CONFIG_PORT/" "$ACTIVE_CONFIG"
```

**问题**：可能匹配到其他块中的 port 字段

**新方法**（精确）：

```bash
awk -v port="$CONFIG_PORT" '
/^server:/ { in_server=1 }
in_server && /^  port:/ && !port_replaced { 
    print "  port: " port
    port_replaced=1
    next
}
/^[a-z]/ && !/^server:/ { in_server=0 }
{ print }
' "$ACTIVE_CONFIG" > "${ACTIVE_CONFIG}.tmp" && mv "${ACTIVE_CONFIG}.tmp" "$ACTIVE_CONFIG"
```

**优势**：
- 只在 `server` 块内生效
- 只替换第一个匹配的 `port`
- 不会影响其他块（如 `database`）

### 自动修复逻辑

```bash
# 1. 检测实际监听端口
LISTENING_PORT=$(ss -tlnp 2>/dev/null | grep uniproxy-panel | grep -oP ':\K[0-9]+' | head -1)

# 2. 比对配置端口
if [ "$LISTENING_PORT" != "$BACKEND_PORT" ]; then
    # 3. 自动更新 Nginx 配置
    sed -i "s/127\.0\.0\.1:[0-9]\+/127.0.0.1:$LISTENING_PORT/g" /etc/nginx/sites-available/uniproxy-panel
    
    # 4. 重新加载 Nginx
    nginx -t && systemctl reload nginx
fi
```

## 📚 相关文档

- [一键安装脚本使用指南](./README.md)
- [端口配置说明](./PORT_CONFIGURATION.md)
- [配置管理工具使用指南](./UNIPROXY_CONFIG_GUIDE.md)
- [生产环境部署指南](./PRODUCTION_DEPLOYMENT_GUIDE.md)

## 💡 最佳实践

1. **使用默认端口**
   - 优先使用 8080 端口
   - 避免使用特殊端口（如 80、443、3306）

2. **定期检查端口状态**
   - 使用 `sudo ss -tlnp` 查看所有监听端口
   - 确保没有端口冲突

3. **保留配置文件备份**
   - 脚本会自动备份配置文件
   - 备份文件位于 `${CONFIG_FILE}.backup.YYYYMMDD_HHMMSS`

4. **查看部署日志**
   - 脚本会显示详细的部署过程
   - 保存日志以便后续排查问题

## 🆘 获取帮助

如果遇到问题，可以：

1. 查看本文档的"问题诊断"部分
2. 查看 [故障排查指南](./TROUBLESHOOTING.md)
3. 在 GitHub 上提交 Issue: https://github.com/wenxin-99/AI-/issues
4. 联系技术支持

---

**提示**: 如果端口配置仍然有问题，可以重新运行 `sudo bash setup.sh`，脚本会自动检测并修复端口配置。
