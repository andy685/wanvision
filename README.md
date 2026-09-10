# 🎬 WanVision / 万影工坊

<div align="center">

**基于 TypeScript 全栈的 AI 短剧自动化生产平台**

[![Node Version](https://img.shields.io/badge/Node.js-20+-339933?style=flat&logo=node.js)](https://nodejs.org)
[![Vue Version](https://img.shields.io/badge/Vue-3.x-4FC08D?style=flat&logo=vue.js)](https://vuejs.org)

[功能特性](#功能特性) • [快速开始](#快速开始) • [部署指南](#部署指南)

</div>

---

## 📖 项目简介

WanVision（万影工坊）是一个基于 AI 的短剧自动化生产平台，实现从剧本生成、角色设计、分镜制作到视频合成的全流程自动化。

### 🎯 核心价值

- **🤖 AI 驱动**：使用大语言模型解析剧本，提取角色、场景和分镜信息
- **🎨 智能创作**：AI 绘图生成角色形象和场景背景
- **📹 视频生成**：基于文生视频和图生视频模型自动生成分镜视频
- **🔄 工作流**：完整的短剧制作工作流，从创意到成片一站式完成

### 🛠️ 技术架构

```
frontend/       — Nuxt 3 + Vue 3 + TypeScript 用户端(纯 CSS，无 UI 框架)
admin-console/  — Vue 3 + Element Plus 独立管理后台(vue-pure-admin，需 pnpm 9+)
backend/        — Hono + Drizzle ORM + Mastra AI Agents + mysql2
backend/workspace/skills/ — Agent 技能定义 (SKILL.md，支持界面在线编辑)
data/           — 生成资源文件
docker/         — init.sql 数据库初始化脚本(可选，启动时自动建表)
scripts/        — dev.sh / deploy.sh 一键启动与部署脚本
```

> **注意**：`admin-console/` 是**完全独立的应用**，与用户端无代码复用，也不是 Nuxt 的一部分。历史上曾有一套内嵌在用户端的 `/admin` 路由后台，已删除。管理后台唯一入口就是 `admin-console`。

---

## ✨ 功能特性

### 🎭 角色管理

- ✅ AI 生成角色形象
- ✅ 批量角色生成
- ✅ 角色图片上传和管理

### 🎬 视频任务

- ✅ AI 自动生成视频任务
- ✅ 场景描述和视频提示词生成
- ✅ 按任务批量生成视频

### 🎥 视频生成

- ✅ 文生视频自动生成
- ✅ FFmpeg 单镜头合成与字幕处理
- ✅ 整集拼接导出

### 📦 资源管理

- ✅ 素材库统一管理
- ✅ 本地存储支持
- ✅ 任务进度追踪

### 🤖 AI Agents

内置 4 个 Mastra Agent，支持数据库配置和 Skill 扩展：

| Agent | 职责 |
|---|---|
| `script_rewriter` | 小说 → 格式化剧本改写 |
| `extractor` | 角色 / 场景 / 道具智能提取与去重 |
| `storyboard_breaker` | 剧本 → 分镜序列拆解 |
| `prompt_generator` | 角色/场景/道具图片提示词 + 分镜视频提示词生成 |

### 🔌 多厂商适配

| 类型 | 支持厂商 |
|---|---|
| **文本** | OpenAI(兼容接口)、Gemini |
| **图片** | OpenAI、Gemini、火山引擎 |
| **视频** | 火山引擎 Seedance 2.0(标准 / Fast / Mini) |

---

## 🚀 快速开始

### 📋 环境要求

| 软件 | 版本要求 | 说明 |
|---|---|---|
| **Node.js** | 20+ | 后端 / 用户端运行环境 |
| **Node.js** | 22+ | **仅 `admin-console` 构建需要**（pnpm 11 在 Node 20 下会报 `ERR_UNKNOWN_BUILTIN_MODULE`） |
| **npm** | 9+ | 后端 / 用户端包管理 |
| **pnpm** | 11 | **仅 `admin-console` 需要**，与后端/前端的 npm 不冲突 |
| **MySQL** | 8.0+ | 本地开发由 `./scripts/dev.sh` 使用本机 MySQL 二进制初始化；Docker 部署已内置 |

> **FFmpeg 无需安装**：项目通过 `ffmpeg-static` / `ffprobe-static` npm 包内置二进制，本地与 Docker 均开箱即用。

### ⚙️ 环境变量

本地开发默认读取 `backend/.env`，统一使用 `mysql://huobao:huobao@127.0.0.1:3317/huobao_drama`。`./scripts/dev.sh` 会自动初始化并启动这份数据库。

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DATABASE_URL` | `mysql://huobao:huobao@127.0.0.1:3317/huobao_drama` | 完整 MySQL 连接串（优先） |
| `MYSQL_HOST` / `MYSQL_PORT` | `127.0.0.1` / `3317` | 未设 `DATABASE_URL` 时分项配置 |
| `MYSQL_USER` / `MYSQL_PASSWORD` | `huobao` / `huobao` | 同上 |
| `MYSQL_DATABASE` | `huobao_drama` | 同上 |
| `PORT` | `5679` | 后端服务端口 |
| `STORAGE_PATH` | `./data/static` | 生成文件存储目录 |
| `FRONTEND_ORIGIN` | — | 生产用户端域名，多个域名用逗号分隔 |
| `ADMIN_ORIGIN` | — | 生产管理后台域名，应和用户端域名分开 |
| `NUXT_PUBLIC_API_BASE` | `/api/v1` | 前端调用的 API 基址；分域部署时设为 `https://api.example.com/api/v1` |
| `NUXT_PUBLIC_APP_ORIGIN` | — | 用户端前端域名，如 `https://wanying.example.com` |
| `NUXT_PUBLIC_ADMIN_ORIGIN` | — | 管理后台前端域名，如 `https://admin.wanying.example.com` |
| `COS_SECRET_ID` / `COS_SECRET_KEY` / `COS_BUCKET` / `COS_REGION` | — | 正式环境必填。生成图片、视频、上传文件会镜像到 COS，换机器时 `/static/...` 可从 COS 签名读取 |

> **说明**：AI 服务的 API Key、Base URL 和模型参数全部在 Web 界面的「设置」页配置并入库，不在配置文件/环境变量中维护。

### 📥 安装依赖

```bash
# 克隆项目
git clone https://github.com/andy685/wanvision.git
cd wanvision

# 安装后端依赖
cd backend && npm install

# 安装前端依赖
cd ../frontend && npm install
```

### 🎯 启动项目

#### 方式一：本地开发模式（推荐）

一条命令启动本地开发所需的全部服务：MySQL、后端、用户端、管理后台。三个应用各自独立运行，均支持热重载。

```bash
# 启动全部
./scripts/dev.sh

# 停止全部
./scripts/dev.sh stop
```

| 应用 | 地址 | 端口 |
|---|---|---|
| MySQL | `mysql://huobao:huobao@127.0.0.1:3317/huobao_drama` | 3317 |
| 用户端 | `http://localhost:3013` | 3013 |
| 管理后台 | `http://localhost:3014` | 3014 |
| 后端 API | `http://localhost:5679/api/v1` | 5679 |

- 两个前端都自动代理 `/api` 和 `/static` 到后端，**后端未启动时页面能打开但接口会 404**
- 管理后台用 **pnpm 11**（不是 npm）；本地版本不够时用 `corepack pnpm@11 dev`，不要在全局装旧版
- 本地开发固定使用 `3317` 这份数据库，避免和 Docker 部署数据混用

正式环境建议分域部署：

- 用户端：`https://wanying.example.com`
- 管理后台：`https://admin.wanying.example.com`
- API：可独立为 `https://api.wanying.example.com/api/v1`，也可由两个前端域名分别反向代理 `/api`

#### 方式二：单服务模式（生产验证）

后端同时提供 API 和前端静态文件：

```bash
# 1. 构建前端
cd frontend && npm run generate

# 2. 复制构建产物到后端读取的目录（generate 产物在 .output/public，后端只读取 frontend/dist）
cp -r .output/public dist

# 3. 启动后端
cd ../backend && npm start
```

访问: `http://localhost:5679`

### 🗄️ 数据库

数据库表在首次启动时自动创建（幂等，每次启动自动重放初始化与迁移）。本地开发默认使用 `./scripts/dev.sh` 管理的 MySQL：

```bash
DATABASE_URL=mysql://huobao:huobao@127.0.0.1:3317/huobao_drama npm start
```

如需在应用外预建表（如 DBA 审核场景），可使用 `docker/init.sql`；schema 变更后通过 `cd backend && npx tsx scripts/export-init-sql.ts` 重新生成。

### 🔑 首次使用：配置 AI 服务

启动后所有 AI 功能（文本/生图/视频）都需要先配置模型服务，未配置时页面顶部会有横幅引导：

1. 打开「设置」页
2. 在「自有 API 快捷配置」中粘贴你的文本/图片/视频 API Key，一键写入三条推荐配置
3. 或使用「手动模板」按厂商逐个添加，支持连通性测试

配置完成横幅自动消失，即可开始创建剧集生产。

---

## 📦 部署指南

正式环境请优先使用根目录的 [DEPLOYMENT.md](./DEPLOYMENT.md)。那里包含纯净打包、生产环境变量、Docker Compose 编排、HTTPS 反向代理、备份和回滚步骤。

### 🐳 Docker 部署（推荐）

#### 方式一：Docker Compose（部署 / 生产验证）

一条命令拉起 **3 个容器**（MySQL + 后端含用户端 + 独立管理后台），含健康检查与启动顺序编排（应用等待 MySQL 就绪后启动，建表自动完成）：

```bash
# 构建并启动（首次约 2-4 分钟）
docker compose up -d --build

# 无代码变更时用它，秒级
docker compose up -d

# 或使用封装脚本（含环境检查、端口检测、健康验收）
./scripts/deploy.sh

# 查看日志 / 停止服务
docker compose logs -f
docker compose down          # 数据卷保留
```

| 应用 | 地址 | 端口 |
|---|---|---|
| 用户端 + 后端 API | `http://localhost:5679` | 5679 |
| 管理后台 | `http://localhost:8081` | 8081 |
| MySQL | 仅容器内部访问：`mysql:3306`（`huobao` / `huobao`） | 不暴露宿主机端口 |

> 本地开发和 Docker 部署使用不同数据库：本地开发是 `127.0.0.1:3317`，Docker 部署是 compose 内部的 `mysql-data` 数据卷。日常开发请用 `./scripts/dev.sh`，Docker 仅用于部署形态验证。

**管理后台默认账号**：`admin` / `Admin@123456`（角色 `super_admin`）

> ⚠️ 这是**开发默认凭据**。生产环境必须在 `docker-compose.yml` 或环境变量中修改 `ADMIN_PHONE` / `ADMIN_USERNAME` / `ADMIN_PASSWORD`，否则任何人都能登录后台。

> ⚠️ `NODE_ENV=production` 时若不设 `ADMIN_PHONE`，后端**不会创建任何超管账号**（`ensureBootstrapAdmin` 直接 return），表现为后台能打开但永远登不进。Compose 已内置默认值，独立部署 `docker run` 时必须显式传入。

持久化数据：

| 挂载 | 内容 |
|---|---|
| `./data` | 生成的图片/视频等文件 |
| `./backend/workspace` | Agent 技能文件（设置页可在线编辑） |
| `mysql-data`(命名卷) | MySQL 数据 |

> **提示**：compose 为源码构建方式，构建过程需从外网下载 `ffmpeg-static` / `sharp` 预编译二进制，网络受限环境请先配置 npm 镜像或代理。

#### 方式二：Docker 命令（预构建镜像）

```bash
# 从源码构建镜像
docker build -t wanvision:latest .

# 运行(MySQL 需另行准备,通过 DATABASE_URL 指向;命名卷自动从镜像初始化 skills 等内容)
docker run -d \
  --name wanvision \
  -p 5679:5679 \
  -v wanvision-data:/app/data \
  -v wanvision-workspace:/app/backend/workspace \
  -e DATABASE_URL=mysql://huobao:huobao@host.docker.internal:3317/huobao_drama \
  --restart unless-stopped \
  wanvision:latest

# 查看日志
docker logs -f wanvision
```

> **注意**：Linux 用户需添加 `--add-host=host.docker.internal:host-gateway` 以访问宿主机服务

**Docker 部署优势：**

- ✅ 前后端合并为单镜像、单端口
- ✅ 开箱即用，内置 FFmpeg 二进制，无需系统安装
- ✅ MySQL 健康检查 + 应用启动重试，首次部署零人工干预
- ✅ `data/` 与 `workspace/` 目录 volume 挂载，数据与技能持久化

#### 🔗 访问宿主机服务（Ollama / 本地模型）

容器内可通过 `http://host.docker.internal:端口号` 访问宿主机服务。

**配置步骤：**

1. 宿主机启动服务（监听所有接口）：

   ```bash
   export OLLAMA_HOST=0.0.0.0:11434 && ollama serve
   ```

2. 在 Web 界面「设置 → AI 服务配置」中填写：
   - Base URL: `http://host.docker.internal:11434/v1`
   - Provider: `openai`
   - Model: `qwen2.5:latest`

---

### 🏭 传统部署方式

```bash
# 1. 构建前端
cd frontend && npm run generate

# 2. 复制构建产物（generate 产物在 frontend/.output/public，后端只读取 frontend/dist，缺此步 API 正常但页面 404）
cp -r .output/public dist && cd ..

# 3. 启动后端
cd backend && npm start
```

需要上传到服务器的文件：

```
backend/                    # 后端源码 + node_modules
backend/workspace/skills/   # Agent 技能文件
frontend/dist/              # 前端构建产物
data/                       # 数据目录（首次运行自动创建）
```

#### Nginx 分域反向代理

```nginx
server {
    listen 80;
    server_name wanying.example.com;

    client_max_body_size 100m;

    location /static/ {
        alias /path/to/wanvision/data/static/;
        sendfile on;
        tcp_nopush on;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://localhost:5679;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 80;
    server_name admin.wanying.example.com;

    client_max_body_size 100m;

    location /api/ {
        proxy_pass http://localhost:5679;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://localhost:5679;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

> 媒体加载优化：生成图片时后端会自动产出 400px 缩略图（`*_thumb.webp`）供列表页加载，视频会抽取海报帧（`*_poster.jpg`）作为封面，前端仅在点开大图/播放时才加载原文件。历史存量文件可在 `backend/` 下执行 `npm run backfill-artwork` 一次性补齐。

---

## 🎨 技术栈

### 后端

- **运行时**: Node.js 20+
- **Web 框架**: Hono
- **ORM**: Drizzle ORM + mysql2
- **AI Agent**: Mastra + AI SDK (OpenAI compatible)
- **视频处理**: FFmpeg (fluent-ffmpeg)
- **图片处理**: Sharp

### 前端

- **框架**: Nuxt 3（SPA 模式）
- **语言**: Vue 3 + TypeScript
- **路由**: 文件路由 (Vue Router 4)
- **样式**: 纯 CSS + CSS Variables
- **图标**: Lucide Vue

---

## 📝 常见问题

### Q: Docker 容器如何访问宿主机的 Ollama？

A: 使用 `http://host.docker.internal:11434/v1` 作为 Base URL。注意：
1. 宿主机 Ollama 需监听 `0.0.0.0`：`export OLLAMA_HOST=0.0.0.0:11434 && ollama serve`
2. Linux 用户使用 `docker run` 需添加：`--add-host=host.docker.internal:host-gateway`

### Q: FFmpeg 未安装或找不到？

A: 无需安装。项目内置 `ffmpeg-static` / `ffprobe-static` 二进制（本地与 Docker 均是）。如自定义 `PATH` 中的系统 FFmpeg 也不会冲突，代码优先使用内置二进制。

### Q: 页面顶部提示「尚未配置模型」？

A: 这是正常的首次部署引导。前往「设置」页，用「自有 API 快捷配置」粘贴 API Key 一键写入，或通过「手动模板」按厂商添加。文本、图片、视频三类均有启用中的配置后横幅自动消失。

### Q: 前端无法连接后端 API？

A: 检查后端是否启动，端口是否正确。开发模式下前端代理配置在 `frontend/nuxt.config.ts`。

### Q: 管理后台登录一直失败，也没有报错？

A: 超管账号没被创建。后端 `NODE_ENV=production` 时若不设 `ADMIN_PHONE`，会跳过建号流程，此时后台能打开但永远登不进。检查：

```bash
docker compose logs huobao-drama | grep "已初始化超管账号"
```

看不到这行就是没建成功，需在 `docker-compose.yml` 中补 `ADMIN_PHONE` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` 后重启。

### Q: 管理后台页面能打开，但登录报 404？

A: 反向代理没配对。管理后台所有请求走相对路径 `/api/v1`，必须转发到后端：开发模式看 `admin-console/vite.config.ts` 的 proxy 配置，容器模式看 `BACKEND_UPSTREAM` 环境变量。

### Q: 管理后台能用手机号登录吗？

A: 不能，也**不应该**。早期版本 `/admin-login` 支持按手机号回退查询，等于给后台开了第二个入口，已移除。现在只能用后台账号（默认 `admin`）登录。

### Q: 构建 admin-console 报 `ERR_UNKNOWN_BUILTIN_MODULE`？

A: pnpm 11 需要 Node 22+，Node 20 下必报此错。升级 Node，或直接用容器构建（Dockerfile 已固定 `node:22-alpine`）。

### Q: 数据库表未创建？

A: 后端会在首次启动时自动创建所有表，检查日志确认初始化是否成功。

---

## 📋 更新日志

### v3.0.0 (2026-08)

#### 🚀 部署与体验优化

- Docker 部署就绪改造
  - MySQL / 应用健康检查，应用等待数据库就绪后启动
  - 数据库初始化增加重试，容器编排下首次部署零人工干预
  - 移除系统 FFmpeg 依赖，全面使用内置二进制
  - Agent skills 目录 volume 持久化（设置页在线编辑不丢失）
  - 新增 `docker/init.sql` 及导出脚本（DBA 审核 / 预建表）
- 首次使用引导
  - 未配置 AI 服务时全站顶部横幅提示并引导至设置页
  - 设置页新增「自有 API 快捷配置」：一个 Key 写入文本/图片/视频三条推荐配置
  - 未配置模型的报错中文化并指引设置页
- 视频模型默认调整为 Seedance 2.0 Fast
- 厂商收敛：仅保留 OpenAI / Gemini / 火山引擎
- 工作台：任务列表抽屉、流水线大环节状态、选择性拼接（拼接前校验视频文件存在）
- 素材库改版、@提及优化、剧集列表重构

### v2.0.0 (2026-04)

#### 🚀 重大更新

- 项目全面迁移至 TypeScript 技术栈
  - 后端：Hono + Drizzle ORM + mysql2
  - 前端：Nuxt 3 + Vue 3
  - AI Agent：Mastra 框架
- 重做单集工作台 UI 和生产流程
  - 更紧凑的控制台布局
  - 重做分镜编辑区
  - 重做镜头图、视频、合成、导出界面
- 新增 Docker 部署支持，前后端合并为单镜像
- 增加运行时 Skill 加载机制
- 扩展多厂商媒体 Adapter
  - 图片：OpenAI、Gemini、火山引擎、阿里
  - 视频：火山引擎/Seedance、Vidu、阿里
- 优化本地文件处理与参考图按需转码

### v1.0.4 (2026-01-27)

- 引入本地存储策略，规避外部资源链接失效
- Base64 参考图嵌入式传输
- 修复镜头切换状态重置问题
- 添加场景迁移至章节

### v1.0.3 (2026-01-16)

- 优化数据库并发访问性能
- Docker 跨平台支持 host.docker.internal

### v1.0.2 (2026-01-14)

- 修复视频生成 API 响应解析问题
- 添加 OpenAI Sora 视频端点配置
- 优化错误处理和日志输出

---

> _"让 AI 帮我们做更有创造力的事"_
