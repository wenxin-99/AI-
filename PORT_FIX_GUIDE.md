# 端口智能检测修复指南

## 🎯 问题背景

在之前的版本中，一键安装脚本的端口检测逻辑存在以下问题：

1. **检测但不修改**：脚本检测到配置文件中的端口（如 2053），但没有强制改为标准端口
2. **前后端不一致**：后端配置保持原端口，Nginx 配置使用硬编码的 8080
3. **缺少验证**：没有验证实际监听端口是否与配置一致

## ✅ 修复方案

### 1. 智能端口分配策略

**新逻辑**：优先使用标准端口 8080，如果被占用则自动尝试备用端口

```bash
# 目标端口列表（按优先级）
TARGET_PORTS=(8080 8081 8082 8083 8084 8085 9000 9001)

# 遍历端口列表，找到第一个可用端口
for port in "${TARGET_PORTS[@]}"; do
    if check_port_available $port; then
        CONFIG_PORT=$port
        break
    fi
done
```

### 2. 精确的配置修改

**问题**：之前使用 `s/port: *[0-9]\+/port: $CONFIG_PORT/g` 会误改所有 port 配置（包括 MySQL 端口）

**修复**：只修改 server 部分的 port 配置

```bash
# 只替换 server 部分的 port 配置
sed -i "/^server:/,/^[a-z]/ s/^  port: *[0-9]\+/  port: $CONFIG_PORT/" "$ACTIVE_CONFIG"
```

### 3. 端口验证机制

**新增**：启动后验证实际监听端口是否与配置一致

```bash
# 检测实际监听端口
LISTENING_PORT=$(ss -tlnp 2>/dev/null | grep uniproxy-panel | grep -oP ':\K[0-9]+' | head -1)

# 对比配置端口
if [ "$LISTENING_PORT" != "$BACKEND_PORT" ]; then
    print_error "警告：实际监听端口与配置端口不一致！"
fi
```

### 4. 完整的功能测试

**新增**：自动测试后端 API 和 Nginx 代理

```bash
# 测试后端 API
curl -s -f -m 5 "http://127.0.0.1:$BACKEND_PORT/api/v1/system/info"

# 测试 Nginx 代理
curl -s -f -m 5 "http://localhost/api/v1/system/info"
```

## 📝 使用方法

### 全新安装

```bash
# 1. 下载最新代码
cd /root
git clone https://github.com/wenxin-99/AI-.git
cd AI-

# 2. 运行安装脚本
sudo bash setup.sh
```

**脚本会自动**：
1. 检测 8080 端口是否可用
2. 如果被占用，自动尝试 8081、8082 等备用端口
3. 修改后端配置文件使用选定的端口
4. 配置 Nginx 代理到正确的端口
5. 验证端口监听和 API 响应
6. 显示最终使用的端口信息

### 修复现有安装

如果您已经安装了 UniProxy Panel，但遇到端口不匹配问题：

**方法 1：使用智能修复脚本**

```bash
# 下载最新代码
cd /root/AI-
git pull

# 运行智能修复脚本
sudo bash fix-port-smart.sh
```

**方法 2：重新运行安装脚本**

```bash
cd /root/AI-
git pull
sudo bash setup.sh
```

**方法 3：手动修复**

```bash
# 1. 检查后端实际监听端口
sudo ss -tlnp | grep uniproxy-panel

# 假设输出显示监听在 2053 端口
# LISTEN 0  65535  *:2053  *:*  users:(("uniproxy-panel",pid=12345,fd=6))

# 2. 修改 Nginx 配置
sudo sed -i 's/127\.0\.0\.1:8080/127.0.0.1:2053/g' /etc/nginx/sites-available/uniproxy-panel

# 3. 验证修改
grep "proxy_pass" /etc/nginx/sites-available/uniproxy-panel

# 4. 测试并重新加载 Nginx
sudo nginx -t
sudo systemctl reload nginx

# 5. 测试访问
curl http://localhost/api/v1/system/info
```

## 🔍 调试信息

### 安装过程中的输出

新版本脚本会显示详细的调试信息：

```
[INFO] 开始智能端口分配...
[INFO] 配置文件原始端口: 2053
[WARNING] 端口 8080 已被占用，尝试下一个...
[SUCCESS] 选择可用端口: 8081
[INFO] 更新配置文件端口为: 8081
[SUCCESS] 端口配置更新成功: 8081
[INFO] 配置 Nginx 代理到后端端口: 8081
[INFO] 重启后端服务...
[SUCCESS] 后端服务运行正常
[INFO] 验证端口监听状态...
[SUCCESS] 后端实际监听端口: 8081
[INFO] 测试后端 API 响应...
[SUCCESS] 后端 API 响应正常
[INFO] 测试 Nginx 代理功能...
[SUCCESS] Nginx 代理工作正常
```

### 查看端口配置

```bash
# 查看后端配置端口
grep "port:" /opt/uniproxy-panel/backend/config.yaml

# 查看实际监听端口
sudo ss -tlnp | grep uniproxy-panel

# 查看 Nginx 代理端口
grep "proxy_pass" /etc/nginx/sites-available/uniproxy-panel
```

### 测试端口连通性

```bash
# 获取后端端口
BACKEND_PORT=$(grep "port:" /opt/uniproxy-panel/backend/config.yaml | awk '{print $2}' | head -1)

# 测试后端直连
curl -v http://127.0.0.1:$BACKEND_PORT/api/v1/system/info

# 测试 Nginx 代理
curl -v http://localhost/api/v1/system/info
```

## 🐛 常见问题

### Q1: 为什么脚本选择了 8081 而不是 8080？

**原因**：8080 端口已被其他服务占用

**解决方案**：
- 选项 1：接受使用 8081 端口（推荐）
- 选项 2：停止占用 8080 的服务，重新运行安装脚本

```bash
# 查看占用 8080 的进程
sudo ss -tlnp | grep :8080

# 停止进程（替换 <PID> 为实际进程 ID）
sudo kill <PID>

# 重新运行安装脚本
sudo bash setup.sh
```

### Q2: 安装后仍然显示 502 错误

**可能原因**：
1. 后端服务未正常启动
2. 端口配置仍然不一致
3. 防火墙阻止了端口访问

**诊断步骤**：

```bash
# 1. 检查后端服务状态
sudo systemctl status uniproxy-panel

# 2. 查看后端日志
sudo journalctl -u uniproxy-panel -n 50

# 3. 检查端口监听
sudo ss -tlnp | grep uniproxy-panel

# 4. 检查 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 5. 运行智能修复脚本
sudo bash /root/AI-/fix-port-smart.sh
```

### Q3: 如何强制使用特定端口？

**方法**：修改配置文件后重新运行安装脚本

```bash
# 1. 修改配置文件
sudo nano /opt/uniproxy-panel/backend/config.yaml

# 将 port 改为你想要的端口，例如 9000
server:
  host: "0.0.0.0"
  port: 9000  # 修改这里
  mode: "release"

# 2. 确保该端口未被占用
sudo ss -tlnp | grep :9000

# 3. 重新运行安装脚本
cd /root/AI-
sudo bash setup.sh
```

### Q4: 脚本提示"所有预设端口都被占用"

**原因**：8080-8085 和 9000-9001 所有端口都被占用

**解决方案**：

**选项 1**：释放某个端口

```bash
# 查看端口占用情况
for port in 8080 8081 8082 8083 8084 8085 9000 9001; do
    echo "Port $port:"
    sudo ss -tlnp | grep :$port
done

# 选择一个可以停止的服务并停止它
sudo systemctl stop <service-name>
```

**选项 2**：添加自定义端口到脚本

```bash
# 编辑 setup.sh
sudo nano /root/AI-/setup.sh

# 找到这一行：
TARGET_PORTS=(8080 8081 8082 8083 8084 8085 9000 9001)

# 添加你的自定义端口，例如：
TARGET_PORTS=(8080 8081 8082 8083 8084 8085 9000 9001 10000 10001)

# 保存并重新运行
sudo bash setup.sh
```

## 📊 端口使用建议

### 推荐端口

| 端口 | 用途 | 优先级 |
|------|------|--------|
| 8080 | 标准备用 HTTP 端口 | ⭐⭐⭐⭐⭐ |
| 8081 | 第一备用端口 | ⭐⭐⭐⭐ |
| 8082 | 第二备用端口 | ⭐⭐⭐ |
| 9000 | 通用应用端口 | ⭐⭐ |

### 避免使用的端口

- **80**: HTTP 标准端口（已被 Nginx 占用）
- **443**: HTTPS 标准端口
- **3306**: MySQL 默认端口
- **5432**: PostgreSQL 默认端口
- **6379**: Redis 默认端口
- **22**: SSH 端口

## 🔄 更新日志

### 2026-02-09 v2

**主要改进**：
- ✅ 改为优先使用 8080 端口，被占用时自动尝试备用端口
- ✅ 使用更精确的 sed 匹配，避免误改其他配置
- ✅ 添加端口验证和实际监听检测
- ✅ 添加后端 API 和 Nginx 代理自动测试
- ✅ 完善错误提示和调试信息
- ✅ 修复 Nginx 配置使用动态端口变量

**修复的问题**：
- ❌ 端口检测但不修改的问题
- ❌ 前后端端口不一致的问题
- ❌ 缺少端口验证的问题
- ❌ sed 误改其他配置的问题

### 2026-02-09 v1

**初始版本**：
- ✅ 添加基本的端口检测功能
- ✅ 支持端口冲突检测
- ✅ Nginx 配置使用动态端口

**已知问题**：
- ❌ 检测到端口但不修改配置
- ❌ 前后端端口可能不一致

## 📚 相关文档

- [端口配置说明](./PORT_CONFIGURATION.md)
- [一键安装脚本使用指南](./README.md)
- [智能修复脚本说明](./fix-port-smart.sh)
- [故障排查指南](./TROUBLESHOOTING.md)

## 💡 最佳实践

### 1. 使用标准端口

优先使用 8080 端口，这是最常用的备用 HTTP 端口，便于记忆和管理。

### 2. 定期检查配置

```bash
# 创建定期检查脚本
cat > /usr/local/bin/check-uniproxy.sh <<'EOF'
#!/bin/bash
echo "=== UniProxy Panel 配置检查 ==="
echo ""
echo "后端配置端口:"
grep "port:" /opt/uniproxy-panel/backend/config.yaml | head -1
echo ""
echo "实际监听端口:"
sudo ss -tlnp | grep uniproxy-panel
echo ""
echo "Nginx 代理端口:"
grep "proxy_pass" /etc/nginx/sites-available/uniproxy-panel | head -1
echo ""
echo "后端 API 测试:"
BACKEND_PORT=$(grep "port:" /opt/uniproxy-panel/backend/config.yaml | awk '{print $2}' | head -1)
curl -s -f -m 5 "http://127.0.0.1:$BACKEND_PORT/api/v1/system/info" && echo "✓ 正常" || echo "✗ 失败"
echo ""
echo "Nginx 代理测试:"
curl -s -f -m 5 "http://localhost/api/v1/system/info" && echo "✓ 正常" || echo "✗ 失败"
EOF

chmod +x /usr/local/bin/check-uniproxy.sh

# 运行检查
check-uniproxy.sh
```

### 3. 设置监控告警

```bash
# 添加到 crontab，每 5 分钟检查一次
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/check-uniproxy.sh > /tmp/uniproxy-check.log 2>&1") | crontab -
```

### 4. 文档化自定义配置

如果使用了非标准端口，建议在配置文件中添加注释：

```yaml
# /opt/uniproxy-panel/backend/config.yaml
server:
  host: "0.0.0.0"
  port: 8081  # 使用 8081 因为 8080 被其他服务占用 (2026-02-09)
  mode: "release"
```

---

**提示**: 如果您在使用过程中遇到任何端口相关的问题，请先运行 `check-uniproxy.sh` 检查配置是否一致，然后运行 `fix-port-smart.sh` 自动修复。
