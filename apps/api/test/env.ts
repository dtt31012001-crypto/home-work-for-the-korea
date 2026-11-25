import { randomBytes } from "node:crypto";

// Biến môi trường cho test: luôn dùng database riêng th_test, không bao giờ dùng dữ liệu thật.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://th:th_dev_only@localhost:5432/th_test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.COOKIE_SECURE = "false";
