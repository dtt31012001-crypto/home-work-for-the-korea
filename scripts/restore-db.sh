#!/usr/bin/env bash
# Khôi phục bản sao lưu vào database ĐÍCH (tạo mới). Không bao giờ ghi đè database đang tồn tại.
#   scripts/restore-db.sh <file.dump> <target_db>
# Biến kết nối: PGHOST PGPORT PGUSER PGPASSWORD (role có quyền CREATEDB)
set -euo pipefail
FILE="${1:?Cần đường dẫn file .dump}"
TARGET="${2:?Cần tên database đích}"
if [[ -f "$FILE.sha256" ]]; then sha256sum --check --quiet "$FILE.sha256"; fi
if psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$TARGET'" | grep -q 1; then
  echo "Database '$TARGET' đã tồn tại – từ chối ghi đè. Hãy chọn tên khác." >&2
  exit 1
fi
createdb "$TARGET"
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET" "$FILE"
echo "Đã khôi phục vào '$TARGET'. Sau khi kiểm tra, chạy deploy/db-init/01-app-role.sh để cấp quyền role ứng dụng."
