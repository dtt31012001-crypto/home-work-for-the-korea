import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "./password";

export const ROLES = ["SUPER_ADMIN", "CENTER_ADMIN", "TEACHER", "STUDENT"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Quản trị nền tảng",
  CENTER_ADMIN: "Quản trị trung tâm",
  TEACHER: "Giáo viên",
  STUDENT: "Học viên",
};

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const createOrganizationSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,32}$/, "Mã chỉ gồm chữ, số, - và _ (2–32 ký tự)"),
  name: z.string().trim().min(2).max(200),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

/** Trung tâm cấp tài khoản (D-B17). Phụ huynh chưa nằm trong danh sách: chờ D-B21. */
export const ISSUABLE_ROLES = ["CENTER_ADMIN", "TEACHER", "STUDENT"] as const;

export const issueAccountSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(32).optional(),
    email: z.string().trim().max(254).optional(),
    role: z.enum(ISSUABLE_ROLES),
  })
  .refine((v) => Boolean(v.phone) || Boolean(v.email), { message: "Cần số điện thoại hoặc email", path: ["phone"] });
export type IssueAccountInput = z.infer<typeof issueAccountSchema>;

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface MeResponse {
  user: { id: string; displayName: string };
  identities: { type: "PHONE" | "EMAIL"; masked: string }[];
  mustChangePassword: boolean;
  contexts: { role: Role; organization: { id: string; code: string; name: string } | null }[];
}

export interface IssueAccountResponse {
  userId: string;
  /** true nếu SĐT/email đã có tài khoản: chỉ gắn thêm vai trò, KHÔNG tạo mật khẩu mới */
  linkedExisting: boolean;
  /** Chỉ trả về một lần khi tạo tài khoản mới hoặc đặt lại mật khẩu */
  temporaryPassword?: string;
  temporaryPasswordExpiresAt?: string;
}
