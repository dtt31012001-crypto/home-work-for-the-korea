// Khởi động trên Render (staging, dữ liệu thử):
// 1. Migration bằng role CHỦ (MIGRATION_DATABASE_URL – chuỗi kết nối Neon, không qua pooler).
// 2. Tạo/cập nhật role ứng dụng (mặc định th_app): không superuser, không BYPASSRLS → RLS luôn áp dụng.
// 3. (Tùy chọn) tạo Quản trị nền tảng đầu tiên nếu có BOOTSTRAP_SUPER_ADMIN_EMAIL.
// 4. Chạy API (127.0.0.1:4000) bằng role ứng dụng – KHÔNG nhận chuỗi kết nối của role chủ – và Web ($PORT).
import { spawn, spawnSync } from "node:child_process";
import { setTimeout } from "node:timers";
import { URL } from "node:url";

const env = process.env;
const fail = (msg) => {
  console.error(`[khởi động] ${msg}`);
  process.exit(1);
};
const ownerUrl = env.MIGRATION_DATABASE_URL;
const appUser = env.APP_DB_USER || "th_app";
const appPassword = env.APP_DB_PASSWORD;
if (!ownerUrl) fail("Thiếu MIGRATION_DATABASE_URL (chuỗi kết nối Neon của role chủ).");
if (!appPassword || appPassword.length < 16) fail("Thiếu APP_DB_PASSWORD (ít nhất 16 ký tự).");
if (!/^[a-z_][a-z0-9_]*$/.test(appUser)) fail("APP_DB_USER chỉ gồm chữ thường, số, gạch dưới.");

const prisma = (args, input) => {
  const r = spawnSync("npx", ["prisma", ...args], { cwd: "/app/api", input, stdio: [input ? "pipe" : "inherit", "inherit", "inherit"], env: { ...env, DATABASE_URL: ownerUrl } });
  if (r.status !== 0) fail(`prisma ${args[0]} ${args[1] ?? ""} thất bại.`);
};

console.log("[khởi động] Chạy migration…");
prisma(["migrate", "deploy", "--schema", "prisma/schema.prisma"]);

const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;
const grantSql = `DO $th_grant$
DECLARE
  app text := ${lit(appUser)};
  owner_role text := current_user;
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app) THEN
    EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', app, ${lit(appPassword)});
  ELSE
    EXECUTE format('ALTER ROLE %I WITH LOGIN PASSWORD %L', app, ${lit(appPassword)});
  END IF;
  SELECT rolsuper, rolbypassrls, rolcreaterole INTO r FROM pg_roles WHERE rolname = app;
  IF r.rolsuper OR r.rolbypassrls OR r.rolcreaterole THEN
    RAISE EXCEPTION 'Role % có quyền vượt RLS – dừng triển khai', app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles u ON u.oid = m.member WHERE u.rolname = app) THEN
    RAISE EXCEPTION 'Role % đang là thành viên role khác (vd. neon_superuser) – hãy tạo bằng SQL, không tạo trên giao diện Neon', app;
  END IF;
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), app);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', app);
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', app);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', owner_role, app);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', owner_role, app);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE audit_log FROM %I', app);
  EXECUTE format('REVOKE ALL ON TABLE _prisma_migrations FROM %I', app);
END
$th_grant$;`;
console.log(`[khởi động] Cấp quyền cho role ứng dụng ${appUser}…`);
prisma(["db", "execute", "--stdin", "--schema", "prisma/schema.prisma"], grantSql);

const appUrl = new URL(ownerUrl);
appUrl.username = appUser;
appUrl.password = encodeURIComponent(appPassword);
const childEnv = { ...env, DATABASE_URL: appUrl.toString() };
delete childEnv.MIGRATION_DATABASE_URL;
delete childEnv.APP_DB_PASSWORD;

if (env.BOOTSTRAP_SUPER_ADMIN_EMAIL) {
  console.log("[khởi động] Kiểm tra Quản trị nền tảng đầu tiên…");
  const r = spawnSync(
    "node",
    ["dist/cli/bootstrap-super-admin.js", "--email", env.BOOTSTRAP_SUPER_ADMIN_EMAIL, "--name", env.BOOTSTRAP_SUPER_ADMIN_NAME || "Quản trị nền tảng"],
    { cwd: "/app/api", stdio: "inherit", env: childEnv },
  );
  if (r.status !== 0) fail("Không tạo được Quản trị nền tảng.");
}

const children = [
  spawn("node", ["dist/main.js"], { cwd: "/app/api", stdio: "inherit", env: { ...childEnv, API_PORT: "4000" } }),
  spawn("node", ["apps/web/server.js"], { cwd: "/app/web", stdio: "inherit", env: { ...childEnv, HOSTNAME: "0.0.0.0", PORT: env.PORT || "10000" } }),
];
let stopping = false;
const stop = (code) => {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 5000).unref();
};
for (const c of children) c.on("exit", (code) => stop(code ?? 1));
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => stop(0));
