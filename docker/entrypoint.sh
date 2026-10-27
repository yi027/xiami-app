#!/bin/sh
set -eu

if [ "${SKIP_MIGRATE:-}" = "1" ]; then
  echo "SKIP_MIGRATE=1, skipping database migrations."
else
  echo "Applying database migrations..."
  attempt=1
  until node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy; do
    if [ "$attempt" -ge 30 ]; then
      echo "Database migrations failed"
      exit 1
    fi
    echo "Database is not ready (attempt ${attempt}). Retrying..."
    attempt=$((attempt + 1))
    sleep 2
  done
fi

echo "Starting 瞎謎-APP on port ${PORT:-43123}..."
# Cloud Run injects HOSTNAME. Next.js standalone binds to that value, so force all interfaces.
export HOSTNAME=0.0.0.0
exec node server.js
