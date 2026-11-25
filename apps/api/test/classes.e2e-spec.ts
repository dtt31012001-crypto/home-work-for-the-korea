import type { INestApplication } from "@nestjs/common";
import { Client, createApp, loggedIn, prisma, resetDb, seedOrg, seedUser } from "./helpers";
import { addDays, isoWeekday } from "../src/classes/schedule";

let app: INestApplication;
beforeAll(async () => {
  app = await createApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(resetDb);

/** Thứ 4 kế tiếp (ngày địa phương) cách hôm nay ít nhất 7 ngày. */
function nextWednesday(): string {
  let d = addDays(new Date().toISOString().slice(0, 10), 7);
  while (isoWeekday(d) !== 3) d = addDays(d, 1);
  return d;
}

const MWF = [
  { weekday: 1, startTime: "18:00", endTime: "19:30" },
  { weekday: 3, startTime: "18:00", endTime: "19:30" },
  { weekday: 5, startTime: "18:00", endTime: "19:30" },
];

async function setup() {
  const org = await seedOrg("HZ", "Horizon");
  const orgB = await seedOrg("OTHER", "Khác");
  const branch = await prisma.branch.create({ data: { organizationId: org.id, name: "Q1", timezone: "Asia/Ho_Chi_Minh" } });
  const p101 = await prisma.room.create({ data: { organizationId: org.id, branchId: branch.id, name: "P101" } });
  const p102 = await prisma.room.create({ data: { organizationId: org.id, branchId: branch.id, name: "P102" } });
  const level = await prisma.curriculumLevel.findUniqueOrThrow({ where: { code: "TH01" } });
  const edition = await prisma.curriculumEdition.create({ data: { levelId: level.id, name: "Bản thử", status: "ACTIVE" } });
  await prisma.lesson.createMany({ data: Array.from({ length: 12 }, (_, i) => ({ editionId: edition.id, number: i + 1, titleVi: `Bài ${i + 1}` })) });
  await prisma.organizationCurriculum.create({ data: { organizationId: org.id, editionId: edition.id } });
  const t1 = await seedUser({ name: "GV Một", phone: "+84911000001", roles: [{ role: "TEACHER", organizationId: org.id }] });
  const t2 = await seedUser({ name: "GV Hai", phone: "+84911000002", roles: [{ role: "TEACHER", organizationId: org.id }] });
  const students = await Promise.all(
    [1, 2, 3].map((i) => seedUser({ name: `HV ${i}`, phone: `+8491200000${i}`, roles: [{ role: "STUDENT", organizationId: org.id }] })),
  );
  const ca = (await loggedIn(app, { phone: "+84900000002", roles: [{ role: "CENTER_ADMIN", organizationId: org.id }] })).client;
  const caB = (await loggedIn(app, { phone: "+84900000003", roles: [{ role: "CENTER_ADMIN", organizationId: orgB.id }] })).client;
  const base = (over: object = {}) => ({
    name: "TH01-K1",
    branchId: branch.id,
    editionId: edition.id,
    teacherUserId: t1.id,
    defaultRoomId: p101.id,
    startDate: nextWednesday(),
    plannedSessions: 24,
    startLessonNumber: 1,
    sessionsPerLesson: 2,
    rules: MWF,
    tuitionAmount: 3_500_000,
    ...over,
  });
  return { org, orgB, branch, p101, p102, edition, t1, t2, students, ca, caB, base };
}

const C = (orgId: string) => `/api/organizations/${orgId}`;

async function patch(c: Client, path: string, body: object) {
  return c.agent.patch(path).set("x-forwarded-for", c.ip).set("x-csrf-token", (await c.get("/api/auth/csrf")).body.csrfToken).send(body);
}

describe("Tạo lớp và sinh buổi học", () => {
  it("xem trước rồi tạo lớp: đúng 24 buổi T2-T4-T6, ngày kết thúc dự kiến, bài dự kiến mỗi buổi", async () => {
    const { org, ca, base } = await setup();
    const pv = await ca.post(`${C(org.id)}/classes/preview`, base());
    expect(pv.status).toBe(200);
    expect(pv.body.sessions).toHaveLength(24);
    expect(pv.body.conflicts).toEqual([]);
    expect(pv.body.sessions[0]).toMatchObject({ number: 1, date: base().startDate, startTime: "18:00", endTime: "19:30", plannedLesson: { number: 1 } });
    expect(pv.body.sessions[2].plannedLesson.number).toBe(2); // 2 buổi / bài
    expect(pv.body.expectedEndDate).toBe(pv.body.sessions[23].date);
    expect(await prisma.courseClass.count()).toBe(0); // xem trước không ghi gì

    const created = await ca.post(`${C(org.id)}/classes`, base());
    expect(created.status).toBe(201);
    const d = (await ca.get(`${C(org.id)}/classes/${created.body.id}`)).body;
    expect(d.sessions).toHaveLength(24);
    expect(d.schedule).toBe("T2, T4, T6 · 18:00–19:30");
    expect(d.expectedEndDate).toBe(pv.body.expectedEndDate);
    expect(d.teacher.displayName).toBe("GV Một");
    expect(d.tuitionAmount).toBe(3_500_000);
    expect(d.phase).toBe("UPCOMING");
    const list = (await ca.get(`${C(org.id)}/classes`)).body;
    expect(list).toEqual([expect.objectContaining({ name: "TH01-K1", plannedSessions: 24, level: { code: "TH01", nameVi: "Sơ cấp 1" } })]);
    expect((await ca.post(`${C(org.id)}/classes`, base({ defaultRoomId: null, teacherUserId: (await prisma.user.findFirstOrThrow({ where: { displayName: "GV Hai" } })).id }))).body.error.code).toBe("CLASS_NAME_TAKEN");
  });

  it("chặn trùng phòng và trùng giáo viên; báo rõ buổi bị trùng", async () => {
    const { org, ca, base, t2, p102 } = await setup();
    await ca.post(`${C(org.id)}/classes`, base());
    const sameRoom = await ca.post(`${C(org.id)}/classes`, base({ name: "K2", teacherUserId: t2.id }));
    expect(sameRoom.status).toBe(409);
    expect(sameRoom.body.error.code).toBe("SCHEDULE_CONFLICT");
    expect(sameRoom.body.error.details[0]).toMatchObject({ type: "ROOM", withClass: "TH01-K1", startTime: "18:00" });
    const sameTeacher = await ca.post(`${C(org.id)}/classes/preview`, base({ name: "K2", defaultRoomId: p102.id }));
    expect(sameTeacher.body.conflicts.every((c: { type: string }) => c.type === "TEACHER")).toBe(true);
    expect((await ca.post(`${C(org.id)}/classes`, base({ name: "K2", teacherUserId: t2.id, defaultRoomId: p102.id }))).status).toBe(201);
  });

  it("ràng buộc database chặn trùng phòng ngay cả khi bỏ qua kiểm tra ứng dụng", async () => {
    const { org, ca, base } = await setup();
    const id = (await ca.post(`${C(org.id)}/classes`, base())).body.id;
    const s = await prisma.classSession.findFirstOrThrow({ where: { classId: id, number: 1 } });
    await expect(
      prisma.classSession.create({ data: { organizationId: org.id, classId: id, kind: "EXTRA", startsAt: s.startsAt, endsAt: s.endsAt, roomId: s.roomId } }),
    ).rejects.toThrow(/session_room_no_overlap/);
  });

  it("chỉ dùng giáo trình được cấp và đang dùng; giáo viên phải thuộc trung tâm", async () => {
    const { org, ca, base, edition } = await setup();
    await prisma.organizationCurriculum.updateMany({ where: { editionId: edition.id }, data: { revokedAt: new Date() } });
    expect((await ca.post(`${C(org.id)}/classes`, base())).body.error.code).toBe("EDITION_NOT_GRANTED");
    await prisma.organizationCurriculum.create({ data: { organizationId: org.id, editionId: edition.id } });
    await prisma.curriculumEdition.update({ where: { id: edition.id }, data: { status: "DRAFT" } });
    expect((await ca.post(`${C(org.id)}/classes`, base())).body.error.code).toBe("EDITION_NOT_ACTIVE");
    await prisma.curriculumEdition.update({ where: { id: edition.id }, data: { status: "ACTIVE" } });
    const outsider = await seedUser({ phone: "+84919999999" });
    expect((await ca.post(`${C(org.id)}/classes`, base({ teacherUserId: outsider.id }))).body.error.code).toBe("TEACHER_NOT_IN_CENTER");
    expect((await ca.post(`${C(org.id)}/classes`, base({ startLessonNumber: 99 }))).body.error.code).toBe("START_LESSON_INVALID");
  });
});

describe("Thay đổi lịch", () => {
  it("đổi giờ một buổi, nghỉ có học bù (kế thừa bài dự kiến), thêm buổi kiểm tra; lưu lịch sử", async () => {
    const { org, ca, base, p102 } = await setup();
    const id = (await ca.post(`${C(org.id)}/classes`, base())).body.id;
    const sessions = (await ca.get(`${C(org.id)}/classes/${id}`)).body.sessions;
    const s3 = sessions[2];

    expect((await patch(ca, `${C(org.id)}/sessions/${sessions[1].id}`, { startTime: "19:00", endTime: "20:30", roomId: p102.id, reason: "GV xin đổi" })).status).toBe(204);
    const cancel = await ca.post(`${C(org.id)}/sessions/${s3.id}/cancel`, { reason: "Nghỉ lễ", makeup: { date: addDays(s3.date, 1), startTime: "18:00", endTime: "19:30" } });
    expect(cancel.status).toBe(200);
    expect((await ca.post(`${C(org.id)}/sessions/${s3.id}/cancel`, { reason: "lần 2" })).body.error.code).toBe("SESSION_NOT_EDITABLE");
    expect((await ca.post(`${C(org.id)}/classes/${id}/sessions`, { kind: "EXAM", date: addDays(base().startDate, 30), startTime: "08:00", endTime: "09:30" })).status).toBe(201);

    const after = (await ca.get(`${C(org.id)}/classes/${id}`)).body.sessions;
    expect(after.find((x: { id: string }) => x.id === sessions[1].id)).toMatchObject({ startTime: "19:00", room: { name: "P102" } });
    expect(after.find((x: { id: string }) => x.id === s3.id)).toMatchObject({ status: "CANCELLED", cancelReason: "Nghỉ lễ" });
    const makeup = after.find((x: { kind: string }) => x.kind === "MAKEUP");
    expect(makeup).toMatchObject({ makeupForId: s3.id, date: addDays(s3.date, 1), plannedLesson: { number: s3.plannedLesson.number } });
    expect(after.filter((x: { kind: string }) => x.kind === "EXAM")).toHaveLength(1);
    expect(await prisma.sessionChange.count()).toBe(4); // đổi giờ, hủy, tạo bù, tạo kiểm tra
    await expect(prisma.sessionChange.deleteMany()).rejects.toThrow(/append-only/);
  });

  it("đổi giáo viên từ một ngày: chỉ các buổi chưa học từ ngày đó chuyển sang GV mới, lưu lịch sử phân công", async () => {
    const { org, ca, base, t2 } = await setup();
    const id = (await ca.post(`${C(org.id)}/classes`, base())).body.id;
    const sessions = (await ca.get(`${C(org.id)}/classes/${id}`)).body.sessions;
    const from = sessions[10].date;
    expect((await ca.post(`${C(org.id)}/classes/${id}/teacher`, { teacherUserId: t2.id, fromDate: from })).status).toBe(204);
    const d = (await ca.get(`${C(org.id)}/classes/${id}`)).body;
    expect(d.teacher.displayName).toBe("GV Hai");
    expect(d.sessions.slice(0, 10).every((s: { teacher: { displayName: string } }) => s.teacher.displayName === "GV Một")).toBe(true);
    expect(d.sessions.slice(10).every((s: { teacher: { displayName: string } }) => s.teacher.displayName === "GV Hai")).toBe(true);
    expect(d.teachers).toEqual([
      expect.objectContaining({ teacher: expect.objectContaining({ displayName: "GV Một" }), validTo: addDays(from, -1) }),
      expect.objectContaining({ teacher: expect.objectContaining({ displayName: "GV Hai" }), validFrom: from, validTo: null }),
    ]);
  });

  it("đổi lịch cố định từ một ngày: các buổi còn lại dời sang lịch mới, giữ số buổi và bài dự kiến", async () => {
    const { org, ca, base } = await setup();
    const id = (await ca.post(`${C(org.id)}/classes`, base())).body.id;
    const before = (await ca.get(`${C(org.id)}/classes/${id}`)).body.sessions;
    const from = before[12].date;
    const res = await ca.post(`${C(org.id)}/classes/${id}/schedule`, {
      fromDate: from,
      rules: [
        { weekday: 2, startTime: "19:00", endTime: "20:30" },
        { weekday: 4, startTime: "19:00", endTime: "20:30" },
      ],
    });
    expect(res.status).toBe(204);
    const d = (await ca.get(`${C(org.id)}/classes/${id}`)).body;
    expect(d.sessions).toHaveLength(24);
    expect(d.schedule).toBe("T3, T5 · 19:00–20:30");
    const moved = d.sessions.filter((s: { number: number }) => s.number > 12);
    expect(moved.every((s: { date: string; startTime: string }) => [2, 4].includes(isoWeekday(s.date)) && s.startTime === "19:00")).toBe(true);
    expect(moved.map((s: { plannedLesson: { number: number } }) => s.plannedLesson.number)).toEqual(before.slice(12).map((s: { plannedLesson: { number: number } }) => s.plannedLesson.number));
    expect(d.sessions.slice(0, 12).map((s: { date: string }) => s.date)).toEqual(before.slice(0, 12).map((s: { date: string }) => s.date));
  });
});

describe("Ghi danh", () => {
  it("thêm học viên, bỏ qua người đã có; bảo lưu/tiếp tục; chuyển lớp giữ lịch sử; nghỉ học", async () => {
    const { org, ca, base, students, t2, p102 } = await setup();
    const k1 = (await ca.post(`${C(org.id)}/classes`, base())).body.id;
    const k2 = (await ca.post(`${C(org.id)}/classes`, base({ name: "K2", teacherUserId: t2.id, defaultRoomId: p102.id }))).body.id;
    const start = base().startDate;
    expect((await ca.post(`${C(org.id)}/classes/${k1}/enrollments`, { studentUserIds: students.map((s) => s.id), startDate: start })).body).toEqual({ added: 3, skipped: 0 });
    expect((await ca.post(`${C(org.id)}/classes/${k1}/enrollments`, { studentUserIds: [students[0]!.id], startDate: start })).body).toEqual({ added: 0, skipped: 1 });
    const outsider = await seedUser({ phone: "+84919999998" });
    expect((await ca.post(`${C(org.id)}/classes/${k1}/enrollments`, { studentUserIds: [outsider.id], startDate: start })).body.error.code).toBe("STUDENT_NOT_IN_CENTER");

    const e = (await ca.get(`${C(org.id)}/classes/${k1}`)).body.enrollments;
    const [a, b, c] = e.map((x: { id: string }) => x.id);
    expect((await ca.post(`${C(org.id)}/enrollments/${a}/hold`, { fromDate: addDays(start, 7), untilDate: addDays(start, 30), note: "Đi công tác" })).status).toBe(204);
    expect((await ca.post(`${C(org.id)}/enrollments/${a}/resume`, { date: addDays(start, 21) })).status).toBe(204);
    const tr = await ca.post(`${C(org.id)}/enrollments/${b}/transfer`, { toClassId: k2, date: addDays(start, 14) });
    expect(tr.status).toBe(201);
    expect((await ca.post(`${C(org.id)}/enrollments/${c}/withdraw`, { date: addDays(start, 10) })).status).toBe(204);

    const d1 = (await ca.get(`${C(org.id)}/classes/${k1}`)).body;
    expect(d1.enrollments.map((x: { status: string }) => x.status).sort()).toEqual(["ACTIVE", "TRANSFERRED", "WITHDRAWN"]);
    expect(d1.activeStudents).toBe(1);
    const d2 = (await ca.get(`${C(org.id)}/classes/${k2}`)).body;
    expect(d2.enrollments).toEqual([expect.objectContaining({ status: "ACTIVE", startDate: addDays(start, 14) })]);
    expect((await ca.post(`${C(org.id)}/enrollments/${b}/transfer`, { toClassId: k2, date: start })).body.error.code).toBe("ENROLLMENT_CLOSED");
  });
});

describe("Cách ly trung tâm", () => {
  it("trung tâm khác không xem/sửa được lớp, buổi học, ghi danh, lịch", async () => {
    const { org, orgB, ca, caB, base, students } = await setup();
    const id = (await ca.post(`${C(org.id)}/classes`, base())).body.id;
    await ca.post(`${C(org.id)}/classes/${id}/enrollments`, { studentUserIds: [students[0]!.id], startDate: base().startDate });
    const d = (await ca.get(`${C(org.id)}/classes/${id}`)).body;
    expect((await caB.get(`${C(org.id)}/classes/${id}`)).status).toBe(404);
    expect((await caB.get(`${C(orgB.id)}/classes/${id}`)).status).toBe(404);
    expect((await caB.post(`${C(orgB.id)}/sessions/${d.sessions[0].id}/cancel`, { reason: "x" })).status).toBe(404);
    expect((await caB.post(`${C(orgB.id)}/enrollments/${d.enrollments[0].id}/withdraw`, { date: base().startDate })).status).toBe(404);
    expect((await caB.get(`${C(orgB.id)}/classes`)).body).toEqual([]);
    expect((await caB.get(`${C(orgB.id)}/calendar?from=${base().startDate}&to=${addDays(base().startDate, 7)}`)).body).toEqual([]);
    const cal = (await ca.get(`${C(org.id)}/calendar?from=${base().startDate}&to=${addDays(base().startDate, 6)}`)).body;
    expect(cal).toHaveLength(3);
    expect(cal[0]).toMatchObject({ class: { name: "TH01-K1", levelCode: "TH01" }, room: { name: "P101" } });
  });
});
