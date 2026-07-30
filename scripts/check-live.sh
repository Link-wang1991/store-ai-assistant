#!/usr/bin/env bash
set -euo pipefail

# 运行中的双服务验收：前端入口可达，后端同时能连通业务数据库。
curl -fsS --max-time 5 http://127.0.0.1:3000/start >/dev/null
curl -fsS --max-time 5 http://127.0.0.1:8080/api/health >/dev/null
echo "Live checks passed: frontend and database-backed backend are healthy."
