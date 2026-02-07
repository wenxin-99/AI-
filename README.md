# UniProxy Panel

统一代理管理面板 - 整合 Xray 和 Gost 双引擎,提供强大的代理管理能力

## 功能特性

- ✅ **Xray 管理** - 完整的 Xray 入站配置管理
  - 支持 VMess、VLESS、Trojan、Shadowsocks 等协议
  - 支持 TCP、WebSocket、HTTP/2、gRPC 等传输层
  - 支持 TLS/XTLS 加密
  - 实时日志查看
  
- ✅ **Gost 管理** - 强大的 Gost 隧道管理
  - 支持 TCP、UDP、HTTP、SOCKS5 等协议
  - 支持速度限制
  - 支持认证配置
  - 实时日志查看

- ✅ **流量统计** - 详细的流量监控和统计

- ✅ **证书管理** - 自动化证书申请和续期

- ✅ **系统设置** - 用户管理、安全配置、密码修改

## 技术栈

**前端:**
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn/ui
- Wouter (路由)
- Recharts (图表)

**后端:**
- Go 1.21+
- Gin (Web框架)
- GORM (ORM)
- SQLite (数据库)
- JWT (认证)

## 快速开始

### 一键部署 (推荐)

```bash
# 下载并运行部署脚本
wget https://raw.githubusercontent.com/wenxin-99/AI-/main/deploy.sh
chmod +x deploy.sh
sudo ./deploy.sh
```

部署完成后:
- 访问地址: `http://你的服务器IP`
- 默认账号: `admin`
- 默认密码: `admin123`

### 手动部署

#### 1. 安装依赖

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y nodejs npm nginx sqlite3 golang-go

# 安装pnpm
sudo npm install -g pnpm
```

#### 2. 克隆项目

```bash
git clone https://github.com/wenxin-99/AI-.git
cd AI-
```

#### 3. 构建前端

```bash
pnpm install
pnpm build
```

#### 4. 部署前端

```bash
sudo mkdir -p /var/www/uniproxy-panel
sudo cp -r dist/public/* /var/www/uniproxy-panel/
```

#### 5. 配置Nginx

```nginx
server {
    listen 80;
    server_name _;

    location / {
        root /var/www/uniproxy-panel;
        try_files $uri $uri/ /index.html;
        index index.html;
    }

    location /api {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

#### 6. 构建并运行后端

```bash
cd backend
go mod download
go build -o uniproxy-panel main.go
./uniproxy-panel
```

## 开发指南

### 前端开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建生产版本
pnpm build
```

### 后端开发

```bash
cd backend

# 安装依赖
go mod download

# 运行开发服务器
go run main.go

# 构建
go build -o uniproxy-panel main.go
```

## 目录结构

```
.
├── client/              # 前端代码
│   ├── public/          # 静态资源
│   └── src/
│       ├── components/  # React组件
│       ├── pages/       # 页面组件
│       ├── services/    # API服务
│       └── lib/         # 工具函数
├── backend/             # 后端代码
│   ├── controllers/     # 控制器
│   ├── models/          # 数据模型
│   ├── routes/          # 路由
│   └── main.go          # 入口文件
├── deploy.sh            # 一键部署脚本
└── README.md
```

## 常见问题

### 1. 端口冲突

如果8080端口被占用,修改后端配置文件 `backend/config.yaml`:

```yaml
server:
  port: 8080  # 修改为其他端口
```

### 2. Nginx 404错误

确保Nginx配置正确,并且前端文件已正确部署到 `/var/www/uniproxy-panel/`

### 3. API 405错误

检查Nginx配置中的API代理设置,确保转发到正确的后端端口

### 4. 后端服务无法启动

查看日志:
```bash
journalctl -u uniproxy-panel -n 50
```

## 更新

```bash
cd /opt/uniproxy-panel
git pull
pnpm install
pnpm build
sudo rm -rf /var/www/uniproxy-panel/*
sudo cp -r dist/public/* /var/www/uniproxy-panel/
cd backend
go build -o uniproxy-panel main.go
sudo systemctl restart uniproxy-panel
```

## 贡献

欢迎提交 Issue 和 Pull Request!

## 许可证

MIT License

## 联系方式

- GitHub: [wenxin-99/AI-](https://github.com/wenxin-99/AI-)
