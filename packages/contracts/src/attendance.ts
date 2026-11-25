import { z } from "zod";
import type { SessionView } from "./classes";

export const ATTENDANCE_LABEL = { PRESENT: "Có mặt", LATE: "Đi muộn", EXCUSED: "Vắng có phép", ABSENT: "Vắng" } as const;
export type AttendanceStatus = keyof typeof ATTENDANCE_LABEL;
export const ATTENDANCE_ORDER: AttendanceStatus[] = ["PRESENT", "LATE", "EXCUSED", "ABSENT"];

const uuid = z.string().uuid();
const record = z.object({
  studentUserId: uuid,
  status: z.enum(["PRESENT", "LATE", "EXCUSED", "ABSENT"]),
  note: z.string().trim().max(300).optional(),
});

/** Ghi buổi học: điểm danh + bài đã dạy + ghi chú + nhận xét học viên. */
export const saveSessionSchema = z.object({
  records: z.array(record).max(500),
  lessons: z.array(z.object({ lessonId: uuid, coverage: z.enum(["DONE", "PARTIAL"]) })).max(20),
  note: z.string().trim().max(2000).optional(),
  comments: z
    .array(z.object({ studentUserId: uuid, body: z.string().trim().max(2000), visibleToFamily: z.boolean() }))
    .max(500)
    .optional(),
  /** Bắt buộc khi quản lý trung tâm sửa sau thời hạn của giáo viên */
  reason: z.string().trim().max(300).optional(),
});
export type SaveSessionInput = z.infer<typeof saveSessionSchema>;

export const changeRequestSchema = z.object({
  changes: z.array(record).min(1).max(500),
  reason: z.string().trim().min(1, "Vui lòng ghi lý do").max(300),
});
export type ChangeRequestInput = z.infer<typeof changeRequestSchema>;

export const decideRequestSchema = z.object({ note: z.string().trim().max(300).optional() });

export interface RosterEntry {
  student: { id: string; displayName: string };
  /** Bảo lưu trong ngày học: không cần điểm danh, không tính vắng */
  onHold: boolean;
  attendance: { status: AttendanceStatus; note: string | null } | null;
  comment: { body: string; visibleToFamily: boolean } | null;
}

export interface SessionWorkspace {
  session: SessionView;
  class: { id: string; name: string; levelCode: string; organizationId: string; organizationName: string; timezone: string };
  roster: RosterEntry[];
  lessons: { id: string; number: number; titleVi: string }[];
  taught: { lessonId: string; coverage: "DONE" | "PARTIAL" }[];
  note: string | null;
  /** Người xem có thể ghi trực tiếp không */
  editable: boolean;
  /** Hết hạn sửa của giáo viên (ISO) */
  editDeadline: string;
  /** Là giáo viên và đã quá hạn: cần gửi yêu cầu sửa */
  needsRequest: boolean;
  pendingRequest: { id: string; reason: string; createdAt: string } | null;
  recordedAt: string | null;
}

export interface TeacherDay {
  date: string;
  sessions: (SessionView & { class: { id: string; name: string; levelCode: string }; organization: { id: string; name: string }; recorded: boolean; counts: AttendanceCounts | null })[];
  /** Buổi đã qua (7 ngày) chưa điểm danh */
  unrecorded: (SessionView & { class: { id: string; name: string }; organization: { id: string; name: string } })[];
}

export interface AttendanceCounts {
  PRESENT: number;
  LATE: number;
  EXCUSED: number;
  ABSENT: number;
  total: number;
}

export interface ClassProgress {
  lessons: { id: string; number: number; titleVi: string; status: "DONE" | "PARTIAL" | "NOT_STARTED"; plannedDate: string | null }[];
  lastDoneLesson: { number: number; titleVi: string } | null;
  plannedLesson: { number: number; titleVi: string } | null;
  behindBy: number;
  behind: boolean;
  threshold: number;
  completedSessions: number;
  plannedSessions: number;
}

export interface CenterToday {
  date: string;
  sessions: (SessionView & { class: { id: string; name: string; levelCode: string }; recorded: boolean; counts: AttendanceCounts | null })[];
  absentees: { student: { id: string; displayName: string }; class: { id: string; name: string }; status: "ABSENT" | "EXCUSED"; sessionId: string }[];
  unrecorded: (SessionView & { class: { id: string; name: string } })[];
  behindClasses: { id: string; name: string; behindBy: number; plannedLesson: number | null; lastDoneLesson: number | null }[];
  pendingRequests: {
    id: string;
    session: SessionView;
    class: { id: string; name: string };
    requestedBy: { id: string; displayName: string };
    reason: string;
    createdAt: string;
    changes: { student: { id: string; displayName: string }; from: AttendanceStatus | null; to: AttendanceStatus }[];
  }[];
}
