import { execSync } from "node:child_process";
import path from "node:path";

export default function globalSetup() {
  const owner = process.env.TEST_MIGRATION_DATABASE_URL ?? "postgresql://th:th_dev_only@localhost:5432/th_test";
  const app = process.env.TEST_DATABASE_URL ?? "postgresql://th_app:th_app_dev_only@localhost:5432/th_test";
  for (const u of [owner, app]) {
    if (!/\/th_test(\?|$)/.test(u)) throw new Error("Từ chối chạy test: database test phải tên là 'th_test'.");
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: owner } });
  const o = new URL(owner);
  const a = new URL(app);
  execSync(path.resolve(__dirname, "../../../deploy/db-init/01-app-role.sh"), {
    stdio: "inherit",
    env: {
      ...process.env,
      PGHOST: o.hostname,
      PGPORT: o.port || "5432",
      PGPASSWORD: decodeURIComponent(o.password),
      POSTGRES_USER: decodeURIComponent(o.username),
      POSTGRES_DB: o.pathname.slice(1),
      APP_DB_USER: decodeURIComponent(a.username),
      APP_DB_PASSWORD: decodeURIComponent(a.password),
    },
  });
}
