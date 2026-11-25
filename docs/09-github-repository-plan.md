# 09 · Phương án lưu trữ trên GitHub Private Repository

> Trạng thái: **chuẩn bị – chưa push.** Chỉ thực hiện sau khi chủ sản phẩm chốt D-T12 và tạo/cấp quyền repository.

---

## 1. Hiện trạng

| Hạng mục | Tình trạng |
|---|---|
| Repository cục bộ | Có, nhánh `main`, 1 commit cũ (tài liệu Homework) + tài liệu mới **chưa commit** |
| Remote | **Chưa có** – mọi thay đổi hiện chỉ nằm trong môi trường làm việc tạm thời |
| Nội dung | Chỉ tài liệu `docs/` và `.gitignore`; chưa có mã nguồn, chưa có bí mật, chưa có dữ liệu học viên |
| Kiểm tra bí mật | Đã quét toàn bộ cây thư mục và lịch sử git theo mẫu khóa/mật khẩu phổ biến: **không phát hiện** (chạy lại gitleaks trước lần push đầu) |

---

## 2. Đề xuất cấu hình

| Hạng mục | Đề xuất |
|---|---|
| Chủ sở hữu | **GitHub Organization** của đơn vị sở hữu sản phẩm (không dùng tài khoản cá nhân) |
| Tên repo | `th-tieng-han` (một repo – monorepo cho mã nguồn và tài liệu) |
| Hiển thị | **Private** |
| Quyền | Chủ sản phẩm: Admin · Lập trình viên: Write · Người review nghiệp vụ: Read (hoặc Triage) |
| Nhánh | `main` luôn chạy được; làm việc trên nhánh `feat/…`, `fix/…`, `docs/…`; gộp qua Pull Request, *squash merge*. Không dùng nhánh `develop` (đơn giản) |
| Bảo vệ `main` | Bắt buộc PR + 1 người duyệt + CI xanh, cấm force-push. Với repo private, tính năng này cần gói GitHub trả phí (Team) theo bảng giá hiện hành – **cần xác nhận**; nếu chưa nâng gói: quy ước làm việc qua PR và chỉ Admin được push `main` |
| CI | GitHub Actions: lint, typecheck, test, gitleaks. Gói miễn phí có giới hạn phút chạy cho repo private – đủ cho giai đoạn đầu |
| Bảo mật | Bật Dependabot alerts & updates; bật secret scanning nếu gói hỗ trợ; luôn chạy gitleaks (miễn phí) |
| Tài liệu | Giữ trong `docs/` cùng repo để thay đổi tài liệu đi cùng thay đổi code |

---

## 3. Được và không được đưa lên repository

| Được đưa lên | **Không bao giờ** đưa lên |
|---|---|
| Mã nguồn, migration, cấu hình mẫu `.env.example` (giá trị giả) | File `.env`, khóa API AI/TTS, mật khẩu DB, khóa riêng (`*.pem`, `*.key`), token |
| Tài liệu `docs/` | Dữ liệu thật của học viên/phụ huynh, bản sao lưu DB (`*.sql`, `*.dump`) |
| Dữ liệu mẫu **tự tạo** cho dev/test | **File giáo trình, audio, sách có bản quyền** – lưu ở kho lưu trữ riêng tư (S3), có ghi giấy phép |
| Mẫu Excel import (không chứa dữ liệu thật) | File Excel danh sách học viên thật của Horizon |

Bí mật cho môi trường staging/production lưu ở **GitHub Environments secrets** (cho CI/CD) và trên máy chủ (biến môi trường), không nằm trong mã.

`.gitignore` đã được bổ sung các mẫu: `*.pem`, `*.key`, `*.p12`, `*.sql`, `*.dump`, `uploads/`, `storage/`, `*.local.*`.

---

## 4. Các bước thực hiện

| # | Ai | Việc |
|---|---|---|
| 1 | Chủ sản phẩm | Tạo Organization (nếu chưa có) và repo **private, trống** (không tạo README/.gitignore/license) tên `th-tieng-han` |
| 2 | Chủ sản phẩm | Cấp quyền cho phiên làm việc này truy cập repo (cài/cho phép ứng dụng Claude GitHub trên repo, hoặc thêm repo vào phiên) |
| 3 | Claude | Chạy gitleaks trên toàn bộ cây và lịch sử; báo kết quả |
| 4 | Claude | Commit tài liệu trên nhánh `docs/blueprint-v2`, push nhánh này (không push trực tiếp `main`), mở Pull Request **khi được yêu cầu** |
| 5 | Chủ sản phẩm | Review, merge PR; bật bảo vệ `main`, Dependabot, secret scanning theo gói |
| 6 | Claude (Phase 0) | Thêm GitHub Actions CI, mẫu PR, `CODEOWNERS` |

> Trong lúc chờ: môi trường làm việc này là tạm thời. Nếu muốn giữ an toàn tài liệu trước khi có repo, có thể tải thư mục `docs/` về hoặc cho phép commit cục bộ.
