# UniProxy Panel Backend Dockerfile
# 多阶段构建，优化镜像大小

# 阶段 1: 构建阶段
FROM golang:1.24-alpine AS builder

# 安装构建依赖
RUN apk add --no-cache git make

# 设置工作目录
WORKDIR /build

# 复制 go.mod 和 go.sum
COPY go.mod go.sum ./

# 下载依赖（利用 Docker 缓存）
RUN go mod download

# 复制源代码
COPY . .

# 构建二进制文件
RUN make build-prod || go build -ldflags="-w -s" -o uniproxy-panel ./cmd/main.go

# 阶段 2: 运行阶段
FROM alpine:latest

# 安装运行时依赖
RUN apk add --no-cache ca-certificates tzdata

# 设置时区
ENV TZ=Asia/Shanghai

# 创建非 root 用户
RUN addgroup -g 1000 uniproxy && \
    adduser -D -u 1000 -G uniproxy uniproxy

# 设置工作目录
WORKDIR /app

# 从构建阶段复制二进制文件
COPY --from=builder /build/uniproxy-panel .

# 复制配置文件模板
COPY --from=builder /build/config.example.yaml ./config.yaml

# 创建数据目录
RUN mkdir -p /app/data && \
    chown -R uniproxy:uniproxy /app

# 切换到非 root 用户
USER uniproxy

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health || exit 1

# 启动服务
CMD ["./uniproxy-panel"]
