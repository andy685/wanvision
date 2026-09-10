#!/usr/bin/env bash
#
# 本地开发一键启动：MySQL(3317) + 后端(5679) + 用户端(3013) + 管理后台(3014)
#
# 用法:
#   ./scripts/dev.sh              启动全部
#   ./scripts/dev.sh backend     只启动后端
#   ./scripts/dev.sh mysql       只启动本地 MySQL
#   ./scripts/dev.sh stop        停止所有已启动的开发进程
#
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.dev-logs"
PID_FILE="$LOG_DIR/pids"

BACKEND_PORT=5679
FRONTEND_PORT=3013
ADMIN_PORT=3014
MYSQL_PORT=3317
MYSQL_DATABASE=huobao_drama
MYSQL_USER=huobao
MYSQL_PASSWORD=huobao
ADMIN_PNPM_MAJOR=11
MYSQL_DATA_DIR="$ROOT_DIR/.local/mysql-data"
MYSQL_SOCKET="$ROOT_DIR/.local/mysql.sock"
MYSQL_PID_FILE="$ROOT_DIR/.local/mysql.pid"

GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[info]${NC}  $*"; }
success() { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
fail()    { echo -e "${RED}[fail]${NC}  $*"; }

port_in_use() { lsof -ti "tcp:$1" >/dev/null 2>&1; }
mysql_ready() { mysqladmin ping -h127.0.0.1 -P"$MYSQL_PORT" -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" --silent >/dev/null 2>&1; }

stop_all() {
  if [[ -f "$PID_FILE" ]]; then
    info "停止已启动的开发进程..."
    while read -r pid; do
      [[ -n "$pid" ]] && kill "$pid" 2>/dev/null && echo "  已停止 PID $pid"
    done < "$PID_FILE"
    : > "$PID_FILE"
  fi
  # 兜底：按端口清理残留
  for p in $BACKEND_PORT $FRONTEND_PORT $ADMIN_PORT $MYSQL_PORT; do
    if port_in_use "$p"; then
      warn "端口 $p 仍有进程占用，尝试清理"
      lsof -ti "tcp:$p" | xargs kill 2>/dev/null || true
    fi
  done
  success "全部已停止"
  exit 0
}

usage() {
  sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# *//'
  exit 0
}

case "${1:-}" in
  stop)  stop_all ;;
  -h|--help) usage ;;
esac

mkdir -p "$LOG_DIR"
: > "$PID_FILE"

echo ""
info "万影工坊本地开发环境启动中（项目根目录: $ROOT_DIR）"
echo ""

# ---------- 环境检查 ----------
command -v node >/dev/null 2>&1 || { fail "未找到 node，请先安装 Node.js 20+"; exit 1; }
NODE_MAJOR=$(node -v | sed 's/v//' | cut -d. -f1)
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  fail "Node 版本过低：$(node -v)，需要 20+"
  exit 1
fi
success "Node $(node -v)"

# ---------- 端口检查 ----------
for p in $BACKEND_PORT $FRONTEND_PORT $ADMIN_PORT; do
  if port_in_use "$p"; then
    fail "端口 $p 已被占用，先停掉占用进程或执行 ./scripts/dev.sh stop"
    lsof -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | tail -1 | sed 's/^/         /'
    exit 1
  fi
done
success "端口 $BACKEND_PORT / $FRONTEND_PORT / $ADMIN_PORT 均空闲"

# ---------- 本地 MySQL ----------
ensure_mysql() {
  if mysql_ready; then
    success "MySQL 已就绪：127.0.0.1:$MYSQL_PORT/$MYSQL_DATABASE"
    return
  fi

  if port_in_use "$MYSQL_PORT"; then
    fail "端口 $MYSQL_PORT 已被占用，但不是当前项目可用的 MySQL。请释放端口或检查 backend/.env"
    lsof -nP -iTCP:"$MYSQL_PORT" -sTCP:LISTEN 2>/dev/null | tail -1 | sed 's/^/         /'
    exit 1
  fi

  command -v mysqld >/dev/null 2>&1 || { fail "未找到 mysqld。请先安装 MySQL，或改用 Docker 部署模式"; exit 1; }
  command -v mysql >/dev/null 2>&1 || { fail "未找到 mysql 客户端。请先安装 MySQL"; exit 1; }
  command -v mysqladmin >/dev/null 2>&1 || { fail "未找到 mysqladmin。请先安装 MySQL"; exit 1; }

  mkdir -p "$MYSQL_DATA_DIR"
  if [[ ! -d "$MYSQL_DATA_DIR/mysql" ]]; then
    info "初始化本地 MySQL 数据目录：$MYSQL_DATA_DIR"
    mysqld --initialize-insecure --datadir="$MYSQL_DATA_DIR" --log-error="$LOG_DIR/mysql-init.log" || {
      fail "MySQL 初始化失败，查看日志：$LOG_DIR/mysql-init.log"
      exit 1
    }
  fi

  info "启动本地 MySQL：127.0.0.1:$MYSQL_PORT"
  nohup mysqld \
    --datadir="$MYSQL_DATA_DIR" \
    --port="$MYSQL_PORT" \
    --socket="$MYSQL_SOCKET" \
    --pid-file="$MYSQL_PID_FILE" \
    --log-error="$LOG_DIR/mysql.log" \
    --bind-address=127.0.0.1 \
    > "$LOG_DIR/mysql-stdout.log" 2>&1 &
  echo $! >> "$PID_FILE"

  for _ in $(seq 1 30); do
    if mysqladmin ping --socket="$MYSQL_SOCKET" -uroot --silent >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if ! mysqladmin ping --socket="$MYSQL_SOCKET" -uroot --silent >/dev/null 2>&1; then
    fail "MySQL 未能启动，查看日志：$LOG_DIR/mysql.log"
    exit 1
  fi

  mysql --socket="$MYSQL_SOCKET" -uroot <<SQL
CREATE DATABASE IF NOT EXISTS $MYSQL_DATABASE CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$MYSQL_USER'@'127.0.0.1' IDENTIFIED BY '$MYSQL_PASSWORD';
CREATE USER IF NOT EXISTS '$MYSQL_USER'@'localhost' IDENTIFIED BY '$MYSQL_PASSWORD';
GRANT ALL PRIVILEGES ON $MYSQL_DATABASE.* TO '$MYSQL_USER'@'127.0.0.1';
GRANT ALL PRIVILEGES ON $MYSQL_DATABASE.* TO '$MYSQL_USER'@'localhost';
FLUSH PRIVILEGES;
SQL

  if mysql_ready; then
    success "MySQL 已就绪：127.0.0.1:$MYSQL_PORT/$MYSQL_DATABASE"
  else
    fail "MySQL 账号初始化失败，查看日志：$LOG_DIR/mysql.log"
    exit 1
  fi
}

# ---------- 依赖安装 ----------
install_if_needed() {
  local dir="$1" name="$2" cmd="$3"
  if [[ ! -d "$ROOT_DIR/$dir/node_modules" ]]; then
    info "安装 $name 依赖（首次较慢）..."
    (cd "$ROOT_DIR/$dir" && eval "$cmd") || { fail "$name 依赖安装失败"; exit 1; }
    success "$name 依赖就绪"
  else
    success "$name 依赖已存在，跳过安装"
  fi
}

# ---------- 选择 pnpm ----------
resolve_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    local v; v=$(pnpm --version 2>/dev/null | cut -d. -f1)
    if [[ "$v" =~ ^[0-9]+$ ]] && [[ "$v" -ge $ADMIN_PNPM_MAJOR ]]; then
      echo "pnpm"; return
    fi
  fi
  echo "corepack pnpm@$ADMIN_PNPM_MAJOR"
}

TARGET="${1:-all}"

if [[ "$TARGET" == "all" || "$TARGET" == "backend" || "$TARGET" == "mysql" ]]; then
  ensure_mysql
fi

if [[ "$TARGET" == "mysql" ]]; then
  echo ""
  success "本地 MySQL 已启动：mysql://$MYSQL_USER:$MYSQL_PASSWORD@127.0.0.1:$MYSQL_PORT/$MYSQL_DATABASE"
  echo -e "  日志目录   : $LOG_DIR"
  echo -e "  停止服务   : ${YELLOW}./scripts/dev.sh stop${NC}"
  exit 0
fi

if [[ "$TARGET" == "all" || "$TARGET" == "backend" ]]; then
  install_if_needed backend "后端" "npm install"
fi
if [[ "$TARGET" == "all" ]]; then
  install_if_needed frontend "用户端" "npm install"
  PNPM_CMD=$(resolve_pnpm)
  info "管理后台使用包管理器: $PNPM_CMD"
  install_if_needed admin-console "管理后台" "$PNPM_CMD install"
fi

# ---------- 启动 ----------
start_service() {
  local name="$1" dir="$2" cmd="$3" log="$LOG_DIR/$4"
  info "启动 $name ..."
  (
    cd "$ROOT_DIR/$dir" || exit 1
    nohup bash -lc "$cmd" > "$log" 2>&1 &
    echo $! >> "$PID_FILE"
  )
}

if [[ "$TARGET" == "all" || "$TARGET" == "backend" ]]; then
  start_service "后端 API" backend "npm run dev" backend.log
fi

if [[ "$TARGET" == "all" ]]; then
  start_service "用户端" frontend "npm run dev" frontend.log
  start_service "管理后台" admin-console "$PNPM_CMD dev" admin.log
fi

# ---------- 等待后端就绪 ----------
info "等待后端就绪（最多 60s）..."
ready=0
for i in $(seq 1 60); do
  if curl -sf "http://localhost:$BACKEND_PORT/api/v1/health/ready" >/dev/null 2>&1; then
    ready=1; break
  fi
  sleep 1
done

echo ""
if [[ $ready -eq 1 ]]; then
  success "后端已就绪"
else
  warn "后端 60s 内未就绪，查看日志: tail -f $LOG_DIR/backend.log"
  warn "常见原因：MySQL 未启动或 DATABASE_URL 配置错误"
fi

echo ""
echo -e "${GREEN}================ 开发服务已启动 ================${NC}"
echo -e "  MySQL      : ${BLUE}mysql://$MYSQL_USER:$MYSQL_PASSWORD@127.0.0.1:$MYSQL_PORT/$MYSQL_DATABASE${NC}"
[[ "$TARGET" == "all" || "$TARGET" == "backend" ]] && echo -e "  后端 API   : ${BLUE}http://localhost:$BACKEND_PORT${NC}"
if [[ "$TARGET" == "all" ]]; then
  echo -e "  用户端     : ${BLUE}http://localhost:$FRONTEND_PORT${NC}"
  echo -e "  管理后台   : ${BLUE}http://localhost:$ADMIN_PORT${NC}   账号 admin / Admin@123456"
fi
echo -e "  日志目录   : $LOG_DIR"
echo -e "  停止服务   : ${YELLOW}./scripts/dev.sh stop${NC}"
echo -e "${GREEN}=================================================${NC}"
echo ""

if [[ "$TARGET" == "all" ]]; then
  warn "管理后台依赖后端接口，后端未就绪时页面能开但接口会 404"
fi
