# UniProxy Panel Frontend Makefile
# 统一的前端构建配置

# 变量定义
PNPM=pnpm
BUILD_DIR=dist
INSTALL_DIR=/opt/uniproxy-panel/client

.PHONY: all install build clean dev preview lint fmt help

# 默认目标
all: clean install build

# 安装依赖
install:
	@echo "==> 安装前端依赖..."
	$(PNPM) install

# 构建生产版本
build:
	@echo "==> 构建前端生产版本..."
	$(PNPM) run build
	@echo "==> 构建完成: $(BUILD_DIR)/"
	@du -sh $(BUILD_DIR)

# 快速构建（跳过类型检查）
build-fast:
	@echo "==> 快速构建..."
	$(PNPM) run build --mode production
	@echo "==> 构建完成"

# 清理构建文件
clean:
	@echo "==> 清理构建文件..."
	@rm -rf $(BUILD_DIR)
	@rm -rf node_modules/.vite
	@echo "==> 清理完成"

# 深度清理（包括 node_modules）
clean-all: clean
	@echo "==> 深度清理..."
	@rm -rf node_modules
	@rm -rf pnpm-lock.yaml
	@echo "==> 深度清理完成"

# 开发模式
dev:
	@echo "==> 启动开发服务器..."
	$(PNPM) run dev

# 预览生产构建
preview: build
	@echo "==> 预览生产构建..."
	$(PNPM) run preview

# 代码检查
lint:
	@echo "==> 运行代码检查..."
	$(PNPM) run lint || echo "提示: 请在 package.json 中配置 lint 脚本"

# 格式化代码
fmt:
	@echo "==> 格式化代码..."
	@which prettier > /dev/null && prettier --write "src/**/*.{ts,tsx,js,jsx,css,scss,json}" || echo "提示: 安装 prettier 可格式化代码"

# 类型检查
typecheck:
	@echo "==> 运行类型检查..."
	$(PNPM) run typecheck || tsc --noEmit

# 安装到系统目录
install-dist: build
	@echo "==> 安装到 $(INSTALL_DIR)..."
	@mkdir -p $(INSTALL_DIR)
	@cp -r $(BUILD_DIR)/* $(INSTALL_DIR)/
	@echo "==> 安装完成"

# 分析构建大小
analyze:
	@echo "==> 分析构建大小..."
	$(PNPM) run build -- --mode analyze || echo "提示: 需要配置 rollup-plugin-visualizer"

# 更新依赖
update:
	@echo "==> 更新依赖..."
	$(PNPM) update

# 显示帮助信息
help:
	@echo "UniProxy Panel Frontend Makefile"
	@echo ""
	@echo "可用目标:"
	@echo "  make install      - 安装依赖"
	@echo "  make build        - 构建生产版本"
	@echo "  make build-fast   - 快速构建"
	@echo "  make clean        - 清理构建文件"
	@echo "  make clean-all    - 深度清理（包括 node_modules）"
	@echo "  make dev          - 启动开发服务器"
	@echo "  make preview      - 预览生产构建"
	@echo "  make lint         - 运行代码检查"
	@echo "  make fmt          - 格式化代码"
	@echo "  make typecheck    - 运行类型检查"
	@echo "  make install-dist - 安装到系统目录"
	@echo "  make analyze      - 分析构建大小"
	@echo "  make update       - 更新依赖"
	@echo "  make help         - 显示此帮助信息"
	@echo ""
	@echo "示例:"
	@echo "  make clean build  - 清理并重新构建"
	@echo "  make install dev  - 安装依赖并启动开发服务器"
