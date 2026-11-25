#!/usr/bin/env bash
# Sao lưu PostgreSQL (định dạng custom, nén) + checksum, xóa bản cũ quá BACKUP_RETENTION_DAYS.
# Biến: PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE BACKUP_DIR [BACKUP_RETENTION_DAYS=14]
# Bản sao lưu PHẢI được chép sang vị trí độc lập (máy/khu vực khác) – xem docs/operations.md.
set -euo pipefail
: "${PGDATABASE:?}" "${BACKUP_DIR:?}"
RETENTION="${BACKUP_RETENTION_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/${PGDATABASE}-${STAMP}.dump"
pg_dump --format=custom --compress=9 --no-owner --no-privileges --file="$FILE.partial" "$PGDATABASE"
mv "$FILE.partial" "$FILE"
sha256sum "$FILE" > "$FILE.sha256"
# Kiểm tra file đọc được trước khi coi là thành công
pg_restore --list "$FILE" > /dev/null
find "$BACKUP_DIR" -name "${PGDATABASE}-*.dump*" -type f -mtime +"$RETENTION" -delete
echo "Đã sao lưu: $FILE ($(du -h "$FILE" | cut -f1))"
