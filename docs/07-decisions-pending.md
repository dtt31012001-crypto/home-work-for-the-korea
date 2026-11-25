# 07 · Quyết định – đã duyệt, còn lại, kỹ thuật đã chốt

> Cập nhật: 2026-11-25 – lần review 2: duyệt D-B17, D-B21, D-B19, D-B03, D-B10, D-B20, D-T04, D-T12; cho phép triển khai Phase 1.
> Nguyên tắc: chủ sản phẩm chỉ quyết định những gì ảnh hưởng đáng kể đến **nghiệp vụ, chi phí, pháp lý hoặc khả năng mở rộng**. Chi tiết kỹ thuật thuần túy do nhóm kỹ thuật chốt theo tiêu chí *đơn giản, ổn định, dễ bảo trì, chi phí hợp lý, mở rộng được* (§3) — chủ sản phẩm có quyền phủ quyết.
> Cách phản hồi: `D-xx: Đồng ý` / `D-xx: Chọn …` / `D-xx: Khác – …`.

---

## 1. Đã phê duyệt

### 1.1 Lần 1 (review FIRST TASK)
| Mã | Nội dung |
|---|---|
| D-B15 | PH: tài khoản, liên kết, lịch, điểm danh ở Phase 1; tình trạng bài ở Phase 2 |
| (kiến trúc) | Learning Progress độc lập AI · Multi-tenant + Modular Monolith · không microservices |
| (nghiệp vụ) | Tái sử dụng có chọn lọc Homework cũ → [08](08-homework-assessment.md) |
| (giáo trình) | Hai hệ TH và KIIP, đủ cấp độ, không tự tạo nội dung có bản quyền |
| (phạm vi) | Không Marketplace, thanh toán trực tuyến, thương mại hóa nâng cao trong MVP |
| (UX) | Ít chữ, ít thao tác, icon đồng bộ, mobile first HV/PH, gộp màn hình, P0/P1/P2 |

### 1.2 Lần 2 (review D-B17) – cho phép triển khai toàn bộ Phase 1

| Mã | Quyết định đã duyệt | Cách hệ thống thực hiện |
|---|---|---|
| **D-B17** | Đăng nhập SĐT/email + mật khẩu; trung tâm cấp mật khẩu tạm. Một người nhiều vai trò, nhiều trung tâm, không trùng tài khoản. Tự đăng ký B2C ở phase sau; kiến trúc sẵn cho Google/OTP | `user_identity` (loại + giá trị chuẩn hóa, duy nhất) → thêm Google/OTP chỉ là thêm loại định danh + luồng xác minh. Giao diện cấp tài khoản nằm trong màn hình Giáo viên/Học viên |
| **Phiên đăng nhập** | HV/PH: 30 ngày nếu đủ an toàn. Quản trị: chặt hơn, cấu hình được | Xem §1.3 – chính sách theo vai trò cao nhất, tính lại mỗi lần làm mới phiên |
| **D-B21** | Trung tâm tạo & xác thực liên kết; HV trưởng thành phải đồng ý; HV chưa thành niên: xác minh người giám hộ; nhiều–nhiều; không bắt buộc; thu hồi ngay | Liên kết chỉ có hiệu lực khi: trung tâm đã xác minh **và** (HV < 18 tuổi **hoặc** HV đã đồng ý). HV tròn 18 tuổi → liên kết cũ tự tạm dừng cho tới khi HV đồng ý |
| **D-B19** | GV sửa điểm danh trong 48h; sau đó cần quản lý trung tâm duyệt; lưu lịch sử; cấu hình được; cảnh báo lớp chậm ≥ 1 bài (cấu hình được) | Cấu hình theo trung tâm; sau hạn GV gửi *yêu cầu sửa*, CA duyệt/từ chối |
| **D-B03** | Mã TH01–TH06, KIIP00–KIIP04, KIIP05-B, KIIP05-A; quản lý bằng dữ liệu; nhập dần từng bài theo phiên bản; không tự tạo nội dung | Mã nằm trong dữ liệu khởi tạo (sửa được trên giao diện); không có danh sách bài mẫu |
| **D-B10** | Phase 1 chỉ học phí tham chiếu; vượt giới hạn → chặn tạo mới, không ảnh hưởng người đang dùng | Một trường số tiền trên lớp; giới hạn HV/GV theo trung tâm |
| **D-B20** | Không hardcode quy mô; dữ liệu thử riêng cho Dev/Staging; thông tin Horizon cung cấp trước vận hành thật | Không có giới hạn cứng trong code; seed chỉ chạy ở dev/test |
| **D-T04** | Máy chủ ưu tiên tại VN; Docker Compose; PostgreSQL; Redis; S3-compatible; sao lưu độc lập; tách Dev/Staging/Production. **Không tự thuê dịch vụ trả phí** | Compose cho từng môi trường, script sao lưu/khôi phục; chưa thuê dịch vụ nào |
| **D-T12** | GitHub Private; mở PR để chạy CI; không merge khi CI chưa đạt; không push bí mật/dữ liệu thật/giáo trình/backup | PR #1 đã mở. ⚠️ Repo hiện đang **Public** – chủ sản phẩm cần chuyển sang Private |
| **Security** | Hoàn thiện RLS; kiểm thử cách ly ở tầng ứng dụng và database; không đưa dữ liệu thật vào trước khi kiểm tra bảo mật | Xem [04 §6](04-system-architecture.md#6-multi-tenancy) và bộ test bảo mật Phase 1 |

### 1.3 Chính sách phiên đăng nhập (đề xuất theo yêu cầu, mặc định cấu hình được qua biến môi trường)

| Nhóm (theo vai trò cao nhất đang có) | Hết hạn nếu không dùng | Thời hạn tối đa từ lúc đăng nhập | Ghi chú |
|---|---|---|---|
| Quản trị (Super Admin, Center Admin) | 2 giờ | 12 giờ | Phải đăng nhập lại mỗi ngày làm việc |
| Giáo viên | 7 ngày | 30 ngày | Dữ liệu nhiều học viên, dùng điện thoại điểm danh |
| Học viên, Phụ huynh | 30 ngày | 90 ngày | Theo duyệt "duy trì 30 ngày" |

Mọi nhóm: access token 15 phút; khóa tài khoản/đổi mật khẩu/thu hồi vai trò có hiệu lực ngay; được gán vai trò quản trị khi đang đăng nhập → lần làm mới tiếp theo áp chính sách chặt hơn.

## 2. Quyết định còn lại

Không còn quyết định nào chặn Phase 1. Các mục dưới đây chặn các phase sau.

### 2.2 Chốt trước Phase 2

| Mã | Vấn đề | Phương án | Đề xuất | Lý do | Ảnh hưởng nghiệp vụ | Chi phí / rủi ro | Trước code |
|---|---|---|---|---|---|---|---|
| **D-B01** | Quyền sử dụng giáo trình *베트남인을 위한 종합 한국어* (phiên bản, phần được số hóa, kênh phân phối) | (a) Có giấy phép đầy đủ · (b) Chỉ dùng nội bộ lớp Horizon · (c) Chưa có | Xác nhận bằng văn bản; trong lúc chờ: **(c)** – chỉ khung + học liệu tự soạn | Tránh rủi ro bản quyền; hệ thống chặn phân phối ngoài phạm vi giấy phép | Quyết định có nội dung HL-P0 (TH01–02) trong Phase 2 hay không | Rủi ro pháp lý cao nếu số hóa khi chưa có quyền | Phase 2 |
| **D-B02** | Quyền sử dụng giáo trình/tài liệu KIIP | như D-B01 | như D-B01 | như D-B01 | Nội dung HL-P1 | như D-B01 | Phase 2 |
| **D-B04** | Cấu trúc cấp độ KIIP hiện hành (cấp 5 Cơ bản/Nâng cao) cần đối chiếu nguồn chính thức | Giữ theo Master Prompt · Cập nhật theo nguồn | Giữ; chủ sản phẩm cung cấp nguồn khi nhập nội dung KIIP | Cấu trúc là dữ liệu, sửa không cần code | Sai cấu trúc → lớp KIIP gắn sai cấp | Thấp | Phase 2 (trước nhập KIIP) |
| **D-B07** | Ai kiểm duyệt học liệu | (a) Kho nền tảng: Super Admin; kho trung tâm: Center Admin hoặc GV được giao quyền; học liệu GV dùng cho lớp mình: chính GV · (b) Mọi học liệu qua Super Admin | **(a)** | Không thêm vai trò mới; không tạo nút thắt ở Super Admin | Tốc độ đưa học liệu vào dùng | (b) chậm; (a) cần CA chịu trách nhiệm chất lượng kho trung tâm | Phase 2 |
| **D-B09** | Center Admin có được sửa điểm? | Có (lý do + lịch sử) · Không | **Không** | Trách nhiệm điểm thuộc GV; CA yêu cầu GV sửa | Khi GV nghỉ việc: CA đổi GV phụ trách lớp, GV mới sửa | Thấp | Phase 2 |
| **D-B11** | HV chuyển lớp/bảo lưu: bài đang mở ở lớp cũ | Vẫn nộp được đến hạn · Hủy | **Vẫn nộp được đến hạn**, không nhận bài mới | Không làm mất công HV đã làm | Báo cáo lớp cũ vẫn tính bài đó | Thấp | Phase 2 |
| **D-B19b** | Mặc định Phase 2: thang điểm, bước điểm, công bố điểm trắc nghiệm ngay | Thang 10 / 100 · bước 0,25 / 0,5 · công bố ngay: bật / **tắt** | Thang 10, bước 0,25, công bố ngay **tắt** | Quen thuộc với HV/PH Việt Nam; GV kiểm soát công bố | Cách HV/PH đọc điểm | Thấp – cấu hình được | Phase 2 |
| **D-B14** | Lưu giữ & xóa dữ liệu (bài nộp, ghi âm, log AI, khi trung tâm ngừng hợp đồng) | Theo bảng [05 §16](05-database-overview.md#16-lưu-giữ-và-quyền-riêng-tư-dữ-liệu) · Khác | Theo bảng; pháp chế xác nhận | Cần cho chính sách dữ liệu (C-05) | Nội dung điều khoản; quyền yêu cầu xóa | Pháp lý | Không chặn code; **bắt buộc trước pilot với dữ liệu thật** |
| **D-T07** | Âm thanh tiếng Hàn | (a) Audio tải lên + TTS tạo sẵn cho từ/câu · (b) Chỉ audio tải lên | **(a)**, chọn nhà cung cấp TTS theo chất lượng giọng Hàn khi bắt đầu Phase 2 | TTS tạo một lần, lưu thành file → chi phí rất thấp | Có audio cho từ vựng ngay cả khi chưa có audio gốc (gắn nhãn TTS) | Phí theo ký tự, phát sinh một lần mỗi câu | Phase 2 |

### 2.3 Chốt trước Phase 3

| Mã | Vấn đề | Phương án | Đề xuất | Lý do | Ảnh hưởng nghiệp vụ | Chi phí / rủi ro | Trước code |
|---|---|---|---|---|---|---|---|
| **D-B12** | Đồng ý xử lý bài làm bằng AI bên thứ ba (máy chủ có thể ở nước ngoài) | Bật mặc định · **Tắt mặc định, trung tâm bật** | Tắt mặc định; bật sau khi điều khoản được cập nhật; chỉ gửi nội dung bài làm đã ẩn danh | Dữ liệu có trẻ vị thành niên; quy định bảo vệ dữ liệu cá nhân của Việt Nam | Trung tâm chưa bật → không có chấm/soạn AI | Pháp lý – **cần pháp chế** | Phase 3 |
| **D-T06** | Nhà cung cấp & model AI | Chọn qua bộ đánh giá tiếng Hàn (chất lượng chấm trợ từ, chia động từ, khoảng cách từ; chi phí; độ trễ; điều khoản dữ liệu) | Đánh giá 2–3 nhà cung cấp ở đầu Phase 3; kiến trúc cho phép đổi | Chọn theo số đo, không theo cảm tính | Chất lượng phản hồi cho HV/GV | Chi phí theo lượng dùng → kiểm soát bằng hạn mức | Phase 3 |

### 2.4 Sau MVP

| Mã | Vấn đề | Đề xuất | Lý do | Trước code |
|---|---|---|---|---|
| D-B05 | Nguồn đề TOPIK/KIIP | Tự biên soạn theo cấu trúc công khai; không sao chép đề thật khi chưa có quyền | Bản quyền | Phase 5 |
| D-B08 | Dữ liệu tự học B2C có chia sẻ cho trung tâm/PH | Riêng tư mặc định; HV bật chia sẻ | Quyền riêng tư người học | Phase 5 |
| D-B18 | Gộp hay tách workspace học viên và người tự học | Quyết định khi thiết kế Phase 5 | Chưa cần trong MVP | Phase 5 |
| D-B13 | Cổng thanh toán, hóa đơn | Chọn ở Phase 6 | Ngoài MVP | Phase 6 |
| D-B06 | Tỷ lệ chia sẻ doanh thu, đối soát | Cấu hình được; đối soát tháng | Ngoài MVP | Phase 7 |
| D-T11 | Kênh thông báo ngoài app (Zalo OA, email, SMS) | Zalo OA ưu tiên sau MVP | Thói quen PH Việt Nam; cần OA doanh nghiệp, có phí | Sau Phase 4 |
| D-B16 | Logo, mã màu chính thức | Dùng tạm xanh lá chủ đạo, Noto Sans/Noto Sans KR; tất cả là cấu hình | Không chặn | Không |

---

## 3. Quyết định kỹ thuật đã chốt (nhóm kỹ thuật, chủ sản phẩm có quyền phủ quyết)

| Mã | Quyết định | Lý do (đơn giản · ổn định · bảo trì · chi phí · mở rộng) |
|---|---|---|
| D-T01 | TypeScript toàn bộ: Next.js (web) + NestJS (API & worker) + PostgreSQL + Redis/BullMQ + lưu trữ S3-compatible | Một ngôn ngữ cho cả đội; công nghệ phổ biến, dễ tuyển; khớp gợi ý Master Prompt |
| D-T02 | Prisma cho schema & migration | Migration có phiên bản, type-safe; truy vấn báo cáo phức tạp dùng SQL trực tiếp |
| D-T03 | Cách ly trung tâm: cột `organization_id` + kiểm tra ở tầng ứng dụng **+ PostgreSQL Row-Level Security** | Hai lớp bảo vệ, chi phí thấp; không cần DB riêng mỗi trung tâm; vẫn tách được DB khi có khách lớn |
| D-T05 | Phiên đăng nhập: token ngắn hạn + refresh xoay vòng trong cookie httpOnly; khóa tài khoản có hiệu lực ngay | An toàn trước XSS, không cần hạ tầng phiên riêng |
| D-T08 | Lịch ôn từ vựng: thuật toán FSRS (mã nguồn mở), lưu phiên bản thuật toán | Chính xác hơn SM-2, đổi được về sau mà không mất dữ liệu |
| D-T09 | Pilot: 1 máy chủ chạy Docker Compose (web, API, worker, DB, Redis) + S3-compatible + backup hằng ngày; tách DB sang dịch vụ quản lý khi tăng tải | Chi phí thấp, dễ vận hành; đường mở rộng rõ |
| D-T10 | Web app responsive + PWA cho HV/PH; chưa làm app native | Một codebase; app native khi thật sự cần thông báo đẩy trên iOS |
| D-T13 | Icon Lucide; font Noto Sans + Noto Sans KR tự host; i18n từ đầu (tiếng Việt mặc định) | Theo Master Prompt; không phụ thuộc CDN |
| D-T14 | Không dùng vector DB/tìm kiếm riêng trong MVP: PostgreSQL full-text + trigram | Đủ cho quy mô MVP, bớt một hệ thống phải vận hành |
| D-T15 | CI: GitHub Actions; quét bí mật bằng gitleaks trong pre-commit và CI | Miễn phí, chặn lộ khóa trước khi push |
