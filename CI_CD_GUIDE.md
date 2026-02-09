# CI/CD 指南

UniProxy Panel 使用 GitHub Actions 实现自动化构建、测试和部署。

## 📋 工作流概述

项目包含两个主要的 GitHub Actions 工作流：

### 1. Build and Test (`build.yml`)

**触发条件**:
- Push 到 `main` 或 `develop` 分支
- Pull Request 到 `main` 或 `develop` 分支

**执行任务**:
- ✅ 后端构建和测试
- ✅ 前端构建和类型检查
- ✅ Docker 镜像构建（仅 main 分支）
- ✅ 代码质量检查

### 2. Release (`release.yml`)

**触发条件**:
- 推送版本标签（如 `v1.0.0`）

**执行任务**:
- ✅ 多平台编译（Linux、macOS、Windows）
- ✅ 创建 GitHub Release
- ✅ 上传编译产物
- ✅ 构建并推送 Docker 镜像（带版本标签）

## 🚀 快速开始

### 1. 启用 GitHub Actions

GitHub Actions 默认启用，无需额外配置。

### 2. 配置 Secrets（可选）

如果需要推送 Docker 镜像到 Docker Hub，需要配置以下 Secrets：

1. 进入 GitHub 仓库设置
2. 选择 `Settings` > `Secrets and variables` > `Actions`
3. 添加以下 Secrets:
   - `DOCKER_USERNAME`: Docker Hub 用户名
   - `DOCKER_PASSWORD`: Docker Hub 密码或 Access Token

### 3. 查看工作流状态

访问仓库的 `Actions` 标签页查看工作流执行状态。

## 📊 工作流详解

### Build and Test 工作流

#### 后端任务 (backend)

```yaml
steps:
  1. Checkout code          # 检出代码
  2. Set up Go             # 设置 Go 环境
  3. Install dependencies  # 安装依赖
  4. Run tests            # 运行测试
  5. Run linter           # 代码检查
  6. Build backend        # 编译后端
  7. Upload artifact      # 上传产物
```

**使用的 Makefile 命令**:
- `make deps` - 下载依赖
- `make test` - 运行测试
- `make lint` - 代码检查
- `make build` - 编译

#### 前端任务 (frontend)

```yaml
steps:
  1. Checkout code          # 检出代码
  2. Set up Node.js        # 设置 Node.js 环境
  3. Install pnpm          # 安装 pnpm
  4. Setup cache           # 配置缓存
  5. Install dependencies  # 安装依赖
  6. Run type check       # 类型检查
  7. Build frontend       # 构建前端
  8. Upload artifact      # 上传产物
```

**使用的命令**:
- `pnpm install --frozen-lockfile` - 安装依赖
- `pnpm run typecheck` - 类型检查
- `pnpm run build` - 构建

#### Docker 任务 (docker)

仅在推送到 `main` 分支时执行：

```yaml
steps:
  1. Checkout code              # 检出代码
  2. Set up Docker Buildx      # 设置 Docker Buildx
  3. Log in to Docker Hub      # 登录 Docker Hub
  4. Build backend image       # 构建后端镜像
  5. Build frontend image      # 构建前端镜像
```

#### 代码质量任务 (code-quality)

```yaml
steps:
  1. Checkout code          # 检出代码
  2. Run ShellCheck        # Shell 脚本检查
  3. Check commit messages # 提交信息检查
```

### Release 工作流

#### 创建 Release

```yaml
steps:
  1. Checkout code                    # 检出代码
  2. Set up Go                       # 设置 Go 环境
  3. Build for multiple platforms    # 多平台编译
  4. Set up Node.js                  # 设置 Node.js
  5. Build frontend                  # 构建前端
  6. Generate changelog              # 生成更新日志
  7. Create Release                  # 创建 Release
```

**编译平台**:
- Linux amd64
- Linux arm64
- macOS amd64
- macOS arm64
- Windows amd64

#### Docker Release

```yaml
steps:
  1. Checkout code              # 检出代码
  2. Set up Docker Buildx      # 设置 Docker Buildx
  3. Log in to Docker Hub      # 登录 Docker Hub
  4. Extract version           # 提取版本号
  5. Build and push images     # 构建并推送镜像
```

**镜像标签**:
- `latest` - 最新版本
- `v1.0.0` - 具体版本号

## 🔧 本地测试

### 测试后端构建

```bash
cd backend
make deps
make test
make lint
make build
```

### 测试前端构建

```bash
cd client
pnpm install
pnpm run typecheck
pnpm run build
```

### 测试 Docker 构建

```bash
# 后端
docker build -t uniproxy-backend -f backend/Dockerfile backend/

# 前端
docker build -t uniproxy-frontend -f client/Dockerfile client/

# 使用 Docker Compose
docker-compose build
```

## 📝 工作流配置

### 修改触发条件

编辑 `.github/workflows/build.yml`:

```yaml
on:
  push:
    branches: [ main, develop, feature/* ]  # 添加更多分支
  pull_request:
    branches: [ main ]
```

### 添加环境变量

```yaml
jobs:
  backend:
    env:
      GO_VERSION: '1.24'
      GOPROXY: 'https://goproxy.cn,direct'
```

### 配置缓存

前端已配置 pnpm 缓存：

```yaml
- name: Setup pnpm cache
  uses: actions/cache@v4
  with:
    path: ${{ env.STORE_PATH }}
    key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
```

后端已配置 Go 模块缓存：

```yaml
- name: Set up Go
  uses: actions/setup-go@v5
  with:
    go-version: '1.24'
    cache-dependency-path: backend/go.sum
```

## 🎯 最佳实践

### 1. 提交规范

使用 Conventional Commits 规范：

```
feat: 添加新功能
fix: 修复 bug
docs: 更新文档
style: 代码格式调整
refactor: 重构代码
test: 添加测试
chore: 构建/工具变动
```

示例：

```bash
git commit -m "feat: 添加节点监控功能"
git commit -m "fix: 修复编译错误"
git commit -m "docs: 更新 README"
```

### 2. 分支策略

- `main` - 生产分支，受保护
- `develop` - 开发分支
- `feature/*` - 功能分支
- `hotfix/*` - 紧急修复分支

### 3. Pull Request

创建 PR 时：

1. 确保所有测试通过
2. 添加详细的描述
3. 关联相关 Issue
4. 请求代码审查

### 4. 版本发布

```bash
# 1. 更新版本号
vim backend/version.go

# 2. 提交更改
git add .
git commit -m "chore: bump version to v1.0.0"

# 3. 创建标签
git tag -a v1.0.0 -m "Release v1.0.0"

# 4. 推送标签
git push origin v1.0.0

# 5. GitHub Actions 自动创建 Release
```

## 📊 监控和通知

### 查看工作流状态

1. 访问仓库的 `Actions` 标签页
2. 选择具体的工作流
3. 查看执行日志

### 配置通知（可选）

在 `.github/workflows/build.yml` 中添加：

```yaml
jobs:
  notify:
    runs-on: ubuntu-latest
    needs: [backend, frontend]
    if: always()
    steps:
      - name: Send notification
        uses: 8398a7/action-slack@v3
        with:
          status: ${{ job.status }}
          webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

## 🐛 故障排查

### 构建失败

1. 查看详细日志
2. 检查依赖版本
3. 本地复现问题
4. 修复后重新推送

### 测试失败

```bash
# 本地运行测试
cd backend
make test

cd client
pnpm run test
```

### Docker 构建失败

```bash
# 本地构建测试
docker build -f backend/Dockerfile backend/

# 查看详细日志
docker build --progress=plain -f backend/Dockerfile backend/
```

### 权限问题

确保 GitHub Actions 有足够的权限：

1. 进入 `Settings` > `Actions` > `General`
2. 设置 `Workflow permissions` 为 `Read and write permissions`

## 🔒 安全建议

1. **保护 Secrets**
   - 不要在日志中打印 Secrets
   - 使用 GitHub Secrets 管理敏感信息

2. **限制权限**
   - 使用最小权限原则
   - 定期审查 Actions 权限

3. **依赖安全**
   - 定期更新依赖
   - 使用 Dependabot 自动更新

4. **代码审查**
   - 所有 PR 需要审查
   - 启用分支保护规则

## 📚 参考资源

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [Workflow 语法](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Conventional Commits](https://www.conventionalcommits.org/)

## 💡 进阶配置

### 矩阵构建

测试多个 Go 版本：

```yaml
jobs:
  backend:
    strategy:
      matrix:
        go-version: ['1.22', '1.23', '1.24']
    steps:
      - uses: actions/setup-go@v5
        with:
          go-version: ${{ matrix.go-version }}
```

### 条件执行

仅在特定文件变更时执行：

```yaml
jobs:
  backend:
    if: contains(github.event.head_commit.modified, 'backend/')
```

### 定时任务

每天自动构建：

```yaml
on:
  schedule:
    - cron: '0 0 * * *'  # 每天 UTC 0:00
```

## 💬 获取帮助

如有问题，请：

1. 查看 Actions 日志
2. 检查 GitHub Issues
3. 提交新的 Issue

---

**提示**: CI/CD 是持续改进的过程，根据项目需求不断优化工作流配置。
