# pnpm 11 在 Node 20 下会报 ERR_UNKNOWN_BUILTIN_MODULE，必须使用 Node 22+
FROM node:22-alpine AS build-stage

WORKDIR /app

# 固定 pnpm 11，与本地开发环境保持一致（lockfile 为 9.0 格式，11 可正常读取）
RUN corepack enable && corepack prepare pnpm@11 --activate

RUN npm config set registry https://registry.npmmirror.com

# 注意：仓库中没有 .npmrc，不要 COPY，否则构建直接失败
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM nginx:stable-alpine AS production-stage

# 管理后台所有接口都走相对路径 /api/v1，必须由 nginx 反代到后端，否则登录会 404
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

COPY --from=build-stage /app/dist /usr/share/nginx/html

ENV BACKEND_UPSTREAM=huobao-drama:5679
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost/nginx-health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
