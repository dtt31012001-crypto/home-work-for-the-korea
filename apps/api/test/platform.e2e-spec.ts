import type { INestApplication } from "@nestjs/common";
import { Client, createApp, loggedIn, prisma, resetDb, seedOrg } from "./helpers";
import { addDays, localDateOf } from "../src/classes/schedule";

let app: INestApplication;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

const TZ = "Asia/Ho_Chi_Minh";
const today = () => localDateOf(new Date(), TZ);

async function put(c: Client, path: string, body: object) {
  return c.send("put", path, body);
}

describe("SA-03 Người dùng toàn nền tảng", () => {
  it("tìm theo tên / SĐT (định dạng bất kỳ) / email; thấy vai trò ở từng trung tâm", async () => {
    const orgA = await seedOrg("A", "Trung tâm A");
    const orgB = await seedOrg("B", "Trung tâm B");
    const sa = await loggedIn(app, { phone: "+84900000000", roles: [{ role: "SUPER_ADMIN", organizationId: null }] });
    await loggedIn(app, { name: "Nguyễn Văn Lâm", phone: "+84933000001", email: "lam@example.com", roles: [{ role: "STUDENT", organizationId: orgA.id }, { role: "TEACHER", organizationId: orgB.id }] });
    const byName = (await sa.client.get("/api/admin/users?q=lâm")).body;
    expect(byName).toHaveLength(1);
    expect(byName[0].roles).toEqual(
      expect.arrayContaining([
        { role: "STUDENT", organization: { id: orgA.id, name: "Trung tâm A" } },
        { role: "TEACHER", organization: { id: orgB.id, name: "Trung tâm B" } },
      ]),
    );
    expect(byName[0].lastLoginAt).not.toBeNull();
    expect((await sa.client.get("/api/admin/users?q=0933 000 001")).body).toHaveLength(1);
    expect((await sa.client.get("/api/admin/users?q=LAM@example.com")).body).toHaveLength(1);
    expect((await sa.client.get("/api/admin/users?q=không-có-ai")).body).toEqual([]);
  });

  it("khóa/mở khóa/đặt lại mật khẩu ở cấp nền tảng có hiệu lực ngay và được ghi nhật ký", async () => {
    const sa = await loggedIn(app, { phone: "+84900000000", roles: [{ role: "SUPER_ADMIN", organizationId: null }] });
    const u = await loggedIn(app, { name: "Không thuộc trung tâm", phone: "+84933000009" });
    expect((await sa.client.post(`/api/admin/users/${u.user.id}/lock`)).status).toBe(200);
    expect((await u.client.get("/api/auth/me")).status).toBe(401);
    expect((await sa.client.post(`/api/admin/users/${u.user.id}/unlock`)).status).toBe(200);
    const r = await sa.client.post(`/api/admin/users/${u.user.id}/reset-password`);
    expect(r.body.temporaryPassword).toHaveLength(10);
    const again = new Client(app);
    const login = await again.login("0933000009", r.body.temporaryPassword);
    expect(login.status).toBe(200);
    expect(login.body.mustChangePassword).toBe(true);
    expect((await sa.client.post(`/api/admin/users/${sa.user.id}/lock`)).status).toBe(403);
    expect((await sa.client.post(`/api/admin/users/01900000-0000-7000-8000-00000000ffff/lock`)).status).toBe(404);

    const log = (await sa.client.get(`/api/admin/audit?resourceId=${u.user.id}&action=account.`)).body;
    expect(log.items.map((i: { action: string }) => i.action)).toEqual(["account.password_reset", "account.unlocked", "account.locked"]);
    expect(log.items[0].actor).toEqual({ id: sa.user.id, displayName: expect.any(String) });
    expect(log.items[0].target).toBe("Không thuộc trung tâm");
  });
});

describe("SA-04 Nhật ký hệ thống", () => {
  it("lọc theo trung tâm/hành động/ngày; phân trang theo con trỏ; chỉ Super Admin xem được", async () => {
    const org = await seedOrg("A", "Trung tâm A");
    const sa = await loggedIn(app, { phone: "+84900000000", roles: [{ role: "SUPER_ADMIN", organizationId: null }] });
    const ca = await loggedIn(app, { phone: "+84900000001", roles: [{ role: "CENTER_ADMIN", organizationId: org.id }] });
    for (let i = 0; i < 55; i++) {
      await prisma.auditLog.create({ data: { action: "test.event", resourceType: "test", organizationId: org.id, actorUserId: ca.user.id, data: { i } } });
    }
    const p1 = (await sa.client.get(`/api/admin/audit?organizationId=${org.id}&action=test.`)).body;
    expect(p1.items).toHaveLength(50);
    expect(p1.items[0].data).toEqual({ i: 54 }); // mới nhất trước
    expect(p1.items[0].organization).toEqual({ id: org.id, name: "Trung tâm A" });
    const p2 = (await sa.client.get(`/api/admin/audit?organizationId=${org.id}&action=test.&before=${p1.nextCursor}`)).body;
    expect(p2.items).toHaveLength(5);
    expect(p2.nextCursor).toBeNull();
    expect((await sa.client.get(`/api/admin/audit?action=test.&from=${addDays(today(), 1)}`)).body.items).toEqual([]);
    expect((await sa.client.get(`/api/admin/audit?action=test.&from=${today()}&to=${today()}`)).body.items).toHaveLength(50);
    expect((await ca.client.get("/api/admin/audit")).status).toBe(404);
    expect((await ca.client.get("/api/admin/users")).status).toBe(404);
  });
});

describe("C-07 Nhập danh sách tài khoản", () => {
  async function setup() {
    const org = await seedOrg("A", "Trung tâm A");
    const other = await seedOrg("B", "Trung tâm B");
    const ca = await loggedIn(app, { phone: "+84900000001", roles: [{ role: "CENTER_ADMIN", organizationId: org.id }] });
    const caB = await loggedIn(app, { phone: "+84900000002", roles: [{ role: "CENTER_ADMIN", organizationId: other.id }] });
    await loggedIn(app, { name: "Đã ở trung tâm khác", phone: "+84933000005", roles: [{ role: "STUDENT", organizationId: other.id }] });
    await loggedIn(app, { name: "Đã ở đây", phone: "+84933000006", roles: [{ role: "STUDENT", organizationId: org.id }] });
    await loggedIn(app, { name: "Người SĐT", phone: "+84933000007" });
    await loggedIn(app, { name: "Người email", email: "x@example.com", phone: "+84933000008" });
    return { org, other, ca: ca.client, caB: caB.client };
  }
  const rows = [
    { displayName: "Học viên Một", phone: "0933 111 001", dateOfBirth: "2012-03-04" },
    { displayName: "Học viên Hai", email: "hai@example.com" },
    { displayName: "Đã ở trung tâm khác", phone: "0933000005" },
    { displayName: "Đã ở đây", phone: "0933000006" },
    { displayName: "", phone: "0933111009" },
    { displayName: "SĐT sai", phone: "12" },
    { displayName: "Trùng dòng 2", phone: "+84933111001" },
    { displayName: "Không liên hệ" },
    { displayName: "Hai tài khoản", phone: "0933000007", email: "x@example.com" },
    { displayName: "Ngày sinh sai", phone: "0933111010", dateOfBirth: "31/12/2010" },
  ];

  it("chạy thử: báo từng dòng (tạo mới, gắn vai trò, đã có, lỗi) và không tạo gì", async () => {
    const { org, ca } = await setup();
    const before = await prisma.user.count();
    const r = await ca.post(`/api/organizations/${org.id}/accounts/import`, { role: "STUDENT", rows, dryRun: true });
    expect(r.status).toBe(200);
    expect(r.body.rows.map((x: { line: number; outcome: string }) => `${x.line}:${x.outcome}`)).toEqual([
      "2:CREATE",
      "3:CREATE",
      "4:LINK_EXISTING",
      "5:ALREADY_HAS_ROLE",
      "6:ERROR",
      "7:ERROR",
      "8:ERROR",
      "9:ERROR",
      "10:ERROR",
      "11:ERROR",
    ]);
    expect(r.body.rows[6].message).toBe("Trùng với dòng 2 trong file");
    expect(r.body.summary).toEqual({ CREATE: 2, LINK_EXISTING: 1, ALREADY_HAS_ROLE: 1, ERROR: 6 });
    expect(r.body.rows.some((x: { temporaryPassword?: string }) => x.temporaryPassword)).toBe(false);
    expect(await prisma.user.count()).toBe(before);
  });

  it("chạy thật: tạo tài khoản với mật khẩu tạm bắt buộc đổi, gắn vai trò người đã có, bỏ qua dòng lỗi, ghi nhật ký", async () => {
    const { org, ca } = await setup();
    const r = await ca.post(`/api/organizations/${org.id}/accounts/import`, { role: "STUDENT", rows, dryRun: false });
    expect(r.body.summary).toEqual({ CREATE: 2, LINK_EXISTING: 1, ALREADY_HAS_ROLE: 1, ERROR: 6 });
    const created = r.body.rows.filter((x: { outcome: string }) => x.outcome === "CREATE");
    expect(created.every((x: { temporaryPassword: string }) => x.temporaryPassword.length === 10)).toBe(true);
    expect(r.body.rows.find((x: { outcome: string }) => x.outcome === "LINK_EXISTING").temporaryPassword).toBeUndefined();
    const c = new Client(app);
    expect((await c.login("0933111001", created[0].temporaryPassword)).body.mustChangePassword).toBe(true);
    const one = await prisma.user.findFirstOrThrow({ where: { displayName: "Học viên Một" } });
    expect(one.dateOfBirth?.toISOString().slice(0, 10)).toBe("2012-03-04");
    const list = (await ca.get(`/api/organizations/${org.id}/accounts?role=STUDENT`)).body.map((p: { displayName: string }) => p.displayName);
    expect(list.sort()).toEqual(["Học viên Hai", "Học viên Một", "Đã ở trung tâm khác", "Đã ở đây"].sort());
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "account.imported" } });
    expect(audit.data).toMatchObject({ role: "STUDENT", CREATE: 2 });
    // Chạy lại cùng file: không tạo trùng
    const again = await ca.post(`/api/organizations/${org.id}/accounts/import`, { role: "STUDENT", rows, dryRun: false });
    expect(again.body.summary).toMatchObject({ CREATE: 0, LINK_EXISTING: 0, ALREADY_HAS_ROLE: 4 });
  });

  it("giới hạn tài khoản của gói: dòng vượt giới hạn báo lỗi, người đang dùng không bị ảnh hưởng", async () => {
    const { org, ca } = await setup();
    await prisma.organization.update({ where: { id: org.id }, data: { maxStudents: 2 } });
    const r = await ca.post(`/api/organizations/${org.id}/accounts/import`, { role: "STUDENT", rows: rows.slice(0, 3), dryRun: false });
    expect(r.body.rows.map((x: { outcome: string }) => x.outcome)).toEqual(["CREATE", "ERROR", "ERROR"]);
    expect(r.body.rows[1].message).toContain("giới hạn 2");
  });

  it("chỉ quản trị đúng trung tâm; dữ liệu đầu vào được kiểm tra", async () => {
    const { org, caB, ca } = await setup();
    expect((await caB.post(`/api/organizations/${org.id}/accounts/import`, { role: "STUDENT", rows, dryRun: true })).status).toBe(404);
    expect((await ca.post(`/api/organizations/${org.id}/accounts/import`, { role: "CENTER_ADMIN", rows, dryRun: true })).status).toBe(400);
    expect((await ca.post(`/api/organizations/${org.id}/accounts/import`, { role: "STUDENT", rows: [], dryRun: true })).status).toBe(400);
    const many = Array.from({ length: 501 }, (_, i) => ({ displayName: `HV ${i}`, phone: `09330${String(i).padStart(5, "0")}` }));
    expect((await ca.post(`/api/organizations/${org.id}/accounts/import`, { role: "STUDENT", rows: many, dryRun: true })).status).toBe(400);
  });
});

describe("CA-07 Báo cáo chuyên cần", () => {
  it("theo lớp và theo học viên; vắng liên tiếp được đưa lên đầu; trung tâm khác không xem được", async () => {
    const org = await seedOrg("A", "Trung tâm A");
    const other = await seedOrg("B", "Trung tâm B");
    await prisma.organization.update({ where: { id: org.id }, data: { attendanceEditHours: 720 } });
    const branch = await prisma.branch.create({ data: { organizationId: org.id, name: "CS1", timezone: TZ } });
    const room = await prisma.room.create({ data: { organizationId: org.id, branchId: branch.id, name: "P1" } });
    const level = await prisma.curriculumLevel.findUniqueOrThrow({ where: { code: "TH01" } });
    const edition = await prisma.curriculumEdition.create({ data: { levelId: level.id, name: "Bản", status: "ACTIVE" } });
    await prisma.lesson.createMany({ data: Array.from({ length: 10 }, (_, i) => ({ editionId: edition.id, number: i + 1, titleVi: `Bài ${i + 1}` })) });
    await prisma.organizationCurriculum.create({ data: { organizationId: org.id, editionId: edition.id } });
    const ca = await loggedIn(app, { phone: "+84900000001", roles: [{ role: "CENTER_ADMIN", organizationId: org.id }] });
    const caB = await loggedIn(app, { phone: "+84900000002", roles: [{ role: "CENTER_ADMIN", organizationId: other.id }] });
    const t = await loggedIn(app, { name: "GV Hà", phone: "+84911000001", roles: [{ role: "TEACHER", organizationId: org.id }] });
    const s1 = await loggedIn(app, { name: "Chăm chỉ", phone: "+84933000001", roles: [{ role: "STUDENT", organizationId: org.id }] });
    const s2 = await loggedIn(app, { name: "Hay vắng", phone: "+84933000002", roles: [{ role: "STUDENT", organizationId: org.id }] });
    const start = addDays(today(), -4);
    const cls = await ca.client.post(`/api/organizations/${org.id}/classes`, {
      name: "K1",
      branchId: branch.id,
      editionId: edition.id,
      teacherUserId: t.user.id,
      defaultRoomId: room.id,
      startDate: start,
      plannedSessions: 10,
      startLessonNumber: 1,
      sessionsPerLesson: 1,
      rules: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startTime: "06:00", endTime: "07:00" })),
    });
    await ca.client.post(`/api/organizations/${org.id}/classes/${cls.body.id}/enrollments`, { studentUserIds: [s1.user.id, s2.user.id], startDate: start });
    const sessions = await prisma.classSession.findMany({ where: { classId: cls.body.id }, orderBy: { startsAt: "asc" } });
    // 3 buổi đã qua được điểm danh: s2 có mặt rồi vắng 2 buổi liền
    const plan: ["PRESENT" | "ABSENT" | "LATE", "PRESENT" | "ABSENT"][] = [
      ["PRESENT", "PRESENT"],
      ["LATE", "ABSENT"],
      ["PRESENT", "ABSENT"],
    ];
    for (const [i, [a, b]] of plan.entries()) {
      const r = await put(t.client, `/api/teaching/sessions/${sessions[i]!.id}`, {
        records: [
          { studentUserId: s1.user.id, status: a },
          { studentUserId: s2.user.id, status: b },
        ],
        lessons: [],
        comments: [],
      });
      expect(r.status).toBe(200);
    }
    const q = `from=${start}&to=${today()}`;
    const rep = (await ca.client.get(`/api/organizations/${org.id}/reports/attendance?${q}`)).body;
    expect(rep.classes).toEqual([
      expect.objectContaining({ name: "K1", levelCode: "TH01", teacher: "GV Hà", heldSessions: 5, recordedSessions: 3, counts: { PRESENT: 3, LATE: 1, EXCUSED: 0, ABSENT: 2, total: 6 } }),
    ]);
    expect(rep.classes[0].rate).toBeCloseTo(4 / 6);
    expect(rep.students.map((s: { displayName: string; absentStreak: number }) => [s.displayName, s.absentStreak])).toEqual([
      ["Hay vắng", 2],
      ["Chăm chỉ", 0],
    ]);
    expect(rep.students[1].rate).toBe(1);
    // Lọc theo lớp; tương lai không tính là "đã diễn ra"
    const future = (await ca.client.get(`/api/organizations/${org.id}/reports/attendance?from=${addDays(today(), 1)}&to=${addDays(today(), 9)}&classId=${cls.body.id}`)).body;
    expect(future.classes).toEqual([]);
    expect((await caB.client.get(`/api/organizations/${org.id}/reports/attendance?${q}`)).status).toBe(404);
    expect((await caB.client.get(`/api/organizations/${other.id}/reports/attendance?${q}&classId=${cls.body.id}`)).status).toBe(404);
    expect((await t.client.get(`/api/organizations/${org.id}/reports/attendance?${q}`)).status).toBe(404);
    expect((await ca.client.get(`/api/organizations/${org.id}/reports/attendance?from=${today()}&to=${start}`)).status).toBe(400);
    expect((await ca.client.get(`/api/organizations/${org.id}/reports/attendance?from=2020-01-01&to=2026-01-01`)).status).toBe(400);
  });
});
