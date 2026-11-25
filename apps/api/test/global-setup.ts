import { execSync } from "node:child_process";

export default function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://th:th_dev_only@localhost:5432/th_test";
  if (!/th_test/.test(url)) throw new Error("Từ chối chạy test: DATABASE test phải có tên chứa 'th_test'.");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
