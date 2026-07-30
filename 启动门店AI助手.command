#!/bin/bash
# 门店 AI 经营助手 —— 一键启动（双击本文件即可）
# 软件只有在「前端 + 后端 API + 数据库连接」均可用时才会显示启动成功。
#
# 说明：13306 是过去一次临时建立的本地数据库中继端口，并不是本软件的
# 必要服务。中继存在时可优先使用；中继因重启或旧终端结束而消失时，必须
# 自动回退至项目原有的远程数据库地址，不能因此拒绝启动整个软件。

set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(cd "$APP_DIR/../store-ai-server" 2>/dev/null && pwd || true)"
FRONTEND_LOG="/tmp/store-ai-frontend.log"
BACKEND_LOG="/tmp/store-ai-backend.log"
FRONTEND_PID_FILE="/tmp/store-ai-frontend.pid"
BACKEND_PID_FILE="/tmp/store-ai-backend.pid"
BACKEND_VERSION_FILE="/tmp/store-ai-backend.jar.mtime"
BACKEND_PID=""
DATABASE_ROUTE=""

cd "$APP_DIR"

frontend_ready() {
  curl -fsS --max-time 3 http://127.0.0.1:3000/start >/dev/null 2>&1
}

backend_ready() {
  # /api-docs 只能证明 Java 端口已监听；/api/health 会同时校验数据库。
  curl -fsS --max-time 3 http://127.0.0.1:8080/api/health >/dev/null 2>&1
}

relay_ready() {
  lsof -nP -iTCP:13306 -sTCP:LISTEN >/dev/null 2>&1
}

open_app() {
  local app_url="http://localhost:3000/start"

  # 优先复用用户正在使用的 Chrome：已有门店助手标签则刷新它；没有才在当前
  # Chrome 窗口新建一个标签。绝不再用 --new-window 或启动独立 Chrome 实例。
  if osascript - "$app_url" <<'APPLESCRIPT' >/dev/null 2>&1
on run argv
  set appUrl to item 1 of argv
  tell application "Google Chrome"
    if not running then launch
    activate
    if (count of windows) = 0 then make new window

    set targetWindow to front window
    set existingAppTab to missing value
    repeat with candidateWindow in windows
      repeat with candidateTab in tabs of candidateWindow
        set candidateUrl to URL of candidateTab
        if candidateUrl starts with "http://localhost:3000/" or candidateUrl starts with "http://127.0.0.1:3000/" then
          set existingAppTab to candidateTab
          set targetWindow to candidateWindow
          exit repeat
        end if
      end repeat
      if existingAppTab is not missing value then exit repeat
    end repeat

    if existingAppTab is missing value then
      tell targetWindow to make new tab with properties {URL:appUrl}
    else
      set URL of existingAppTab to appUrl
      set active tab index of targetWindow to index of existingAppTab
    end if
    set index of targetWindow to 1
  end tell
end run
APPLESCRIPT
  then
    return 0
  fi

  # 自动化权限尚未授予时，也只尝试使用现有 Chrome，不回退到其他浏览器。
  open -a "Google Chrome" "$app_url" >/dev/null 2>&1 || true
}

wait_until_ready() {
  local check_name="$1"
  local seconds="$2"
  local i
  for i in $(seq 1 "$seconds"); do
    if "$check_name"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

stop_stale_frontend() {
  local pids i
  pids="$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "🧹 正在清理失效的前端服务..."
    kill $pids >/dev/null 2>&1 || true
    # Next.js 会拉起子进程，父进程退出后端口未必立刻释放。确认端口释放后
    # 再启动，避免 EADDRINUSE 后脚本仍误报“已启动”。
    for i in $(seq 1 8); do
      lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1 || return 0
      sleep 1
    done
    pids="$(lsof -tiTCP:3000 -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      echo "⚠️ 前端进程未正常退出，正在结束端口 3000 的残留进程..."
      kill -9 $pids >/dev/null 2>&1 || true
      sleep 1
    fi
  fi
  ! lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1
}

stop_stale_backend() {
  local pids i
  pids="$(lsof -tiTCP:8080 -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "🧹 正在清理失效的后端服务..."
    kill $pids >/dev/null 2>&1 || true
    for i in $(seq 1 8); do
      lsof -nP -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1 || return 0
      sleep 1
    done
    pids="$(lsof -tiTCP:8080 -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      echo "⚠️ 后端进程未正常退出，正在结束端口 8080 的残留进程..."
      kill -9 $pids >/dev/null 2>&1 || true
      sleep 1
    fi
  fi
  ! lsof -nP -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1
}

load_env_value() {
  local env_file="$1"
  local key="$2"
  local line=""
  local value=""

  [ -f "$env_file" ] || return 0
  line="$(LC_ALL=C grep -m 1 "^${key}=" "$env_file" 2>/dev/null || true)"
  [ -n "$line" ] || return 0

  value="${line#*=}"
  value="${value%$'\r'}"
  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  export "$key=$value"
}

load_backend_config() {
  local env_file key
  for env_file in "$BACKEND_DIR/.env" "$BACKEND_DIR/.env.local"; do
    for key in DB_URL DB_USERNAME DB_PASSWORD SPRING_PROFILES_ACTIVE JWT_SECRET; do
      load_env_value "$env_file" "$key"
    done
  done
}

load_deployment_config() {
  local config_file="$BACKEND_DIR/render.yaml"
  local key value

  # 这套项目原本的后端部署参数保存在 render.yaml。仅在本机读取并传给
  # 当前启动的 Java 进程，不打印、不复制到 .env，也不上传任何内容。
  [ -f "$config_file" ] || return 0
  while IFS=$'\t' read -r key value; do
    [ -n "$key" ] || continue
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    export "$key=$value"
  done < <(
    awk '
      /^[[:space:]]*-[[:space:]]+key:[[:space:]]+/ { key=$3; next }
      key != "" && /^[[:space:]]*value:[[:space:]]*/ {
        value=$0
        sub(/^[[:space:]]*value:[[:space:]]*/, "", value)
        if (key ~ /^(DB_URL|DB_USERNAME|DB_PASSWORD|JWT_SECRET|MINIO_ENDPOINT|MINIO_ACCESS_KEY|MINIO_SECRET_KEY|AI_PROVIDER)$/) {
          print key "\t" value
        }
        key=""
      }
    ' "$config_file"
  )
}

use_local_database_relay() {
  local database_path
  [[ "${DB_URL:-}" == jdbc:mysql://* ]] || {
    DATABASE_ROUTE="项目配置"
    return 0
  }

  if ! relay_ready; then
    DATABASE_ROUTE="远程数据库直连"
    return 0
  fi

  # 旧的本地中继仍在运行时，保持兼容；否则保留原 DB_URL 直连。
  database_path="${DB_URL#jdbc:mysql://*/}"
  export DB_URL="jdbc:mysql://127.0.0.1:13306/${database_path}"
  DATABASE_ROUTE="本地数据库中继"
}

load_frontend_ai_config() {
  local key
  for key in AI_PROVIDER DEEPSEEK_API_KEY DEEPSEEK_BASE_URL DEEPSEEK_MODEL QWEN_API_KEY QWEN_TEXT_MODEL QWEN_VISION_MODEL STORAGE_PROVIDER; do
    load_env_value "$APP_DIR/.env.local" "$key"
  done
}

backend_configured() {
  [ -n "${DB_URL:-}" ] && [ -n "${DB_USERNAME:-}" ] && [ -n "${DB_PASSWORD:-}" ]
}

backend_needs_build() {
  local jar_path="$BACKEND_DIR/target/store-ai-server-1.0.0-SNAPSHOT.jar"
  [ ! -f "$jar_path" ] && return 0
  find "$BACKEND_DIR/src" "$BACKEND_DIR/pom.xml" -type f -newer "$jar_path" -print -quit | grep -q .
}

backend_running_version_matches() {
  local jar_path="$BACKEND_DIR/target/store-ai-server-1.0.0-SNAPSHOT.jar"
  local expected=""
  local running=""
  [ -f "$jar_path" ] && [ -f "$BACKEND_VERSION_FILE" ] || return 1
  expected="$(stat -f %m "$jar_path" 2>/dev/null || true)"
  running="$(cat "$BACKEND_VERSION_FILE" 2>/dev/null || true)"
  [ -n "$expected" ] && [ "$expected" = "$running" ]
}

start_backend() {
  # 健康检查只能说明“旧版本仍在运行”，不能说明它已加载刚修改的后端代码。
  # 若源码比 JAR 新，必须重启并重新打包，避免双击启动后界面仍使用旧功能。
  if backend_ready && ! backend_needs_build && backend_running_version_matches; then
    return 0
  fi

  if backend_ready; then
    echo "📦 检测到后端代码已更新，正在重启以加载最新功能..."
  fi

  stop_stale_backend || {
    echo "❌ 无法释放后端端口 8080"
    return 1
  }

  if [ -z "$BACKEND_DIR" ] || [ ! -d "$BACKEND_DIR" ]; then
    echo "❌ 未找到后端程序目录：$APP_DIR/../store-ai-server"
    return 1
  fi

  # 先读项目原有部署配置，再允许真实本机 .env 覆盖；不会输出密码。
  # 不直接 source 前端 .env.local，避免其中带空格的展示名称干扰启动。
  load_deployment_config
  load_backend_config
  load_frontend_ai_config
  use_local_database_relay

  if ! backend_configured; then
    echo "❌ 后端数据库连接尚未配置，软件暂时不能登录或使用业务功能。"
    echo "   请在 $BACKEND_DIR/.env 中补齐 DB_URL、DB_USERNAME、DB_PASSWORD 后重新双击启动。"
    return 1
  fi

  if ! command -v java >/dev/null 2>&1; then
    echo "❌ 未找到 Java，后端无法启动。"
    return 1
  fi

  local jar_path="$BACKEND_DIR/target/store-ai-server-1.0.0-SNAPSHOT.jar"
  if backend_needs_build; then
    echo "📦 正在更新后端程序（首次或代码更新时可能需要一分钟）..."
    (cd "$BACKEND_DIR" && ./mvnw -q -DskipTests package) || {
      echo "❌ 后端程序准备失败，详见 $BACKEND_LOG"
      return 1
    }
  fi

  # 本地运行时签名仅保留在本次进程内，不写入项目文件。
  export SERVER_PORT="${SERVER_PORT:-8080}"
  # 默认使用 local：不会启用 dev 环境中的演示数据写入器。
  # 如需重新生成全新演示库，才显式设置 SPRING_PROFILES_ACTIVE=dev 后启动。
  export SPRING_PROFILES_ACTIVE="${SPRING_PROFILES_ACTIVE:-local}"
  export JWT_SECRET="${JWT_SECRET:-local-$(date +%s)-$RANDOM-$RANDOM}"

  echo "🚀 正在启动后端服务（数据库：${DATABASE_ROUTE:-项目配置}）..."
  nohup java -jar "$jar_path" >"$BACKEND_LOG" 2>&1 &
  BACKEND_PID=$!
  echo "$BACKEND_PID" >"$BACKEND_PID_FILE"

  if wait_until_ready backend_ready 50; then
    stat -f %m "$jar_path" >"$BACKEND_VERSION_FILE" 2>/dev/null || true
    return 0
  fi

  echo "❌ 后端未能就绪，请查看 $BACKEND_LOG"
  return 1
}

start_frontend() {
  if frontend_ready; then
    return 0
  fi

  stop_stale_frontend || {
    echo "❌ 无法释放前端端口 3000"
    return 1
  }
  echo "🚀 正在启动页面服务..."
  nohup npm run dev:lan >"$FRONTEND_LOG" 2>&1 &
  echo $! >"$FRONTEND_PID_FILE"

  if wait_until_ready frontend_ready 40; then
    return 0
  fi

  echo "❌ 页面服务未能就绪，请查看 $FRONTEND_LOG"
  return 1
}

echo "======================================"
echo "      门店 AI 经营助手  启动中..."
echo "======================================"
echo ""

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1

if ! command -v node >/dev/null 2>&1; then
  echo "❌ 没找到 Node.js，请先安装后再运行。"
  read -p "按回车键关闭窗口..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "📦 首次运行，正在安装页面依赖..."
  npm install || { echo "❌ 页面依赖安装失败"; read -p "按回车键关闭..."; exit 1; }
fi

if ! start_backend; then
  echo ""
  # 保留原有体验：即使后端异常，也先打开页面，方便查看界面和已有本地内容。
  if start_frontend; then
    echo "页面已打开，但登录、会谈和 AI 功能暂不可用。"
    open_app
  else
    echo "软件未能打开页面，请查看 $FRONTEND_LOG"
  fi
  read -p "按回车键关闭窗口..."
  exit 1
fi

if ! start_frontend; then
  read -p "按回车键关闭窗口..."
  exit 1
fi

echo ""
echo "✅ 前端、后端和数据库连接均已就绪，正在打开浏览器..."
open_app
echo ""
echo "--------------------------------------"
echo " 访问地址： http://localhost:3000/start"
echo " 请保持这个启动窗口打开；关闭窗口会停止本次启动的后端服务"
echo "--------------------------------------"
echo ""

# 后端是本次启动的子进程。保留启动窗口可避免 macOS 在 .command 结束时
# 回收它，解决“刚提示成功、随后页面又断开”的问题。
if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
  wait "$BACKEND_PID"
else
  # 若后端本来就在运行，当前窗口同样保持打开，避免再次出现“成功后立即完成”。
  while backend_ready && frontend_ready; do
    sleep 5
  done
fi
