import type { INestApplication } from "@nestjs/common";
import { Client, createApp, loggedIn, prisma, resetDb, seedOrg, seedUser } from "./helpers";
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
const yearsAgo = (y: number) => addDays(today(), -365 * y - 5);

async function put(c: Client, path: string, body: object) {
  return c.agent.put(path).set("x-forwarded-for", c.ip).set("x-csrf-token", (await c.get("/api/auth/csrf")).body.csrfToken).send(body);
}

async function makeCenter(code: string, studentIds: string[], teacherPhone: string, caPhone: string) {
  const org = await seedOrg(code, `Trung tâm ${code}`);
  const branch = await prisma.branch.create({ data: { organizationId: org.id, name: "CS1", timezone: TZ } });
  const room = await prisma.room.create({ data: { organizationId: org.id, branchId: branch.id, name: "P1" } });
  const level = await prisma.curriculumLevel.findUniqueOrThrow({ where: { code: "TH01" } });
  const edition = await prisma.curriculumEdition.create({ data: { levelId: level.id, name: `Bản ${code}`, status: "ACTIVE" } });
  await prisma.lesson.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ editionId: edition.id, number: i + 1, titleVi: `Bài ${i + 1}` })) });
  await prisma.organizationCurriculum.create({ data: { organizationId: org.id, editionId: edition.id } });
  await prisma.roleAssignment.createMany({ data: studentIds.map((userId) => ({ userId, role: "STUDENT" as const, organizationId: org.id })) });
  const teacher = await loggedIn(app, { name: `GV ${code}`, phone: teacherPhone, roles: [{ role: "TEACHER", organizationId: org.id }] });
  const ca = (await loggedIn(app, { phone: caPhone, roles: [{ role: "CENTER_ADMIN", organizationId: org.id }] })).client;
  const start = addDays(today(), -6);
  const cls = await ca.post(`/api/organizations/${org.id}/classes`, {
    name: `${code}-K1`,
    branchId: branch.id,
    editionId: edition.id,
    teacherUserId: teacher.user.id,
    defaultRoomId: room.id,
    startDate: start,
    plannedSessions: 20,
    startLessonNumber: 1,
    sessionsPerLesson: 1,
    rules: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startTime: "06:00", endTime: "07:00" })),
  });
  expect(cls.status).toBe(201);
  await ca.post(`/api/organizations/${org.id}/classes/${cls.body.id}/enrollments`, { studentUserIds: studentIds, startDate: start });
  const sessions = await prisma.classSession.findMany({ where: { classId: cls.body.id }, orderBy: { startsAt: "asc" } });
  return { org, edition, ca, teacher: teacher.client, classId: cls.body.id as string, sessions };
}

async function setup() {
  const s1 = await loggedIn(app, { name: "Bé An", phone: "+84933000001" });
  const s2 = await loggedIn(app, { name: "Anh Bình", phone: "+84933000002" });
  await prisma.user.update({ where: { id: s1.user.id }, data: { dateOfBirth: new Date(`${yearsAgo(12)}T00:00:00Z`) } });
  await prisma.user.update({ where: { id: s2.user.id }, data: { dateOfBirth: new Date(`${yearsAgo(25)}T00:00:00Z`) } });
  const a = await makeCenter("HZ", [s1.user.id, s2.user.id], "+84911000001", "+84900000001");
  const b = await makeCenter("OTHER", [s1.user.id], "+84911000002", "+84900000002");
  const g1 = await a.ca.post(`/api/organizations/${a.org.id}/students/${s1.user.id}/guardians`, { displayName: "Mẹ An", phone: "0944000001", relationship: "Mẹ", verificationNote: "Khai sinh" });
  const g2 = await a.ca.post(`/api/organizations/${a.org.id}/students/${s2.user.id}/guardians`, { displayName: "Bố Bình", phone: "0944000002", relationship: "Bố" });
  const parent1 = new Client(app);
  await parent1.login("0944000001", g1.body.account.temporaryPassword);
  await parent1.post("/api/auth/password", { currentPassword: g1.body.account.temporaryPassword, newPassword: "me-an-mat-khau" });
  const parent2 = new Client(app);
  await parent2.login("0944000002", g2.body.account.temporaryPassword);
  await parent2.post("/api/auth/password", { currentPassword: g2.body.account.temporaryPassword, newPassword: "bo-binh-mat-khau" });
  // Ghi điểm danh hôm qua ở trung tâm A: An vắng, có 2 nhận xét (1 chia sẻ, 1 nội bộ)
  const y = a.sessions.find((s) => localDateOf(s.startsAt, TZ) === addDays(today(), -1))!;
  const r = await put(a.teacher, `/api/teaching/sessions/${y.id}`, {
    records: [
      { studentUserId: s1.user.id, status: "ABSENT" },
      { studentUserId: s2.user.id, status: "PRESENT" },
    ],
    lessons: [{ lessonId: (await prisma.lesson.findFirstOrThrow({ where: { editionId: a.edition.id, number: 1 } })).id, coverage: "DONE" }],
    comments: [
      { studentUserId: s1.user.id, body: "Cần ôn lại bảng chữ cái", visibleToFamily: true },
      { studentUserId: s2.user.id, body: "Ghi chú nội bộ cho trung tâm", visibleToFamily: false },
    ],
  });
  expect(r.status).toBe(200);
  return { s1, s2, a, b, parent1, parent2, g1: g1.body.link.id as string, yesterday: y };
}

describe("Học viên (HV-01, HV-02)", () => {
  it("tổng quan: lớp đang học ở các trung tâm, buổi hôm nay, buổi tiếp theo, chuyên cần, nhận xét được chia sẻ", async () => {
    const { s1, s2 } = await setup();
    const o = (await s1.client.get("/api/learning/overview")).body;
    expect(o.student.displayName).toBe("Bé An");
    expect(o.classes.map((c: { name: string }) => c.name).sort()).toEqual(["HZ-K1", "OTHER-K1"]);
    expect(o.classes.find((c: { name: string }) => c.name === "HZ-K1").currentLesson).toEqual({ number: 1, titleVi: "Bài 1" });
    expect(o.todaySessions).toHaveLength(2);
    expect(o.nextSession).not.toBeNull();
    expect(o.attendance).toMatchObject({ ABSENT: 1, total: 1 });
    expect(o.comments).toEqual([expect.objectContaining({ body: "Cần ôn lại bảng chữ cái", class: "HZ-K1" })]);

    const o2 = (await s2.client.get("/api/learning/overview")).body;
    expect(o2.comments).toEqual([]); // nhận xét nội bộ không hiển thị cho học viên
  });

  it("lịch học kèm điểm danh của chính mình; không xem được dữ liệu người khác", async () => {
    const { s1, s2, yesterday } = await setup();
    const from = addDays(today(), -2);
    const sched = (await s1.client.get(`/api/learning/schedule?from=${from}&to=${today()}`)).body;
    expect(sched.length).toBe(6); // 3 ngày × 2 trung tâm
    expect(sched.find((s: { id: string }) => s.id === yesterday.id).attendance).toBe("ABSENT");
    expect((await s1.client.get(`/api/family/children/${s2.user.id}/overview`)).status).toBe(404);
    expect((await s1.client.get(`/api/learning/schedule?from=${today()}&to=${from}`)).status).toBe(400);
  });

  it("thời gian bảo lưu: buổi được đánh dấu bảo lưu, không tính vào buổi tiếp theo", async () => {
    const { s2, a } = await setup();
    const e = await prisma.enrollment.findFirstOrThrow({ where: { classId: a.classId, studentUserId: s2.user.id } });
    await a.ca.post(`/api/organizations/${a.org.id}/enrollments/${e.id}/hold`, { fromDate: today(), untilDate: addDays(today(), 5) });
    const sched = (await s2.client.get(`/api/learning/schedule?from=${today()}&to=${addDays(today(), 2)}`)).body;
    expect(sched.every((s: { onHold: boolean }) => s.onHold)).toBe(true);
    const o = (await s2.client.get("/api/learning/overview")).body;
    expect(o.nextSession === null || o.nextSession.date >= addDays(today(), 5)).toBe(true);
  });
});

describe("Phụ huynh (PH-01, PH-02)", () => {
  it("chỉ thấy con có liên kết hiệu lực và chỉ dữ liệu ở trung tâm đã xác thực liên kết", async () => {
    const { s1, parent1, yesterday } = await setup();
    const children = (await parent1.get("/api/family/children")).body;
    expect(children).toEqual([expect.objectContaining({ studentId: s1.user.id, displayName: "Bé An" })]);
    const o = (await parent1.get(`/api/family/children/${s1.user.id}/overview`)).body;
    expect(o.classes.map((c: { name: string }) => c.name)).toEqual(["HZ-K1"]); // không thấy lớp ở trung tâm khác
    expect(o.todaySessions).toHaveLength(1);
    expect(o.attendance.ABSENT).toBe(1);
    expect(o.comments).toHaveLength(1);
    const sched = (await parent1.get(`/api/family/children/${s1.user.id}/schedule?from=${addDays(today(), -1)}&to=${addDays(today(), -1)}`)).body;
    expect(sched).toEqual([expect.objectContaining({ id: yesterday.id, attendance: "ABSENT" })]);
  });

  it("liên kết chờ học viên đồng ý: phụ huynh chưa xem được gì", async () => {
    const { s2, parent2 } = await setup();
    expect((await parent2.get("/api/family/children")).body).toEqual([]);
    expect((await parent2.get(`/api/family/children/${s2.user.id}/overview`)).status).toBe(404);
    expect((await parent2.get(`/api/family/children/${s2.user.id}/schedule?from=${today()}&to=${today()}`)).status).toBe(404);
  });

  it("thu hồi liên kết có hiệu lực ngay; không xem được học viên không liên kết", async () => {
    const { s1, s2, parent1, a, g1 } = await setup();
    expect((await parent1.get(`/api/family/children/${s2.user.id}/overview`)).status).toBe(404);
    expect((await parent1.get(`/api/family/children/${s1.user.id}/overview`)).status).toBe(200);
    await a.ca.post(`/api/organizations/${a.org.id}/guardian-links/${g1}/revoke`, { reason: "Gia đình yêu cầu" });
    expect((await parent1.get(`/api/family/children/${s1.user.id}/overview`)).status).toBe(404);
    expect((await parent1.get("/api/family/children")).body).toEqual([]);
  });

  it("tài khoản phụ huynh bị khóa: mất truy cập ngay", async () => {
    const { s1, parent1 } = await setup();
    const p = await prisma.user.findFirstOrThrow({ where: { identities: { some: { value: "+84944000001" } } } });
    await prisma.user.update({ where: { id: p.id }, data: { status: "LOCKED", tokenVersion: { increment: 1 } } });
    expect((await parent1.get(`/api/family/children/${s1.user.id}/overview`)).status).toBe(401);
  });
});

it("người không phải học viên gọi /learning nhận 404", async () => {
  const org = await seedOrg("X");
  const { client } = await loggedIn(app, { phone: "+84955000001", roles: [{ role: "TEACHER", organizationId: org.id }] });
  expect((await client.get("/api/learning/overview")).status).toBe(404);
  void seedUser;
});
