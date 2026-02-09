# Docker 部署指南

UniProxy Panel 支持 Docker 和 Docker Compose 部署，提供开箱即用的容器化解决方案。

## 📦 快速开始

### 使用 Docker Compose（推荐）

```bash
# 1. 克隆项目
git clone https://github.com/wenxin-99/AI-.git
cd AI-

# 2. 启动所有服务
docker-compose up -d

# 3. 查看日志
docker-compose logs -f

# 4. 访问服务
# 前端: http://localhost
# 后端: http://localhost:8080
```

### 使用 Makefile

```bash
# 构建 Docker 镜像
make docker-build

# 启动容器
make docker-up

# 查看日志
make docker-logs

# 停止容器
make docker-down
```

## 🛠️ 配置说明

### 环境变量

在 `docker-compose.yml` 中配置环境变量：

```yaml
services:
  backend:
    environment:
      - TZ=Asia/Shanghai          # 时区
      - GIN_MODE=release          # Gin 模式（release/debug）
      - DB_TYPE=sqlite            # 数据库类型
      - DB_PATH=/app/data/db.sqlite  # 数据库路径
```

### 端口映射

默认端口映射：

- **前端**: `80:80` - 访问 http://localhost
- **后端**: `8080:8080` - 访问 http://localhost:8080

修改端口映射：

```yaml
services:
  frontend:
    ports:
      - "8000:80"  # 改为 8000 端口
  backend:
    ports:
      - "9000:8080"  # 改为 9000 端口
```

### 数据持久化

后端数据存储在 Docker volume 中：

```yaml
volumes:
  backend-data:
    driver: local
```

查看数据卷：

```bash
docker volume ls
docker volume inspect ai-_backend-data
```

备份数据：

```bash
docker run --rm -v ai-_backend-data:/data -v $(pwd):/backup alpine tar czf /backup/backend-data-backup.tar.gz -C /data .
```

恢复数据：

```bash
docker run --rm -v ai-_backend-data:/data -v $(pwd):/backup alpine tar xzf /backup/backend-data-backup.tar.gz -C /data
```

## 🔧 开发环境

### 使用开发配置

```bash
# 启动开发环境（支持热重载）
docker-compose -f docker-compose.dev.yml up -d

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f

# 停止开发环境
docker-compose -f docker-compose.dev.yml down
```

开发环境特性：

- ✅ 源代码挂载，支持热重载
- ✅ 包含 MySQL 和 Redis
- ✅ 开发模式（详细日志）
- ✅ 端口映射到宿主机

### 访问开发服务

- **前端开发服务器**: http://localhost:5173
- **后端开发服务器**: http://localhost:8080
- **MySQL**: localhost:3306
  - 用户: `uniproxy`
  - 密码: `uniproxy123`
  - 数据库: `uniproxy_dev`
- **Redis**: localhost:6379

## 📝 常用命令

### 容器管理

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose stop

# 重启服务
docker-compose restart

# 停止并删除容器
docker-compose down

# 停止并删除容器和数据卷
docker-compose down -v

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend
docker-compose logs -f frontend
```

### 镜像管理

```bash
# 构建镜像
docker-compose build

# 强制重新构建
docker-compose build --no-cache

# 拉取最新镜像
docker-compose pull

# 查看镜像
docker images | grep uniproxy
```

### 进入容器

```bash
# 进入后端容器
docker-compose exec backend sh

# 进入前端容器
docker-compose exec frontend sh

# 以 root 用户进入
docker-compose exec -u root backend sh
```

### 健康检查

```bash
# 查看容器健康状态
docker-compose ps

# 手动执行健康检查
docker-compose exec backend wget --no-verbose --tries=1 --spider http://localhost:8080/api/health
```

## 🚀 生产部署

### 1. 准备配置文件

```bash
# 复制配置文件模板
cp backend/config.example.yaml backend/config.yaml

# 编辑配置
vim backend/config.yaml
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
# 时区
TZ=Asia/Shanghai

# 后端配置
GIN_MODE=release
DB_TYPE=sqlite

# MySQL 配置（如果使用 MySQL）
MYSQL_ROOT_PASSWORD=your_strong_password
MYSQL_DATABASE=uniproxy
MYSQL_USER=uniproxy
MYSQL_PASSWORD=your_password
```

### 3. 启动服务

```bash
# 构建并启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f

# 检查服务状态
docker-compose ps
```

### 4. 配置反向代理（可选）

如果使用 Nginx 或 Traefik 作为反向代理：

```nginx
# Nginx 配置示例
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5. 启用 HTTPS（推荐）

使用 Let's Encrypt 免费证书：

```bash
# 安装 certbot
sudo apt-get install certbot python3-certbot-nginx

# 申请证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

## 🔒 安全建议

1. **修改默认密码**
   - 修改 MySQL root 密码
   - 修改应用管理员密码

2. **使用环境变量**
   - 不要在 docker-compose.yml 中硬编码密码
   - 使用 `.env` 文件管理敏感信息

3. **限制端口暴露**
   - 只暴露必要的端口
   - 使用反向代理而不是直接暴露服务

4. **定期更新**
   ```bash
   # 拉取最新镜像
   docker-compose pull
   
   # 重启服务
   docker-compose up -d
   ```

5. **备份数据**
   - 定期备份数据卷
   - 备份配置文件

## 🐛 故障排查

### 容器无法启动

```bash
# 查看详细日志
docker-compose logs backend
docker-compose logs frontend

# 检查容器状态
docker-compose ps

# 查看容器详细信息
docker inspect <container_id>
```

### 端口冲突

```bash
# 检查端口占用
sudo netstat -tlnp | grep -E '(80|8080)'

# 修改 docker-compose.yml 中的端口映射
```

### 数据库连接失败

```bash
# 检查 MySQL 容器状态
docker-compose ps mysql

# 查看 MySQL 日志
docker-compose logs mysql

# 测试连接
docker-compose exec backend ping mysql
```

### 镜像构建失败

```bash
# 清理缓存重新构建
docker-compose build --no-cache

# 查看构建日志
docker-compose build --progress=plain
```

### 磁盘空间不足

```bash
# 清理未使用的镜像
docker image prune -a

# 清理未使用的容器
docker container prune

# 清理未使用的数据卷
docker volume prune

# 清理所有未使用的资源
docker system prune -a --volumes
```

## 📊 监控和日志

### 查看资源使用

```bash
# 查看容器资源使用情况
docker stats

# 查看特定容器
docker stats uniproxy-backend uniproxy-frontend
```

### 日志管理

```bash
# 查看最近 100 行日志
docker-compose logs --tail=100

# 查看实时日志
docker-compose logs -f

# 导出日志
docker-compose logs > logs.txt
```

### 集成监控工具

可以集成 Prometheus + Grafana 进行监控：

```yaml
# docker-compose.yml 添加
services:
  prometheus:
    image: prom/prometheus
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
```

## 🔄 更新和升级

### 更新到最新版本

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 重新构建镜像
docker-compose build

# 3. 重启服务
docker-compose up -d

# 4. 验证更新
docker-compose ps
docker-compose logs -f
```

### 回滚到之前版本

```bash
# 1. 停止服务
docker-compose down

# 2. 切换到之前的版本
git checkout <previous_version>

# 3. 重新构建并启动
docker-compose up -d --build
```

## 📚 参考资源

- [Docker 官方文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [Dockerfile 最佳实践](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)

## 💬 获取帮助

如有问题，请：

1. 查看日志: `docker-compose logs -f`
2. 检查 GitHub Issues
3. 提交新的 Issue

---

**提示**: 生产环境建议使用 Docker Swarm 或 Kubernetes 进行编排和管理。
