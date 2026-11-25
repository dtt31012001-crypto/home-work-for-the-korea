#!/usr/bin/env bash
# Chuẩn bị database dev cục bộ: chạy migration (role chủ) rồi cấp quyền cho role ứng dụng.
# Dùng với `docker compose up -d postgres` (xem docker-compose.yml ở thư mục gốc).
set -euo pipefail
cd "$(dirname "$0")/.."
OWNER_URL="${MIGRATION_DATABASE_URL:-postgresql://th:th_dev_only@localhost:5432/th_dev}"
MIGRATION_DATABASE_URL="$OWNER_URL" pnpm --filter @th/api db:migrate
APP_DB_USER="${APP_DB_USER:-th_app}" APP_DB_PASSWORD="${APP_DB_PASSWORD:-th_app_dev_only}" \
  POSTGRES_USER="$(node -e "console.log(new URL(process.argv[1]).username)" "$OWNER_URL")" \
  POSTGRES_DB="$(node -e "console.log(new URL(process.argv[1]).pathname.slice(1))" "$OWNER_URL")" \
  PGHOST="$(node -e "console.log(new URL(process.argv[1]).hostname)" "$OWNER_URL")" \
  PGPORT="$(node -e "console.log(new URL(process.argv[1]).port || 5432)" "$OWNER_URL")" \
  PGPASSWORD="$(node -e "console.log(decodeURIComponent(new URL(process.argv[1]).password))" "$OWNER_URL")" \
  deploy/db-init/01-app-role.sh
echo "Xong. Ứng dụng kết nối bằng role th_app (RLS áp dụng)."
