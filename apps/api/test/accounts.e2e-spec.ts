import type { INestApplication } from "@nestjs/common";
import { Client, createApp, loggedIn, prisma, resetDb, seedOrg, seedUser } from "./helpers";

let app: INestApplication;

beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

async function setup() {
  const orgA = await seedOrg("HZ", "Horizon");
  const orgB = await seedOrg("OTHER", "Trung tâm khác");
  const sa = await loggedIn(app, { name: "Quản trị nền tảng", phone: "+84900000001", roles: [{ role: "SUPER_ADMIN" }] });
  const ca = await loggedIn(app, { name: "Admin Horizon", phone: "+84900000002", roles: [{ role: "CENTER_ADMIN", organizationId: orgA.id }] });
  return { orgA, orgB, sa: sa.client, ca: ca.client, caUser: ca.user };
}

const accounts = (orgId: string) => `/api/organizations/${orgId}/accounts`;

describe("Trung tâm (Super Admin)", () => {
  it("Super Admin tạo và xem trung tâm; Center Admin không truy cập được", async () => {
    const { sa, ca } = await setup();
    const created = await sa.post("/api/admin/organizations", { code: "hz-2", name: "Horizon cơ sở 2" });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe("HZ-2");
    expect((await sa.post("/api/admin/organizations", { code: "HZ-2", name: "Trùng" })).body.error.code).toBe("ORGANIZATION_CODE_TAKEN");
    expect((await sa.get("/api/admin/organizations")).body).toHaveLength(3);
    expect((await ca.get("/api/admin/organizations")).status).toBe(404);
    expect((await ca.post("/api/admin/organizations", { code: "X1", name: "X" })).status).toBe(404);
  });
});

describe("Cấp tài khoản bằng mật khẩu tạm (D-B17)", () => {
  it("Center Admin cấp tài khoản học viên; mật khẩu tạm hiển thị một lần, bắt buộc đổi, hết hạn sau 7 ngày", async () => {
    const { orgA, ca } = await setup();
    const res = await ca.post(accounts(orgA.id), { displayName: "Nguyễn Văn An", phone: "0911 111 111", role: "STUDENT" });
    expect(res.status).toBe(201);
    expect(res.body.linkedExisting).toBe(false);
    expect(res.body.temporaryPassword).toMatch(/^[a-z2-9]{10}$/);
    const days = (new Date(res.body.temporaryPasswordExpiresAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    const list = await ca.get(accounts(orgA.id));
    const an = list.body.find((u: { displayName: string }) => u.displayName === "Nguyễn Văn An");
    expect(an).toMatchObject({ roles: ["STUDENT"], mustChangePassword: true, identities: [{ type: "PHONE", value: "+84911111111" }] });
    expect(JSON.stringify(list.body)).not.toContain(res.body.temporaryPassword);

    const student = new Client(app);
    const login = await student.login("0911111111", res.body.temporaryPassword);
    expect(login.body).toEqual({ mustChangePassword: true });
    expect((await student.post("/api/auth/password", { currentPassword: res.body.temporaryPassword, newPassword: "kim-chi-ngon-lam" })).status).toBe(200);
    const me = await student.get("/api/auth/me");
    expect(me.body.contexts).toEqual([{ role: "STUDENT", organization: { id: orgA.id, code: "HZ", name: "Horizon" } }]);
  });

  it("chỉ Super Admin được cấp tài khoản Quản trị trung tâm", async () => {
    const { orgA, sa, ca } = await setup();
    const denied = await ca.post(accounts(orgA.id), { displayName: "Admin 2", email: "admin2@example.com", role: "CENTER_ADMIN" });
    expect(denied.status).toBe(403);
    const ok = await sa.post(accounts(orgA.id), { displayName: "Admin 2", email: "admin2@example.com", role: "CENTER_ADMIN" });
    expect(ok.status).toBe(201);
  });

  it("SĐT đã có tài khoản → gắn thêm vai trò vào tài khoản sẵn có, không tạo trùng, không cấp mật khẩu mới", async () => {
    const { orgA, orgB, ca: caA } = await setup();
    const teacher = await seedUser({ name: "Cô Mai", phone: "+84922222222", roles: [{ role: "TEACHER", organizationId: orgB.id }] });
    const res = await caA.post(accounts(orgA.id), { displayName: "Mai", phone: "0922222222", role: "TEACHER" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ userId: teacher.id, linkedExisting: true });
    expect(await prisma.user.count({ where: { identities: { some: { value: "+84922222222" } } } })).toBe(1);

    const again = await caA.post(accounts(orgA.id), { displayName: "Mai", phone: "0922222222", role: "TEACHER" });
    expect(again.body.error.code).toBe("ALREADY_HAS_ROLE");
  });

  it("SĐT và email thuộc hai tài khoản khác nhau → báo xung đột", async () => {
    const { orgA, ca } = await setup();
    await seedUser({ phone: "+84933333333" });
    await seedUser({ email: "b@example.com" });
    const res = await ca.post(accounts(orgA.id), { displayName: "X", phone: "0933333333", email: "b@example.com", role: "STUDENT" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("IDENTIFIER_CONFLICT");
  });

  it("kiểm tra dữ liệu đầu vào", async () => {
    const { orgA, ca } = await setup();
    expect((await ca.post(accounts(orgA.id), { displayName: "X", phone: "0212345678", role: "STUDENT" })).body.error.code).toBe("INVALID_PHONE");
    expect((await ca.post(accounts(orgA.id), { displayName: "X", role: "STUDENT" })).body.error.code).toBe("VALIDATION_ERROR");
    expect((await ca.post(accounts(orgA.id), { displayName: "X", phone: "0911111111", role: "SUPER_ADMIN" })).body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Cách ly giữa các trung tâm", () => {
  it("Center Admin không xem/cấp/đặt lại/khóa tài khoản của trung tâm khác (404)", async () => {
    const { orgB, ca } = await setup();
    const other = await seedUser({ phone: "+84944444444", roles: [{ role: "STUDENT", organizationId: orgB.id }] });
    expect((await ca.get(accounts(orgB.id))).status).toBe(404);
    expect((await ca.post(accounts(orgB.id), { displayName: "X", phone: "0955555555", role: "STUDENT" })).status).toBe(404);
    // Dữ liệu sai cũng nhận 404 (kiểm tra quyền trước kiểm tra dữ liệu)
    expect((await ca.post(accounts(orgB.id), { bad: true })).status).toBe(404);
    expect((await ca.post(`${accounts(orgB.id)}/${other.id}/reset-password`)).status).toBe(404);
    expect((await ca.post(`${accounts(orgB.id)}/${other.id}/lock`)).status).toBe(404);
    expect((await ca.get("/api/organizations/00000000-0000-0000-0000-000000000000/accounts")).status).toBe(404);
    expect((await ca.get("/api/organizations/not-a-uuid/accounts")).status).toBe(404);
  });

  it("dùng ID người của trung tâm khác trên URL trung tâm mình → 404", async () => {
    const { orgA, orgB, ca } = await setup();
    const other = await seedUser({ phone: "+84944444444", roles: [{ role: "STUDENT", organizationId: orgB.id }] });
    expect((await ca.post(`${accounts(orgA.id)}/${other.id}/reset-password`)).status).toBe(404);
  });

  it("trung tâm bị tạm ngưng: Center Admin mất quyền quản lý và mất ngữ cảnh", async () => {
    const { orgA, ca } = await setup();
    await prisma.organization.update({ where: { id: orgA.id }, data: { status: "SUSPENDED" } });
    expect((await ca.get(accounts(orgA.id))).status).toBe(404);
    expect((await ca.get("/api/auth/me")).body.contexts).toEqual([]);
  });
});

describe("Đặt lại mật khẩu và khóa tài khoản", () => {
  it("đặt lại mật khẩu: phiên cũ bị đăng xuất, mật khẩu tạm mới bắt buộc đổi", async () => {
    const { orgA, ca } = await setup();
    const { client: student, user } = await loggedIn(app, { phone: "+84966666666", roles: [{ role: "STUDENT", organizationId: orgA.id }] });
    const res = await ca.post(`${accounts(orgA.id)}/${user.id}/reset-password`);
    expect(res.status).toBe(200);
    expect(res.body.temporaryPassword).toMatch(/^[a-z2-9]{10}$/);
    expect((await student.get("/api/auth/me")).status).toBe(401);
    expect((await new Client(app).login("0966666666", res.body.temporaryPassword)).body).toEqual({ mustChangePassword: true });
  });

  it("người thuộc nhiều trung tâm: Center Admin không đặt lại được, Super Admin thì được", async () => {
    const { orgA, orgB, sa, ca } = await setup();
    const t = await seedUser({ phone: "+84977777777", roles: [{ role: "TEACHER", organizationId: orgA.id }, { role: "TEACHER", organizationId: orgB.id }] });
    const denied = await ca.post(`${accounts(orgA.id)}/${t.id}/reset-password`);
    expect(denied.status).toBe(403);
    expect((await sa.post(`${accounts(orgA.id)}/${t.id}/reset-password`)).status).toBe(200);
  });

  it("khóa học viên có hiệu lực ngay; mở khóa thì đăng nhập lại được; không tự khóa, không khóa quản trị khác", async () => {
    const { orgA, sa, ca, caUser } = await setup();
    const { client: student, user } = await loggedIn(app, { phone: "+84988888888", roles: [{ role: "STUDENT", organizationId: orgA.id }] });
    expect((await ca.post(`${accounts(orgA.id)}/${user.id}/lock`)).status).toBe(200);
    expect((await student.get("/api/auth/me")).status).toBe(401);
    expect((await new Client(app).login("0988888888", "song-han-mua-thu-2026")).body.error.code).toBe("ACCOUNT_LOCKED");
    expect((await ca.post(`${accounts(orgA.id)}/${user.id}/unlock`)).status).toBe(200);
    expect((await new Client(app).login("0988888888", "song-han-mua-thu-2026")).status).toBe(200);

    expect((await ca.post(`${accounts(orgA.id)}/${caUser.id}/lock`)).status).toBe(403);
    const ca2 = await seedUser({ phone: "+84999999999", roles: [{ role: "CENTER_ADMIN", organizationId: orgA.id }] });
    expect((await ca.post(`${accounts(orgA.id)}/${ca2.id}/lock`)).status).toBe(403);
    expect((await sa.post(`${accounts(orgA.id)}/${ca2.id}/lock`)).status).toBe(200);

    const actions = (await prisma.auditLog.findMany({ where: { organizationId: orgA.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["account.locked", "account.unlocked"]));
  });
});
