import type { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { TEST_APP_URL } from "./env";
import { Client, createApp, loggedIn, prisma, resetDb, seedOrg, seedUser } from "./helpers";

let app: INestApplication;
/** Kết nối bằng role ỨNG DỤNG để kiểm tra Row-Level Security ở tầng database. */
const appDb = new PrismaClient({ datasources: { db: { url: TEST_APP_URL } } });

beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await appDb.$disconnect();
});
beforeEach(resetDb);

async function setup() {
  const orgA = await seedOrg("HZ", "Horizon");
  const orgB = await seedOrg("OTHER", "Trung tâm khác");
  const sa = await loggedIn(app, { phone: "+84900000001", roles: [{ role: "SUPER_ADMIN" }] });
  const caA = await loggedIn(app, { phone: "+84900000002", roles: [{ role: "CENTER_ADMIN", organizationId: orgA.id }] });
  const caB = await loggedIn(app, { phone: "+84900000003", roles: [{ role: "CENTER_ADMIN", organizationId: orgB.id }] });
  return { orgA, orgB, sa: sa.client, caA: caA.client, caB: caB.client };
}

describe("Thông tin và cấu hình trung tâm", () => {
  it("Center Admin cập nhật thông tin và cấu hình vận hành; không sửa được giới hạn/trạng thái", async () => {
    const { orgA, caA } = await setup();
    const patch = await caA.agent
      .patch(`/api/organizations/${orgA.id}`)
      .set("x-forwarded-for", caA.ip)
      .set("x-csrf-token", (await caA.get("/api/auth/csrf")).body.csrfToken)
      .send({ contactPhone: "028 1234 5678", attendanceEditHours: 24, behindThresholdLessons: 2 });
    expect(patch.status).toBe(204);
    const d = await caA.get(`/api/organizations/${orgA.id}`);
    expect(d.body).toMatchObject({ contactPhone: "028 1234 5678", attendanceEditHours: 24, behindThresholdLessons: 2, maxStudents: null });

    const bad = await caA.agent
      .patch(`/api/organizations/${orgA.id}`)
      .set("x-forwarded-for", caA.ip)
      .set("x-csrf-token", (await caA.get("/api/auth/csrf")).body.csrfToken)
      .send({ attendanceEditHours: 10_000 });
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");

    const adminPatch = await caA.agent
      .patch(`/api/admin/organizations/${orgA.id}`)
      .set("x-forwarded-for", caA.ip)
      .set("x-csrf-token", (await caA.get("/api/auth/csrf")).body.csrfToken)
      .send({ maxStudents: 9999 });
    expect(adminPatch.status).toBe(404);
  });

  it("Super Admin tạm ngưng trung tâm và đặt giới hạn tài khoản; vượt giới hạn chặn tạo mới nhưng người cũ vẫn dùng được", async () => {
    const { orgA, sa, caA } = await setup();
    const csrf = (await sa.get("/api/auth/csrf")).body.csrfToken;
    expect(
      (await sa.agent.patch(`/api/admin/organizations/${orgA.id}`).set("x-forwarded-for", sa.ip).set("x-csrf-token", csrf).send({ maxStudents: 1 })).status,
    ).toBe(204);
    const first = await caA.post(`/api/organizations/${orgA.id}/accounts`, { displayName: "HV 1", phone: "0911111111", role: "STUDENT" });
    expect(first.status).toBe(201);
    const second = await caA.post(`/api/organizations/${orgA.id}/accounts`, { displayName: "HV 2", phone: "0922222222", role: "STUDENT" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("ACCOUNT_LIMIT_REACHED");
    expect((await new Client(app).login("0911111111", first.body.temporaryPassword)).status).toBe(200);
    // Giáo viên không bị ảnh hưởng bởi giới hạn học viên
    expect((await caA.post(`/api/organizations/${orgA.id}/accounts`, { displayName: "GV", phone: "0933333333", role: "TEACHER" })).status).toBe(201);

    const list = await sa.get("/api/admin/organizations");
    expect(list.body.find((o: { id: string }) => o.id === orgA.id)).toMatchObject({ maxStudents: 1, counts: { students: 1, teachers: 1, parents: 0 } });

    await sa.agent.patch(`/api/admin/organizations/${orgA.id}`).set("x-forwarded-for", sa.ip).set("x-csrf-token", csrf).send({ status: "SUSPENDED" });
    expect((await caA.get(`/api/organizations/${orgA.id}`)).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: "organization.admin_updated", organizationId: orgA.id } })).toBe(2);
  });
});

describe("Cơ sở và phòng", () => {
  it("tạo cơ sở (múi giờ hợp lệ), phòng; trùng tên báo lỗi rõ", async () => {
    const { orgA, caA } = await setup();
    const b = await caA.post(`/api/organizations/${orgA.id}/branches`, { name: "Cơ sở 1", address: "Quận 1", timezone: "Asia/Ho_Chi_Minh" });
    expect(b.status).toBe(201);
    expect((await caA.post(`/api/organizations/${orgA.id}/branches`, { name: "Cơ sở 1" })).body.error.code).toBe("DUPLICATE_NAME");
    expect((await caA.post(`/api/organizations/${orgA.id}/branches`, { name: "X", timezone: "Mars/Base" })).body.error.code).toBe("VALIDATION_ERROR");
    const r = await caA.post(`/api/organizations/${orgA.id}/rooms`, { branchId: b.body.id, name: "P101", capacity: 20 });
    expect(r.status).toBe(201);
    expect((await caA.post(`/api/organizations/${orgA.id}/rooms`, { branchId: b.body.id, name: "P101" })).body.error.code).toBe("DUPLICATE_NAME");
    const d = await caA.get(`/api/organizations/${orgA.id}`);
    expect(d.body.branches).toEqual([
      expect.objectContaining({ name: "Cơ sở 1", timezone: "Asia/Ho_Chi_Minh", rooms: [expect.objectContaining({ name: "P101", capacity: 20 })] }),
    ]);
  });

  it("không dùng được cơ sở của trung tâm khác để tạo phòng; không xem được trung tâm khác", async () => {
    const { orgA, orgB, caA, caB } = await setup();
    const bA = await caA.post(`/api/organizations/${orgA.id}/branches`, { name: "Cơ sở A" });
    expect((await caB.post(`/api/organizations/${orgB.id}/rooms`, { branchId: bA.body.id, name: "Lấn" })).status).toBe(404);
    expect((await caB.get(`/api/organizations/${orgA.id}`)).status).toBe(404);
    expect((await caB.post(`/api/organizations/${orgA.id}/branches`, { name: "Lấn" })).status).toBe(404);
  });
});

describe("Row-Level Security ở tầng database (role ứng dụng)", () => {
  async function asScope<T>(orgIds: string[] | "bypass" | null, fn: (tx: Parameters<Parameters<typeof appDb.$transaction>[0]>[0]) => Promise<T>) {
    return appDb.$transaction(async (tx) => {
      if (orgIds === "bypass") await tx.$executeRaw`SELECT set_config('app.bypass_rls','on',true)`;
      else if (orgIds) await tx.$executeRaw`SELECT set_config('app.org_ids', ${orgIds.join(",")}, true)`;
      return fn(tx);
    });
  }

  it("mặc định từ chối; chỉ thấy trung tâm trong phạm vi; không ghi được sang trung tâm khác", async () => {
    const orgA = await seedOrg("HZ");
    const orgB = await seedOrg("OTHER");
    await prisma.branch.create({ data: { organizationId: orgA.id, name: "A1" } });
    await prisma.branch.create({ data: { organizationId: orgB.id, name: "B1" } });

    expect(await appDb.branch.count()).toBe(0); // không đặt phạm vi → không thấy gì
    expect(await asScope(null, (tx) => tx.branch.count())).toBe(0);
    expect((await asScope([orgB.id], (tx) => tx.branch.findMany())).map((b) => b.name)).toEqual(["B1"]);
    expect(await asScope([orgB.id], (tx) => tx.branch.count({ where: { organizationId: orgA.id } }))).toBe(0);
    expect(await asScope([orgA.id, orgB.id], (tx) => tx.branch.count())).toBe(2);
    expect(await asScope("bypass", (tx) => tx.branch.count())).toBe(2);

    await expect(asScope([orgB.id], (tx) => tx.branch.create({ data: { organizationId: orgA.id, name: "Lấn" } }))).rejects.toThrow(/row-level security/i);
    const updated = await asScope([orgB.id], (tx) => tx.branch.updateMany({ where: { organizationId: orgA.id }, data: { name: "Bị sửa" } }));
    expect(updated.count).toBe(0);
    const deleted = await asScope([orgB.id], (tx) => tx.branch.deleteMany({ where: { organizationId: orgA.id } }));
    expect(deleted.count).toBe(0);
  });

  it("phạm vi đặt trong transaction không rò sang transaction/kết nối khác", async () => {
    const orgA = await seedOrg("HZ");
    await prisma.branch.create({ data: { organizationId: orgA.id, name: "A1" } });
    expect(await asScope([orgA.id], (tx) => tx.branch.count())).toBe(1);
    expect(await appDb.branch.count()).toBe(0);
  });

  it("khóa ngoại kép: phòng không thể gắn với cơ sở của trung tâm khác (kể cả khi bỏ qua RLS)", async () => {
    const orgA = await seedOrg("HZ");
    const orgB = await seedOrg("OTHER");
    const bA = await prisma.branch.create({ data: { organizationId: orgA.id, name: "A1" } });
    await expect(prisma.room.create({ data: { organizationId: orgB.id, branchId: bA.id, name: "X" } })).rejects.toThrow();
  });

  it("role ứng dụng không phải superuser và không có BYPASSRLS", async () => {
    const rows = await appDb.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});

it("tài khoản giáo viên không quản lý được trung tâm", async () => {
  const org = await seedOrg("HZ");
  await seedUser({ phone: "+84955555555", roles: [{ role: "TEACHER", organizationId: org.id }] });
  const t = new Client(app);
  await t.login("0955555555", "song-han-mua-thu-2026");
  expect((await t.get(`/api/organizations/${org.id}`)).status).toBe(404);
});
