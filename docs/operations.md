# Vận hành – Môi trường, triển khai, sao lưu

> Theo D-T04 (đã duyệt): máy chủ ưu tiên tại Việt Nam, Docker Compose, PostgreSQL, Redis, lưu trữ S3-compatible, sao lưu độc lập, tách Development / Staging / Production.
> **Chưa thuê hoặc đăng ký dịch vụ trả phí nào.** Việc chọn nhà cung cấp máy chủ cần chủ sản phẩm duyệt chi phí.

## 1. Ba môi trường

| Môi trường | Cách chạy | Dữ liệu |
|---|---|---|
| Development | `docker-compose.yml` ở thư mục gốc + `pnpm dev:api` / `pnpm dev:web` | Dữ liệu thử tự tạo, database `th_dev` / `th_test` |
| Staging | `deploy/docker-compose.yml` + `deploy/.env.staging`, `COMPOSE_PROJECT_NAME=th-staging` | Dữ liệu thử riêng; **không** sao chép dữ liệu production sang |
| Production | `deploy/docker-compose.yml` + `deploy/.env.production`, `COMPOSE_PROJECT_NAME=th-production` | Dữ liệu thật – chỉ sau khi hoàn tất kiểm tra bảo mật & bảo vệ dữ liệu |

Staging và Production nên chạy trên **máy chủ khác nhau**. Nếu buộc phải chung máy, tên project khác nhau đảm bảo container, mạng và volume không dùng chung.

## 2. Thành phần (deploy/docker-compose.yml)

| Service | Vai trò |
|---|---|
| `postgres` | PostgreSQL 16. Lần khởi tạo đầu chạy `deploy/db-init/01-app-role.sh` tạo role ứng dụng |
| `migrate` | Chạy migration bằng role **chủ sở hữu**, rồi dừng |
| `grant-app-role` | Cấp quyền cho role **ứng dụng** (không phải chủ bảng, không vượt RLS) sau mỗi lần migrate |
| `api` | NestJS, kết nối bằng role ứng dụng |
| `web` | Next.js |
| `proxy` | Caddy: HTTPS tự động, header bảo mật, `/api/*` → api, còn lại → web |
| `redis` | Dự phòng cho hàng đợi/giới hạn tần suất nhiều máy (chưa dùng ở Phase 1) |
| `object-storage` | SeaweedFS (S3-compatible, Apache-2.0). Phase 1 chưa lưu file |
| `backup` | `pg_dump` hằng ngày vào `BACKUP_HOST_DIR`, kiểm tra file đọc được, xóa bản quá hạn |

> Ghi chú: ảnh `minio/minio` không còn tải được công khai từ Docker Hub (đã kiểm tra 2026-11-25), nên dùng SeaweedFS. Có thể thay bằng dịch vụ S3-compatible của nhà cung cấp tại Việt Nam khi được duyệt chi phí.

## 3. Triển khai Staging

```bash
cp deploy/.env.example deploy/.env.staging   # điền mật khẩu/khóa riêng (openssl rand -base64 36)
docker compose --env-file deploy/.env.staging -f deploy/docker-compose.yml up -d --build
docker compose --env-file deploy/.env.staging -f deploy/docker-compose.yml exec api \
  node dist/cli/bootstrap-super-admin.js --name "Tên" --email ban@example.com
```

Nếu build sau proxy doanh nghiệp có chứng chỉ riêng: thêm `--secret id=extra_ca,src=duong-dan/ca.crt` khi `docker build`.

## 4. Sao lưu và khôi phục

- Sao lưu tự động hằng ngày: `scripts/backup-db.sh` (định dạng custom, nén, kèm `.sha256`, kiểm tra `pg_restore --list`).
- **Sao lưu độc lập (bắt buộc trước production):** chép thư mục `BACKUP_HOST_DIR` sang vị trí khác máy chủ (máy chủ/khu vực khác, lưu trữ S3-compatible khác) bằng công cụ như `rclone` theo lịch. Việc chọn nơi lưu trữ thứ hai cần duyệt chi phí.
- Khôi phục: `scripts/restore-db.sh <file.dump> <database_moi>` – luôn khôi phục vào database **mới**, từ chối ghi đè database đang tồn tại; kiểm tra checksum trước.

### Diễn tập khôi phục (đã chạy 2026-11-25 trên môi trường rehearsal)

| Bước | Kết quả |
|---|---|
| Dựng toàn bộ stack bằng `deploy/docker-compose.yml` | 9 service khởi động đúng thứ tự (migrate → grant → api) |
| Đăng nhập qua proxy, kiểm tra header bảo mật | Đạt |
| Role ứng dụng `th_app` | Không superuser, không BYPASSRLS |
| Sao lưu → khôi phục vào `th_restore_check` | Số người dùng, nhật ký, migration trùng khớp |
| Thử khôi phục đè database đang chạy | Bị từ chối |

Lặp lại diễn tập **mỗi tháng** và trước mỗi lần nâng cấp lớn.

## 5. Kích thước ảnh

| Ảnh | Kích thước | Ghi chú |
|---|---|---|
| `th-api` | ~2 GB trên đĩa | Dùng `node:22-bookworm` (có sẵn OpenSSL cho Prisma). Có thể tối ưu sau |
| `th-web` | ~460 MB | Next.js standalone |

## 6. Staging trên Render + Neon (dữ liệu thử)

> Chỉ dùng cho **staging với dữ liệu thử**. Neon và Render đặt máy chủ tại Singapore, không phải Việt Nam như D-T04 → **không đưa dữ liệu học viên thật** lên môi trường này khi chưa có quyết định riêng (Nghị định 13/2023 về chuyển dữ liệu cá nhân ra nước ngoài).

Kiến trúc: **một** dịch vụ Render (`render.yaml`, ảnh `deploy/render/Dockerfile`) chạy cả Web (cổng `$PORT`) và API (`127.0.0.1:4000`, không mở ra ngoài) + database Neon. Mỗi lần khởi động, `deploy/render/start.mjs`:

1. chạy migration bằng role chủ;
2. tạo/cập nhật role `th_app` bằng SQL và **dừng triển khai nếu role này có quyền vượt RLS** (superuser, BYPASSRLS, CREATEROLE, hoặc là thành viên role khác như `neon_superuser`);
3. tạo Quản trị nền tảng đầu tiên nếu có `BOOTSTRAP_SUPER_ADMIN_EMAIL`;
4. chạy API bằng role `th_app` (tiến trình API không nhận chuỗi kết nối của role chủ).

### Bước 1 – Neon
1. Tạo project `th-staging`, region **AWS Asia Pacific (Singapore)**, PostgreSQL 16 hoặc 17.
2. *Connect* → tắt **Connection pooling** → chép chuỗi kết nối của role `neondb_owner` (dạng `postgresql://neondb_owner:…@ep-….ap-southeast-1.aws.neon.tech/neondb?sslmode=require`).
3. **Không** tạo role `th_app` trên giao diện Neon (role tạo ở đó thuộc `neon_superuser`); hệ thống tự tạo bằng SQL.

### Bước 2 – Render
1. Dashboard → **New → Blueprint** → chọn repo `home-work-for-the-korea`, nhánh `main` → Render đọc `render.yaml`.
2. Nhập biến khi được hỏi:
   - `MIGRATION_DATABASE_URL`: chuỗi kết nối ở Bước 1.2;
   - `BOOTSTRAP_SUPER_ADMIN_EMAIL`, `BOOTSTRAP_SUPER_ADMIN_NAME`: email và tên Quản trị nền tảng đầu tiên.
   - `APP_DB_PASSWORD`, `JWT_SECRET` được Render tự sinh.
3. **Apply**. Lần build đầu mất khoảng 10 phút.
4. Mở **Logs**, tìm dòng `Mật khẩu tạm (chỉ hiển thị một lần)` → đăng nhập tại `https://th-staging.onrender.com` (tên miền thật xem ở đầu trang dịch vụ) và đổi mật khẩu.
5. Sau khi đăng nhập được: xóa hai biến `BOOTSTRAP_SUPER_ADMIN_*` (không bắt buộc – các lần khởi động sau không in lại mật khẩu).

### Lưu ý gói miễn phí
- Dịch vụ "ngủ" sau 15 phút không có truy cập; lần mở đầu tiên chờ khoảng 1 phút. **Đang xử lý bằng UptimeRobot (miễn phí)**: monitor HTTP(s) gọi `https://th-staging.onrender.com/api/health` mỗi 5 phút, gửi cảnh báo qua email khi lỗi. Một dịch vụ chạy liên tục dùng ~720–744 giờ/tháng, trong hạn mức 750 giờ miễn phí của Render. Giải pháp chắc chắn hơn: gói Starter (cần chủ sản phẩm duyệt).
- Neon gói miễn phí có giới hạn dung lượng và thời gian chạy; database tự "ngủ" khi không dùng.
- Sao lưu: Neon có khôi phục theo thời điểm trong thời hạn của gói; **chưa** có sao lưu độc lập cho môi trường này – chấp nhận được vì chỉ có dữ liệu thử.
- Nâng gói trả phí cần chủ sản phẩm duyệt.
