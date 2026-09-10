# 管理后台（admin-console）正式环境部署方案

> 适用版本：7.0.0（vite 8 构建，hash 路由，产物目录 `dist/`）

## 一、产物说明

`pnpm build` 产出 `dist/`（约 15 MB），已是纯净生产包：

| 项目 | 状态 |
| --- | --- |
| Mock 数据 | 不打包（`vite-plugin-fake-server` 仅 dev 生效） |
| console 调试 | 全部移除（`vite-plugin-remove-console`） |
| Sourcemap | 关闭（`build.sourcemap: false`） |
| CDN | 未启用（`VITE_CDN = false`，库全部本地打包） |
| 路由 | hash 模式，无需服务端路由回退配置 |
| API 地址 | 相对路径 `/api/v1`，由 nginx 反代到后端 |

产物结构：

```
dist/
├── index.html
├── favicon.ico / logo.* / version.json
├── static/js/、static/css/、static/png/   # 带内容 hash，可长期缓存
└── wasm/、html/、audio/                    # 静态资源
```

## 二、方案 A：Docker Compose 部署（推荐）

项目根目录 `docker-compose.yml` 已内置 `admin-console` 服务，与后端（`huobao-drama:5679`）联动。

```bash
# 1. 配置后端环境变量（复制后按正式环境填写，务必改掉默认密码）
cp .env.example .env 2>/dev/null || vi .env   # 参考 docker-compose.yml 的 environment 列表
#   必改：ADMIN_PASSWORD、API_KEY_ENCRYPTION_SECRET、FRONTEND_ORIGIN、ADMIN_ORIGIN
#   ADMIN_ORIGIN 填管理后台实际访问地址，例如 https://admin.example.com

# 2. 构建并启动（首次构建较慢，依赖走 npmmirror 国内源）
docker compose up -d --build

# 3. 验证
curl http://localhost:8081/nginx-health     # → ok
curl -I http://localhost:8081/              # → 200，index.html
curl http://localhost:8081/api/v1/health/ready
```

管理后台访问地址：`http://<服务器IP>:8081`。后端地址通过环境变量 `BACKEND_UPSTREAM` 注入（默认 `huobao-drama:5679`，即 compose 内服务名；独立部署时改为真实后端地址，如 `10.0.0.5:5679` 或 `api.example.com`）。

> ⚠️ 2026-09-10 修复：`nginx.conf.template` 原先把 `/static/` 整段反代到后端，会拦截前端自身的 `/static/js/*.js` 构建产物导致白屏。已改为本地优先（`try_files $uri @backend`）、未命中回源后端。**部署前请确认使用的是修复后的模板。**

## 三、方案 B：纯静态产物 + 独立 nginx

服务器上已有后端与 nginx 时使用，不引入 Docker。

### 1. 上传产物

```bash
# 本地打包
cd admin-console && tar czf admin-console-dist.tar.gz -C dist .
# 上传并解压
scp admin-console-dist.tar.gz user@server:/var/www/admin-console/
ssh user@server "mkdir -p /var/www/admin-console && tar xzf /var/www/admin-console/admin-console-dist.tar.gz -C /var/www/admin-console"
```

### 2. nginx 站点配置

以 `/etc/nginx/conf.d/admin-console.conf` 为例（与 `nginx.conf.template` 同源，手工替换变量即可）：

```nginx
server {
    listen 80;
    server_name admin.example.com;          # 换成实际域名

    root /var/www/admin-console;
    index index.html;

    # API 反代到后端（后端默认端口 5679）
    location /api/ {
        proxy_pass http://127.0.0.1:5679;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        client_max_body_size 100m;
    }

    # 前端构建产物优先本地；后端生成的图片/视频回源后端
    location /static/ {
        root /var/www/admin-console;
        try_files $uri @backend;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
    location @backend {
        proxy_pass http://127.0.0.1:5679;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # hash 路由，兜底首页
    location / {
        try_files $uri $uri/ /index.html;
    }

    # gzip（产物已带 hash，gzip_static 有预压缩文件时更优）
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1k;
}
```

```bash
nginx -t && nginx -s reload
```

### 3. HTTPS

域名解析到服务器后，用 certbot 一键签发并自动改写 nginx：

```bash
sudo certbot --nginx -d admin.example.com
```

## 四、后端侧要求

- 后端默认端口 `5679`（`PORT` 环境变量可改）。
- 生产必须配置：`DATABASE_URL`（MySQL）、`API_KEY_ENCRYPTION_SECRET`、`ADMIN_USERNAME` / `ADMIN_PASSWORD`（首次初始化超管）。
- 跨域白名单（`backend/src/index.ts`）：`ADMIN_ORIGIN` 填管理后台的完整访问地址；同域反代（如上 nginx 配置）时 API 与页面同源，不存在跨域问题。
- 健康检查：`GET /api/v1/health/ready`。

## 五、发布与回滚

**发布**：重新构建 → 上传替换 → 浏览器强刷（产物带 hash，新引用自然生效；旧 hash 文件保留片刻可实现平滑过渡）。

```bash
# 独立 nginx 场景的原子切换做法：按版本目录部署 + 软链
ssh user@server "
  mkdir -p /var/www/admin-console-releases/$(date +%Y%m%d%H%M) && \
  tar xzf /tmp/admin-console-dist.tar.gz -C /var/www/admin-console-releases/$(date +%Y%m%d%H%M) && \
  ln -sfn /var/www/admin-console-releases/$(date +%Y%m%d%H%M) /var/www/admin-console"
```

**回滚**：把软链指回上一版本目录即可，无需重新上传。

## 六、验证清单

- [ ] `https://<域名>/` 打开登录页，无白屏（重点验证 `/static/js/*.js` 返回 200 且来自本地）
- [ ] 登录成功，接口 `/api/v1/auth/admin-login` 返回 200
- [ ] 退出登录 / 让 token 失效后操作页面 → 自动跳回 `/login`
- [ ] 图片/视频等后端生成资源正常加载（`/static/` 回源）
- [ ] 刷新任意 hash 路由页面（如 `/#/users`）正常显示
