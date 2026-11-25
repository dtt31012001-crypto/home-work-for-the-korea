# Homework Management System – Tổng quan

> Trạng thái: **Phase 1 – Discovery & Requirement Analysis (chờ review)**
> Ngày: 2026-11-25

## 1. Kết quả kiểm tra repository

| Hạng mục | Kết quả |
|---|---|
| Thư mục làm việc | Trống, không có mã nguồn, không có cấu hình |
| Repository GitHub liên quan | Không tìm thấy repository nào khớp "homework" trong tài khoản |
| Stack hiện tại | Không có |
| Quy chuẩn code hiện có | Không có |

**Kết luận:** Đây là dự án mới (greenfield). Không có kiến trúc cũ cần bảo toàn, nên stack được đề xuất ở mục 3. Mọi quyết định kiến trúc trong tài liệu này là **đề xuất**, chưa được phê duyệt.

## 2. Mục tiêu sản phẩm

Nền tảng web (tiếng Việt, responsive) cho phép:

- **Admin** quản trị tài khoản, lớp, môn, năm học/học kỳ, phân công.
- **Giáo viên** tạo bài tập (7 dạng), giao bài, theo dõi bài nộp, chấm điểm (tự động / thủ công / AI hỗ trợ), duyệt và công bố điểm, xem báo cáo.
- **Học sinh** làm bài, lưu nháp, nộp bài, nộp lại, xem kết quả và nhận xét.
- **AI (Claude qua Anthropic API)** đề xuất điểm và nhận xét cho câu tự luận theo rubric; **không bao giờ tự công bố điểm**.

## 3. Đề xuất kiến trúc (chờ phê duyệt ở Phase 2)

```
                ┌──────────────┐  HTTPS   ┌──────────────────────────┐
 Browser ─────▶ │    Nginx     │ ───────▶ │  web: Next.js (App Router)│
                │ (TLS, proxy) │          │  React, Tailwind, shadcn  │
                └──────┬───────┘          └────────────┬─────────────┘
                       │ /api                          │ REST (cookie)
                       ▼                               ▼
                ┌──────────────────────────────────────────────┐
                │ api: NestJS (REST, Swagger, JWT, RBAC)        │
                │  modules: auth, users, org, assignments,      │
                │  questions, submissions, grading, files,      │
                │  notifications, reports, audit                │
                └───┬──────────────┬───────────────┬───────────┘
                    │              │               │ enqueue
              ┌─────▼────┐   ┌─────▼─────┐   ┌─────▼──────────────┐
              │PostgreSQL│   │  Redis    │◀──│ worker: NestJS +   │──▶ Anthropic API
              │ (Prisma) │   │ (BullMQ,  │   │ BullMQ (AI grading,│
              └──────────┘   │ rate-limit│   │ notifications,     │
                             │ cache)    │   │ scheduled publish, │
                             └───────────┘   │ exports)           │
                                             └─────────┬──────────┘
                                                       ▼
                                           S3-compatible storage
                                           (MinIO dev / S3 prod)
```

| Lớp | Đề xuất | Lý do |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo: `apps/web`, `apps/api`, `apps/worker`, `packages/shared` | Dùng chung Zod schema/type giữa FE và BE, build/test một lệnh |
| Frontend | Next.js + React + TypeScript + Tailwind + shadcn/ui + Lucide + React Hook Form + Zod + TanStack Query | Theo yêu cầu; phù hợp SaaS UI |
| Rich text / công thức | TipTap (ProseMirror) + KaTeX | Lưu dạng JSON có cấu trúc → sanitize dễ, render công thức chuẩn |
| Backend | NestJS + REST + Swagger | Module hoá rõ ràng, DI, guard cho RBAC |
| DB | PostgreSQL 16 + Prisma (migration) | Quan hệ phức tạp, transaction, ràng buộc |
| Queue | Redis + BullMQ, **worker là process riêng** | AI grading bất đồng bộ, retry, không chặn request |
| File | S3-compatible (MinIO khi dev), upload/download bằng **presigned URL** | Không lưu file trong DB, file riêng tư |
| AI | `@anthropic-ai/sdk`, model cấu hình qua env, structured output (JSON schema) | API key chỉ ở backend/worker |
| Auth | JWT access token ngắn hạn + refresh token xoay vòng, cả hai trong **httpOnly cookie**; CSRF double-submit token | Không lộ token cho JS → giảm rủi ro XSS |
| Test | Vitest/Jest (unit), Supertest + Testcontainers Postgres/Redis (integration), Playwright (E2E) | Kiểm tra cả DB state, không chỉ HTTP 200 |
| Deploy | Docker, Docker Compose, Nginx, HTTPS | Theo yêu cầu |

Phương án thay thế đã cân nhắc: **chỉ dùng Next.js full-stack** (Route Handlers + Server Actions). Gọn hơn nhưng yếu ở background worker, RBAC guard và Swagger → **không khuyến nghị** cho phạm vi này.

## 4. Tài liệu Phase 1

| File | Nội dung |
|---|---|
| [requirements.md](requirements.md) | Actor & quyền, yêu cầu chức năng/phi chức năng, business rules, trạng thái, ngoại lệ, MVP vs nâng cao, rủi ro, kế hoạch phase, câu hỏi mở |
| [use-cases.md](use-cases.md) | Danh sách use case và đặc tả các use case chính |
| [business-workflows.md](business-workflows.md) | Luồng nghiệp vụ và state machine (Mermaid) |

Các tài liệu còn lại trong `docs/` (architecture, database-design, erd, api-specification, …) thuộc Phase 2 trở đi.
