# Hướng dẫn phát triển

## Yêu cầu
- Node.js 22, pnpm 10 (`corepack enable`)
- PostgreSQL 16 (dùng `docker compose up -d postgres` hoặc cài sẵn)

## Cấu trúc

```
apps/api            NestJS + Prisma (REST, cổng 4000, tiền tố /api)
apps/web            Next.js (cổng 3000, chuyển tiếp /api/* sang API → cookie cùng origin)
packages/contracts  Schema Zod, chuẩn hóa SĐT/email, chính sách mật khẩu – dùng chung FE/BE
docs/               Tài liệu sản phẩm
```

## Chạy lần đầu

```bash
pnpm install
docker compose up -d postgres        # tự tạo role chủ th và role ứng dụng th_app
cp .env.example apps/api/.env        # sửa JWT_SECRET
pnpm --filter @th/contracts build
scripts/setup-dev-db.sh              # migrate bằng role chủ, cấp quyền role ứng dụng
pnpm --filter @th/api bootstrap:super-admin --name "Tên" --email ban@example.com
pnpm dev:api                       # cửa sổ 1
pnpm dev:web                       # cửa sổ 2 → http://localhost:3000/dang-nhap
```

Lệnh `bootstrap:super-admin` in **mật khẩu tạm một lần** trên terminal; đăng nhập xong hệ thống bắt buộc đổi mật khẩu.

## Kiểm thử

```bash
pnpm lint && pnpm typecheck && pnpm test
```

Test API chạy trên database **`th_test`** riêng (tự migrate và cấp quyền; từ chối chạy nếu tên DB khác `th_test`).
Ứng dụng trong test kết nối bằng role `th_app` (RLS áp dụng); role chủ chỉ dùng để tạo dữ liệu thử.
Biến: `TEST_DATABASE_URL` (role ứng dụng), `TEST_MIGRATION_DATABASE_URL` (role chủ).

## Hai role database
- **Chủ sở hữu** (`MIGRATION_DATABASE_URL`): chỉ chạy migration.
- **Ứng dụng** (`DATABASE_URL`): không phải chủ bảng, không có BYPASSRLS → PostgreSQL Row-Level Security luôn lọc dữ liệu theo trung tâm.
  Không được đọc/sửa `_prisma_migrations`, không được sửa/xóa `audit_log`.

## API hiện có (lát cắt D-B17)

| Method | Đường dẫn | Ai dùng |
|---|---|---|
| GET | `/api/auth/csrf` | Mọi người – lấy CSRF token (gửi lại trong header `x-csrf-token`) |
| POST | `/api/auth/login` | Đăng nhập bằng SĐT/email + mật khẩu |
| POST | `/api/auth/refresh` | Làm mới phiên (xoay vòng refresh token) |
| POST | `/api/auth/logout` | Đăng xuất |
| POST | `/api/auth/password` | Đổi mật khẩu (kể cả mật khẩu tạm) |
| GET | `/api/auth/me` | Thông tin tài khoản và vai trò |
| GET/POST | `/api/admin/organizations` | Super Admin xem/tạo trung tâm |
| GET/POST | `/api/organizations/:orgId/accounts` | Super Admin / Center Admin xem, cấp tài khoản (mật khẩu tạm) |
| POST | `/api/organizations/:orgId/accounts/:userId/reset-password` | Cấp lại mật khẩu tạm |
| POST | `/api/organizations/:orgId/accounts/:userId/lock` · `/unlock` | Khóa / mở khóa |
| GET | `/api/health` | Kiểm tra sống |

## Quy tắc bảo mật khi đóng góp
- Không commit `.env`, khóa, dữ liệu học viên thật, file giáo trình có bản quyền (xem `09-github-repository-plan.md`).
- Mọi endpoint mới mặc định yêu cầu đăng nhập; chỉ dùng `@Public()` khi thật sự cần.
- Endpoint có `:orgId` phải dùng `OrganizationAdminGuard` (hoặc guard tương đương) và có test truy cập chéo trung tâm trả 404.
