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

const H = 3_600_000;
const D = 24 * H;
const latest = (userId: string) => prisma.session.findFirstOrThrow({ where: { userId, revokedAt: null }, orderBy: { createdAt: "desc" } });
const near = (actual: Date, expectedMs: number) => Math.abs(actual.getTime() - Date.now() - expectedMs) < 60_000;

describe("Chính sách phiên theo vai trò", () => {
  it("quản trị trung tâm: hết hạn sau 2 giờ không dùng, tối đa 12 giờ", async () => {
    const org = await seedOrg("HZ");
    const { user } = await loggedIn(app, { phone: "+84900000001", roles: [{ role: "CENTER_ADMIN", organizationId: org.id }] });
    const s = await latest(user.id);
    expect(s.policy).toBe("ADMIN");
    expect(near(s.expiresAt, 2 * H)).toBe(true);
    expect(near(s.familyExpiresAt, 12 * H)).toBe(true);
  });

  it("giáo viên: 7 ngày / 30 ngày; học viên và phụ huynh: 30 ngày / 90 ngày", async () => {
    const org = await seedOrg("HZ");
    const t = await loggedIn(app, { phone: "+84900000002", roles: [{ role: "TEACHER", organizationId: org.id }] });
    const st = await latest(t.user.id);
    expect(st.policy).toBe("TEACHER");
    expect(near(st.expiresAt, 7 * D)).toBe(true);

    const p = await loggedIn(app, { phone: "+84900000003", roles: [{ role: "PARENT", organizationId: org.id }] });
    const sp = await latest(p.user.id);
    expect(sp.policy).toBe("LEARNER");
    expect(near(sp.expiresAt, 30 * D)).toBe(true);
    expect(near(sp.familyExpiresAt, 90 * D)).toBe(true);
  });

  it("được gán quyền quản trị khi đang đăng nhập → lần làm mới sau áp chính sách chặt hơn", async () => {
    const org = await seedOrg("HZ");
    const { client, user } = await loggedIn(app, { phone: "+84900000004", roles: [{ role: "STUDENT", organizationId: org.id }] });
    expect((await latest(user.id)).policy).toBe("LEARNER");
    await prisma.roleAssignment.create({ data: { userId: user.id, role: "CENTER_ADMIN", organizationId: org.id } });
    expect((await client.post("/api/auth/refresh")).status).toBe(200);
    const s = await latest(user.id);
    expect(s.policy).toBe("ADMIN");
    expect(near(s.familyExpiresAt, 12 * H)).toBe(true);
  });

  it("quá thời hạn tối đa của chuỗi phiên → phải đăng nhập lại", async () => {
    const { client, user } = await loggedIn(app, { phone: "+84900000005" });
    await prisma.session.updateMany({ where: { userId: user.id }, data: { familyStartedAt: new Date(Date.now() - 91 * D), familyExpiresAt: new Date(Date.now() - 1000) } });
    const res = await client.post("/api/auth/refresh");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("SESSION_EXPIRED");
  });

  it("thời hạn tối đa không bị kéo dài qua nhiều lần làm mới", async () => {
    const { client, user } = await loggedIn(app, { phone: "+84900000006" });
    const first = await latest(user.id);
    await client.post("/api/auth/refresh");
    await client.post("/api/auth/refresh");
    const last = await latest(user.id);
    expect(last.familyExpiresAt.getTime()).toBe(first.familyExpiresAt.getTime());
  });
});

describe("Làm mới token đồng thời", () => {
  it("hai request làm mới cùng lúc: một thành công, một báo SESSION_ROTATED; phiên KHÔNG bị thu hồi", async () => {
    const { client, user } = await loggedIn(app, { phone: "+84900000007" });
    await client.get("/api/auth/csrf");
    const [a, b] = await Promise.all([client.post("/api/auth/refresh"), client.post("/api/auth/refresh")]);
    const statuses = [a.status, b.status].sort();
    expect(statuses[0]).toBe(200);
    expect([200, 409]).toContain(statuses[1]);
    const loser = [a, b].find((r) => r.status === 409);
    if (loser) expect(loser.body.error.code).toBe("SESSION_ROTATED");
    expect((await client.get("/api/auth/me")).status).toBe(200);
    expect(await prisma.session.count({ where: { userId: user.id, revokedReason: "REUSE_DETECTED" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "auth.refresh.reuse_detected" } })).toBe(0);
  });

  it("tab thứ hai dùng token vừa xoay trong thời gian ân hạn → 409 SESSION_ROTATED, không thu hồi", async () => {
    const user = await seedUser({ phone: "+84900000008" });
    const victim = new Client(app);
    const login = await victim.login("+84900000008", DEFAULT_PASSWORD);
    const old = ([] as string[]).concat(login.headers["set-cookie"] ?? []).find((x) => x.startsWith("th_rt="))!.split(";")[0]!;
    expect((await victim.post("/api/auth/refresh")).status).toBe(200);
    const otherTab = new Client(app);
    const res = await otherTab.agent
      .post("/api/auth/refresh")
      .set("x-forwarded-for", otherTab.ip)
      .set("cookie", `${old}; th_csrf=${"b".repeat(43)}`)
      .set("x-csrf-token", "b".repeat(43));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SESSION_ROTATED");
    expect(await prisma.session.count({ where: { userId: user.id, revokedReason: "REUSE_DETECTED" } })).toBe(0);
  });
});
