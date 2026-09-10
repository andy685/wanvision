#!/usr/bin/env bash
#
# 生产/演示环境一键部署（Docker Compose）
#
# 用法:
#   ./scripts/deploy.sh                构建并启动全部服务
#   ./scripts/deploy.sh --no-build     跳过构建，仅重启（无代码变更时用，秒级）
#   ./scripts/deploy.sh --backend-only 只重建并重启后端
#   ./scripts/deploy.sh --down         停止并移除容器（数据卷保留）
#   ./scripts/deploy.sh --help         查看帮助
#
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# 脚本绝对路径：下面会 cd 到 ROOT_DIR，相对路径的 BASH_SOURCE 会失效
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
cd "$ROOT_DIR" || exit 1

APP_PORT=5679
MYSQL_PORT=3308
ADMIN_PORT=8081

GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[info]${NC}  $*"; }
success() { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
fail()    { echo -e "${RED}[fail]${NC}  $*"; }

port_in_use() { lsof -ti "tcp:$1" >/dev/null 2>&1; }

usage() { sed -n '2,10p' "$SCRIPT_PATH" | sed 's/^# *//'; exit 0; }

BUILD=1
TARGET=""
case "${1:-}" in
  --no-build)    BUILD=0 ;;
  --backend-only) TARGET="huobao-drama" ;;
  --down)
    info "停止并移除容器（数据卷保留）..."
    docker compose down && success "已停止"
    exit 0 ;;
  -h|--help)     usage ;;
  "")            ;;
  *) fail "未知参数: $1"; usage ;;
esac

echo ""
info "万影工坊部署开始"
echo ""

# ---------- 1. 检查 docker ----------
if ! command -v docker >/dev/null 2>&1; then
  fail "未找到 docker，请先安装 Docker Desktop"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  warn "Docker daemon 未运行，尝试启动 Docker Desktop..."
  if [[ "$(uname)" == "Darwin" ]]; then
    open -a Docker || { fail "无法启动 Docker Desktop，请手动启动后重试"; exit 1; }
  else
    fail "Docker daemon 未运行，请手动启动 Docker 服务"
    exit 1
  fi
  for i in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
  docker info >/dev/null 2>&1 || { fail "Docker 启动超时（60s）"; exit 1; }
fi
success "Docker 已就绪"

# ---------- 2. 端口检查 ----------
conflict=0
for p in $APP_PORT $MYSQL_PORT $ADMIN_PORT; do
  if port_in_use "$p"; then
    fail "端口 $p 已被占用："
    # 用 lsof 原始输出，容器进程经常查不到 ps 命令行
    lsof -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | tail -1 | sed 's/^/         /'
    info "  释放端口: lsof -ti tcp:$p | xargs kill"
    conflict=1
  fi
done
[[ $conflict -eq 1 ]] && {
  echo ""
  warn "请停掉占用进程，或修改 docker-compose.yml 的 ports 映射后重试"
  exit 1
}
success "端口 $APP_PORT / $MYSQL_PORT / $ADMIN_PORT 均空闲"

# ---------- 3. 构建并启动 ----------
if [[ $BUILD -eq 1 ]]; then
  info "构建镜像并启动（首次约 2-4 分钟）..."
  if [[ -n "$TARGET" ]]; then
    docker compose up -d --build "$TARGET" || { fail "构建失败"; exit 1; }
  else
    docker compose up -d --build || { fail "构建失败"; exit 1; }
  fi
else
  info "跳过构建，直接启动..."
  docker compose up -d || { fail "启动失败"; exit 1; }
fi
success "容器已启动"

# ---------- 4. 等待健康检查 ----------
info "等待后端就绪（最多 120s）..."
ready=0
for i in $(seq 1 120); do
  resp=$(curl -sf "http://localhost:$APP_PORT/api/v1/health/ready" 2>/dev/null || echo "")
  if [[ -n "$resp" ]]; then
    ready=1
    break
  fi
  sleep 1
done

echo ""
echo -e "${GREEN}================= 部署结果 =================${NC}"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null
echo ""

if [[ $ready -eq 1 ]]; then
  success "后端健康检查通过: $resp"
else
  warn "后端 120s 内未就绪"
  warn "排查：docker compose logs -f huobao-drama"
  warn "常见原因：MySQL 未就绪 / 数据库迁移失败 / 端口冲突"
fi

# ---------- 5. 检查超管账号 ----------
if docker compose logs huobao-drama 2>/dev/null | grep -q "已初始化超管账号"; then
  success "超管账号已就绪"
else
  warn "未检测到超管账号初始化日志，管理后台可能登录失败"
  warn "确认 ADMIN_PHONE 已设置: docker compose exec huobao-drama printenv ADMIN_PHONE"
fi

echo ""
echo -e "${GREEN}================= 访问地址 =================${NC}"
echo -e "  用户端 + API : ${BLUE}http://localhost:$APP_PORT${NC}"
echo -e "  管理后台     : ${BLUE}http://localhost:$ADMIN_PORT${NC}"
echo -e "  MySQL        : localhost:$MYSQL_PORT (huobao / huobao)"
echo ""
echo -e "  管理后台默认账号: ${YELLOW}admin${NC} / ${YELLOW}Admin@123456${NC}"
echo -e "  查看日志: docker compose logs -f"
echo -e "  停止服务: ./scripts/deploy.sh --down"
echo -e "${GREEN}=============================================${NC}"

if [[ "${ADMIN_PASSWORD:-}" == "" ]]; then
  echo ""
  warn "当前使用默认超管凭据。正式部署前请务必在 docker-compose.yml 或环境变量中修改"
  warn "ADMIN_PHONE / ADMIN_USERNAME / ADMIN_PASSWORD"
fi
echo ""
