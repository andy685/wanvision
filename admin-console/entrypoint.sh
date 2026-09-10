#!/bin/sh
set -e

# 后端地址在运行时注入，默认指向 compose 内的服务名
: "${BACKEND_UPSTREAM:=huobao-drama:5679}"

# 用模板渲染真实 nginx 配置（避免为了 envsubst 额外安装 gettext）
sed "s|\${BACKEND_UPSTREAM}|${BACKEND_UPSTREAM}|g" \
  /etc/nginx/nginx.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
