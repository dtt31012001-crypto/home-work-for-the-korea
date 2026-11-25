# 07 · Quyết định – đã duyệt, còn lại, kỹ thuật đã chốt

> Cập nhật: 2026-11-25 sau buổi review FIRST TASK.
> Nguyên tắc: chủ sản phẩm chỉ quyết định những gì ảnh hưởng đáng kể đến **nghiệp vụ, chi phí, pháp lý hoặc khả năng mở rộng**. Chi tiết kỹ thuật thuần túy do nhóm kỹ thuật chốt theo tiêu chí *đơn giản, ổn định, dễ bảo trì, chi phí hợp lý, mở rộng được* (§3) — chủ sản phẩm có quyền phủ quyết.
> Cách phản hồi: `D-xx: Đồng ý` / `D-xx: Chọn …` / `D-xx: Khác – …`.

---

## 1. Đã phê duyệt

| Mã | Nội dung |
|---|---|
| D-B15 | PH: tài khoản, liên kết PH–HV, xem lịch và điểm danh ở Phase 1; xem tình trạng làm bài ngay khi Phase 2 có giao bài |
| (kiến trúc) | Learning Progress là module độc lập, không phụ thuộc AI |
| (kiến trúc) | Multi-tenant + Modular Monolith; không microservices giai đoạn đầu |
| (nghiệp vụ) | Tái sử dụng có chọn lọc phân tích Homework cũ, bỏ phần không phù hợp → [08](08-homework-assessment.md) |
| (giáo trình) | Hai hệ chính thức TH và KIIP; thiết kế đủ cấp độ; không tự tạo nội dung khi chưa có dữ liệu và quyền |
| D-B10 (một phần) | Không Marketplace, không thanh toán trực tuyến, không thương mại hóa nâng cao trong MVP |
| (UX) | Ít chữ, thao tác đơn giản, icon đồng bộ, mobile first cho HV/PH, gộp màn hình, không thêm khái niệm thừa |
| (lộ trình) | Phân loại màn hình P0/P1/P2 → [06 §3](06-mvp-roadmap.md#3-danh-mục-màn-hình-mvp-và-mức-ưu-tiên) |

---

## 2. Quyết định còn lại

Cột **Trước code**: *Có* = phải chốt trước khi viết code Phase 0/1 · *Phase n* = phải chốt trước khi làm phase đó · *Không* = có mặc định an toàn, đổi được về sau.

### 2.1 Bắt buộc chốt trước khi viết code

| Mã | Vấn đề | Phương án | Đề xuất | Lý do | Ảnh hưởng nghiệp vụ | Chi phí / rủi ro | Trước code |
|---|---|---|---|---|---|---|---|
| **D-B17** | Cách đăng nhập và cấp tài khoản trong MVP | (a) SĐT/email + mật khẩu; trung tâm cấp **mật khẩu tạm**, bắt buộc đổi lần đầu · (b) (a) + OTP SMS/Zalo · (c) (a) + Google | **(a)** | Không phát sinh phí tin nhắn; phù hợp tài khoản do trung tâm tạo; kiến trúc sẵn sàng thêm OTP/Google | Trung tâm phải gửi mật khẩu tạm cho HV/PH (trực tiếp/Zalo cá nhân); quên mật khẩu không có email → nhờ trung tâm đặt lại | (b): phí mỗi tin SMS/ZNS + thủ tục đăng ký brandname/OA. (a): rủi ro mật khẩu tạm bị lộ → giảm bằng hết hạn sau 7 ngày và bắt buộc đổi | **Có** |
| **D-B21** | Quy tắc liên kết phụ huynh – học viên | (a) Center Admin tạo liên kết; HV **≥ 18 tuổi phải đồng ý** trong app; HV < 18 do Center Admin xác nhận người giám hộ · (b) Center Admin tạo, không cần HV đồng ý · (c) PH tự yêu cầu bằng mã mời | **(a)**; (c) để sau | Master Prompt yêu cầu HV trưởng thành phải đồng ý; trung tâm là nơi đã xác minh PH ngoài đời | Cần **ngày sinh HV** để biết ≥ 18; HV trưởng thành có thể từ chối | (b) rủi ro pháp lý về dữ liệu cá nhân người trưởng thành; (c) thêm luồng xác minh | **Có** |
| **D-B19** | Giá trị mặc định Phase 1 | Cửa sổ GV sửa điểm danh: 24h / **48h** / 7 ngày · Ngưỡng "chậm tiến độ": **≥ 1 bài** / ≥ 2 bài | 48h; ≥ 1 bài; cấu hình được theo trung tâm | Đủ thời gian cho GV sửa nhầm, vẫn giữ kỷ luật dữ liệu | Quyết định khi nào CA phải can thiệp sửa điểm danh; độ nhạy cảnh báo | Thấp – đổi được bằng cấu hình | **Có** (chỉ cần chấp thuận mặc định) |
| **D-B03** | Mã chương trình TH01–TH06, KIIP00–KIIP05-A/B | Dùng mã đề xuất · Đổi mã | **Dùng mã đề xuất** | Ngắn, dễ đọc; lưu trong dữ liệu nên đổi được không cần sửa code | Hiển thị trên lớp, báo cáo, file import | Thấp | **Có** (dữ liệu khởi tạo) |
| **D-B10** | Học phí và giới hạn gói trong MVP (thanh toán trực tuyến đã loại) | (a) Lớp có **một trường học phí** để tham chiếu, không theo dõi đóng tiền · (b) (a) + trạng thái đã/chưa đóng từng HV nhập tay · Khi trung tâm vượt giới hạn: chặn tạo mới / chỉ cảnh báo | **(a)**; vượt giới hạn: **chỉ chặn tạo mới**, không ảnh hưởng HV đang học | Không tạo thêm khái niệm tài chính khi chưa có module tài chính; (b) có thể thêm ở P2 | Trung tâm vẫn theo dõi đóng học phí ngoài hệ thống trong MVP | Thấp | **Có** (form lớp) |
| **D-B20** | Thông tin Horizon cho pilot | Số cơ sở, lớp, GV, HV; tỷ lệ HV < 18 tuổi; múi giờ (có HV ở Hàn Quốc?); lớp pilot; quy trình hiện tại | Cung cấp trước Phase 1 | Xác định dữ liệu thử, cấu hình, quy mô hạ tầng | Quyết định lớp pilot và kịch bản nghiệm thu | Thiếu → nghiệm thu trên giả định | **Có** |
| **D-T04** | Hạ tầng và vị trí lưu dữ liệu | (a) VPS/cloud **tại Việt Nam** · (b) Cloud quốc tế vùng Singapore · (c) Cloud quốc tế vùng Seoul | **(a)** cho DB và file; Docker Compose trên 1 máy chủ + lưu trữ S3-compatible; backup sang vị trí thứ hai | Dữ liệu cá nhân HV/PH (có trẻ vị thành niên) ở trong nước giảm thủ tục chuyển dữ liệu ra nước ngoài; chi phí pilot thấp | Không ảnh hưởng tính năng | (a) cần chọn nhà cung cấp có S3-compatible và backup tốt. (b)/(c) có thể phải lập hồ sơ chuyển dữ liệu ra nước ngoài – cần pháp chế. Chi phí pilot: một máy chủ cỡ vừa + lưu trữ | **Có** (trước khi dựng staging) |
| **D-T12** | Nơi lưu mã nguồn | (a) GitHub Private dưới **Organization** của công ty · (b) GitHub Private dưới tài khoản cá nhân | **(a)** | Quyền sở hữu thuộc tổ chức, dễ thêm/bớt thành viên; xem [09](09-github-repository-plan.md) | Không | Gói miễn phí dùng được; **bảo vệ nhánh** cho repo private cần gói trả phí (Team) – có thể bật sau | **Có** |

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
