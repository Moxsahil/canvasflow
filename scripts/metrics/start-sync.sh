#!/usr/bin/env bash
# Runs the built sync-server with a clean environment pointed at the local
# embedded Postgres. `env -i` + no --env-file means services/sync-server/.env
# (which points at Neon) is never read.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/services/sync-server"
exec env -i PATH="$PATH" HOME="$HOME" \
  NODE_ENV=production LOG_LEVEL="${LOG_LEVEL:-warn}" \
  PORT_WS="${METRICS_SYNC_PORT:-4000}" PORT_HTTP="$(( ${METRICS_SYNC_PORT:-4000} + 1 ))" \
  DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54329/canvasflow" \
  AUTH_SECRET="local-metrics-secret-not-used-anywhere-else-000000" \
  node dist/index.js
