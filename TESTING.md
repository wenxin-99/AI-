# UniProxy Panel 测试指南

本文档说明如何测试节点监控和心跳功能。

## 🧪 测试节点认证和心跳功能

### 前置条件

1. 后端服务正在运行（默认端口 8080）
2. 已创建至少一个节点并获取 API Token

### 获取 API Token

1. 登录 UniProxy Panel 管理面板
2. 进入「节点管理」页面
3. 点击「添加节点」按钮
4. 在弹出的对话框中，系统会自动生成 API Token
5. 复制该 Token 用于测试

### 运行测试脚本

```bash
# 设置环境变量并运行测试
cd /home/ubuntu/AI-
API_TOKEN="your_api_token_here" ./test-heartbeat.sh

# 如果面板不在 localhost:8080，可以指定地址
PANEL_URL="https://your-domain.com" API_TOKEN="your_token" ./test-heartbeat.sh
```

### 测试内容

测试脚本会执行以下验证：

1. **无认证访问测试** - 验证未提供 Token 时返回 401
2. **错误 Token 测试** - 验证错误的 Token 被拒绝
3. **正确 Token 测试** - 验证正确的 Token 可以成功上报心跳
4. **Query 参数测试** - 验证通过 URL 参数传递 Token
5. **监控数据获取** - 验证可以获取节点监控数据

### 预期结果

所有测试应该显示 `✓ 通过`，示例输出：

```
========================================
节点心跳测试脚本
========================================

配置信息:
面板地址: http://localhost:8080
API Token: abc1234567...xyz9876543

[测试 1] 无认证访问心跳接口...
✓ 通过 - 无认证访问被正确拒绝 (HTTP 401)

[测试 2] 使用错误的 Token...
✓ 通过 - 错误 Token 被正确拒绝 (HTTP 401)

[测试 3] 使用正确的 Token 发送心跳...
✓ 通过 - 心跳上报成功 (HTTP 200)

[测试 4] 使用 Query 参数传递 Token...
✓ 通过 - Query 参数认证成功 (HTTP 200)

[测试 5] 获取节点监控数据...
✓ 通过 - 获取监控数据成功 (HTTP 200)

========================================
测试完成
========================================
```

## 🔧 手动测试心跳 API

如果需要手动测试，可以使用 curl 命令：

### 使用 Authorization Header

```bash
curl -X POST http://localhost:8080/api/node/heartbeat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -d '{
    "status": "online",
    "cpu_usage": 25.5,
    "memory_usage": 60.2,
    "disk_usage": 45.8,
    "network_in": 1024000,
    "network_out": 2048000,
    "uptime": 86400,
    "xray_status": "running",
    "gost_status": "running"
  }'
```

### 使用 Query 参数

```bash
curl -X POST "http://localhost:8080/api/node/heartbeat?token=YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "online",
    "cpu_usage": 25.5,
    "memory_usage": 60.2
  }'
```

### 获取监控数据

```bash
curl http://localhost:8080/api/node/monitor/data \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

## 📊 验证面板状态

测试成功后，在面板中验证：

1. 进入「监控中心」页面
2. 查看节点列表，状态应该显示为「在线」
3. 点击节点名称查看详细监控数据
4. 确认 CPU、内存、磁盘等指标正确显示
5. 查看历史图表是否有数据点

## 🐛 常见问题

### 测试失败：连接被拒绝

**原因**: 后端服务未启动或端口不正确

**解决方案**:
```bash
# 检查服务状态
sudo systemctl status uniproxy-panel

# 检查端口监听
sudo netstat -tlnp | grep 8080

# 重启服务
sudo systemctl restart uniproxy-panel
```

### 测试失败：401 Unauthorized

**原因**: API Token 无效或已过期

**解决方案**:
1. 在面板中重新生成 API Token
2. 确保复制的 Token 完整无误
3. 检查数据库中节点的 api_token 字段

### 节点显示"从未连接"

**原因**: 节点 agent 未正确配置或未运行

**解决方案**:
```bash
# 检查 agent 服务状态
sudo systemctl status uniproxy-agent

# 查看 agent 日志
sudo journalctl -u uniproxy-agent -f

# 检查 agent 配置文件
cat /etc/uniproxy/agent.conf

# 重启 agent
sudo systemctl restart uniproxy-agent
```

### 数据库查询失败

**原因**: NodeAPIAuth 中间件无法访问数据库

**解决方案**:
1. 检查后端日志: `sudo journalctl -u uniproxy-panel -f`
2. 确认数据库连接配置正确
3. 验证 nodes 表存在且有 api_token 字段

## 📝 开发调试

### 启用详细日志

编辑配置文件 `/etc/uniproxy/config.yaml`:

```yaml
log:
  level: debug  # 改为 debug 级别
```

重启服务后查看详细日志：

```bash
sudo systemctl restart uniproxy-panel
sudo journalctl -u uniproxy-panel -f
```

### 直接查询数据库

```bash
# SQLite
sqlite3 /var/lib/uniproxy/uniproxy.db "SELECT id, name, api_token, status FROM nodes;"

# MySQL
mysql -u root -p uniproxy -e "SELECT id, name, api_token, status FROM nodes;"
```

## 🚀 生产环境测试

在生产环境中，建议：

1. 使用 HTTPS 连接测试
2. 验证 Nginx 反向代理配置正确
3. 检查防火墙规则允许 API 端口
4. 测试从外部网络访问心跳接口
5. 验证证书有效性和安全性

### HTTPS 测试示例

```bash
PANEL_URL="https://your-domain.com" API_TOKEN="your_token" ./test-heartbeat.sh
```

## 📚 相关文档

- [部署指南](DEPLOY.md) - 完整的部署和配置说明
- [HTTPS 配置](HTTPS_SETUP.md) - HTTPS 证书配置指南
- [API 文档](API.md) - 完整的 API 接口文档

## 💡 提示

- 每次创建新节点时都会生成新的 API Token
- API Token 是节点的唯一认证凭证，请妥善保管
- 建议定期轮换 API Token 以提高安全性
- 监控数据默认保留 30 天，可在配置文件中调整
