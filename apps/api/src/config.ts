import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET phải dài ít nhất 32 ký tự"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  API_PORT: z.coerce.number().int().positive().default(4000),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | undefined;

/** Đọc và kiểm tra biến môi trường một lần; thiếu/sai → dừng khởi động với thông báo rõ. */
export function config(): AppConfig {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Cấu hình môi trường không hợp lệ: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Thông số nghiệp vụ D-B17 (đã duyệt). */
export const AUTH_POLICY = {
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlDays: 30,
  temporaryPasswordTtlDays: 7,
  maxFailedLogins: 5,
  lockoutMinutes: 15,
} as const;
