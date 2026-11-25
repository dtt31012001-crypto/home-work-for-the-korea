import { z } from "zod";
import type { Role } from "./schemas";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ (YYYY-MM-DD)");

/** Tuổi tròn tại ngày `today` (YYYY-MM-DD). */
export function ageOn(dateOfBirth: string, today: string): number {
  const [by, bm, bd] = dateOfBirth.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = today.split("-").map(Number) as [number, number, number];
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

export const ADULT_AGE = 18;

/** Ngày hiện tại theo giờ Việt Nam (YYYY-MM-DD). */
export function todayVN(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Không có ngày sinh → coi như đã thành niên (an toàn: cần học viên đồng ý). */
export function isMinor(dateOfBirth: string | null | undefined, today = todayVN()): boolean {
  return Boolean(dateOfBirth) && ageOn(dateOfBirth!, today) < ADULT_AGE;
}

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  dateOfBirth: isoDate.nullable().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const addGuardianSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(32).optional(),
    email: z.string().trim().max(254).optional(),
    relationship: z.string().trim().min(1).max(60),
    /** Bắt buộc khi học viên chưa thành niên: trung tâm ghi cách đã xác minh người giám hộ */
    verificationNote: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => v || undefined),
  })
  .refine((v) => Boolean(v.phone) || Boolean(v.email), { message: "Cần số điện thoại hoặc email", path: ["phone"] });
export type AddGuardianInput = z.infer<typeof addGuardianSchema>;

export const revokeLinkSchema = z.object({ reason: z.string().trim().max(300).optional() });
export const consentSchema = z.object({ accept: z.boolean() });

export const LINK_STATUS_LABEL = {
  PENDING_CONSENT: "Chờ học viên đồng ý",
  ACTIVE: "Đang liên kết",
  PAUSED_ADULT: "Tạm dừng – học viên đã đủ 18 tuổi, chờ đồng ý",
  REJECTED: "Học viên từ chối",
  REVOKED: "Đã thu hồi",
} as const;
export type LinkDisplayStatus = keyof typeof LINK_STATUS_LABEL;

export interface GuardianLinkView {
  id: string;
  organizationId: string;
  relationship: string;
  status: LinkDisplayStatus;
  /** true khi phụ huynh thực sự được xem dữ liệu */
  effective: boolean;
  guardian: { id: string; displayName: string; identities: { type: "PHONE" | "EMAIL"; value: string }[] };
  student: { id: string; displayName: string };
  verificationNote: string | null;
  createdAt: string;
}

export interface PersonRow {
  id: string;
  displayName: string;
  dateOfBirth: string | null;
  status: "ACTIVE" | "LOCKED" | "DEACTIVATED";
  roles: Role[];
  identities: { type: "PHONE" | "EMAIL"; value: string }[];
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: string | null;
  /** Có vai trò ở trung tâm khác → một số thao tác cần quản trị nền tảng */
  otherCenters: boolean;
}

export interface StudentDetail extends PersonRow {
  guardians: GuardianLinkView[];
}

export interface ConsentRequest {
  id: string;
  organization: { id: string; name: string };
  guardian: { displayName: string };
  relationship: string;
  status: LinkDisplayStatus;
}
