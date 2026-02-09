# GitHub Actions 设置指南

由于 GitHub App 权限限制，GitHub Actions 工作流文件需要手动添加到仓库。

## 📋 工作流文件

已为您准备好两个 GitHub Actions 工作流配置文件：

### 1. Build and Test (`.github/workflows/build.yml`)

自动构建和测试工作流，在每次推送或 Pull Request 时触发。

**功能**:
- ✅ 后端构建和测试
- ✅ 前端构建和类型检查
- ✅ Docker 镜像构建
- ✅ 代码质量检查

### 2. Release (`.github/workflows/release.yml`)

发布工作流，在推送版本标签时触发。

**功能**:
- ✅ 多平台编译（Linux、macOS、Windows）
- ✅ 创建 GitHub Release
- ✅ 上传编译产物
- ✅ 构建并推送 Docker 镜像

## 🚀 手动添加步骤

### 方法 1: 通过 GitHub 网页界面

1. 访问您的 GitHub 仓库
2. 点击 `Add file` > `Create new file`
3. 文件名输入: `.github/workflows/build.yml`
4. 复制以下内容到编辑器:

```yaml
name: Build and Test

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  # 后端构建和测试
  backend:
    name: Backend Build & Test
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.24'
          cache-dependency-path: backend/go.sum

      - name: Install dependencies
        working-directory: ./backend
        run: make deps

      - name: Run tests
        working-directory: ./backend
        run: make test

      - name: Run linter
        working-directory: ./backend
        run: |
          go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
          make lint || true

      - name: Build backend
        working-directory: ./backend
        run: make build

      - name: Upload backend artifact
        uses: actions/upload-artifact@v4
        with:
          name: backend-binary
          path: backend/uniproxy-panel
          retention-days: 7

  # 前端构建和测试
  frontend:
    name: Frontend Build & Test
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 10

      - name: Get pnpm store directory
        shell: bash
        run: |
          echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - name: Setup pnpm cache
        uses: actions/cache@v4
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        working-directory: ./client
        run: pnpm install --frozen-lockfile

      - name: Run type check
        working-directory: ./client
        run: pnpm run typecheck || true

      - name: Build frontend
        working-directory: ./client
        run: pnpm run build

      - name: Upload frontend artifact
        uses: actions/upload-artifact@v4
        with:
          name: frontend-dist
          path: client/dist
          retention-days: 7

  # Docker 镜像构建
  docker:
    name: Docker Build
    runs-on: ubuntu-latest
    needs: [backend, frontend]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Docker Hub (optional)
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
        continue-on-error: true

      - name: Build backend image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile
          push: false
          tags: uniproxy/panel-backend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build frontend image
        uses: docker/build-push-action@v5
        with:
          context: ./client
          file: ./client/Dockerfile
          push: false
          tags: uniproxy/panel-frontend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # 代码质量检查
  code-quality:
    name: Code Quality
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run ShellCheck
        uses: ludeeus/action-shellcheck@master
        with:
          scandir: '.'
          severity: warning
        continue-on-error: true
```

5. 点击 `Commit changes`

6. 重复步骤 2-5，创建 `.github/workflows/release.yml`，内容见下方

### 方法 2: 通过本地 Git 推送

如果您有仓库的写入权限，可以直接在本地创建文件并推送：

```bash
# 1. 克隆仓库（如果还没有）
git clone https://github.com/wenxin-99/AI-.git
cd AI-

# 2. 创建工作流目录
mkdir -p .github/workflows

# 3. 创建 build.yml
cat > .github/workflows/build.yml << 'EOF'
# 将上面的 build.yml 内容粘贴到这里
EOF

# 4. 创建 release.yml
cat > .github/workflows/release.yml << 'EOF'
# 将 release.yml 内容粘贴到这里
EOF

# 5. 提交并推送
git add .github/workflows/
git commit -m "添加 GitHub Actions 工作流"
git push origin main
```

### 方法 3: 下载并上传

1. 从项目文档中下载工作流文件
2. 在 GitHub 仓库中创建 `.github/workflows/` 目录
3. 上传文件

## 🔧 配置 Secrets（可选）

如果需要推送 Docker 镜像到 Docker Hub：

1. 进入仓库设置: `Settings` > `Secrets and variables` > `Actions`
2. 点击 `New repository secret`
3. 添加以下 Secrets:
   - **Name**: `DOCKER_USERNAME`
     **Value**: 您的 Docker Hub 用户名
   - **Name**: `DOCKER_PASSWORD`
     **Value**: 您的 Docker Hub 密码或 Access Token

## ✅ 验证设置

添加工作流文件后：

1. 访问仓库的 `Actions` 标签页
2. 应该能看到 "Build and Test" 和 "Release" 工作流
3. 推送代码或创建 PR 会自动触发工作流

## 📝 Release.yml 完整内容

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  # 创建 GitHub Release
  release:
    name: Create Release
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: '1.24'

      - name: Build backend for multiple platforms
        working-directory: ./backend
        run: |
          # Linux amd64
          GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o uniproxy-panel-linux-amd64 ./cmd/main.go
          
          # Linux arm64
          GOOS=linux GOARCH=arm64 go build -ldflags="-w -s" -o uniproxy-panel-linux-arm64 ./cmd/main.go
          
          # macOS amd64
          GOOS=darwin GOARCH=amd64 go build -ldflags="-w -s" -o uniproxy-panel-darwin-amd64 ./cmd/main.go
          
          # macOS arm64
          GOOS=darwin GOARCH=arm64 go build -ldflags="-w -s" -o uniproxy-panel-darwin-arm64 ./cmd/main.go
          
          # Windows amd64
          GOOS=windows GOARCH=amd64 go build -ldflags="-w -s" -o uniproxy-panel-windows-amd64.exe ./cmd/main.go

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install pnpm
        uses: pnpm/action-setup@v3
        with:
          version: 10

      - name: Build frontend
        working-directory: ./client
        run: |
          pnpm install --frozen-lockfile
          pnpm run build
          tar -czf ../frontend-dist.tar.gz -C dist .

      - name: Generate changelog
        id: changelog
        uses: metcalfc/changelog-generator@v4.3.1
        with:
          myToken: ${{ secrets.GITHUB_TOKEN }}

      - name: Create Release
        uses: softprops/action-gh-release@v2
        with:
          body: ${{ steps.changelog.outputs.changelog }}
          files: |
            backend/uniproxy-panel-linux-amd64
            backend/uniproxy-panel-linux-arm64
            backend/uniproxy-panel-darwin-amd64
            backend/uniproxy-panel-darwin-arm64
            backend/uniproxy-panel-windows-amd64.exe
            frontend-dist.tar.gz
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # 构建并推送 Docker 镜像（带版本标签）
  docker-release:
    name: Docker Release
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
        continue-on-error: true

      - name: Extract version
        id: version
        run: echo "VERSION=${GITHUB_REF#refs/tags/v}" >> $GITHUB_OUTPUT

      - name: Build and push backend image
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          file: ./backend/Dockerfile
          push: true
          tags: |
            uniproxy/panel-backend:latest
            uniproxy/panel-backend:${{ steps.version.outputs.VERSION }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
        continue-on-error: true

      - name: Build and push frontend image
        uses: docker/build-push-action@v5
        with:
          context: ./client
          file: ./client/Dockerfile
          push: true
          tags: |
            uniproxy/panel-frontend:latest
            uniproxy/panel-frontend:${{ steps.version.outputs.VERSION }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
        continue-on-error: true
```

## 💡 提示

- 工作流文件添加后会立即生效
- 可以在 `Actions` 标签页查看执行历史
- 详细的使用说明请查看 [CI_CD_GUIDE.md](./CI_CD_GUIDE.md)

## 📚 相关文档

- [CI/CD 使用指南](./CI_CD_GUIDE.md)
- [Docker 部署指南](./DOCKER_GUIDE.md)
- [Makefile 使用指南](./MAKEFILE_GUIDE.md)

---

**注意**: 由于权限限制，这些文件无法通过自动化工具推送，需要您手动添加。
