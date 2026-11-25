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
const DAILY = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startTime: "07:00", endTime: "08:30" }));

async function put(c: Client, path: string, body: object) {
  return c.agent.put(path).set("x-forwarded-for", c.ip).set("x-csrf-token", (await c.get("/api/auth/csrf")).body.csrfToken).send(body);
}

/** Lớp học mỗi ngày, khai giảng 10 ngày trước → có buổi đã qua, hôm nay, ngày mai. */
async function setup() {
  const org = await seedOrg("HZ", "Horizon");
  const orgB = await seedOrg("OTHER", "Khác");
  const branch = await prisma.branch.create({ data: { organizationId: org.id, name: "Q1", timezone: TZ } });
  const room = await prisma.room.create({ data: { organizationId: org.id, branchId: branch.id, name: "P101" } });
  const level = await prisma.curriculumLevel.findUniqueOrThrow({ where: { code: "TH01" } });
  const edition = await prisma.curriculumEdition.create({ data: { levelId: level.id, name: "Bản thử", status: "ACTIVE" } });
  await prisma.lesson.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ editionId: edition.id, number: i + 1, titleVi: `Bài ${i + 1}` })) });
  await prisma.organizationCurriculum.create({ data: { organizationId: org.id, editionId: edition.id } });
  const t1u = await loggedIn(app, { name: "GV Một", phone: "+84911000001", roles: [{ role: "TEACHER", organizationId: org.id }] });
  const t2u = await loggedIn(app, { name: "GV Hai", phone: "+84911000002", roles: [{ role: "TEACHER", organizationId: org.id }] });
  const students = await Promise.all([1, 2, 3].map((i) => seedUser({ name: `HV ${i}`, phone: `+8491200000${i}`, roles: [{ role: "STUDENT", organizationId: org.id }] })));
  const ca = (await loggedIn(app, { phone: "+84900000002", roles: [{ role: "CENTER_ADMIN", organizationId: org.id }] })).client;
  const caB = (await loggedIn(app, { phone: "+84900000003", roles: [{ role: "CENTER_ADMIN", organizationId: orgB.id }] })).client;
  const start = addDays(today(), -10);
  const cls = await ca.post(`/api/organizations/${org.id}/classes`, {
    name: "K1",
    branchId: branch.id,
    editionId: edition.id,
    teacherUserId: t1u.user.id,
    defaultRoomId: room.id,
    startDate: start,
    plannedSessions: 30,
    startLessonNumber: 1,
    sessionsPerLesson: 1,
    rules: DAILY,
  });
  expect(cls.status).toBe(201);
  await ca.post(`/api/organizations/${org.id}/classes/${cls.body.id}/enrollments`, { studentUserIds: students.map((s) => s.id), startDate: start });
  const sessions = await prisma.classSession.findMany({ where: { classId: cls.body.id }, orderBy: { startsAt: "asc" } });
  const byDate = (d: string) => sessions.find((s) => localDateOf(s.startsAt, TZ) === d)!;
  return { org, orgB, edition, t1: t1u.client, t2: t2u.client, t1u: t1u.user, t2u: t2u.user, students, ca, caB, classId: cls.body.id as string, byDate };
}

const allPresent = (ids: string[]) => ids.map((studentUserId) => ({ studentUserId, status: "PRESENT" as const }));
const lesson = async (editionId: string, n: number) => (await prisma.lesson.findFirstOrThrow({ where: { editionId, number: n } })).id;

describe("Giáo viên điểm danh và ghi buổi học", () => {
  it("hôm nay của giáo viên: buổi hôm nay và các buổi đã qua chưa điểm danh", async () => {
    const { t1 } = await setup();
    const day = (await t1.get("/api/teaching/today")).body;
    expect(day.date).toBe(today());
    expect(day.sessions).toHaveLength(1);
    expect(day.sessions[0]).toMatchObject({ class: { name: "K1", levelCode: "TH01" }, recorded: false, room: { name: "P101" } });
    expect(day.unrecorded.length).toBeGreaterThanOrEqual(6); // 7 ngày gần nhất chưa điểm danh
  });

  it("ghi điểm danh + bài đã dạy + nhận xét; thiếu học viên thì báo; học viên bảo lưu không cần điểm danh", async () => {
    const { t1, students, edition, byDate, org, ca, classId } = await setup();
    const s = byDate(addDays(today(), -1));
    const enr = (await ca.get(`/api/organizations/${org.id}/classes/${classId}`)).body.enrollments;
    const held = enr.find((e: { student: { id: string } }) => e.student.id === students[2]!.id);
    await ca.post(`/api/organizations/${org.id}/enrollments/${held.id}/hold`, { fromDate: addDays(today(), -3) });

    const ws = (await t1.get(`/api/teaching/sessions/${s.id}`)).body;
    expect(ws.editable).toBe(true);
    expect(ws.roster.find((r: { student: { id: string } }) => r.student.id === students[2]!.id).onHold).toBe(true);
    expect(ws.session.plannedLesson.number).toBe(10);

    const incomplete = await put(t1, `/api/teaching/sessions/${s.id}`, { records: [{ studentUserId: students[0]!.id, status: "PRESENT" }], lessons: [] });
    expect(incomplete.body.error.code).toBe("ATTENDANCE_INCOMPLETE");
    const res = await put(t1, `/api/teaching/sessions/${s.id}`, {
      records: [
        { studentUserId: students[0]!.id, status: "PRESENT" },
        { studentUserId: students[1]!.id, status: "ABSENT", note: "Ốm" },
      ],
      lessons: [{ lessonId: await lesson(edition.id, 1), coverage: "DONE" }],
      note: "Ôn tập bảng chữ cái",
      comments: [{ studentUserId: students[0]!.id, body: "Phát âm tiến bộ", visibleToFamily: true }],
    });
    expect(res.status).toBe(200);
    const after = (await t1.get(`/api/teaching/sessions/${s.id}`)).body;
    expect(after.session.status).toBe("COMPLETED");
    expect(after.taught).toEqual([{ lessonId: await lesson(edition.id, 1), coverage: "DONE" }]);
    expect(after.note).toBe("Ôn tập bảng chữ cái");
    expect(after.roster.find((r: { student: { id: string } }) => r.student.id === students[0]!.id).comment).toEqual({ body: "Phát âm tiến bộ", visibleToFamily: true });
    expect(await prisma.attendanceEvent.count({ where: { sessionId: s.id } })).toBe(2);

    // Sửa trong thời hạn: lưu lịch sử
    await put(t1, `/api/teaching/sessions/${s.id}`, { records: allPresent([students[0]!.id, students[1]!.id]), lessons: [{ lessonId: await lesson(edition.id, 1), coverage: "DONE" }] });
    const events = await prisma.attendanceEvent.findMany({ where: { sessionId: s.id, studentUserId: students[1]!.id }, orderBy: { at: "asc" } });
    expect(events.map((e) => [e.before, e.after])).toEqual([
      [null, "ABSENT"],
      ["ABSENT", "PRESENT"],
    ]);
    await expect(prisma.attendanceEvent.deleteMany()).rejects.toThrow(/append-only/);
    expect((await t1.get("/api/teaching/today")).body.unrecorded.some((u: { id: string }) => u.id === s.id)).toBe(false);
  });

  it("chưa đến ngày, buổi đã nghỉ, buổi của giáo viên khác: không ghi được", async () => {
    const { t1, t2, students, byDate, org, ca } = await setup();
    const tomorrow = byDate(addDays(today(), 1));
    expect((await put(t1, `/api/teaching/sessions/${tomorrow.id}`, { records: allPresent(students.map((s) => s.id)), lessons: [] })).body.error.code).toBe("SESSION_NOT_STARTED");
    const y = byDate(addDays(today(), -2));
    expect((await put(t2, `/api/teaching/sessions/${y.id}`, { records: allPresent(students.map((s) => s.id)), lessons: [] })).status).toBe(404);
    expect((await t2.get(`/api/teaching/sessions/${y.id}`)).status).toBe(404);
    const future = byDate(addDays(today(), 3));
    await ca.post(`/api/organizations/${org.id}/sessions/${future.id}/cancel`, { reason: "Nghỉ lễ" });
    await prisma.classSession.update({ where: { id: future.id }, data: { startsAt: new Date(future.startsAt.getTime() - 4 * 86_400_000 + 3_600_000), endsAt: new Date(future.endsAt.getTime() - 4 * 86_400_000 + 3_600_000) } });
    expect((await put(t1, `/api/teaching/sessions/${future.id}`, { records: allPresent(students.map((s) => s.id)), lessons: [] })).body.error.code).toBe("SESSION_CANCELLED");
  });
});

describe("Thời hạn sửa điểm danh và yêu cầu sửa (D-B19)", () => {
  it("quá thời hạn: giáo viên gửi yêu cầu, quản lý duyệt → điểm danh cập nhật và lưu lịch sử", async () => {
    const { t1, students, byDate, org, ca } = await setup();
    const s = byDate(addDays(today(), -1));
    await put(t1, `/api/teaching/sessions/${s.id}`, { records: allPresent(students.map((x) => x.id)), lessons: [] });
    await prisma.organization.update({ where: { id: org.id }, data: { attendanceEditHours: 0 } });

    const ws = (await t1.get(`/api/teaching/sessions/${s.id}`)).body;
    expect(ws).toMatchObject({ editable: false, needsRequest: true });
    const direct = await put(t1, `/api/teaching/sessions/${s.id}`, { records: allPresent(students.map((x) => x.id)), lessons: [] });
    expect(direct.status).toBe(409);
    expect(direct.body.error.code).toBe("EDIT_WINDOW_CLOSED");

    const req = await t1.post(`/api/teaching/sessions/${s.id}/change-requests`, { changes: [{ studentUserId: students[1]!.id, status: "LATE" }], reason: "Bấm nhầm" });
    expect(req.status).toBe(201);
    expect((await t1.post(`/api/teaching/sessions/${s.id}/change-requests`, { changes: [{ studentUserId: students[1]!.id, status: "ABSENT" }], reason: "x" })).body.error.code).toBe("REQUEST_PENDING");

    const dash = (await ca.get(`/api/organizations/${org.id}/today`)).body;
    expect(dash.pendingRequests).toEqual([
      expect.objectContaining({ id: req.body.id, reason: "Bấm nhầm", requestedBy: expect.objectContaining({ displayName: "GV Một" }), changes: [expect.objectContaining({ from: "PRESENT", to: "LATE" })] }),
    ]);
    expect((await ca.post(`/api/organizations/${org.id}/attendance-requests/${req.body.id}/approve`, {})).status).toBe(204);
    const att = await prisma.attendance.findFirstOrThrow({ where: { sessionId: s.id, studentUserId: students[1]!.id } });
    expect(att.status).toBe("LATE");
    expect((await prisma.attendanceEvent.findFirstOrThrow({ where: { sessionId: s.id, after: "LATE" } })).source).toBe("REQUEST_APPROVED");
    expect((await ca.post(`/api/organizations/${org.id}/attendance-requests/${req.body.id}/reject`, {})).body.error.code).toBe("REQUEST_DECIDED");
  });

  it("buổi quá hạn mà chưa điểm danh: giáo viên gửi yêu cầu điểm danh muộn, duyệt xong buổi được ghi nhận", async () => {
    const { t1, students, byDate, org, ca } = await setup();
    const s = byDate(addDays(today(), -5));
    expect((await t1.get(`/api/teaching/sessions/${s.id}`)).body).toMatchObject({ needsRequest: true, editable: false });
    const req = await t1.post(`/api/teaching/sessions/${s.id}/change-requests`, { changes: allPresent(students.map((x) => x.id)), reason: "Quên điểm danh" });
    expect(req.status).toBe(201);
    await ca.post(`/api/organizations/${org.id}/attendance-requests/${req.body.id}/approve`, {});
    expect((await prisma.classSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("COMPLETED");
    expect(await prisma.attendance.count({ where: { sessionId: s.id } })).toBe(3);
  });

  it("từ chối yêu cầu thì điểm danh giữ nguyên", async () => {
    const { t1, students, byDate, org, ca } = await setup();
    const s = byDate(addDays(today(), -1));
    await put(t1, `/api/teaching/sessions/${s.id}`, { records: allPresent(students.map((x) => x.id)), lessons: [] });
    await prisma.organization.update({ where: { id: org.id }, data: { attendanceEditHours: 0 } });
    const req = await t1.post(`/api/teaching/sessions/${s.id}/change-requests`, { changes: [{ studentUserId: students[0]!.id, status: "ABSENT" }], reason: "x" });
    await ca.post(`/api/organizations/${org.id}/attendance-requests/${req.body.id}/reject`, { note: "Không đúng" });
    expect((await prisma.attendance.findFirstOrThrow({ where: { sessionId: s.id, studentUserId: students[0]!.id } })).status).toBe("PRESENT");
  });

  it("quản lý trung tâm sửa trực tiếp sau thời hạn phải ghi lý do", async () => {
    const { t1, students, byDate, org, ca } = await setup();
    const s = byDate(addDays(today(), -1));
    await put(t1, `/api/teaching/sessions/${s.id}`, { records: allPresent(students.map((x) => x.id)), lessons: [] });
    await prisma.organization.update({ where: { id: org.id }, data: { attendanceEditHours: 0 } });
    const records = [{ studentUserId: students[0]!.id, status: "EXCUSED" }, ...allPresent([students[1]!.id, students[2]!.id])];
    expect((await put(ca, `/api/organizations/${org.id}/sessions/${s.id}/attendance`, { records, lessons: [] })).body.error.code).toBe("REASON_REQUIRED");
    expect((await put(ca, `/api/organizations/${org.id}/sessions/${s.id}/attendance`, { records, lessons: [], reason: "Phụ huynh gửi giấy phép" })).status).toBe(200);
    expect((await prisma.attendanceEvent.findFirstOrThrow({ where: { sessionId: s.id, after: "EXCUSED" } })).reason).toBe("Phụ huynh gửi giấy phép");
  });
});

describe("Quyền giáo viên thay đổi", () => {
  it("giáo viên bị rút khỏi trung tâm mất quyền ngay; đổi giáo viên lớp → buổi sau chuyển quyền", async () => {
    const { t1, t2, t1u, t2u, byDate, org, ca, classId } = await setup();
    const tomorrow = byDate(addDays(today(), 1));
    expect((await t1.get(`/api/teaching/sessions/${tomorrow.id}`)).status).toBe(200);
    await ca.post(`/api/organizations/${org.id}/classes/${classId}/teacher`, { teacherUserId: t2u.id, fromDate: addDays(today(), 1) });
    expect((await t1.get(`/api/teaching/sessions/${tomorrow.id}`)).status).toBe(404);
    expect((await t2.get(`/api/teaching/sessions/${tomorrow.id}`)).status).toBe(200);
    expect((await t1.get(`/api/teaching/sessions/${byDate(addDays(today(), -1)).id}`)).status).toBe(200); // buổi cũ vẫn của GV cũ
    expect((await t1.get(`/api/teaching/classes/${classId}`)).status).toBe(404);
    expect((await t2.get(`/api/teaching/classes/${classId}`)).body.enrollments[0].student.phone).toBeNull(); // tối thiểu dữ liệu

    await ca.post(`/api/organizations/${org.id}/accounts/${t2u.id}/roles/TEACHER/revoke`);
    expect((await t2.get(`/api/teaching/sessions/${tomorrow.id}`)).status).toBe(404);
    expect((await t2.get("/api/teaching/today")).body.sessions).toEqual([]);
    expect(t1u.id).not.toBe(t2u.id);
  });
});

describe("Tiến độ và màn hình hôm nay của trung tâm", () => {
  it("lớp chậm từ ngưỡng trở lên được cảnh báo; học viên vắng hôm nay được liệt kê", async () => {
    const { t1, students, edition, byDate, org, ca, classId } = await setup();
    await prisma.organization.update({ where: { id: org.id }, data: { attendanceEditHours: 720 } });
    // Đã qua ~10 buổi (dự kiến tới bài 10) nhưng mới dạy xong bài 1–2
    await put(t1, `/api/teaching/sessions/${byDate(addDays(today(), -2)).id}`, { records: allPresent(students.map((x) => x.id)), lessons: [{ lessonId: await lesson(edition.id, 1), coverage: "DONE" }] });
    await put(t1, `/api/teaching/sessions/${byDate(addDays(today(), -1)).id}`, {
      records: allPresent(students.map((x) => x.id)),
      lessons: [
        { lessonId: await lesson(edition.id, 2), coverage: "DONE" },
        { lessonId: await lesson(edition.id, 3), coverage: "PARTIAL" },
      ],
    });
    const p = (await ca.get(`/api/organizations/${org.id}/classes/${classId}/progress`)).body;
    expect(p.lastDoneLesson.number).toBe(2);
    expect(p.lessons[2].status).toBe("PARTIAL");
    expect(p.behind).toBe(true);
    expect(p.behindBy).toBeGreaterThanOrEqual(7);
    expect(p.completedSessions).toBe(2);

    await put(t1, `/api/teaching/sessions/${byDate(today()).id}`, {
      records: [{ studentUserId: students[0]!.id, status: "ABSENT" }, ...allPresent([students[1]!.id, students[2]!.id])],
      lessons: [],
    });
    const dash = (await ca.get(`/api/organizations/${org.id}/today`)).body;
    expect(dash.sessions[0]).toMatchObject({ recorded: true, counts: { PRESENT: 2, ABSENT: 1, total: 3 } });
    expect(dash.absentees).toEqual([expect.objectContaining({ student: expect.objectContaining({ displayName: "HV 1" }), status: "ABSENT" })]);
    expect(dash.behindClasses).toEqual([expect.objectContaining({ name: "K1", lastDoneLesson: 2 })]);
    expect(dash.unrecorded.length).toBeGreaterThan(0);

    await prisma.organization.update({ where: { id: org.id }, data: { behindThresholdLessons: 50 } });
    expect((await ca.get(`/api/organizations/${org.id}/today`)).body.behindClasses).toEqual([]);
  });

  it("trung tâm khác không xem/sửa được điểm danh", async () => {
    const { caB, orgB, org, byDate, students } = await setup();
    const s = byDate(addDays(today(), -1));
    expect((await caB.get(`/api/organizations/${orgB.id}/sessions/${s.id}/attendance`)).status).toBe(404);
    expect((await caB.get(`/api/organizations/${org.id}/sessions/${s.id}/attendance`)).status).toBe(404);
    expect((await put(caB, `/api/organizations/${orgB.id}/sessions/${s.id}/attendance`, { records: allPresent(students.map((x) => x.id)), lessons: [], reason: "x" })).status).toBe(404);
    expect((await caB.get(`/api/organizations/${orgB.id}/today`)).body.sessions).toEqual([]);
  });
});
