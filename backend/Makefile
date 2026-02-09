# UniProxy Panel Backend Makefile
# 统一的后端构建配置

# 变量定义
BINARY_NAME=uniproxy-panel
MAIN_PATH=./cmd/main.go
GO=go
GOFLAGS=-v
LDFLAGS=-w -s
BUILD_DIR=.
INSTALL_DIR=/opt/uniproxy-panel/backend

# Go 环境配置
export GOPROXY=https://goproxy.cn,direct
export GO111MODULE=on

# 版本信息
VERSION=$(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME=$(shell date -u '+%Y-%m-%d_%H:%M:%S')
GIT_COMMIT=$(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# LDFLAGS 包含版本信息
VERSION_LDFLAGS=-X 'main.Version=$(VERSION)' \
                 -X 'main.BuildTime=$(BUILD_TIME)' \
                 -X 'main.GitCommit=$(GIT_COMMIT)'

.PHONY: all build clean install test deps run dev help

# 默认目标
all: clean deps build

# 构建二进制文件
build:
	@echo "==> 编译后端服务..."
	@echo "    版本: $(VERSION)"
	@echo "    提交: $(GIT_COMMIT)"
	@echo "    时间: $(BUILD_TIME)"
	$(GO) build $(GOFLAGS) -ldflags "$(LDFLAGS) $(VERSION_LDFLAGS)" -o $(BUILD_DIR)/$(BINARY_NAME) $(MAIN_PATH)
	@echo "==> 编译完成: $(BUILD_DIR)/$(BINARY_NAME)"
	@ls -lh $(BUILD_DIR)/$(BINARY_NAME)

# 快速构建（不包含版本信息）
build-fast:
	@echo "==> 快速编译..."
	$(GO) build -o $(BUILD_DIR)/$(BINARY_NAME) $(MAIN_PATH)
	@echo "==> 编译完成"

# 构建并压缩（生产环境）
build-prod:
	@echo "==> 构建生产版本..."
	CGO_ENABLED=0 $(GO) build -ldflags "$(LDFLAGS) $(VERSION_LDFLAGS)" -o $(BUILD_DIR)/$(BINARY_NAME) $(MAIN_PATH)
	@echo "==> 压缩二进制文件..."
	@which upx > /dev/null && upx -9 $(BUILD_DIR)/$(BINARY_NAME) || echo "提示: 安装 upx 可进一步压缩二进制文件"
	@ls -lh $(BUILD_DIR)/$(BINARY_NAME)

# 下载依赖
deps:
	@echo "==> 下载 Go 依赖..."
	$(GO) mod download
	$(GO) mod verify

# 更新依赖
deps-update:
	@echo "==> 更新 Go 依赖..."
	$(GO) get -u ./...
	$(GO) mod tidy

# 清理构建文件
clean:
	@echo "==> 清理构建文件..."
	@rm -f $(BUILD_DIR)/$(BINARY_NAME)
	@rm -f $(BUILD_DIR)/uniproxy
	@echo "==> 清理完成"

# 安装到系统目录
install: build
	@echo "==> 安装到 $(INSTALL_DIR)..."
	@mkdir -p $(INSTALL_DIR)
	@cp $(BUILD_DIR)/$(BINARY_NAME) $(INSTALL_DIR)/
	@echo "==> 安装完成"

# 运行测试
test:
	@echo "==> 运行测试..."
	$(GO) test -v -race -coverprofile=coverage.out ./...
	@echo "==> 测试完成"

# 查看测试覆盖率
coverage: test
	@echo "==> 生成覆盖率报告..."
	$(GO) tool cover -html=coverage.out -o coverage.html
	@echo "==> 覆盖率报告: coverage.html"

# 代码检查
lint:
	@echo "==> 运行代码检查..."
	@which golangci-lint > /dev/null || (echo "请安装 golangci-lint: https://golangci-lint.run/usage/install/" && exit 1)
	golangci-lint run ./...

# 格式化代码
fmt:
	@echo "==> 格式化代码..."
	$(GO) fmt ./...
	@which goimports > /dev/null && goimports -w . || echo "提示: 安装 goimports 可自动整理 import"

# 运行服务（开发模式）
run:
	@echo "==> 运行服务（开发模式）..."
	$(GO) run $(MAIN_PATH)

# 热重载开发（需要安装 air）
dev:
	@echo "==> 启动热重载开发模式..."
	@which air > /dev/null || (echo "请安装 air: go install github.com/cosmtrek/air@latest" && exit 1)
	air

# 生成 systemd 服务文件
systemd:
	@echo "==> 生成 systemd 服务文件..."
	@printf '[Unit]\n' > uniproxy-panel.service
	@printf 'Description=UniProxy Panel Backend Service\n' >> uniproxy-panel.service
	@printf 'After=network.target\n\n' >> uniproxy-panel.service
	@printf '[Service]\n' >> uniproxy-panel.service
	@printf 'Type=simple\n' >> uniproxy-panel.service
	@printf 'User=root\n' >> uniproxy-panel.service
	@printf 'WorkingDirectory=$(INSTALL_DIR)\n' >> uniproxy-panel.service
	@printf 'ExecStart=$(INSTALL_DIR)/$(BINARY_NAME)\n' >> uniproxy-panel.service
	@printf 'Restart=always\n' >> uniproxy-panel.service
	@printf 'RestartSec=5\n' >> uniproxy-panel.service
	@printf 'StandardOutput=journal\n' >> uniproxy-panel.service
	@printf 'StandardError=journal\n\n' >> uniproxy-panel.service
	@printf '[Install]\n' >> uniproxy-panel.service
	@printf 'WantedBy=multi-user.target\n' >> uniproxy-panel.service
	@echo "==> 服务文件已生成: uniproxy-panel.service"
	@echo "    安装命令: sudo cp uniproxy-panel.service /etc/systemd/system/"

# 显示版本信息
version:
	@echo "版本: $(VERSION)"
	@echo "提交: $(GIT_COMMIT)"
	@echo "时间: $(BUILD_TIME)"

# 显示帮助信息
help:
	@echo "UniProxy Panel Backend Makefile"
	@echo ""
	@echo "可用目标:"
	@echo "  make build        - 编译后端服务（包含版本信息）"
	@echo "  make build-fast   - 快速编译（不包含版本信息）"
	@echo "  make build-prod   - 构建生产版本（优化压缩）"
	@echo "  make clean        - 清理构建文件"
	@echo "  make deps         - 下载依赖"
	@echo "  make deps-update  - 更新依赖"
	@echo "  make install      - 安装到系统目录"
	@echo "  make test         - 运行测试"
	@echo "  make coverage     - 生成测试覆盖率报告"
	@echo "  make lint         - 运行代码检查"
	@echo "  make fmt          - 格式化代码"
	@echo "  make run          - 运行服务（开发模式）"
	@echo "  make dev          - 热重载开发模式（需要 air）"
	@echo "  make systemd      - 生成 systemd 服务文件"
	@echo "  make version      - 显示版本信息"
	@echo "  make help         - 显示此帮助信息"
	@echo ""
	@echo "示例:"
	@echo "  make clean build  - 清理并重新编译"
	@echo "  make deps build   - 下载依赖并编译"
	@echo "  make test lint    - 运行测试和代码检查"
