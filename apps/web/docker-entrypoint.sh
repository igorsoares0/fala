#!/bin/sh
# Applies this release's pending migrations, then starts the server.
# They run here rather than as a Coolify pre-deployment command because that command
# runs inside the container already running (the previous release, with its own env and
# migrations). If they fail, the container exits before it ever turns healthy, and
# Coolify keeps the previous release serving.
set -e

if [ "${SKIP_MIGRATIONS:-}" != "1" ]; then
  echo "Applying database migrations..."
  (cd /migrate && DATABASE_URL="${DIRECT_DATABASE_URL:-$DATABASE_URL}" ./node_modules/.bin/prisma migrate deploy)
fi

exec node apps/web/server.js
