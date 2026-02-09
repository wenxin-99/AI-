# Makefile 使用指南

UniProxy Panel 现在使用 Makefile 统一管理构建流程，简化开发和部署操作。

## 📁 文件结构

```
AI-/
├── Makefile              # 根目录 Makefile（协调前后端）
├── backend/
│   └── Makefile          # 后端 Makefile
└── client/
    └── Makefile          # 前端 Makefile
```

## 🚀 快速开始

### 首次使用

```bash
# 克隆项目
git clone https://github.com/wenxin-99/AI-.git
cd AI-

# 初始化项目（安装所有依赖）
make init

# 查看帮助信息
make help
```

### 开发模式

```bash
# 启动前后端开发服务器（并行运行）
make dev

# 或者分别启动
make backend-dev    # 后端: http://localhost:8080
make frontend-dev   # 前端: http://localhost:5173
```

### 构建项目

```bash
# 构建所有组件
make build

# 或者分别构建
make backend-build
make frontend-build

# 清理并重新构建
make clean build
```

### 部署到服务器

```bash
# 方法 1: 使用 Makefile 部署
make deploy

# 方法 2: 使用一键脚本（推荐）
make deploy-quick
# 等同于: sudo bash setup.sh
```

## 📖 常用命令

### 根目录命令

| 命令 | 说明 |
|------|------|
| `make init` | 初始化项目（安装所有依赖） |
| `make build` | 构建所有组件 |
| `make clean` | 清理所有构建文件 |
| `make dev` | 启动开发模式（前后端并行） |
| `make test` | 运行所有测试 |
| `make deploy` | 完整部署（构建+安装） |
| `make deploy-quick` | 快速部署（使用 setup.sh） |
| `make start` | 启动服务 |
| `make stop` | 停止服务 |
| `make restart` | 重启服务 |
| `make status` | 查看服务状态 |
| `make logs` | 查看实时日志 |
| `make fmt` | 格式化代码 |
| `make lint` | 运行代码检查 |
| `make help` | 显示帮助信息 |

### 后端命令

进入后端目录：`cd backend`

| 命令 | 说明 |
|------|------|
| `make build` | 编译后端（包含版本信息） |
| `make build-fast` | 快速编译（不包含版本信息） |
| `make build-prod` | 构建生产版本（优化压缩） |
| `make clean` | 清理构建文件 |
| `make deps` | 下载依赖 |
| `make deps-update` | 更新依赖 |
| `make test` | 运行测试 |
| `make coverage` | 生成测试覆盖率报告 |
| `make lint` | 运行代码检查 |
| `make fmt` | 格式化代码 |
| `make run` | 运行服务（开发模式） |
| `make dev` | 热重载开发模式（需要 air） |
| `make systemd` | 生成 systemd 服务文件 |
| `make version` | 显示版本信息 |

### 前端命令

进入前端目录：`cd client`

| 命令 | 说明 |
|------|------|
| `make install` | 安装依赖 |
| `make build` | 构建生产版本 |
| `make build-fast` | 快速构建 |
| `make clean` | 清理构建文件 |
| `make clean-all` | 深度清理（包括 node_modules） |
| `make dev` | 启动开发服务器 |
| `make preview` | 预览生产构建 |
| `make lint` | 运行代码检查 |
| `make fmt` | 格式化代码 |
| `make typecheck` | 运行类型检查 |
| `make analyze` | 分析构建大小 |
| `make update` | 更新依赖 |

## 💡 使用场景

### 场景 1: 本地开发

```bash
# 1. 克隆项目
git clone https://github.com/wenxin-99/AI-.git
cd AI-

# 2. 安装依赖
make init

# 3. 启动开发服务器
make dev

# 4. 在浏览器中访问
# 前端: http://localhost:5173
# 后端: http://localhost:8080
```

### 场景 2: 代码提交前

```bash
# 1. 格式化代码
make fmt

# 2. 运行代码检查
make lint

# 3. 运行测试
make test

# 4. 提交代码
git add .
git commit -m "your message"
git push
```

### 场景 3: 服务器部署

```bash
# 1. 拉取最新代码
cd /opt/uniproxy-panel
git pull origin main

# 2. 快速部署
make deploy-quick

# 3. 查看服务状态
make status

# 4. 查看日志
make logs
```

### 场景 4: 更新依赖

```bash
# 更新所有依赖
make update-deps

# 或者分别更新
cd backend && make deps-update
cd client && make update
```

### 场景 5: 构建生产版本

```bash
# 后端生产构建（优化压缩）
cd backend
make build-prod

# 前端生产构建
cd client
make build

# 或者在根目录一次性构建
make build
```

## 🔧 高级功能

### 版本信息

后端 Makefile 会自动将版本信息嵌入到二进制文件中：

```bash
cd backend
make build

# 查看版本信息
make version
# 输出:
# 版本: v1.0.0
# 提交: a1b2c3d
# 时间: 2026-02-09_00:00:00
```

### 测试覆盖率

```bash
cd backend
make coverage

# 会生成 coverage.html 文件
# 在浏览器中打开查看详细的覆盖率报告
```

### 热重载开发

后端支持热重载开发（需要安装 air）：

```bash
# 安装 air
go install github.com/cosmtrek/air@latest

# 启动热重载
cd backend
make dev
```

### 构建大小分析

前端支持构建大小分析：

```bash
cd client
make analyze

# 会生成可视化的构建分析报告
```

### Docker 支持

```bash
# 构建 Docker 镜像
make docker-build

# 启动 Docker 容器
make docker-up

# 停止 Docker 容器
make docker-down

# 查看 Docker 日志
make docker-logs
```

## 🎯 与部署脚本的集成

部署脚本（setup.sh、deploy.sh 等）已经集成了 Makefile：

1. **优先使用 Makefile**: 如果检测到 Makefile，脚本会使用 `make build` 编译
2. **自动回退**: 如果 Makefile 不存在或编译失败，自动回退到传统的 `go build` 命令
3. **向后兼容**: 旧的部署脚本仍然可以正常工作

## 📊 性能对比

使用 Makefile 的优势：

| 特性 | 传统方式 | Makefile 方式 |
|------|----------|---------------|
| 命令长度 | `go build -ldflags "..." -o ...` | `make build` |
| 版本信息 | 手动添加 | 自动嵌入 |
| 依赖管理 | 手动执行 | 自动处理 |
| 清理文件 | 手动删除 | `make clean` |
| 并行构建 | 不支持 | `make -j4 build` |
| 错误处理 | 需要检查 | 自动处理 |

## 🐛 常见问题

### Q: make 命令找不到？

A: 安装 make 工具：

```bash
# Ubuntu/Debian
sudo apt-get install make

# CentOS/RHEL
sudo yum install make

# macOS
xcode-select --install
```

### Q: Makefile 编译失败？

A: 检查 Go 环境：

```bash
# 检查 Go 是否安装
go version

# 检查 GOPATH
echo $GOPATH

# 尝试直接编译
cd backend
go build -o uniproxy-panel ./cmd/main.go
```

### Q: 如何自定义编译选项？

A: 编辑 `backend/Makefile`，修改 `LDFLAGS` 或 `GOFLAGS` 变量：

```makefile
# 添加自定义编译标志
GOFLAGS=-v -race
LDFLAGS=-w -s -X 'main.CustomVar=value'
```

### Q: 如何在 CI/CD 中使用？

A: 在 GitHub Actions 中使用：

```yaml
- name: Build Backend
  run: |
    cd backend
    make build

- name: Build Frontend
  run: |
    cd client
    make build
```

## 📚 参考资源

- [GNU Make 官方文档](https://www.gnu.org/software/make/manual/)
- [Go Build 命令文档](https://golang.org/cmd/go/#hdr-Compile_packages_and_dependencies)
- [pnpm 官方文档](https://pnpm.io/)

## 💬 反馈和贡献

如果您在使用 Makefile 时遇到问题或有改进建议，欢迎：

1. 提交 Issue: https://github.com/wenxin-99/AI-/issues
2. 提交 Pull Request
3. 联系维护者

## 📝 更新日志

### 2026-02-09

- ✅ 创建根目录 Makefile
- ✅ 创建后端 Makefile（支持版本信息、测试覆盖率）
- ✅ 创建前端 Makefile（支持构建分析）
- ✅ 集成到部署脚本（setup.sh）
- ✅ 添加 Docker 支持
- ✅ 添加完整的帮助文档

---

**提示**: 随时运行 `make help` 查看最新的命令列表和使用说明。
