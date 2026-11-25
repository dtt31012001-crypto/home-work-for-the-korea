# TH – Tiếng Hàn · Tài liệu sản phẩm

**배움으로 세상을 넓히다** — *Mở rộng thế giới thông qua học tập.*

> Trạng thái: **Phân tích – đã review lần 1 (2026-11-25), chờ chốt các quyết định bắt buộc.** Chưa viết code.
> Ngày lập: 2026-11-25 · Nguồn yêu cầu: Master Prompt V2.0 – TH – Tiếng Hàn.

## Bộ tài liệu

| # | Tài liệu | Nội dung |
|---|---|---|
| 1 | [01-product-blueprint.md](01-product-blueprint.md) | Sản phẩm, hệ sinh thái, 7 vai trò, cấu trúc hai hệ giáo trình, nguyên tắc học liệu & AI, phạm vi MVP |
| 2 | [02-sitemap.md](02-sitemap.md) | Website công khai và các workspace (màn hình đã gộp) |
| 3 | [03-user-flow.md](03-user-flow.md) | Luồng xuyên vai trò, import học liệu, state machine, ngoại lệ |
| 4 | [04-system-architecture.md](04-system-architecture.md) | Modular monolith, multi-tenant, phân quyền, AI gateway, bảo mật |
| 5 | [05-database-overview.md](05-database-overview.md) | Mô hình dữ liệu theo domain |
| 6 | [06-mvp-roadmap.md](06-mvp-roadmap.md) | **Danh mục 44 màn hình P0/P1/P2**, Phase 1 chi tiết (phạm vi, luồng, nghiệm thu), Phase 2–4 |
| 7 | [07-decisions-pending.md](07-decisions-pending.md) | Quyết định đã duyệt · còn lại · kỹ thuật đã chốt |
| 8 | [08-homework-assessment.md](08-homework-assessment.md) | Đặc tả bài tập & đánh giá (thay bộ Homework cũ) |
| 9 | [09-github-repository-plan.md](09-github-repository-plan.md) | Phương án lưu trữ trên GitHub Private |
| – | [development.md](development.md) · [operations.md](operations.md) · [huong-dan-su-dung.md](huong-dan-su-dung.md) | Chạy dev & danh sách API · Triển khai, sao lưu · Hướng dẫn sử dụng nhanh Phase 1 |

**Thứ tự đọc gợi ý:** 07 → 06 → 01 → 02/03/08 → 04/05/09.

## Tài liệu lưu trữ

Bộ phân tích **Homework Management System** cũ đã chuyển vào [archive/homework-management-v1](archive/homework-management-v1/README.md) và **không còn hiệu lực**; phần phù hợp đã được điều chỉnh vào tài liệu 08.

## Quy ước

- **P0** – bắt buộc để vận hành · **P1** – cần ngay sau P0 · **P2** – phát triển sau. Ưu tiên kho học liệu ký hiệu **HL-P0…HL-P3**.
- **[Đề xuất]** – nội dung do người phân tích đề xuất, chưa được phê duyệt.
- **[Giả định]** – giả định khi thiếu thông tin; cần xác nhận.
- **D-xx** – mã quyết định trong [07-decisions-pending.md](07-decisions-pending.md).
- Thời gian lưu UTC, hiển thị theo múi giờ của cơ sở/người dùng.
- Sơ đồ dùng Mermaid (hiển thị trực tiếp trên GitHub/GitLab).

## Những gì tài liệu này KHÔNG chứa

- Không có mục lục, danh sách bài, từ vựng hay ngữ pháp của bất kỳ giáo trình thật nào. Người phân tích **không có quyền truy cập** giáo trình *베트남인을 위한 종합 한국어* hay giáo trình KIIP. Mọi ví dụ nội dung (vd. "bài 8", "은/는 – 이/가") chỉ minh họa cơ chế, không phải trích giáo trình.
- Không có giá bán, tỷ lệ chia sẻ doanh thu, logo, mã màu chính thức, nhà cung cấp AI đã chốt — đây là quyết định của chủ sản phẩm.
