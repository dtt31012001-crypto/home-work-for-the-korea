import { z } from "zod";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const limit = z.number().int().min(0).max(1_000_000).nullable().optional();

/** Super Admin chỉnh trung tâm: trạng thái và giới hạn tài khoản (D-B10). */
export const adminUpdateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  maxStudents: limit,
  maxTeachers: limit,
});
export type AdminUpdateOrganizationInput = z.infer<typeof adminUpdateOrganizationSchema>;

/** Trung tâm tự chỉnh thông tin và cấu hình vận hành (D-B19). */
export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  contactPhone: optionalText(32),
  contactEmail: optionalText(254),
  address: optionalText(300),
  attendanceEditHours: z.number().int().min(0).max(720).optional(),
  behindThresholdLessons: z.number().int().min(1).max(50).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const branchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: optionalText(300),
  timezone: z.string().refine(isValidTimeZone, "Múi giờ không hợp lệ").default("Asia/Ho_Chi_Minh"),
});
export type BranchInput = z.infer<typeof branchSchema>;

export const updateBranchSchema = branchSchema.partial().extend({ status: z.enum(["ACTIVE", "ARCHIVED"]).optional() });
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export const roomSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  capacity: z.number().int().min(1).max(1000).nullable().optional(),
});
export type RoomInput = z.infer<typeof roomSchema>;

export const updateRoomSchema = roomSchema.omit({ branchId: true }).partial().extend({ status: z.enum(["ACTIVE", "ARCHIVED"]).optional() });
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export const TIMEZONE_OPTIONS = [
  { value: "Asia/Ho_Chi_Minh", label: "Việt Nam (GMT+7)" },
  { value: "Asia/Seoul", label: "Hàn Quốc (GMT+9)" },
] as const;

export interface OrganizationDetail {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  maxStudents: number | null;
  maxTeachers: number | null;
  attendanceEditHours: number;
  behindThresholdLessons: number;
  counts: { students: number; teachers: number; parents: number };
  branches: {
    id: string;
    name: string;
    address: string | null;
    timezone: string;
    status: "ACTIVE" | "ARCHIVED";
    rooms: { id: string; name: string; capacity: number | null; status: "ACTIVE" | "ARCHIVED" }[];
  }[];
}
