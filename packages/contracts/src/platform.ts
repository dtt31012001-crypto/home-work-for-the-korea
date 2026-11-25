import { z } from "zod";
import type { Role } from "./schemas";
import type { AttendanceCounts } from "./attendance";

/** SA-03: người dùng toàn nền tảng. */
export interface PlatformUserRow {
  id: string;
  displayName: string;
  status: "ACTIVE" | "LOCKED" | "DEACTIVATED";
  identities: { type: "PHONE" | "EMAIL"; value: string }[];
  roles: { role: Role; organization: { id: string; name: string } | null }[];
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

/** SA-04: một dòng nhật ký hệ thống. */
export interface AuditRow {
  id: string;
  at: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actor: { id: string; displayName: string } | null;
  /** Tên người dùng bị tác động (khi đối tượng là tài khoản) */
  target: string | null;
  organization: { id: string; name: string } | null;
  ip: string | null;
  data: unknown;
}

export interface AuditPage {
  items: AuditRow[];
  /** Truyền lại vào `before` để xem trang tiếp theo; null khi hết */
  nextCursor: string | null;
}

/** Nhãn tiếng Việt cho các hành động thường gặp; hành động khác hiển thị mã gốc. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "auth.login.succeeded": "Đăng nhập",
  "auth.login.failed": "Đăng nhập sai",
  "auth.login.locked_out": "Tạm khóa do sai nhiều lần",
  "auth.refresh.reuse_detected": "Phát hiện dùng lại phiên",
  "auth.password.changed": "Đổi mật khẩu",
  "auth.password.temporary_replaced": "Đặt mật khẩu lần đầu",
  "account.issued": "Cấp tài khoản",
  "account.imported": "Nhập danh sách tài khoản",
  "account.role_linked": "Gắn thêm vai trò",
  "account.role_revoked": "Rút vai trò",
  "account.password_reset": "Đặt lại mật khẩu",
  "account.locked": "Khóa tài khoản",
  "account.unlocked": "Mở khóa tài khoản",
  "account.profile_updated": "Sửa hồ sơ",
  "organization.created": "Tạo trung tâm",
  "organization.updated": "Sửa trung tâm",
  "organization.admin_updated": "Đổi trạng thái/giới hạn trung tâm",
  "curriculum.granted": "Cấp giáo trình",
  "curriculum.grant_revoked": "Thu hồi giáo trình",
  "guardian_link.created": "Tạo liên kết phụ huynh",
  "guardian_link.consented": "Học viên đồng ý liên kết",
  "guardian_link.rejected": "Học viên từ chối liên kết",
  "guardian_link.revoked": "Thu hồi liên kết phụ huynh",
  "class.created": "Tạo lớp",
  "class.updated": "Sửa lớp",
  "class.teacher_changed": "Đổi giáo viên",
  "class.schedule_changed": "Đổi lịch cố định",
  "session.cancelled": "Nghỉ buổi học",
  "session.updated": "Sửa buổi học",
  "session.added": "Thêm buổi học",
  "enrollment.created": "Ghi danh",
  "enrollment.on_hold": "Bảo lưu",
  "enrollment.resumed": "Học tiếp",
  "enrollment.transferred": "Chuyển lớp",
  "enrollment.withdrawn": "Nghỉ học",
  "attendance.recorded": "Điểm danh",
  "attendance.updated": "Sửa điểm danh",
  "attendance.change_requested": "Yêu cầu sửa điểm danh",
  "attendance.change_approved": "Duyệt sửa điểm danh",
  "attendance.change_rejected": "Từ chối sửa điểm danh",
};

/** CA-07: báo cáo chuyên cần trong khoảng ngày. */
export interface AttendanceReport {
  from: string;
  to: string;
  classes: {
    id: string;
    name: string;
    levelCode: string;
    teacher: string | null;
    /** Buổi đã diễn ra (không tính buổi nghỉ) */
    heldSessions: number;
    recordedSessions: number;
    counts: AttendanceCounts;
    /** (có mặt + đi muộn) / tổng lượt điểm danh, null khi chưa có dữ liệu */
    rate: number | null;
  }[];
  students: {
    id: string;
    displayName: string;
    classes: string[];
    counts: AttendanceCounts;
    rate: number | null;
    /** Vắng (không phép) liên tiếp gần nhất */
    absentStreak: number;
  }[];
}

/** C-07: nhập danh sách tài khoản (giai đoạn 1: học viên / giáo viên). */
export const IMPORT_MAX_ROWS = 500;
export const importRowSchema = z.object({
  displayName: z.string().trim().max(120),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().max(254).optional(),
  dateOfBirth: z.string().trim().max(10).optional(),
});
export const importAccountsSchema = z.object({
  role: z.enum(["STUDENT", "TEACHER"]),
  rows: z.array(importRowSchema).min(1, "File không có dòng dữ liệu").max(IMPORT_MAX_ROWS, `Tối đa ${IMPORT_MAX_ROWS} dòng mỗi lần`),
  /** true: chỉ kiểm tra, không tạo gì */
  dryRun: z.boolean(),
});
export type ImportAccountsInput = z.infer<typeof importAccountsSchema>;

export type ImportOutcome = "CREATE" | "LINK_EXISTING" | "ALREADY_HAS_ROLE" | "ERROR";
export interface ImportResultRow {
  /** Số dòng trong file (dòng tiêu đề là 1) */
  line: number;
  displayName: string;
  identifier: string;
  outcome: ImportOutcome;
  message: string | null;
  /** Chỉ có khi đã tạo thật (dryRun=false) và là tài khoản mới; hiển thị một lần */
  temporaryPassword?: string;
}
export interface ImportResult {
  dryRun: boolean;
  rows: ImportResultRow[];
  summary: Record<ImportOutcome, number>;
  temporaryPasswordExpiresAt: string | null;
}
