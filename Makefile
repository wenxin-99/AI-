# UniProxy Panel Makefile
# 统一的项目构建配置

# 变量定义
BACKEND_DIR=backend
CLIENT_DIR=client
INSTALL_DIR=/opt/uniproxy-panel

# 颜色输出
RED=\033[0;31m
GREEN=\033[0;32m
YELLOW=\033[1;33m
NC=\033[0m # No Color

.PHONY: all build clean install dev test help
.PHONY: backend frontend
.PHONY: backend-build backend-clean backend-install backend-test
.PHONY: frontend-build frontend-clean frontend-install frontend-dev
.PHONY: deploy start stop restart status logs
.PHONY: docker docker-build docker-up docker-down

# 默认目标
all: clean build

# 构建所有组件
build: backend-build frontend-build
	@echo "$(GREEN)==> 所有组件构建完成$(NC)"

# 清理所有构建文件
clean: backend-clean frontend-clean
	@echo "$(GREEN)==> 清理完成$(NC)"

# 安装所有组件
install: backend-install frontend-install
	@echo "$(GREEN)==> 所有组件安装完成$(NC)"

# 开发模式（并行启动前后端）
dev:
	@echo "$(YELLOW)==> 启动开发模式...$(NC)"
	@echo "$(YELLOW)    后端: http://localhost:8080$(NC)"
	@echo "$(YELLOW)    前端: http://localhost:5173$(NC)"
	@make -j2 backend-dev frontend-dev

# 运行所有测试
test: backend-test
	@echo "$(GREEN)==> 所有测试完成$(NC)"

# ============================================
# 后端目标
# ============================================

backend: backend-build

backend-build:
	@echo "$(YELLOW)==> 构建后端...$(NC)"
	@cd $(BACKEND_DIR) && $(MAKE) build

backend-clean:
	@echo "$(YELLOW)==> 清理后端...$(NC)"
	@cd $(BACKEND_DIR) && $(MAKE) clean

backend-install:
	@echo "$(YELLOW)==> 安装后端...$(NC)"
	@cd $(BACKEND_DIR) && $(MAKE) install

backend-test:
	@echo "$(YELLOW)==> 测试后端...$(NC)"
	@cd $(BACKEND_DIR) && $(MAKE) test

backend-dev:
	@cd $(BACKEND_DIR) && $(MAKE) run

backend-deps:
	@cd $(BACKEND_DIR) && $(MAKE) deps

# ============================================
# 前端目标
# ============================================

frontend: frontend-build

frontend-build:
	@echo "$(YELLOW)==> 构建前端...$(NC)"
	@cd $(CLIENT_DIR) && $(MAKE) build

frontend-clean:
	@echo "$(YELLOW)==> 清理前端...$(NC)"
	@cd $(CLIENT_DIR) && $(MAKE) clean

frontend-install:
	@echo "$(YELLOW)==> 安装前端...$(NC)"
	@cd $(CLIENT_DIR) && $(MAKE) install-dist

frontend-dev:
	@cd $(CLIENT_DIR) && $(MAKE) dev

frontend-deps:
	@cd $(CLIENT_DIR) && $(MAKE) install

# ============================================
# 部署相关
# ============================================

# 完整部署
deploy: build install
	@echo "$(GREEN)==> 部署完成$(NC)"
	@echo "$(YELLOW)请运行以下命令配置服务:$(NC)"
	@echo "    sudo bash setup.sh"

# 快速部署（使用现有脚本）
deploy-quick:
	@echo "$(YELLOW)==> 执行快速部署...$(NC)"
	@sudo bash setup.sh

# 启动服务
start:
	@echo "$(YELLOW)==> 启动服务...$(NC)"
	@sudo systemctl start uniproxy-panel
	@sudo systemctl start nginx
	@echo "$(GREEN)==> 服务已启动$(NC)"

# 停止服务
stop:
	@echo "$(YELLOW)==> 停止服务...$(NC)"
	@sudo systemctl stop uniproxy-panel
	@echo "$(GREEN)==> 服务已停止$(NC)"

# 重启服务
restart:
	@echo "$(YELLOW)==> 重启服务...$(NC)"
	@sudo systemctl restart uniproxy-panel
	@sudo systemctl restart nginx
	@echo "$(GREEN)==> 服务已重启$(NC)"

# 查看服务状态
status:
	@echo "$(YELLOW)==> 服务状态:$(NC)"
	@sudo systemctl status uniproxy-panel --no-pager || true
	@echo ""
	@echo "$(YELLOW)==> 端口监听:$(NC)"
	@sudo netstat -tlnp | grep -E '(8080|80|443)' || echo "未找到监听端口"

# 查看日志
logs:
	@echo "$(YELLOW)==> 查看服务日志（按 Ctrl+C 退出）:$(NC)"
	@sudo journalctl -u uniproxy-panel -f

# 查看最近日志
logs-tail:
	@echo "$(YELLOW)==> 最近 50 条日志:$(NC)"
	@sudo journalctl -u uniproxy-panel -n 50 --no-pager

# ============================================
# Docker 相关（可选）
# ============================================

docker: docker-build

docker-build:
	@echo "$(YELLOW)==> 构建 Docker 镜像...$(NC)"
	@docker build -t uniproxy-panel:latest .
	@echo "$(GREEN)==> Docker 镜像构建完成$(NC)"

docker-up:
	@echo "$(YELLOW)==> 启动 Docker 容器...$(NC)"
	@docker-compose up -d
	@echo "$(GREEN)==> Docker 容器已启动$(NC)"

docker-down:
	@echo "$(YELLOW)==> 停止 Docker 容器...$(NC)"
	@docker-compose down
	@echo "$(GREEN)==> Docker 容器已停止$(NC)"

docker-logs:
	@docker-compose logs -f

# ============================================
# 工具命令
# ============================================

# 检查环境
check-env:
	@echo "$(YELLOW)==> 检查开发环境...$(NC)"
	@echo "Go 版本:"
	@go version || echo "$(RED)Go 未安装$(NC)"
	@echo ""
	@echo "Node.js 版本:"
	@node --version || echo "$(RED)Node.js 未安装$(NC)"
	@echo ""
	@echo "pnpm 版本:"
	@pnpm --version || echo "$(RED)pnpm 未安装$(NC)"
	@echo ""
	@echo "Git 版本:"
	@git --version || echo "$(RED)Git 未安装$(NC)"

# 初始化项目
init: frontend-deps backend-deps
	@echo "$(GREEN)==> 项目初始化完成$(NC)"

# 代码格式化
fmt:
	@echo "$(YELLOW)==> 格式化代码...$(NC)"
	@cd $(BACKEND_DIR) && $(MAKE) fmt
	@cd $(CLIENT_DIR) && $(MAKE) fmt
	@echo "$(GREEN)==> 代码格式化完成$(NC)"

# 代码检查
lint:
	@echo "$(YELLOW)==> 运行代码检查...$(NC)"
	@cd $(BACKEND_DIR) && $(MAKE) lint || true
	@cd $(CLIENT_DIR) && $(MAKE) lint || true
	@echo "$(GREEN)==> 代码检查完成$(NC)"

# 更新依赖
update-deps:
	@echo "$(YELLOW)==> 更新依赖...$(NC)"
	@cd $(BACKEND_DIR) && $(MAKE) deps-update
	@cd $(CLIENT_DIR) && $(MAKE) update
	@echo "$(GREEN)==> 依赖更新完成$(NC)"

# 显示版本信息
version:
	@cd $(BACKEND_DIR) && $(MAKE) version

# 显示帮助信息
help:
	@printf "\033[0;32mUniProxy Panel Makefile\033[0m\n"
	@printf "\n"
	@printf "\033[1;33m通用目标:\033[0m\n"
	@echo "  make build        - 构建所有组件"
	@echo "  make clean        - 清理所有构建文件"
	@echo "  make install      - 安装所有组件"
	@echo "  make dev          - 启动开发模式（前后端并行）"
	@echo "  make test         - 运行所有测试"
	@echo "  make init         - 初始化项目（安装依赖）"
	@echo ""
	@echo "$(YELLOW)后端目标:$(NC)"
	@echo "  make backend-build    - 构建后端"
	@echo "  make backend-clean    - 清理后端"
	@echo "  make backend-install  - 安装后端"
	@echo "  make backend-test     - 测试后端"
	@echo "  make backend-dev      - 运行后端开发服务器"
	@echo ""
	@echo "$(YELLOW)前端目标:$(NC)"
	@echo "  make frontend-build   - 构建前端"
	@echo "  make frontend-clean   - 清理前端"
	@echo "  make frontend-install - 安装前端"
	@echo "  make frontend-dev     - 运行前端开发服务器"
	@echo ""
	@echo "$(YELLOW)部署目标:$(NC)"
	@echo "  make deploy       - 完整部署（构建+安装）"
	@echo "  make deploy-quick - 快速部署（使用 setup.sh）"
	@echo "  make start        - 启动服务"
	@echo "  make stop         - 停止服务"
	@echo "  make restart      - 重启服务"
	@echo "  make status       - 查看服务状态"
	@echo "  make logs         - 查看实时日志"
	@echo "  make logs-tail    - 查看最近日志"
	@echo ""
	@echo "$(YELLOW)Docker 目标:$(NC)"
	@echo "  make docker-build - 构建 Docker 镜像"
	@echo "  make docker-up    - 启动 Docker 容器"
	@echo "  make docker-down  - 停止 Docker 容器"
	@echo "  make docker-logs  - 查看 Docker 日志"
	@echo ""
	@echo "$(YELLOW)工具目标:$(NC)"
	@echo "  make check-env    - 检查开发环境"
	@echo "  make fmt          - 格式化代码"
	@echo "  make lint         - 运行代码检查"
	@echo "  make update-deps  - 更新依赖"
	@echo "  make version      - 显示版本信息"
	@echo "  make help         - 显示此帮助信息"
	@echo ""
	@echo "$(YELLOW)示例:$(NC)"
	@echo "  make init         - 首次使用，初始化项目"
	@echo "  make dev          - 开发时，启动前后端"
	@echo "  make build        - 构建前，编译所有组件"
	@echo "  make deploy-quick - 部署到服务器"
	@echo "  make restart      - 更新代码后，重启服务"
