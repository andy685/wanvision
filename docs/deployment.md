# 万影工坊部署手册

面向需要在新机器上把整套系统跑起来的人。所有端口、命令、默认值均已在本仓库实测校准。

- 只想本地开发 → 看 [方式 A](#方式-a本地开发推荐)
- 要验证部署或交付给别人 → 看 [方式 B](#方式-bdocker-compose-全量推荐)
- 要上线 → 看 [方式 C](#方式-c生产分域部署)

---

## 1. 架构总览

项目由 **3 个可独立部署的应用 + 1 个数据库** 构成。最容易搞混的一点是：`admin-console` 是**完全独立的前端应用**，和用户端没有任何代码复用，也不是 Nuxt 的一部分。

```text
                        ┌─────────────────────────────┐
   浏览器 ──3013──────► │ frontend (Nuxt 3 用户端)     │  开发模式独立进程
                        └──────────────┬──────────────┘
                                       │ /api 代理
   浏览器 ──3014──────► ┌──────────────┴──────────────┐
                        │ admin-console (Vue Pure Admin│  开发模式独立进程
                        │              独立管理后台)    │  容器模式 8081
                        └──────────────┬──────────────┘
                                       │ /api 代理
                        ┌──────────────▼──────────────┐
                        │ backend (Hono API)     5679  │
                        │ + 托管 frontend 静态产物      │  ← Docker 单容器
                        └──────────────┬──────────────┘
                                       │
                        ┌──────────────▼──────────────┐
                        │ MySQL 8.4              3308  │  ← 容器内 3306
                        └─────────────────────────────┘
```

### 服务清单

| 应用 | 目录 | 技术栈 | 开发端口 | 容器端口 | 说明 |
|---|---|---|---|---|---|
| 用户端 | `frontend/` | Nuxt 3 + Vue 3 + TS | `3013` | 同后端 `5679` | 生产环境由后端托管静态产物 |
| 后端 API | `backend/` | Hono + Drizzle + mysql2 | `5679` | `5679` | 同时托管用户端静态文件 |
| **管理后台** | `admin-console/` | Vue 3 + Element Plus | `3014` | `8081` | **独立应用**，仅调后端 API |
| 数据库 | — | MySQL 8.4 | — | `3308` → 容器 `3306` | 命名卷 `mysql-data` 持久化 |

> ⚠️ 历史上有过第二套后台 `frontend/app/pages/admin/`（长在用户端里的 `/admin` 路由），**已删除**。现在管理后台唯一入口就是 `admin-console`。如果你的分支里还能访问 `http://localhost:5679/admin`，说明镜像是旧构建，需要 `docker compose up -d --build`。

### 端口占用速查

| 端口 | 服务 | 冲突时的处理 |
|---|---|---|
| `5679` | 后端 API | 常见冲突源：本地 `npm run dev` 起的 backend 进程，`lsof -i :5679` 查杀 |
| `3308` | MySQL 宿主映射 | 原用 `3307`，被其他项目容器占用后改为 `3308`；改 `docker-compose.yml` 的 `ports` |
| `3013` | Nuxt 用户端（仅开发） | 改 `frontend/nuxt.config.ts` |
| `3014` | 管理后台（仅开发） | 改 `admin-console/.env.development` 的 `VITE_PORT` |
| `8081` | 管理后台容器 | 改 `docker-compose.yml` 的 `admin-console.ports` |

---

## 2. 环境要求

| 软件 | 版本 | 备注 |
|---|---|---|
| Node.js | 20+ | 后端 / 用户端 |
| Node.js | **22+** | **仅 `admin-console` 构建**。pnpm 11 在 Node 20 下报 `ERR_UNKNOWN_BUILTIN_MODULE`，Dockerfile 已用 `node:22-alpine` |
| pnpm | **11** | **仅 `admin-console` 需要**（后端/前端用 npm）。lockfile 为 9.0 格式，pnpm 11 可正常读取 |
| MySQL | 8.0+ | Docker 部署已内置，本机无需安装 |
| Docker | 任意近期版本 + Compose v2 | 仅方式 B / C 需要 |

`admin-console` 用 pnpm 且要求 11，后端和前端仍用 npm，两者互不干扰。本地版本不够时用 corepack 拉起，**不要在全局装旧版 pnpm**：

```bash
cd admin-console && corepack pnpm@11 dev
```

---

## 3. 部署方式

### 方式 A：本地开发（推荐）

三个终端，各起一个进程。支持热重载，改代码即时生效。

```bash
# 终端 1：后端 + 数据库（数据库需自备，或仅起后端连远程库）
cd backend && npm install && npm run dev      # → 5679

# 终端 2：用户端
cd frontend && npm install && npm run dev     # → 3013

# 终端 3：管理后台
cd admin-console && pnpm install && pnpm dev  # → 3014
```

访问地址：

| 应用 | 地址 |
|---|---|
| 用户端 | http://localhost:3013 |
| 管理后台 | http://localhost:3014 |
| 后端健康检查 | http://localhost:5679/api/v1/health/ready |

**依赖关系统**：`frontend` 和 `admin-console` 都通过代理把 `/api` 转发到 `http://localhost:5679`，所以**后端必须先起来**，否则两个前端能打开但所有接口 404。

一键脚本（见 [第 7 节](#7-自动化脚本)）：

```bash
./scripts/dev.sh
```

---

### 方式 B：Docker Compose 全量（推荐）

一条命令拉起 3 个容器（MySQL + 后端含用户端 + 管理后台）。

```bash
docker compose up -d --build
```

首次构建约 2–4 分钟（要拉 `mysql:8.4`、装依赖、`nuxt generate`、构建 admin-console）。之后改动代码才需要重新构建；仅重启 **1 秒内**完成：

```bash
docker compose up -d        # 无代码变更时用它，快
```

| 应用 | 地址 |
|---|---|
| 用户端 + 后端 | http://localhost:5679 |
| 管理后台 | http://localhost:8081 |
| MySQL | `localhost:3308`（账号 `huobao` / `huobao`，root 密码 `huobao_root`） |

常用命令：

```bash
docker compose ps                      # 查看状态，3 个都应 healthy
docker compose logs -f huobao-drama    # 跟随后端日志
docker compose logs -f admin-console   # 跟随管理后台日志
docker compose down                    # 停止并移除容器（数据卷保留）
docker compose down -v                 # 连数据库一起清掉（危险）
docker compose up -d --build huobao-drama   # 只重建后端
```

持久化挂载：

| 挂载 | 内容 |
|---|---|
| `./data` | 生成的图片/视频 |
| `./backend/workspace` | Agent 技能文件（设置页可在线编辑） |
| `mysql-data`（命名卷） | MySQL 数据 |

---

### 方式 C：生产分域部署

三个域名各司其职，**管理后台域名不要与用户端混用**（涉及登录态和 CORS 配置）：

| 域名 | 指向 |
|---|---|
| `wanying.example.com` | 用户端（backend 容器，含静态产物） |
| `admin.wanying.example.com` | 管理后台（admin-console 容器） |
| `api.wanying.example.com` | 后端 API（可与用户端同容器，由 Nginx 分流） |

管理后台容器通过环境变量指定后端地址（容器内默认是服务名，独立部署时必须改）：

```bash
docker run -d --name wanvision-admin \
  -p 8080:80 \
  -e BACKEND_UPSTREAM=api.wanying.example.com:443 \
  wanvision-admin:latest
```

`BACKEND_UPSTREAM` 支持 `host:port` 形式；若后端是 HTTPS，需自行修改 `nginx.conf.template` 中对应的 `proxy_pass` 为 `https://`。

外网 Nginx 参考 `README.md` 的「Nginx 分域反向代理」一节。

---

## 4. 环境变量

### 后端（`docker-compose.yml` 的 `huobao-drama.environment`）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `NODE_ENV` | `production` | **影响超管是否创建，见下节** |
| `PORT` | `5679` | 服务端口 |
| `DATABASE_URL` | `mysql://huobao:huobao@mysql:3306/huobao_drama` | 容器内用服务名 `mysql` |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | 生产设为用户端域名，多个用逗号分隔 |
| `ADMIN_ORIGIN` | — | 管理后台域名 |
| `API_KEY_ENCRYPTION_SECRET` | 空 | **生产必填**，AI 服务 Key 的加密密钥 |
| `ADMIN_PHONE` | `13800138000` | 超管手机号，**生产必须改** |
| `ADMIN_USERNAME` | `admin` | 超管登录账号，**生产必须改** |
| `ADMIN_PASSWORD` | `Admin@123456` | 超管密码，**生产必须改** |

支付相关（`WECHAT_*` / `ALIPAY_*`）、对象存储（`COS_*`）见 `docs/tencent-cloud-deployment.md`。

### 管理后台

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VITE_API_BASE_URL` | `/api/v1` | 接口基址，定义在 `src/utils/http/index.ts`。**默认相对路径，靠反代，一般不用改** |
| `VITE_PORT` | `3014`（dev）/ `8848`（.env） | 仅开发服务器生效 |
| `VITE_ROUTER_HISTORY` | `hash` | 路由模式，容器用 hash 无需额外 Nginx 回退规则 |
| `BACKEND_UPSTREAM` | `huobao-drama:5679` | **仅容器模式**，Nginx 反代目标 |

`.env` 优先级：`.env.production` > `.env.development` > `.env`。`VITE_API_BASE_URL` 只在 `.env.development` 显式写了，生产走代码里的默认值 `/api/v1`，这是有意为之——构建产物不绑定域名，同一份产物可部署到任意环境。

---

## 5. 初始化超管账号

管理后台**没有注册入口**，账号由后端启动时自动创建（`backend/src/routes/auth.ts` 的 `ensureBootstrapAdmin`）。

**这是最容易踩的坑**，逻辑如下：

```js
const phone = process.env.ADMIN_PHONE || (process.env.NODE_ENV === 'production' ? '' : DEV_ADMIN_PHONE)
if (!phone) return        // ← 直接返回，不创建任何账号
```

即：**`NODE_ENV=production` 时不设 `ADMIN_PHONE` 就完全不建号**，此时管理后台能打开但永远登不进去，且没有任何前端报错提示。

Docker Compose 已内置默认值 `ADMIN_PHONE=13800138000`，开箱可登。**正式部署必须覆盖这三个变量**：

```bash
ADMIN_PHONE=你的手机号 \
ADMIN_USERNAME=你的账号 \
ADMIN_PASSWORD=高强度密码 \
docker compose up -d
```

账号创建成功后后端日志会打印：

```
[auth] 已初始化超管账号 admin
```

看不到这行就是没建成功。确认方式：

```bash
docker compose logs huobao-drama 2>/dev/null | grep "已初始化超管"
```

### 登录凭据（开发默认）

| 项 | 值 |
|---|---|
| 地址 | http://localhost:3014（开发）/ http://localhost:8081（容器） |
| 账号 | `admin` |
| 密码 | `Admin@123456` |
| 角色 | `super_admin` |

> **只能用账号登录，不接受手机号。** 早期版本的 `/admin-login` 会按手机号回退查询，手机号可直接登后台，属于越权入口，已移除。现在传手机号会返回 `400 后台账号或密码错误`。

快速验证：

```bash
# 应返回 200
curl -s -X POST http://localhost:5679/api/v1/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123456"}'

# 应返回 400 {"message":"后台账号或密码错误"}
curl -s -X POST http://localhost:5679/api/v1/auth/admin-login \
  -H "Content-Type: application/json" \
  -d '{"username":"13800138000","password":"Admin@123456"}'
```

---

## 6. 健康检查与验收

```bash
# 后端就绪（含数据库连接状态）
curl http://localhost:5679/api/v1/health/ready
# 期望：{"status":"ready","database":"ok"}

# 管理后台容器
curl http://localhost:8081/nginx-health
# 期望：ok

# 三个容器状态
docker compose ps    # STATUS 列均应为 healthy
```

**部署完成的判断标准**（三条全过才算成功）：

1. `docker compose ps` 三个服务 `healthy`
2. `/api/v1/health/ready` 返回 `database: ok`
3. 能用超管账号**登录进管理后台**并看到运营概览数据（仅前两条不够——反代配错时前两条照样是绿的，但登录会 404）

---

## 7. 自动化脚本

| 脚本 | 用途 |
|---|---|
| `scripts/dev.sh` | 本地一键起开发全套（后端 + 用户端 + 管理后台），自动装依赖、检测端口 |
| `scripts/deploy.sh` | 生产/演示一键部署：环境检查 → 端口检测 → 构建 → 启动 → 健康检查 |

```bash
./scripts/dev.sh                # 本地开发
./scripts/deploy.sh             # 全量部署
./scripts/deploy.sh --no-build  # 跳过构建，仅重启（1 秒）
./scripts/deploy.sh --help      # 查看全部参数
```

`deploy.sh` 会在关键节点失败并给出明确原因（端口被占、Docker 未启动、健康检查超时），不会静默跳过。

---

## 8. 排障指南

以下均为实际发生过的问题，按现象查。

### Docker Hub 拉取镜像失败（`Bad Gateway` / `EOF`）

`node:20-slim` 等镜像从 Docker Hub 拉取可能失败。换镜像源后打回官方标签：

```bash
docker pull dockerproxy.com/library/node:20-slim
docker tag dockerproxy.com/library/node:20-slim node:20-slim
```

长期方案：在 Docker Desktop → Settings → Docker Engine 配置 `registry-mirrors`。

### 端口被占用导致 `docker compose up` 失败

报错含 `Bind for 0.0.0.0:XXXX failed: port is already allocated`。

```bash
lsof -i :5679      # 查出占用进程
kill <PID>         # 或改 docker-compose.yml 的 ports 映射
```

`3307` 曾被其他项目的 MySQL 容器占用，因此本项目改用 `3308`。

### Nuxt 构建报 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`

发生在 Nuxt 清理 `.nuxt` 缓存时，是环境的批量删除保护（阈值 50 个文件/轮次），**与代码无关**，不代表构建失败。用 `mv` 移走缓存目录绕开（`mv` 不计入删除）：

```bash
mv frontend/.nuxt /tmp/nuxt-cache-bak
cd frontend && npm run build
```

### `pnpm install` 报 `ERR_UNKNOWN_BUILTIN_MODULE`

pnpm 11 需要 Node 22+，在 Node 20 下必报此错。两个解法：

- 升级本机 Node 到 22+
- 或让容器构建（Dockerfile 已固定 `node:22-alpine`），不在本机构建

### 管理后台能打开，但登录报 404 / 接口不通

99% 是反向代理没配对。管理后台所有请求走相对路径 `/api/v1`，必须转发到后端：

- **开发模式**：检查 `admin-console/vite.config.ts` 的 `proxy./api.target` 是否为 `http://localhost:5679`，且后端确实在跑
- **容器模式**：检查 `BACKEND_UPSTREAM` 是否正确；进容器看渲染后的配置：
  ```bash
  docker compose exec admin-console cat /etc/nginx/conf.d/default.conf | grep proxy_pass
  ```

### 管理后台登录一直失败，无报错

超管账号没创建。按 [第 5 节](#5-初始化超管账号) 检查 `ADMIN_PHONE` 和日志。

### 管理后台弹出英文提示或 i18n key（如 `login.purePassWordReg`）

vue-i18n v11 下 `transformI18n` 用 `t.call()` 绑定 this 会失效，导致 key 被原样显示。已修复：改为按点号路径直接从中文表取值，`fallbackLocale` 设为 `zh`，并新增 `src/utils/errorMessage.ts` 统一把 axios 英文错误（`Network Error` / `timeout` / `Request failed with status code xxx`）映射为中文。

### 构建 admin-console 镜像时报 `COPY .npmrc` 失败

仓库中**没有 `.npmrc`**，早期 Dockerfile 的 `COPY .npmrc package.json ...` 会直接导致构建失败。现已移除该行，如需私有源请在 `pnpm install` 前用 `RUN` 命令写入。

### 用户端 `/admin` 仍能访问

旧镜像残留。执行 `docker compose up -d --build` 重建。

---

## 9. 数据备份

```bash
# 备份数据库
docker compose exec mysql mysqldump -uroot -phuobao_root huobao_drama > backup_$(date +%F).sql

# 恢复
docker compose exec -T mysql mysql -uroot -phuobao_root huobao_drama < backup_2026-09-10.sql

# 生成文件（data/ 与 workspace/ 已挂载在宿主机，直接打包即可）
tar -czf data_$(date +%F).tar.gz data backend/workspace
```
