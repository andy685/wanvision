# 万影工坊生产部署方案

这份方案用于正式环境交付。项目按三块部署：用户端由后端容器托管静态产物，管理后台是独立 Nginx 容器，数据库使用 MySQL 容器并持久化到 Docker volume。

## 1. 推荐架构

| 服务 | 容器 | 默认监听 | 对外域名 |
|---|---|---:|---|
| 用户端 + API | `huobao-drama` | `127.0.0.1:5679` | `https://wanying.example.com` |
| 管理后台 | `admin-console` | `127.0.0.1:8081` | `https://admin.wanying.example.com` |
| 数据库 | `mysql` | 仅容器内访问 | 不暴露公网 |

正式环境建议用 Nginx、Caddy 或云负载均衡统一终止 HTTPS。MySQL 不开放公网端口。

## 2. 服务器要求

| 规模 | 建议配置 |
|---|---|
| 小规模试运行 | 2 核 CPU / 4 GB 内存 / 80 GB SSD |
| 正式使用 | 4 核 CPU / 8 GB 内存 / 200 GB SSD 起 |

系统依赖：Docker Engine、Docker Compose v2。应用镜像内已包含 Node 和 FFmpeg 相关依赖。

## 3. 打纯净包

在开发机项目根目录执行：

```bash
./scripts/package-clean.sh
```

产物会生成在 `release/wanvision-clean-YYYYMMDD-HHMMSS.tar.gz`，旁边会生成对应的 `.sha256` 校验文件。

纯净包会排除以下内容：

- `.git`、本地 IDE/调试目录、临时截图和审计报告
- `node_modules`、构建产物、Nuxt 缓存
- `backend/.env`、`admin-console/.env*` 等本机配置
- `data/static`、`data/storage`、本地数据库和生成素材

`backend/workspace/skills` 会保留，因为它是 Agent 技能配置的一部分，也需要在生产环境持久化。

## 4. 首次部署

上传并解压纯净包：

```bash
tar -xzf wanvision-clean-YYYYMMDD-HHMMSS.tar.gz
cd wanvision
cp .env.production.example .env.production
```

编辑 `.env.production`，至少替换这些值：

```bash
FRONTEND_ORIGIN=https://wanying.example.com
ADMIN_ORIGIN=https://admin.wanying.example.com
PUBLIC_BASE_URL=https://wanying.example.com
MYSQL_PASSWORD=替换为强密码
MYSQL_ROOT_PASSWORD=替换为另一个强密码
API_KEY_ENCRYPTION_SECRET=使用 openssl rand -hex 32 生成
ADMIN_PHONE=你的超管手机号
ADMIN_USERNAME=admin
ADMIN_PASSWORD=替换为强密码
```

启动生产编排：

```bash
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
```

检查状态：

```bash
docker compose -f docker-compose.production.yml --env-file .env.production ps
docker compose -f docker-compose.production.yml --env-file .env.production logs -f huobao-drama
```

健康检查：

```bash
curl http://127.0.0.1:5679/api/v1/health/ready
curl http://127.0.0.1:8081/nginx-health
```

## 5. 反向代理

Nginx 示例：

```nginx
server {
    listen 443 ssl http2;
    server_name wanying.example.com;

    ssl_certificate /etc/letsencrypt/live/wanying.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wanying.example.com/privkey.pem;

    client_max_body_size 200m;

    location / {
        proxy_pass http://127.0.0.1:5679;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}

server {
    listen 443 ssl http2;
    server_name admin.wanying.example.com;

    ssl_certificate /etc/letsencrypt/live/admin.wanying.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.wanying.example.com/privkey.pem;

    client_max_body_size 200m;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

如果使用 Caddy：

```caddyfile
wanying.example.com {
    reverse_proxy 127.0.0.1:5679
}

admin.wanying.example.com {
    reverse_proxy 127.0.0.1:8081
}
```

## 6. 上线后初始化

1. 打开管理后台 `https://admin.wanying.example.com`。
2. 用 `.env.production` 里的 `ADMIN_PHONE` / `ADMIN_PASSWORD` 登录。
3. 进入「AI 服务」配置文本、图片、视频模型服务。
4. 进入「价格规则」确认每个步骤的积分规则。
5. 建议登录后立刻修改默认超管密码。

## 7. 升级与回滚

升级：

```bash
tar -xzf wanvision-clean-new.tar.gz -C /opt
cd /opt/wanvision
cp /opt/wanvision-old/.env.production .env.production
docker compose -f docker-compose.production.yml --env-file .env.production up -d --build
```

回滚：

```bash
cd /opt/wanvision-old
docker compose -f docker-compose.production.yml --env-file .env.production up -d
```

数据库 volume 默认保留。涉及数据库结构升级前，先做备份。

## 8. 备份

数据库备份：

```bash
docker compose -f docker-compose.production.yml --env-file .env.production exec mysql \
  sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > backup_$(date +%F).sql
```

本地文件存储备份：

```bash
tar -czf data-backup_$(date +%F).tar.gz data backend/workspace
```

如果启用了 COS，对象文件以 COS 为准，同时保留数据库备份。

## 9. 生产检查清单

- `.env.production` 没有使用 example 里的占位密码。
- `API_KEY_ENCRYPTION_SECRET` 已设置且上线后不要随意更换。
- MySQL 没有暴露公网端口。
- 用户端和管理后台都已经配置 HTTPS。
- `FRONTEND_ORIGIN`、`ADMIN_ORIGIN`、`PUBLIC_BASE_URL` 与真实域名一致。
- 已完成一次数据库备份恢复演练。
- 已在管理后台配置 AI 服务，并用测试按钮确认连通。
