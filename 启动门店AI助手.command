#!/bin/bash
# 门店 AI 经营助手 —— 一键启动（双击本文件即可）
cd "$(dirname "$0")"

echo "======================================"
echo "      门店 AI 经营助手  启动中..."
echo "======================================"
echo ""

# 加载 nvm，确保能找到 node
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1

if ! command -v node >/dev/null 2>&1; then
  echo "❌ 没找到 Node.js，请先安装后再运行。"
  read -p "按回车键关闭窗口..."
  exit 1
fi

# 首次运行自动安装依赖
if [ ! -d node_modules ]; then
  echo "📦 首次运行，正在安装依赖（几分钟，请耐心等待）..."
  npm install || { echo "❌ 依赖安装失败"; read -p "按回车键关闭..."; exit 1; }
fi

# 如果 3000 端口已有可用服务，不再重复启动，直接打开
if curl -s http://localhost:3000/start >/dev/null 2>&1; then
  echo "✅ 服务已在运行，直接打开浏览器..."
  open "http://localhost:3000/start"
  echo ""
  echo "--------------------------------------"
  echo " 访问地址： http://localhost:3000/start"
  echo "--------------------------------------"
  echo ""
  exit 0
fi

# 停掉可能残留的旧 dev 服务，确保用 3000 端口
pkill -f "next dev" >/dev/null 2>&1
sleep 1

echo "🚀 正在启动服务..."
npm run dev >/tmp/store-ai-dev.log 2>&1 &
DEV_PID=$!

# 等待服务就绪（最多 40 秒）
READY=0
for i in $(seq 1 40); do
  if curl -s http://localhost:3000/start >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done

echo ""
if [ "$READY" = "1" ]; then
  echo "✅ 启动成功！正在打开浏览器..."
  open "http://localhost:3000/start"
else
  echo "⚠️ 启动较慢或失败，请手动打开： http://localhost:3000/start"
  echo "   （日志见 /tmp/store-ai-dev.log）"
fi

echo ""
echo "--------------------------------------"
echo " 访问地址： http://localhost:3000/start"
echo " 用完后：直接关闭此窗口即可停止服务"
echo "--------------------------------------"
echo ""

# 保持运行，关闭窗口即停止
wait $DEV_PID
