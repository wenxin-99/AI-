# 端口智能配置说明

UniProxy Panel 一键安装脚本现已支持端口智能检测和自动配置功能。

## 🎯 功能特性

### 1. 自动端口检测

安装脚本会自动检测后端配置文件中的端口设置：

```bash
# 检测配置文件中的端口
CONFIG_PORT=$(grep -E "^  port:" "$ACTIVE_CONFIG" | awk '{print $2}' | head -1)
```

### 2. 端口冲突检测

如果检测到端口被占用，自动尝试使用备用端口：

```bash
# 检查端口是否被占用
if ss -tlnp | grep -q ":$CONFIG_PORT "; then
    print_warning "端口 $CONFIG_PORT 已被占用"
    # 尝试使用备用端口: 8080, 8081, 8082, 8083, 8084, 8085
fi
```

### 3. 前后端端口自动同步

Nginx 配置会自动使用后端实际监听的端口：

```nginx
location /api {
    proxy_pass http://127.0.0.1:$BACKEND_PORT;  # 动态端口
}
```

## 📝 使用方法

### 全新安装

```bash
# 下载并运行安装脚本
sudo bash setup.sh
```

脚本会自动：
1. 检测配置文件中的端口（默认 8080）
2. 检查端口是否被占用
3. 如果被占用，自动选择可用端口
4. 配置 Nginx 代理到正确的后端端口
5. 显示最终使用的端口信息

### 更新现有安装

如果您已经安装了 UniProxy Panel，但遇到端口不匹配问题：

```bash
# 方法 1: 重新运行安装脚本
sudo bash setup.sh

# 方法 2: 手动修复端口配置
# 1. 检查后端配置的端口
grep "port:" /opt/uniproxy-panel/backend/config.yaml

# 2. 修改 Nginx 配置
sudo nano /etc/nginx/sites-available/uniproxy-panel
# 将 proxy_pass http://127.0.0.1:8080 改为实际端口

# 3. 重新加载 Nginx
sudo nginx -t
sudo systemctl reload nginx
```

## 🔧 端口配置详解

### 配置文件位置

后端配置文件可能在以下位置之一：
- `/opt/uniproxy-panel/config.yaml`
- `/opt/uniproxy-panel/backend/config.yaml`

### 端口配置格式

```yaml
server:
  host: "0.0.0.0"
  port: 8080  # 后端监听端口
  mode: "release"
```

### 默认端口

- **后端默认端口**: 8080
- **备用端口列表**: 8080, 8081, 8082, 8083, 8084, 8085
- **前端端口**: 80 (Nginx)

## 🚀 工作流程

### 1. 端口检测阶段

```
检测配置文件 → 读取端口配置 → 检查端口占用 → 选择可用端口
```

### 2. 配置更新阶段

```
备份配置文件 → 更新端口配置 → 保存环境变量
```

### 3. Nginx 配置阶段

```
生成 Nginx 配置 → 使用动态端口 → 测试配置 → 重启服务
```

### 4. 验证阶段

```
检查后端服务 → 检查 Nginx 服务 → 显示访问信息
```

## 📊 端口状态检查

### 查看当前端口配置

```bash
# 查看后端配置端口
grep "port:" /opt/uniproxy-panel/backend/config.yaml

# 查看 Nginx 代理端口
grep "proxy_pass" /etc/nginx/sites-available/uniproxy-panel

# 查看实际监听端口
sudo ss -tlnp | grep uniproxy-panel
```

### 查看端口占用情况

```bash
# 使用 ss 命令
sudo ss -tlnp | grep :8080

# 使用 netstat 命令（如果已安装）
sudo netstat -tlnp | grep :8080

# 使用 lsof 命令（如果已安装）
sudo lsof -i :8080
```

## 🐛 常见问题

### Q1: 为什么会出现端口不匹配？

**原因**：
- 后端配置文件中的端口与 Nginx 配置不一致
- 手动修改了配置文件但未同步更新 Nginx
- 使用了旧版本的安装脚本

**解决方案**：
使用新版本的安装脚本重新部署，或手动同步端口配置。

### Q2: 如何自定义后端端口？

**方法 1**：修改配置文件后重新运行安装脚本

```bash
# 1. 修改配置文件
sudo nano /opt/uniproxy-panel/backend/config.yaml
# 将 port 改为你想要的端口，例如 9000

# 2. 重新运行安装脚本
sudo bash setup.sh
```

**方法 2**：手动修改并同步配置

```bash
# 1. 修改后端配置
sudo nano /opt/uniproxy-panel/backend/config.yaml

# 2. 修改 Nginx 配置
sudo nano /etc/nginx/sites-available/uniproxy-panel
# 将所有 proxy_pass 中的端口改为新端口

# 3. 重启服务
sudo systemctl restart uniproxy-panel
sudo systemctl reload nginx
```

### Q3: 端口被占用怎么办？

**检查占用进程**：

```bash
sudo ss -tlnp | grep :8080
```

**选项 1**：停止占用端口的进程

```bash
# 查找进程 PID
sudo lsof -i :8080

# 停止进程
sudo kill <PID>
```

**选项 2**：让安装脚本自动选择可用端口

```bash
# 重新运行安装脚本，它会自动选择可用端口
sudo bash setup.sh
```

**选项 3**：手动指定其他端口

修改配置文件使用其他端口（如 8081、8082 等）。

### Q4: 如何验证端口配置是否正确？

```bash
# 1. 检查后端是否在正确的端口监听
sudo ss -tlnp | grep uniproxy-panel

# 2. 测试后端 API
BACKEND_PORT=$(grep "port:" /opt/uniproxy-panel/backend/config.yaml | awk '{print $2}')
curl -v http://127.0.0.1:$BACKEND_PORT/api/v1/system/info

# 3. 检查 Nginx 代理配置
grep "proxy_pass" /etc/nginx/sites-available/uniproxy-panel

# 4. 测试完整访问链路
curl -v http://localhost/api/v1/system/info
```

## 💡 最佳实践

### 1. 使用标准端口

建议使用标准端口以便记忆和管理：
- **8080**: 最常用的备用 HTTP 端口
- **8081-8085**: 备用端口

### 2. 定期检查配置

```bash
# 创建检查脚本
cat > /usr/local/bin/check-uniproxy-ports.sh <<'EOF'
#!/bin/bash
echo "=== UniProxy Panel 端口检查 ==="
echo ""
echo "后端配置端口:"
grep "port:" /opt/uniproxy-panel/backend/config.yaml
echo ""
echo "Nginx 代理端口:"
grep "proxy_pass" /etc/nginx/sites-available/uniproxy-panel | grep -o ":[0-9]*"
echo ""
echo "实际监听端口:"
sudo ss -tlnp | grep uniproxy-panel
EOF

chmod +x /usr/local/bin/check-uniproxy-ports.sh

# 运行检查
check-uniproxy-ports.sh
```

### 3. 文档化自定义配置

如果使用了非标准端口，建议记录在配置文件中：

```yaml
# /opt/uniproxy-panel/backend/config.yaml
server:
  host: "0.0.0.0"
  port: 9000  # 自定义端口，原因：8080 被其他服务占用
  mode: "release"
```

## 📚 相关文档

- [一键安装脚本使用指南](./README.md)
- [Nginx 配置说明](./NGINX_CONFIGURATION.md)
- [故障排查指南](./TROUBLESHOOTING.md)

## 🔄 更新日志

### 2026-02-09

- ✅ 添加端口智能检测功能
- ✅ 添加端口冲突自动处理
- ✅ 实现前后端端口自动同步
- ✅ 优化安装脚本用户体验
- ✅ 添加详细的端口信息显示

---

**提示**: 如果您在使用过程中遇到任何端口相关的问题，请先运行 `check-uniproxy-ports.sh` 检查配置是否一致。
