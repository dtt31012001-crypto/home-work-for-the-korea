import { randomBytes } from "node:crypto";

// Test luôn dùng database riêng th_test, không bao giờ dùng dữ liệu thật.
// Ứng dụng kết nối bằng role th_app (RLS áp dụng); role chủ chỉ dùng để migrate và tạo dữ liệu thử.
export const TEST_APP_URL = process.env.TEST_DATABASE_URL ?? "postgresql://th_app:th_app_dev_only@localhost:5432/th_test";
export const TEST_OWNER_URL = process.env.TEST_MIGRATION_DATABASE_URL ?? "postgresql://th:th_dev_only@localhost:5432/th_test";

process.env.DATABASE_URL = TEST_APP_URL;
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.COOKIE_SECURE = "false";
