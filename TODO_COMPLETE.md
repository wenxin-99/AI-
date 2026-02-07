# UniProxy Panel 完善任务清单

## Phase 1: 分析 3x-ui 源代码提取完整配置结构

### Xray 配置结构分析
- [ ] 分析 3x-ui 的 Inbound 数据模型
- [ ] 提取完整的 StreamSettings 配置
- [ ] 提取 Sniffing 配置结构
- [ ] 提取 Fallbacks 配置结构
- [ ] 提取 TLS/Reality 完整配置

### Gost 配置结构分析
- [ ] 分析 flux-panel 的隧道配置
- [ ] 提取 TLS 加密配置
- [ ] 提取认证配置

## Phase 2: 完善 Xray 配置生成和高级选项

### 后端实现
- [ ] 完善 StreamSettings 生成 (TCP/WS/HTTP/2/gRPC/QUIC)
- [ ] 实现 Proxy Protocol 支持
- [ ] 实现 HTTP 伪装配置
- [ ] 实现 Sockopt 配置
- [ ] 实现 External Proxy 配置
- [ ] 完善 Sniffing 配置生成
- [ ] 实现 Fallbacks 配置生成

### 数据库模型更新
- [ ] 扩展 XrayInbound 模型字段
- [ ] 添加 StreamSettings JSON 字段
- [ ] 添加 Sniffing JSON 字段
- [ ] 添加 Fallbacks JSON 字段

## Phase 3: 实现 TLS/Reality 完整支持

### TLS 证书管理
- [ ] 实现证书上传功能
- [ ] 实现 Let's Encrypt 自动申请
- [ ] 实现证书自动续期
- [ ] 添加证书管理数据表

### Reality 协议
- [ ] 实现 Reality 配置生成
- [ ] 实现私钥/公钥管理
- [ ] 实现目标网站配置
- [ ] 实现 shortId 生成

### Gost TLS
- [ ] 完善 Gost TLS 隧道配置
- [ ] 实现证书选择
- [ ] 实现加密算法配置

## Phase 4: 开发完整的前端配置界面

### Xray 管理页面增强
- [ ] 添加传输层配置选项卡
  - [ ] TCP 配置 (Header伪装)
  - [ ] WebSocket 配置 (Path, Headers)
  - [ ] HTTP/2 配置 (Host, Path)
  - [ ] gRPC 配置 (ServiceName)
  - [ ] QUIC 配置
- [ ] 添加安全配置选项卡
  - [ ] TLS 配置界面
  - [ ] Reality 配置界面
  - [ ] 证书选择
- [ ] 添加高级选项选项卡
  - [ ] Proxy Protocol 开关
  - [ ] HTTP 伪装配置
  - [ ] Sockopt 配置
  - [ ] External Proxy 配置
- [ ] 添加 Sniffing 配置界面
- [ ] 添加 Fallbacks 管理界面

### 证书管理页面
- [ ] 创建证书列表页面
- [ ] 创建证书上传对话框
- [ ] 创建 Let's Encrypt 申请对话框
- [ ] 显示证书过期时间
- [ ] 证书续期功能

### Gost 管理页面增强
- [ ] 添加 TLS 配置选项
- [ ] 添加证书选择
- [ ] 添加加密算法选择

## Phase 5: 测试和最终交付

- [ ] 测试所有协议配置生成
- [ ] 测试 TLS 证书管理
- [ ] 测试 Reality 协议
- [ ] 测试订阅链接生成
- [ ] 创建完整的使用文档
- [ ] 创建配置示例
