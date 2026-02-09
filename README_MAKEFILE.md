# Makefile 构建系统

UniProxy Panel 现已支持 Makefile 统一构建！🎉

## 快速开始

```bash
# 查看所有可用命令
make help

# 初始化项目（首次使用）
make init

# 启动开发模式
make dev

# 构建所有组件
make build

# 部署到服务器
make deploy-quick
```

## 主要优势

✅ **简化命令** - 从复杂的 `go build -ldflags "..." -o ...` 简化为 `make build`  
✅ **版本管理** - 自动将 Git 版本信息嵌入二进制文件  
✅ **依赖管理** - 自动处理前后端依赖下载和更新  
✅ **并行构建** - 支持前后端并行编译，提升构建速度  
✅ **服务管理** - 一键启动、停止、重启服务  
✅ **向后兼容** - 部署脚本自动检测并使用 Makefile，不影响旧流程

## 文件结构

```
AI-/
├── Makefile              # 根目录 Makefile（协调前后端）
├── backend/
│   └── Makefile          # 后端 Makefile（Go 项目）
└── client/
    └── Makefile          # 前端 Makefile（Node.js 项目）
```

## 常用命令速查

| 场景 | 命令 | 说明 |
|------|------|------|
| 首次使用 | `make init` | 安装所有依赖 |
| 本地开发 | `make dev` | 启动前后端开发服务器 |
| 代码检查 | `make lint` | 运行代码检查 |
| 运行测试 | `make test` | 运行所有测试 |
| 构建项目 | `make build` | 构建前后端 |
| 清理文件 | `make clean` | 清理所有构建文件 |
| 服务器部署 | `make deploy-quick` | 一键部署（使用 setup.sh） |
| 重启服务 | `make restart` | 重启后端服务 |
| 查看日志 | `make logs` | 查看实时日志 |
| 查看状态 | `make status` | 查看服务状态 |

## 详细文档

查看完整的使用指南：[MAKEFILE_GUIDE.md](./MAKEFILE_GUIDE.md)

## 与现有脚本的集成

部署脚本（setup.sh、deploy.sh 等）已经自动集成 Makefile：

1. **优先使用 Makefile**: 如果检测到 Makefile，自动使用 `make build`
2. **自动回退**: 如果 Makefile 不存在或失败，回退到传统 `go build`
3. **无缝升级**: 拉取最新代码后，部署脚本自动使用新的 Makefile

## 示例工作流

### 开发流程

```bash
# 1. 克隆项目
git clone https://github.com/wenxin-99/AI-.git
cd AI-

# 2. 初始化
make init

# 3. 启动开发
make dev
# 前端: http://localhost:5173
# 后端: http://localhost:8080

# 4. 代码检查
make fmt lint

# 5. 运行测试
make test
```

### 部署流程

```bash
# 1. 拉取最新代码
cd /opt/uniproxy-panel
git pull origin main

# 2. 一键部署
make deploy-quick

# 3. 查看状态
make status

# 4. 查看日志
make logs
```

## 版本信息

后端编译时会自动嵌入版本信息：

```bash
cd backend
make build
make version

# 输出:
# 版本: v1.0.0
# 提交: a1b2c3d
# 时间: 2026-02-09_00:00:00
```

## 高级功能

- **热重载开发**: `make dev`（后端需要安装 air）
- **测试覆盖率**: `cd backend && make coverage`
- **构建分析**: `cd client && make analyze`
- **生产构建**: `cd backend && make build-prod`
- **Docker 支持**: `make docker-build && make docker-up`

## 环境要求

- **make**: 构建工具（必需）
- **Go**: 1.24+ （后端编译）
- **Node.js**: 22+ （前端编译）
- **pnpm**: 包管理器（前端依赖）

检查环境：

```bash
make check-env
```

## 问题反馈

如有问题或建议，欢迎提交 Issue 或 Pull Request。

---

**提示**: 运行 `make help` 查看完整的命令列表。
