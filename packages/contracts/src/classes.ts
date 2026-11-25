import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ không hợp lệ (HH:MM)");
const uuid = z.string().uuid();

export const weeklyRuleSchema = z
  .object({ weekday: z.number().int().min(1).max(7), startTime: time, endTime: time })
  .refine((r) => r.startTime < r.endTime, { message: "Giờ kết thúc phải sau giờ bắt đầu", path: ["endTime"] });
export type WeeklyRuleInput = z.infer<typeof weeklyRuleSchema>;

export const createClassSchema = z.object({
  name: z.string().trim().min(1).max(120),
  branchId: uuid,
  editionId: uuid,
  teacherUserId: uuid,
  defaultRoomId: uuid.nullable().optional(),
  startDate: date,
  plannedSessions: z.number().int().min(1).max(500),
  startLessonNumber: z.number().int().min(0).max(999),
  sessionsPerLesson: z.number().int().min(1).max(20).default(1),
  rules: z.array(weeklyRuleSchema).min(1, "Cần ít nhất một buổi trong tuần").max(14),
  tuitionAmount: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
});
export type CreateClassInput = z.infer<typeof createClassSchema>;

export const updateClassSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  defaultRoomId: uuid.nullable().optional(),
  tuitionAmount: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]).optional(),
});
export type UpdateClassInput = z.infer<typeof updateClassSchema>;

export const changeTeacherSchema = z.object({ teacherUserId: uuid, fromDate: date });
export type ChangeTeacherInput = z.infer<typeof changeTeacherSchema>;

export const changeScheduleSchema = z.object({
  fromDate: date,
  rules: z.array(weeklyRuleSchema).min(1).max(14),
  roomId: uuid.nullable().optional(),
});
export type ChangeScheduleInput = z.infer<typeof changeScheduleSchema>;

export const updateSessionSchema = z.object({
  date: date.optional(),
  startTime: time.optional(),
  endTime: time.optional(),
  roomId: uuid.nullable().optional(),
  teacherUserId: uuid.nullable().optional(),
  reason: z.string().trim().max(300).optional(),
});
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

export const cancelSessionSchema = z.object({
  reason: z.string().trim().min(1, "Vui lòng ghi lý do").max(300),
  makeup: z
    .object({ date, startTime: time, endTime: time, roomId: uuid.nullable().optional() })
    .refine((m) => m.startTime < m.endTime, { message: "Giờ kết thúc phải sau giờ bắt đầu", path: ["endTime"] })
    .optional(),
});
export type CancelSessionInput = z.infer<typeof cancelSessionSchema>;

export const addSessionSchema = z
  .object({
    kind: z.enum(["EXTRA", "EXAM"]),
    date,
    startTime: time,
    endTime: time,
    roomId: uuid.nullable().optional(),
    plannedLessonId: uuid.nullable().optional(),
  })
  .refine((m) => m.startTime < m.endTime, { message: "Giờ kết thúc phải sau giờ bắt đầu", path: ["endTime"] });
export type AddSessionInput = z.infer<typeof addSessionSchema>;

export const enrollSchema = z.object({ studentUserIds: z.array(uuid).min(1).max(200), startDate: date });
export type EnrollInput = z.infer<typeof enrollSchema>;

export const holdSchema = z.object({ fromDate: date, untilDate: date.nullable().optional(), note: z.string().trim().max(300).optional() });
export const resumeSchema = z.object({ date });
export const withdrawSchema = z.object({ date, note: z.string().trim().max(300).optional() });
export const transferSchema = z.object({ toClassId: uuid, date, note: z.string().trim().max(300).optional() });

export const SESSION_KIND_LABEL = { REGULAR: "Buổi học", MAKEUP: "Học bù", EXTRA: "Học thêm", EXAM: "Kiểm tra" } as const;
export const SESSION_STATUS_LABEL = { SCHEDULED: "Sắp diễn ra", COMPLETED: "Đã học", CANCELLED: "Nghỉ" } as const;
export const ENROLLMENT_STATUS_LABEL = { ACTIVE: "Đang học", ON_HOLD: "Bảo lưu", TRANSFERRED: "Đã chuyển lớp", WITHDRAWN: "Nghỉ học", COMPLETED: "Hoàn thành" } as const;
export const WEEKDAY_OPTIONS = [
  { value: 1, label: "Thứ 2" },
  { value: 2, label: "Thứ 3" },
  { value: 3, label: "Thứ 4" },
  { value: 4, label: "Thứ 5" },
  { value: 5, label: "Thứ 6" },
  { value: 6, label: "Thứ 7" },
  { value: 7, label: "Chủ nhật" },
] as const;

export type SessionKind = keyof typeof SESSION_KIND_LABEL;
export type SessionStatus = keyof typeof SESSION_STATUS_LABEL;
export type EnrollmentStatus = keyof typeof ENROLLMENT_STATUS_LABEL;

export interface ScheduleConflict {
  date: string;
  startTime: string;
  endTime: string;
  type: "ROOM" | "TEACHER";
  withClass: string;
}

export interface ClassPreview {
  sessions: { number: number; date: string; startTime: string; endTime: string; plannedLesson: { number: number; titleVi: string } | null }[];
  expectedEndDate: string | null;
  conflicts: ScheduleConflict[];
  lessonsAvailable: number;
}

export interface SessionView {
  id: string;
  number: number | null;
  kind: SessionKind;
  status: SessionStatus;
  date: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  room: { id: string; name: string } | null;
  teacher: { id: string; displayName: string } | null;
  plannedLesson: { id: string; number: number; titleVi: string } | null;
  cancelReason: string | null;
  makeupForId: string | null;
}

export interface ClassSummary {
  id: string;
  name: string;
  status: "OPEN" | "COMPLETED" | "CANCELLED";
  phase: "UPCOMING" | "RUNNING" | "ENDED" | "CANCELLED";
  level: { code: string; nameVi: string };
  edition: { id: string; name: string };
  branch: { id: string; name: string; timezone: string };
  teacher: { id: string; displayName: string } | null;
  schedule: string;
  startDate: string;
  expectedEndDate: string | null;
  plannedSessions: number;
  activeStudents: number;
  nextSession: { date: string; startTime: string } | null;
}

export interface ClassDetail extends ClassSummary {
  defaultRoom: { id: string; name: string } | null;
  tuitionAmount: number | null;
  startLessonNumber: number;
  sessionsPerLesson: number;
  rules: { weekday: number; startTime: string; endTime: string }[];
  teachers: { teacher: { id: string; displayName: string }; validFrom: string; validTo: string | null }[];
  enrollments: {
    id: string;
    status: EnrollmentStatus;
    student: { id: string; displayName: string; phone: string | null };
    startDate: string;
    endDate: string | null;
    holdFrom: string | null;
    holdUntil: string | null;
    note: string | null;
  }[];
  sessions: SessionView[];
}

export interface CalendarSession extends SessionView {
  class: { id: string; name: string; levelCode: string };
  branch: { id: string; name: string; timezone: string };
}
