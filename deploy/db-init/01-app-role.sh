#!/usr/bin/env bash
# Tạo role ứng dụng KHÔNG phải chủ bảng, KHÔNG có BYPASSRLS → Row-Level Security luôn áp dụng.
# Chạy tự động khi khởi tạo container postgres lần đầu, và chạy lại được (idempotent) sau mỗi lần migrate.
set -euo pipefail
: "${APP_DB_USER:?}" "${APP_DB_PASSWORD:?}" "${POSTGRES_USER:?}" "${POSTGRES_DB:?}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" -v owner="$POSTGRES_USER" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L', :'app_user', :'app_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user') \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', :'app_user') \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'app_user') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', :'owner', :'app_user') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', :'owner', :'app_user') \gexec
-- Nhật ký hệ thống: ứng dụng chỉ được thêm/đọc
SELECT format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_log FROM %I', :'app_user')
WHERE to_regclass('public.audit_log') IS NOT NULL \gexec
-- Bảng nội bộ của Prisma: ứng dụng không cần
SELECT format('REVOKE ALL ON TABLE _prisma_migrations FROM %I', :'app_user')
WHERE to_regclass('public._prisma_migrations') IS NOT NULL \gexec
SQL
