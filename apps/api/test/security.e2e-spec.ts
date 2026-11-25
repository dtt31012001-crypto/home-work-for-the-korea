/**
 * Bộ kiểm thử bảo mật tổng hợp Phase 1. Các tình huống chi tiết khác nằm ở từng spec:
 * - khóa tài khoản: auth, accounts, learner · làm mới đồng thời: session-policy
 * - giáo viên bị rút: attendance, people · thu hồi liên kết phụ huynh: people, learner · RLS: organization
 * File này bổ sung: người có vai trò ở nhiều trung tâm, đổi vai trò khi đang đăng nhập,
 * quét toàn bộ endpoint theo trung tâm (truy cập chéo) và ma trận vai trò ↔ workspace.
 */
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

async function center(code: string, ca: Client, teacherId: string, studentId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { code } });
  const branch = await prisma.branch.create({ data: { organizationId: org.id, name: "CS1", timezone: TZ } });
  const room = await prisma.room.create({ data: { organizationId: org.id, branchId: branch.id, name: "P1" } });
  const level = await prisma.curriculumLevel.findUniqueOrThrow({ where: { code: "TH01" } });
  const edition = await prisma.curriculumEdition.create({ data: { levelId: level.id, name: `Bản ${code}`, status: "ACTIVE" } });
  await prisma.lesson.createMany({ data: Array.from({ length: 10 }, (_, i) => ({ editionId: edition.id, number: i + 1, titleVi: `Bài ${i + 1}` })) });
  const grant = await prisma.organizationCurriculum.create({ data: { organizationId: org.id, editionId: edition.id } });
  await prisma.roleAssignment.create({ data: { userId: studentId, role: "STUDENT", organizationId: org.id } });
  const cls = await ca.post(`/api/organizations/${org.id}/classes`, {
    name: `${code}-K1`,
    branchId: branch.id,
    editionId: edition.id,
    teacherUserId: teacherId,
    defaultRoomId: room.id,
    startDate: addDays(today(), -3),
    plannedSessions: 10,
    startLessonNumber: 1,
    sessionsPerLesson: 1,
    rules: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startTime: "06:00", endTime: "07:00" })),
  });
  expect(cls.status).toBe(201);
  await ca.post(`/api/organizations/${org.id}/classes/${cls.body.id}/enrollments`, { studentUserIds: [studentId], startDate: addDays(today(), -3) });
  const session = await prisma.classSession.findFirstOrThrow({ where: { classId: cls.body.id }, orderBy: { startsAt: "asc" } });
  const enrollment = await prisma.enrollment.findFirstOrThrow({ where: { classId: cls.body.id } });
  return { org, branch, room, edition, grant, classId: cls.body.id as string, sessionId: session.id, enrollmentId: enrollment.id };
}

/**
 * Trung tâm A và B. Người X: quản trị A và giáo viên ở B. Mỗi trung tâm có một học viên và một lớp.
 */
async function setup() {
  const orgA = await seedOrg("A", "Trung tâm A");
  const orgB = await seedOrg("B", "Trung tâm B");
  const sa = await loggedIn(app, { phone: "+84900000000", roles: [{ role: "SUPER_ADMIN", organizationId: null }] });
  const x = await loggedIn(app, {
    name: "Người X",
    phone: "+84900000001",
    roles: [
      { role: "CENTER_ADMIN", organizationId: orgA.id },
      { role: "TEACHER", organizationId: orgB.id },
    ],
  });
  const caB = await loggedIn(app, { phone: "+84900000002", roles: [{ role: "CENTER_ADMIN", organizationId: orgB.id }] });
  const teacherA = await loggedIn(app, { phone: "+84911000001", roles: [{ role: "TEACHER", organizationId: orgA.id }] });
  const studentA = await loggedIn(app, { name: "HV A", phone: "+84933000001" });
  const studentB = await loggedIn(app, { name: "HV B", phone: "+84933000002" });
  const a = await center("A", x.client, teacherA.user.id, studentA.user.id);
  const b = await center("B", caB.client, x.user.id, studentB.user.id);
  const g = await caB.client.post(`/api/organizations/${b.org.id}/students/${studentB.user.id}/guardians`, {
    displayName: "PH B",
    phone: "0944000002",
    relationship: "Mẹ",
    verificationNote: "Khai sinh",
  });
  await prisma.user.update({ where: { id: studentB.user.id }, data: { dateOfBirth: new Date("2015-01-01T00:00:00Z") } });
  return { orgA, orgB, sa, x, caB, teacherA, studentA, studentB, a, b, linkB: g.body.link?.id as string };
}

describe("Người có vai trò ở nhiều trung tâm", () => {
  it("quản trị ở A nhưng chỉ là giáo viên ở B: không quản lý được B, chỉ dạy lớp của mình ở B", async () => {
    const { x, orgA, orgB, a, b } = await setup();
    expect((await x.client.get(`/api/organizations/${orgA.id}/classes`)).status).toBe(200);
    for (const path of ["classes", "accounts", "calendar?from=2026-01-01&to=2026-01-07", "today", `classes/${b.classId}`, `students/${(await prisma.enrollment.findFirstOrThrow({ where: { classId: b.classId } })).studentUserId}`]) {
      expect([path, (await x.client.get(`/api/organizations/${orgB.id}/${path}`)).status]).toEqual([path, 404]);
    }
    const mine = (await x.client.get("/api/teaching/classes")).body as { id: string }[];
    expect(mine.map((c) => c.id)).toEqual([b.classId]); // không thấy lớp ở A dù là quản trị A
    expect((await x.client.get(`/api/teaching/sessions/${a.sessionId}`)).status).toBe(404);
    expect((await x.client.get(`/api/teaching/sessions/${b.sessionId}`)).status).toBe(200);
  });

  it("học viên ở hai trung tâm: quản trị mỗi trung tâm chỉ thấy phần của mình", async () => {
    const { x, caB, orgA, orgB, studentA } = await setup();
    await prisma.roleAssignment.create({ data: { userId: studentA.user.id, role: "STUDENT", organizationId: orgB.id } });
    const detailB = await caB.client.get(`/api/organizations/${orgB.id}/students/${studentA.user.id}`);
    expect(detailB.status).toBe(200);
    expect(detailB.body.otherCenters).toBe(true); // chỉ biết "có học ở nơi khác", không biết ở đâu
    expect(JSON.stringify(detailB.body)).not.toMatch(/A-K1|Trung tâm A/);
    // Danh sách học viên của mỗi trung tâm chỉ gồm người của trung tâm đó
    const listA = (await x.client.get(`/api/organizations/${orgA.id}/accounts?role=STUDENT`)).body as { displayName: string }[];
    expect(listA.map((p) => p.displayName)).toEqual(["HV A"]);
    // Không sửa được hồ sơ người thuộc nhiều trung tâm (tránh một trung tâm thay đổi dữ liệu dùng chung)
    expect((await caB.client.patch(`/api/organizations/${orgB.id}/accounts/${studentA.user.id}`, { displayName: "Đổi tên" })).status).toBe(403);
  });
});

describe("Đổi vai trò khi đang đăng nhập", () => {
  it("rút quyền quản trị: mất quyền ngay ở request kế tiếp, không cần đăng nhập lại; vai trò khác giữ nguyên", async () => {
    const { sa, x, orgA, orgB } = await setup();
    expect((await x.client.get(`/api/organizations/${orgA.id}/accounts`)).status).toBe(200);
    expect((await sa.client.post(`/api/organizations/${orgA.id}/accounts/${x.user.id}/roles/CENTER_ADMIN/revoke`, {})).status).toBe(204);
    expect((await x.client.get(`/api/organizations/${orgA.id}/accounts`)).status).toBe(404);
    expect((await x.client.post(`/api/organizations/${orgA.id}/accounts`, { displayName: "Mới", phone: "0977000001", role: "STUDENT" })).status).toBe(404);
    const me = (await x.client.get("/api/auth/me")).body;
    expect(me.contexts.map((c: { role: string; organization: { id: string } }) => `${c.role}:${c.organization.id}`)).toEqual([`TEACHER:${orgB.id}`]);
    expect((await x.client.get("/api/teaching/today")).status).toBe(200);
  });

  it("học viên bị rút khỏi trung tâm: mất dữ liệu ở trung tâm đó, phụ huynh mất liên kết", async () => {
    const { caB, orgB, studentB, linkB } = await setup();
    expect(linkB).toBeTruthy();
    expect((await studentB.client.get("/api/learning/overview")).status).toBe(200);
    expect((await caB.client.post(`/api/organizations/${orgB.id}/accounts/${studentB.user.id}/roles/STUDENT/revoke`, {})).status).toBe(204);
    expect((await studentB.client.get("/api/learning/overview")).status).toBe(404);
    expect((await prisma.guardianLink.findUniqueOrThrow({ where: { id: linkB } })).status).toBe("REVOKED");
  });
});

describe("Truy cập chéo trung tâm (quét endpoint)", () => {
  it("quản trị A dùng URL của B, hoặc URL của A với ID tài nguyên của B → luôn 404, không lộ dữ liệu", async () => {
    const { x, orgA, orgB, b, studentB, linkB } = await setup();
    const B = `/api/organizations/${orgB.id}`;
    const A = `/api/organizations/${orgA.id}`;
    const bodies: Record<string, object> = { cancel: { reason: "Thử" }, withdraw: { date: today() }, hold: { fromDate: today() } };
    const probes: [string, string][] = [
      ["GET", B],
      ["PATCH", B],
      ["POST", `${B}/branches`],
      ["PATCH", `${B}/branches/${b.branch.id}`],
      ["POST", `${B}/rooms`],
      ["GET", `${B}/accounts`],
      ["POST", `${B}/accounts`],
      ["PATCH", `${B}/accounts/${studentB.user.id}`],
      ["POST", `${B}/accounts/${studentB.user.id}/lock`],
      ["POST", `${B}/accounts/${studentB.user.id}/reset-password`],
      ["POST", `${B}/accounts/${studentB.user.id}/roles/STUDENT/revoke`],
      ["GET", `${B}/curricula`],
      ["GET", `${B}/curricula/${b.edition.id}/lessons`],
      ["GET", `${B}/classes`],
      ["POST", `${B}/classes`],
      ["GET", `${B}/classes/${b.classId}`],
      ["GET", `${B}/classes/${b.classId}/progress`],
      ["POST", `${B}/classes/${b.classId}/enrollments`],
      ["POST", `${B}/sessions/${b.sessionId}/cancel`],
      ["GET", `${B}/sessions/${b.sessionId}/attendance`],
      ["PUT", `${B}/sessions/${b.sessionId}/attendance`],
      ["POST", `${B}/enrollments/${b.enrollmentId}/hold`],
      ["GET", `${B}/students/${studentB.user.id}`],
      ["POST", `${B}/guardian-links/${linkB}/revoke`],
      ["GET", `${B}/today`],
      // URL trung tâm A, ID tài nguyên trung tâm B
      ["PATCH", `${A}/branches/${b.branch.id}`],
      ["PATCH", `${A}/rooms/${b.room.id}`],
      ["PATCH", `${A}/accounts/${studentB.user.id}`],
      ["POST", `${A}/accounts/${studentB.user.id}/lock`],
      ["GET", `${A}/classes/${b.classId}`],
      ["PATCH", `${A}/classes/${b.classId}`],
      ["GET", `${A}/classes/${b.classId}/progress`],
      ["PATCH", `${A}/sessions/${b.sessionId}`],
      ["POST", `${A}/sessions/${b.sessionId}/cancel`],
      ["GET", `${A}/sessions/${b.sessionId}/attendance`],
      ["POST", `${A}/enrollments/${b.enrollmentId}/withdraw`],
      ["GET", `${A}/students/${studentB.user.id}`],
      ["POST", `${A}/guardian-links/${linkB}/revoke`],
      ["GET", `${A}/curricula/${b.edition.id}/lessons`],
    ];
    const bad: string[] = [];
    for (const [method, path] of probes) {
      const csrf = (await x.client.get("/api/auth/csrf")).body.csrfToken;
      const r = await x.client.agent[method.toLowerCase() as "get"](path).set("x-forwarded-for", x.client.ip).set("x-csrf-token", csrf).send(bodies[path.split("/").pop()!] ?? {});
      if (r.status !== 404) bad.push(`${method} ${path} → ${r.status}`);
    }
    expect(bad).toEqual([]);
    // Không có gì bị thay đổi ở B
    expect((await prisma.user.findUniqueOrThrow({ where: { id: studentB.user.id } })).status).toBe("ACTIVE");
    expect((await prisma.classSession.findUniqueOrThrow({ where: { id: b.sessionId } })).status).toBe("SCHEDULED");
    expect((await prisma.enrollment.findUniqueOrThrow({ where: { id: b.enrollmentId } })).status).toBe("ACTIVE");
  });

  it("chỉ Super Admin dùng được API quản trị nền tảng", async () => {
    const { x, caB, studentA } = await setup();
    for (const c of [x.client, caB.client, studentA.client]) {
      expect((await c.get("/api/admin/organizations")).status).toBe(404);
      expect((await c.get("/api/admin/curricula")).status).toBe(404);
      expect((await c.post("/api/admin/organizations", { code: "Z", name: "Z" })).status).toBe(404);
    }
  });
});

describe("Ma trận vai trò ↔ workspace", () => {
  it("mỗi vai trò chỉ gọi được API của workspace mình; chưa đăng nhập → 401", async () => {
    const { x, studentA, teacherA, orgA } = await setup();
    const parent = await loggedIn(app, { phone: "+84944000009", roles: [{ role: "PARENT", organizationId: orgA.id }] });
    const cases: [string, Client, string, number][] = [
      ["học viên", studentA.client, "/api/teaching/today", 404],
      ["học viên", studentA.client, `/api/organizations/${orgA.id}/classes`, 404],
      ["học viên", studentA.client, "/api/family/children", 404],
      ["phụ huynh", parent.client, "/api/learning/overview", 404],
      ["phụ huynh", parent.client, "/api/teaching/today", 404],
      ["phụ huynh", parent.client, `/api/organizations/${orgA.id}/accounts`, 404],
      ["giáo viên", teacherA.client, `/api/organizations/${orgA.id}/accounts`, 404],
      ["giáo viên", teacherA.client, `/api/organizations/${orgA.id}/today`, 404],
      ["giáo viên", teacherA.client, "/api/learning/overview", 404],
      ["giáo viên", teacherA.client, "/api/family/children", 404],
      ["quản trị", x.client, "/api/learning/overview", 404],
    ];
    const bad: string[] = [];
    for (const [who, c, path, expected] of cases) {
      const s = (await c.get(path)).status;
      if (s !== expected) bad.push(`${who} GET ${path} → ${s}`);
    }
    const anon = new Client(app);
    for (const path of ["/api/auth/me", "/api/teaching/today", "/api/learning/overview", "/api/family/children", `/api/organizations/${orgA.id}`, "/api/admin/organizations"]) {
      const s = (await anon.get(path)).status;
      if (s !== 401) bad.push(`ẩn danh GET ${path} → ${s}`);
    }
    expect(bad).toEqual([]);
  });
});
