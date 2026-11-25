import type { INestApplication } from "@nestjs/common";
import { Client, DEFAULT_PASSWORD, createApp, loggedIn, prisma, resetDb, seedOrg, seedUser } from "./helpers";

let app: INestApplication;

beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

const PHONE = "+84912345678";

describe("Đăng nhập (D-B17)", () => {
  it("từ chối request thay đổi dữ liệu không có CSRF token", async () => {
    await seedUser({ phone: PHONE });
    const c = new Client(app);
    const res = await c.agent.post("/api/auth/login").set("x-forwarded-for", c.ip).send({ identifier: PHONE, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_INVALID");
  });

  it("đăng nhập bằng SĐT ở định dạng khác vẫn khớp; cookie httpOnly; /me trả về ngữ cảnh", async () => {
    const org = await seedOrg("HZ");
    await seedUser({ name: "Lan", phone: PHONE, roles: [{ role: "TEACHER", organizationId: org.id }] });
    const c = new Client(app);
    const res = await c.login("0912 345 678", DEFAULT_PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ mustChangePassword: false });
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    expect(cookies.find((x) => x.startsWith("th_at="))).toMatch(/HttpOnly/);
    expect(cookies.find((x) => x.startsWith("th_rt="))).toMatch(/Path=\/api\/auth; .*HttpOnly/);

    const me = await c.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.displayName).toBe("Lan");
    expect(me.body.identities).toEqual([{ type: "PHONE", masked: "+84•••••5678" }]);
    expect(me.body.contexts).toEqual([{ role: "TEACHER", organization: { id: org.id, code: "HZ", name: "Trung tâm HZ" } }]);
  });

  it("đăng nhập bằng email không phân biệt hoa thường", async () => {
    await seedUser({ email: "lan@example.com" });
    const res = await new Client(app).login(" LAN@Example.com ", DEFAULT_PASSWORD);
    expect(res.status).toBe(200);
  });

  it("sai mật khẩu và tài khoản không tồn tại trả cùng một thông báo", async () => {
    await seedUser({ phone: PHONE });
    const wrong = await new Client(app).login(PHONE, "sai-mat-khau-123");
    const unknown = await new Client(app).login("0987654321", "sai-mat-khau-123");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("khóa tạm 15 phút sau 5 lần sai, kể cả khi sau đó nhập đúng", async () => {
    const user = await seedUser({ phone: PHONE });
    const c = new Client(app);
    for (let i = 0; i < 4; i++) expect((await c.login(PHONE, "sai-mat-khau-123")).status).toBe(401);
    expect((await c.login(PHONE, "sai-mat-khau-123")).body.error.code).toBe("TOO_MANY_ATTEMPTS");
    const blocked = await c.login(PHONE, DEFAULT_PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("TOO_MANY_ATTEMPTS");

    await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await c.login(PHONE, DEFAULT_PASSWORD)).status).toBe(200);
  });

  it("giới hạn tần suất đăng nhập theo IP", async () => {
    const c = new Client(app);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await c.login(`09${String(10000000 + i)}`, "x-y-z-1234")).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe("Mật khẩu tạm và đổi mật khẩu", () => {
  it("bắt buộc đổi mật khẩu tạm trước khi dùng chức năng khác", async () => {
    await seedUser({ phone: PHONE, password: "tam-abcde23", mustChange: true, tempExpiresAt: new Date(Date.now() + 86_400_000), roles: [{ role: "SUPER_ADMIN" }] });
    const c = new Client(app);
    const login = await c.login(PHONE, "tam-abcde23");
    expect(login.body).toEqual({ mustChangePassword: true });

    expect((await c.get("/api/auth/me")).body.mustChangePassword).toBe(true);
    const blocked = await c.get("/api/admin/organizations");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const weak = await c.post("/api/auth/password", { currentPassword: "tam-abcde23", newPassword: "12345678" });
    expect(weak.body.error.code).toBe("PASSWORD_TOO_COMMON");
    const withPhone = await c.post("/api/auth/password", { currentPassword: "tam-abcde23", newPassword: "lan0912345678" });
    expect(withPhone.body.error.code).toBe("PASSWORD_CONTAINS_PHONE");

    const ok = await c.post("/api/auth/password", { currentPassword: "tam-abcde23", newPassword: "hoa-mai-no-ro" });
    expect(ok.status).toBe(200);
    expect((await c.get("/api/auth/me")).body.mustChangePassword).toBe(false);
    expect((await c.get("/api/admin/organizations")).status).toBe(200);

    expect((await new Client(app).login(PHONE, "tam-abcde23")).status).toBe(401);
    expect((await new Client(app).login(PHONE, "hoa-mai-no-ro")).status).toBe(200);
  });

  it("mật khẩu tạm quá 7 ngày không đăng nhập được", async () => {
    await seedUser({ phone: PHONE, password: "tam-abcde23", mustChange: true, tempExpiresAt: new Date(Date.now() - 1000) });
    const res = await new Client(app).login(PHONE, "tam-abcde23");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TEMP_PASSWORD_EXPIRED");
  });

  it("sai mật khẩu hiện tại thì không đổi được", async () => {
    const { client } = await loggedIn(app, { phone: PHONE });
    const res = await client.post("/api/auth/password", { currentPassword: "khong-dung-1", newPassword: "hoa-mai-no-ro" });
    expect(res.body.error.code).toBe("WRONG_CURRENT_PASSWORD");
  });

  it("đổi mật khẩu đăng xuất mọi thiết bị khác", async () => {
    const { client: a } = await loggedIn(app, { phone: PHONE });
    const b = new Client(app);
    await b.login(PHONE, DEFAULT_PASSWORD);
    expect((await b.get("/api/auth/me")).status).toBe(200);

    expect((await a.post("/api/auth/password", { currentPassword: DEFAULT_PASSWORD, newPassword: "hoa-mai-no-ro" })).status).toBe(200);
    expect((await a.get("/api/auth/me")).status).toBe(200);
    expect((await b.get("/api/auth/me")).status).toBe(401);
    expect((await b.post("/api/auth/refresh")).status).toBe(401);
  });
});

describe("Phiên đăng nhập", () => {
  it("refresh xoay vòng token trong cùng chuỗi phiên", async () => {
    const { client, user } = await loggedIn(app, { phone: PHONE });
    expect((await client.post("/api/auth/refresh")).status).toBe(200);
    expect((await client.get("/api/auth/me")).status).toBe(200);
    const sessions = await prisma.session.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    expect(sessions).toHaveLength(2);
    expect(sessions[0]!.revokedReason).toBe("ROTATED");
    expect(sessions[0]!.replacedById).toBe(sessions[1]!.id);
    expect(sessions[0]!.familyId).toBe(sessions[1]!.familyId);
    expect(sessions[1]!.revokedAt).toBeNull();
  });

  it("phát hiện dùng lại refresh token đã xoay → thu hồi phiên hiện tại", async () => {
    const user = await seedUser({ phone: PHONE });
    const victim = new Client(app);
    const login = await victim.login(PHONE, DEFAULT_PASSWORD);
    const stolen = ([] as string[]).concat(login.headers["set-cookie"] ?? []).find((x) => x.startsWith("th_rt="))!.split(";")[0]!;

    expect((await victim.post("/api/auth/refresh")).status).toBe(200);
    await prisma.session.updateMany({ where: { userId: user.id, revokedReason: "ROTATED" }, data: { revokedAt: new Date(Date.now() - 60_000) } });

    const attacker = new Client(app);
    const res = await attacker.agent
      .post("/api/auth/refresh")
      .set("x-forwarded-for", attacker.ip)
      .set("cookie", `${stolen}; th_csrf=${"a".repeat(43)}`)
      .set("x-csrf-token", "a".repeat(43));
    expect(res.status).toBe(401);
    expect((await victim.get("/api/auth/me")).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: "auth.refresh.reuse_detected" } })).toBe(1);
  });

  it("đăng xuất thu hồi phiên", async () => {
    const { client } = await loggedIn(app, { phone: PHONE });
    expect((await client.post("/api/auth/logout")).status).toBe(204);
    expect((await client.get("/api/auth/me")).status).toBe(401);
    expect((await client.post("/api/auth/refresh")).status).toBe(401);
  });

  it("khóa tài khoản có hiệu lực ngay với phiên đang mở", async () => {
    const { client, user } = await loggedIn(app, { phone: PHONE });
    await prisma.user.update({ where: { id: user.id }, data: { status: "LOCKED", tokenVersion: { increment: 1 } } });
    expect((await client.get("/api/auth/me")).status).toBe(401);
    const res = await new Client(app).login(PHONE, DEFAULT_PASSWORD);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_LOCKED");
  });
});

describe("Nhật ký hệ thống", () => {
  it("ghi đăng nhập thành công/thất bại và không cho sửa/xóa", async () => {
    await seedUser({ phone: PHONE });
    await new Client(app).login(PHONE, "sai-mat-khau-123");
    await new Client(app).login(PHONE, DEFAULT_PASSWORD);
    const actions = (await prisma.auditLog.findMany({ orderBy: { at: "asc" } })).map((a) => a.action);
    expect(actions).toEqual(["auth.login.failed", "auth.login.succeeded"]);
    const json = JSON.stringify(await prisma.auditLog.findMany());
    expect(json).not.toContain(DEFAULT_PASSWORD);
    expect(json).not.toContain("912345678");
    await expect(prisma.auditLog.deleteMany()).rejects.toThrow(/append-only/);
  });
});
