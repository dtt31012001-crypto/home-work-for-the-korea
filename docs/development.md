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

## API hiện có (Phase 1)

Mọi endpoint cần đăng nhập trừ `csrf`, `login`, `refresh`, `health`. Request thay đổi dữ liệu cần header `x-csrf-token`. Sai quyền hoặc ID ngoài phạm vi → **404** (không tiết lộ sự tồn tại), trả về trước bước kiểm tra dữ liệu.

| Nhóm | Đường dẫn (tiền tố `/api`) | Ai dùng |
|---|---|---|
| Đăng nhập | `GET auth/csrf` · `POST auth/login` · `POST auth/refresh` · `POST auth/logout` · `POST auth/password` · `GET auth/me` | Mọi người |
| Nền tảng | `GET/POST admin/organizations` · `PATCH admin/organizations/:orgId` | Super Admin |
| Giáo trình | `GET admin/curricula` · `POST admin/curricula/levels`, `editions` · `PATCH …/series/:id`, `levels/:id`, `editions/:id`, `lessons/:id` · `POST …/editions/:id/lessons`, `lessons/bulk` | Super Admin |
| Người dùng (SA-03) | `GET admin/users?q&status` · `POST admin/users/:userId/lock`, `unlock`, `reset-password` | Super Admin |
| Nhật ký (SA-04) | `GET admin/audit?organizationId&action&from&to&resourceId&before` | Super Admin |
| Trung tâm | `GET/PATCH organizations/:orgId` · `POST …/branches`, `rooms` · `PATCH …/branches/:id`, `rooms/:id` | SA, Center Admin |
| Giáo trình được cấp | `GET/POST organizations/:orgId/curricula` · `GET …/curricula/:editionId/lessons` · `POST …/curricula/:grantId/revoke` | SA (cấp), CA (xem) |
| Tài khoản | `GET/POST organizations/:orgId/accounts` · `POST …/accounts/import` (C-07) · `PATCH …/accounts/:userId` · `POST …/:userId/reset-password`, `lock`, `unlock`, `roles/:role/revoke` | SA, CA |
| Học viên & PH | `GET organizations/:orgId/students/:id` · `POST …/students/:id/guardians` · `POST …/guardian-links/:id/revoke` | SA, CA |
| Liên kết của tôi | `GET me/guardian-links`, `me/guardian-requests`, `me/children` · `POST me/guardian-links/:id/consent`, `revoke` | HV, PH |
| Lớp & lịch | `GET/POST organizations/:orgId/classes` · `POST …/classes/preview` · `GET/PATCH …/classes/:id` · `POST …/classes/:id/teacher`, `schedule`, `sessions`, `enrollments` · `PATCH …/sessions/:id` · `POST …/sessions/:id/cancel` · `POST …/enrollments/:id/hold`, `resume`, `withdraw`, `transfer` · `GET …/calendar` | SA, CA |
| Điểm danh (CA) | `GET organizations/:orgId/today` · `GET/PUT …/sessions/:id/attendance` · `POST …/attendance-requests/:id/approve`, `reject` · `GET …/classes/:id/progress` · `GET …/reports/attendance?from&to&classId` (CA-07) | SA, CA |
| Giáo viên | `GET teaching/today`, `teaching/classes`, `teaching/classes/:id` · `GET/PUT teaching/sessions/:id` · `POST teaching/sessions/:id/change-requests` | Giáo viên |
| Học viên | `GET learning/overview` · `GET learning/schedule?from&to` | Học viên |
| Phụ huynh | `GET family/children` · `GET family/children/:studentId/overview`, `schedule?from&to` | Phụ huynh |
| Hệ thống | `GET health` | Giám sát |

## Quy tắc bảo mật khi đóng góp
- Không commit `.env`, khóa, dữ liệu học viên thật, file giáo trình có bản quyền (xem `09-github-repository-plan.md`).
- Mọi endpoint mới mặc định yêu cầu đăng nhập; chỉ dùng `@Public()` khi thật sự cần.
- Endpoint có `:orgId` phải dùng `OrganizationAdminGuard` (hoặc guard tương đương) và có test truy cập chéo trung tâm trả 404; thêm endpoint mới vào danh sách quét trong `test/security.e2e-spec.ts`.
- Workspace theo vai trò dùng `@RequireRole(...)` (`/teaching`, `/learning`, `/family`).
