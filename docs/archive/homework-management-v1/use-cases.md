# Use Cases – Homework Management System

> Phase 1 – chờ review. Mỗi use case tham chiếu mã yêu cầu trong `requirements.md`.

## 1. Danh sách use case

### Chung
| Mã | Use case | Actor | Yêu cầu |
|---|---|---|---|
| UC-01 | Đăng nhập / đăng xuất | Tất cả | AUTH-01..06 |
| UC-02 | Đổi mật khẩu (bắt buộc lần đầu) | Tất cả | AUTH-04 |
| UC-03 | Xem & quản lý thông báo | Tất cả | NTF-01..03 |

### Administrator
| Mã | Use case | Yêu cầu |
|---|---|---|
| UC-10 | Tạo / sửa / khoá tài khoản GV, HS | ADM-01, AUTH-05 |
| UC-11 | Import tài khoản từ Excel | ADM-02 |
| UC-12 | Quản lý năm học, học kỳ | ADM-03 |
| UC-13 | Quản lý môn học | ADM-04 |
| UC-14 | Quản lý lớp học | ADM-05 |
| UC-15 | Phân công GV vào lớp theo môn / gỡ phân công | ADM-06 |
| UC-16 | Xếp / rút HS khỏi lớp | ADM-07 |
| UC-17 | Cấu hình hệ thống (file, AI, ngân sách) | ADM-08 |
| UC-18 | Xem audit log | ADM-09 |
| UC-19 | Xem dashboard & báo cáo toàn hệ thống, xuất Excel | RPT-01, RPT-05 |

### Teacher
| Mã | Use case | Yêu cầu |
|---|---|---|
| UC-20 | Xem lớp được phân công, danh sách HS, lịch sử học tập | RPT-07 |
| UC-21 | Tạo / sửa bài tập (nháp) | ASG-01..03, ASG-16 |
| UC-22 | Soạn câu hỏi, đáp án, rubric | QST-01..07, QST-10 |
| UC-23 | Tái sử dụng câu hỏi / nhân bản bài tập | ASG-14, QST-08..09 |
| UC-24 | Giao bài (lớp, nhiều lớp, cá nhân), lên lịch | ASG-05..10 |
| UC-25 | Thu hồi / khôi phục bài tập; gia hạn cho HS | ASG-11, BR-14 |
| UC-26 | Theo dõi tình trạng bài nộp | Mục 5.2 |
| UC-27 | Chấm bài (workspace chấm: thủ công + rubric) | GRD-02..06 |
| UC-28 | Xem & duyệt đề xuất AI, yêu cầu chấm lại AI | AI-*, GRD-08 |
| UC-29 | Yêu cầu HS nộp lại | GRD-07 |
| UC-30 | Công bố điểm / sửa điểm sau công bố | GRD-09..11 |
| UC-31 | Xem dashboard, báo cáo lớp, xuất Excel | RPT-02, RPT-04, RPT-05 |

### Student
| Mã | Use case | Yêu cầu |
|---|---|---|
| UC-40 | Xem dashboard học sinh | RPT-03 |
| UC-41 | Xem danh sách bài tập (bộ lọc) | SUB-01..02 |
| UC-42 | Làm bài (bắt đầu, trả lời, autosave, đếm giờ) | SUB-03..07 |
| UC-43 | Nộp bài / nộp lại | SUB-08..11 |
| UC-44 | Xem kết quả & nhận xét | Mục 4.5 master prompt |

### System
| Mã | Use case | Yêu cầu |
|---|---|---|
| UC-50 | Mở bài theo lịch, gửi thông báo bài mới | ASG-10, NTF-01 |
| UC-51 | Nhắc sắp hạn, báo quá hạn | NTF-01 |
| UC-52 | Tự nộp khi hết giờ | SUB-10 |
| UC-53 | Chấm tự động | GRD-01 |
| UC-54 | Chạy AI grading job | AI-01..10 |
| UC-55 | Dọn file mồ côi | E13 |

---

## 2. Đặc tả các use case chính

### UC-01 Đăng nhập
- **Tiền điều kiện:** tài khoản tồn tại, không bị khoá.
- **Luồng chính:** nhập định danh + mật khẩu → server kiểm tra rate limit → xác minh Argon2 → phát access/refresh token (cookie httpOnly, Secure, SameSite=Lax) + CSRF token → ghi audit `LOGIN_SUCCESS` → điều hướng theo vai trò; nếu `must_change_password` → UC-02.
- **Luồng phụ:** sai mật khẩu → thông báo chung "Thông tin đăng nhập không đúng", tăng bộ đếm, audit `LOGIN_FAILED`; vượt ngưỡng → khoá tạm 15 phút. Tài khoản bị khoá → "Tài khoản đã bị khoá, liên hệ quản trị viên".
- **Hậu điều kiện:** phiên được tạo, lưu refresh token (băm) trong DB.

### UC-10 Admin tạo tài khoản giáo viên
- **Luồng chính:** nhập họ tên, email, username, số điện thoại (tuỳ chọn) → validate unique → tạo user + role TEACHER + hồ sơ teacher, mật khẩu tạm (sinh ngẫu nhiên, hiển thị một lần) và `must_change_password = true` → audit `USER_CREATED`.
- **Ngoại lệ:** trùng email/username → 409 với trường lỗi cụ thể.
- **Kiểm thử phải xác nhận:** bản ghi user/teacher/user_roles trong DB, mật khẩu không lưu dạng rõ, audit log tồn tại.

### UC-14/16 Admin tạo lớp và thêm học sinh
- **Luồng chính:** tạo lớp (tên, khối, năm học) → chọn nhiều HS (tìm kiếm) → thêm vào `class_students` (`joined_at`).
- **Quy tắc:** HS chỉ thuộc **một lớp chính** trong một năm học (xem câu hỏi mở nếu cần lớp tự chọn); rút HS = đặt `left_at`, không xoá.
- **Hiệu ứng:** HS được thêm sẽ nhận các bài đang mở chưa quá hạn của lớp (BR-11).

### UC-21/22/24 Giáo viên tạo và giao bài tập
1. GV chọn lớp/môn được phân công → tạo bài (DRAFT).
2. Thêm câu hỏi theo loại; với essay nhập đáp án tham khảo và rubric; bật/tắt AI.
3. Thiết lập: `open_at`, `due_at`, cho phép muộn + `late_until`, thời gian làm bài, số lần nộp, chính sách đáp án, chính sách nhận xét AI.
4. Chọn đối tượng: lớp (≥1) và/hoặc từng HS.
5. Bấm **Giao bài** → server kiểm tra BR-10, BR-02 → `status = PUBLISHED`, `published_at = now`.
6. Nếu `open_at ≤ now`: chốt recipients + thông báo ngay; ngược lại job theo lịch thực hiện ở `open_at` (UC-50).
- **Ngoại lệ:** thiếu đáp án đúng / thiếu rubric / thời gian không hợp lệ → 422 liệt kê từng lỗi; lớp không được phân công → 403.

### UC-42 Học sinh làm bài
1. HS mở bài (đã OPEN) → xem thông tin, bấm **Bắt đầu**.
2. Server tạo attempt `IN_PROGRESS`, `started_at`, tính `deadline` (BR-22), trả `server_now`.
3. HS trả lời; client autosave (PATCH câu trả lời kèm `draft_version`).
4. Upload file: xin presigned URL → upload trực tiếp lên storage → gọi API xác nhận → server kiểm tra magic bytes/dung lượng → gắn vào câu trả lời.
- **Ngoại lệ:** hết giờ → server từ chối lưu, client chuyển màn hình "Đã tự nộp"; xung đột phiên bản → cảnh báo.

### UC-43 Học sinh nộp bài
1. HS bấm **Nộp bài** → hộp xác nhận liệt kê câu chưa trả lời.
2. Client gửi POST submit kèm `Idempotency-Key`.
3. Server (transaction): khoá attempt → kiểm tra quyền nộp, hạn, câu bắt buộc → chốt nội dung (snapshot vào `submission_versions`) → `SUBMITTED`, `submitted_at`, `is_late` → chấm tự động các câu xác định → tạo job AI cho essay (enqueue sau commit) → trạng thái `GRADING` hoặc `GRADED`.
4. Thông báo GV (gộp).
- **Ngoại lệ:** trùng request → trả kết quả cũ; quá hạn → 409 `DEADLINE_PASSED`; hết lượt → 409 `NO_ATTEMPTS_LEFT`.

### UC-27/28 Giáo viên chấm và duyệt AI
1. GV mở workspace chấm: trái = bài làm (theo câu), phải = bảng điểm (điểm tự động, đề xuất AI theo tiêu chí, ô điểm GV, nhận xét).
2. Với câu essay có đề xuất AI: GV **Chấp nhận** / **Chỉnh sửa** / **Bỏ qua và tự chấm**; có thể **Chấm lại bằng AI**.
3. GV có thể ghi đè điểm tự động (bắt buộc lý do).
4. Lưu → grade_details + grade_history; khi mọi câu đã duyệt → attempt `GRADED`.
- **Ngoại lệ:** AI `FAILED`/`SKIPPED_BUDGET` → hiển thị lý do, GV chấm tay; cảnh báo nghi ngờ injection.

### UC-30 Công bố điểm
- GV chọn công bố cho 1 HS hoặc tất cả attempt `GRADED` của bài → attempt `PUBLISHED`, `published_at` → thông báo HS.
- Sửa sau công bố: bắt buộc lý do, ghi history, thông báo HS "Điểm đã được cập nhật".

### UC-44 Học sinh xem kết quả
- Chỉ khi attempt `PUBLISHED`. Hiển thị: điểm/tổng, điểm từng câu, câu trả lời của mình, đáp án đúng (nếu `answer_visibility` cho phép), nhận xét GV, nhận xét AI (nếu bài cho phép **và** GV đã duyệt), phần cần cải thiện.
- API không bao giờ trả `ai_grading_results` thô, điểm AI chưa duyệt, rubric nội bộ hay ghi chú riêng của GV.

### UC-54 AI grading job
1. Worker nhận job → kiểm tra attempt còn hợp lệ (chưa bị huỷ), kiểm tra ngân sách.
2. Dựng prompt: system prompt (phiên bản hoá) + đề + đáp án tham khảo + rubric + bài làm trong vùng dữ liệu được đánh dấu; không có thông tin định danh HS.
3. Gọi Anthropic API (structured output theo JSON schema, timeout, retry).
4. Validate → lưu `ai_grading_results` + metadata (model, prompt_version, tokens, latency, cost).
5. Cập nhật grade câu → `AI_SUGGESTED`; nếu tất cả câu AI của attempt xong → thông báo GV "Bài đã sẵn sàng để duyệt".
- **Ngoại lệ:** xem E06–E10 trong requirements.
