// Chạy migration bằng role CHỦ SỞ HỮU (MIGRATION_DATABASE_URL), không dùng role ứng dụng.
import { spawnSync } from "node:child_process";
try {
  process.loadEnvFile?.();
} catch {
  /* production: biến môi trường do máy chủ cung cấp */
}
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("Thiếu MIGRATION_DATABASE_URL (role chủ sở hữu database).");
  process.exit(1);
}
const cmd = process.argv[2] === "dev" ? ["migrate", "dev"] : ["migrate", "deploy"];
const r = spawnSync("npx", ["prisma", ...cmd], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
process.exit(r.status ?? 1);
