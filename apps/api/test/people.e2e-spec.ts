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

const yearsAgo = (y: number, extraDays = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - y);
  d.setUTCDate(d.getUTCDate() - extraDays);
  return d.toISOString().slice(0, 10);
};

async function setup() {
  const orgA = await seedOrg("HZ", "Horizon");
  const orgB = await seedOrg("OTHER", "Khác");
  const ca = (await loggedIn(app, { phone: "+84900000002", roles: [{ role: "CENTER_ADMIN", organizationId: orgA.id }] })).client;
  const caB = (await loggedIn(app, { phone: "+84900000003", roles: [{ role: "CENTER_ADMIN", organizationId: orgB.id }] })).client;
  return { orgA, orgB, ca, caB };
}

async function issueStudent(ca: Client, orgId: string, phone: string, dateOfBirth?: string) {
  const r = await ca.post(`/api/organizations/${orgId}/accounts`, { displayName: `HV ${phone}`, phone, role: "STUDENT", dateOfBirth });
  expect(r.status).toBe(201);
  return r.body as { userId: string; temporaryPassword: string };
}

async function loginAs(phone: string, temp: string, newPassword = "mat-khau-moi-123") {
  const c = new Client(app);
  await c.login(phone, temp);
  await c.post("/api/auth/password", { currentPassword: temp, newPassword });
  return c;
}

describe("Giáo viên", () => {
  it("cấp tài khoản, lọc theo vai trò; rút khỏi trung tâm có hiệu lực ngay, giữ tài khoản", async () => {
    const { orgA, ca } = await setup();
    const t = (await ca.post(`/api/organizations/${orgA.id}/accounts`, { displayName: "Cô Lan", phone: "0911000001", role: "TEACHER" })).body;
    await issueStudent(ca, orgA.id, "0911000002");
    const teachers = (await ca.get(`/api/organizations/${orgA.id}/accounts?role=TEACHER`)).body;
    expect(teachers.map((x: { displayName: string }) => x.displayName)).toEqual(["Cô Lan"]);
    expect((await ca.get(`/api/organizations/${orgA.id}/accounts?role=BOSS`)).status).toBe(400);

    const teacher = await loginAs("0911000001", t.temporaryPassword);
    expect((await teacher.get("/api/auth/me")).body.contexts).toHaveLength(1);
    expect((await ca.post(`/api/organizations/${orgA.id}/accounts/${t.userId}/roles/TEACHER/revoke`)).status).toBe(204);
    expect((await teacher.get("/api/auth/me")).body.contexts).toEqual([]);
    expect((await ca.get(`/api/organizations/${orgA.id}/accounts?role=TEACHER`)).body).toEqual([]);
    expect((await ca.post(`/api/organizations/${orgA.id}/accounts/${t.userId}/roles/TEACHER/revoke`)).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: "account.role_revoked" } })).toBe(1);
  });

  it("Center Admin không rút được quyền quản trị; sửa hồ sơ người thuộc nhiều trung tâm bị chặn", async () => {
    const { orgA, orgB, ca } = await setup();
    const caUser = await prisma.user.findFirstOrThrow({ where: { identities: { some: { value: "+84900000002" } } } });
    expect((await ca.post(`/api/organizations/${orgA.id}/accounts/${caUser.id}/roles/CENTER_ADMIN/revoke`)).status).toBe(403);
    const multi = await seedUser({ phone: "+84922000001", roles: [{ role: "TEACHER", organizationId: orgA.id }, { role: "TEACHER", organizationId: orgB.id }] });
    const patch = await ca.agent
      .patch(`/api/organizations/${orgA.id}/accounts/${multi.id}`)
      .set("x-forwarded-for", ca.ip)
      .set("x-csrf-token", (await ca.get("/api/auth/csrf")).body.csrfToken)
      .send({ displayName: "Đổi tên" });
    expect(patch.status).toBe(403);
    const list = (await ca.get(`/api/organizations/${orgA.id}/accounts?role=TEACHER`)).body;
    expect(list[0].otherCenters).toBe(true);
  });
});

describe("Liên kết phụ huynh – học viên (D-B21)", () => {
  it("học viên chưa thành niên: bắt buộc ghi cách xác minh người giám hộ; liên kết hiệu lực ngay", async () => {
    const { orgA, ca } = await setup();
    const st = await issueStudent(ca, orgA.id, "0933000001", yearsAgo(12));
    const url = `/api/organizations/${orgA.id}/students/${st.userId}/guardians`;
    const missing = await ca.post(url, { displayName: "Mẹ An", phone: "0944000001", relationship: "Mẹ" });
    expect(missing.body.error.code).toBe("GUARDIAN_VERIFICATION_REQUIRED");
    expect(await prisma.user.count({ where: { identities: { some: { value: "+84944000001" } } } })).toBe(0);

    const ok = await ca.post(url, { displayName: "Mẹ An", phone: "0944000001", relationship: "Mẹ", verificationNote: "Đối chiếu giấy khai sinh tại quầy" });
    expect(ok.status).toBe(201);
    expect(ok.body.link).toMatchObject({ status: "ACTIVE", effective: true, relationship: "Mẹ" });
    expect(ok.body.account.temporaryPassword).toMatch(/^[a-z2-9]{10}$/);

    const parent = await loginAs("0944000001", ok.body.account.temporaryPassword);
    expect((await parent.get("/api/auth/me")).body.contexts).toEqual([expect.objectContaining({ role: "PARENT" })]);
    expect((await parent.get("/api/me/children")).body).toEqual([expect.objectContaining({ studentId: st.userId, organizationId: orgA.id, relationship: "Mẹ" })]);
  });

  it("học viên đã thành niên: chờ đồng ý; đồng ý → phụ huynh mới xem được; từ chối → không xem được", async () => {
    const { orgA, ca } = await setup();
    const st = await issueStudent(ca, orgA.id, "0933000002", yearsAgo(25));
    const add = await ca.post(`/api/organizations/${orgA.id}/students/${st.userId}/guardians`, { displayName: "Bố B", phone: "0944000002", relationship: "Bố" });
    expect(add.body.link).toMatchObject({ status: "PENDING_CONSENT", effective: false });
    const parent = await loginAs("0944000002", add.body.account.temporaryPassword);
    expect((await parent.get("/api/me/children")).body).toEqual([]);

    const student = await loginAs("0933000002", st.temporaryPassword);
    const reqs = (await student.get("/api/me/guardian-requests")).body;
    expect(reqs).toEqual([expect.objectContaining({ id: add.body.link.id, relationship: "Bố", organization: { id: orgA.id, name: "Horizon" }, guardian: { displayName: "Bố B" } })]);
    expect((await student.post(`/api/me/guardian-links/${add.body.link.id}/consent`, { accept: true })).status).toBe(204);
    expect((await parent.get("/api/me/children")).body).toHaveLength(1);

    // Học viên trưởng thành tự thu hồi → hiệu lực ngay
    expect((await student.post(`/api/me/guardian-links/${add.body.link.id}/revoke`)).status).toBe(204);
    expect((await parent.get("/api/me/children")).body).toEqual([]);

    const again = await ca.post(`/api/organizations/${orgA.id}/students/${st.userId}/guardians`, { displayName: "Bố B", phone: "0944000002", relationship: "Bố" });
    expect(again.body.account).toEqual({ userId: add.body.account.userId, linkedExisting: true }); // không tạo trùng, không cấp mật khẩu mới
    expect((await student.post(`/api/me/guardian-links/${again.body.link.id}/consent`, { accept: false })).status).toBe(204);
    expect((await parent.get("/api/me/children")).body).toEqual([]);
    const detail = (await ca.get(`/api/organizations/${orgA.id}/students/${st.userId}`)).body;
    expect(detail.guardians.map((g: { status: string }) => g.status)).toEqual(["REJECTED", "REVOKED"]);
  });

  it("học viên tròn 18 tuổi: liên kết cũ tự tạm dừng tới khi học viên đồng ý", async () => {
    const { orgA, ca } = await setup();
    const st = await issueStudent(ca, orgA.id, "0933000003", yearsAgo(17));
    const add = await ca.post(`/api/organizations/${orgA.id}/students/${st.userId}/guardians`, { displayName: "Mẹ C", phone: "0944000003", relationship: "Mẹ", verificationNote: "Xác minh qua CCCD" });
    const parent = await loginAs("0944000003", add.body.account.temporaryPassword);
    expect((await parent.get("/api/me/children")).body).toHaveLength(1);

    await prisma.user.update({ where: { id: st.userId }, data: { dateOfBirth: new Date(`${yearsAgo(18)}T00:00:00Z`) } });
    expect((await parent.get("/api/me/children")).body).toEqual([]);
    const student = await loginAs("0933000003", st.temporaryPassword);
    expect((await student.get("/api/me/guardian-requests")).body[0].status).toBe("PAUSED_ADULT");
    await student.post(`/api/me/guardian-links/${add.body.link.id}/consent`, { accept: true });
    expect((await parent.get("/api/me/children")).body).toHaveLength(1);
  });

  it("học viên chưa thành niên không tự thu hồi được; trung tâm thu hồi có hiệu lực ngay với phiên đang mở", async () => {
    const { orgA, ca } = await setup();
    const st = await issueStudent(ca, orgA.id, "0933000004", yearsAgo(10));
    const add = await ca.post(`/api/organizations/${orgA.id}/students/${st.userId}/guardians`, { displayName: "Bố D", phone: "0944000004", relationship: "Bố", verificationNote: "Hộ khẩu" });
    const parent = await loginAs("0944000004", add.body.account.temporaryPassword);
    const student = await loginAs("0933000004", st.temporaryPassword);
    expect((await student.post(`/api/me/guardian-links/${add.body.link.id}/revoke`)).status).toBe(403);
    expect((await parent.get("/api/me/children")).body).toHaveLength(1);
    expect((await ca.post(`/api/organizations/${orgA.id}/guardian-links/${add.body.link.id}/revoke`, { reason: "Yêu cầu của gia đình" })).status).toBe(204);
    expect((await parent.get("/api/me/children")).body).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: "guardian_link.revoked" } })).toBe(1);
  });

  it("một phụ huynh nhiều con, một học viên nhiều phụ huynh; học viên rời trung tâm → liên kết bị thu hồi", async () => {
    const { orgA, ca } = await setup();
    const c1 = await issueStudent(ca, orgA.id, "0933000005", yearsAgo(9));
    const c2 = await issueStudent(ca, orgA.id, "0933000006", yearsAgo(11));
    const mom = await ca.post(`/api/organizations/${orgA.id}/students/${c1.userId}/guardians`, { displayName: "Mẹ E", phone: "0944000005", relationship: "Mẹ", verificationNote: "Khai sinh" });
    await ca.post(`/api/organizations/${orgA.id}/students/${c2.userId}/guardians`, { displayName: "Mẹ E", phone: "0944000005", relationship: "Mẹ", verificationNote: "Khai sinh" });
    await ca.post(`/api/organizations/${orgA.id}/students/${c1.userId}/guardians`, { displayName: "Bố E", phone: "0944000006", relationship: "Bố", verificationNote: "Khai sinh" });
    const parent = await loginAs("0944000005", mom.body.account.temporaryPassword);
    expect((await parent.get("/api/me/children")).body.map((c: { studentId: string }) => c.studentId).sort()).toEqual([c1.userId, c2.userId].sort());
    expect((await ca.get(`/api/organizations/${orgA.id}/students/${c1.userId}`)).body.guardians).toHaveLength(2);
    expect((await ca.post(`/api/organizations/${orgA.id}/students/${c1.userId}/guardians`, { displayName: "Mẹ E", phone: "0944000005", relationship: "Mẹ", verificationNote: "x" })).body.error.code).toBe("LINK_EXISTS");

    await ca.post(`/api/organizations/${orgA.id}/accounts/${c1.userId}/roles/STUDENT/revoke`);
    expect((await parent.get("/api/me/children")).body.map((c: { studentId: string }) => c.studentId)).toEqual([c2.userId]);
  });

  it("không có ngày sinh → coi như đã thành niên, cần học viên đồng ý", async () => {
    const { orgA, ca } = await setup();
    const st = await issueStudent(ca, orgA.id, "0933000007");
    const add = await ca.post(`/api/organizations/${orgA.id}/students/${st.userId}/guardians`, { displayName: "PH F", phone: "0944000007", relationship: "Bố" });
    expect(add.body.link.status).toBe("PENDING_CONSENT");
  });

  it("cách ly trung tâm: trung tâm khác không xem/thêm/thu hồi được", async () => {
    const { orgA, orgB, ca, caB } = await setup();
    const st = await issueStudent(ca, orgA.id, "0933000008", yearsAgo(8));
    const add = await ca.post(`/api/organizations/${orgA.id}/students/${st.userId}/guardians`, { displayName: "PH G", phone: "0944000008", relationship: "Mẹ", verificationNote: "x" });
    expect((await caB.get(`/api/organizations/${orgA.id}/students/${st.userId}`)).status).toBe(404);
    expect((await caB.get(`/api/organizations/${orgB.id}/students/${st.userId}`)).status).toBe(404);
    expect((await caB.post(`/api/organizations/${orgB.id}/students/${st.userId}/guardians`, { displayName: "X", phone: "0955000001", relationship: "Bố", verificationNote: "x" })).status).toBe(404);
    expect((await caB.post(`/api/organizations/${orgB.id}/guardian-links/${add.body.link.id}/revoke`, {})).status).toBe(404);
    const other = new Client(app);
    await other.login("+84900000003", DEFAULT_PASSWORD);
    expect((await other.post(`/api/me/guardian-links/${add.body.link.id}/consent`, { accept: true })).status).toBe(404);
  });
});
