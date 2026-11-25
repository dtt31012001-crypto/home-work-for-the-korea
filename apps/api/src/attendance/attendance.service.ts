import { HttpStatus, Injectable } from "@nestjs/common";
import type { AttendanceStatus, ClassSession, CourseClass, Prisma } from "@prisma/client";
import type {
  AttendanceCounts,
  CenterToday,
  ChangeRequestInput,
  ClassProgress,
  RosterEntry,
  SaveSessionInput,
  SessionWorkspace,
  TeacherDay,
} from "@th/contracts";
import { AppException, forbidden, notFound } from "../common/app-exception";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../auth/access.service";
import type { ClientMeta } from "../auth/auth.service";
import { ClassesService, ymd } from "../classes/classes.service";
import { addDays, localDateOf, zonedToUtc } from "../classes/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { TenantDb, type Tx } from "../prisma/tenant-db.service";

const bad = (code: string, message: string, details?: unknown) => new AppException(HttpStatus.BAD_REQUEST, code, message, details);

type Mode = "TEACHER" | "CENTER_ADMIN";

/** Học viên trong danh sách điểm danh của một ngày: đã ghi danh, chưa rời lớp; bảo lưu trong ngày đó thì không tính. */
export function inRoster(e: { startDate: Date; endDate: Date | null; status: string }, day: string): boolean {
  if (ymd(e.startDate) > day) return false;
  if (e.endDate && ymd(e.endDate) <= day && e.status !== "ACTIVE" && e.status !== "ON_HOLD") return false;
  return true;
}

export function onHoldOn(e: { holdFrom: Date | null; holdUntil: Date | null; status: string }, day: string): boolean {
  if (!e.holdFrom || ymd(e.holdFrom) > day) return false;
  if (e.holdUntil) return day < ymd(e.holdUntil);
  return e.status === "ON_HOLD";
}

function counts(rows: { status: AttendanceStatus }[]): AttendanceCounts {
  const c: AttendanceCounts = { PRESENT: 0, LATE: 0, EXCUSED: 0, ABSENT: 0, total: rows.length };
  for (const r of rows) c[r.status]++;
  return c;
}

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
    private readonly classes: ClassesService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- truy cập

  /** Giáo viên chỉ thao tác buổi mình dạy, khi còn vai trò giáo viên ở trung tâm; quản trị trung tâm thao tác mọi buổi của trung tâm. */
  private async loadForActor(tx: Tx, actor: Actor, sessionId: string, mode: Mode) {
    const s = await tx.classSession.findUnique({ where: { id: sessionId } });
    if (!s) throw notFound();
    if (mode === "TEACHER") {
      if (s.teacherUserId !== actor.userId || !actor.hasRole(s.organizationId, "TEACHER")) throw notFound();
    } else if (!actor.canManage(s.organizationId)) throw notFound();
    const cls = await tx.courseClass.findUniqueOrThrow({ where: { id: s.classId } });
    const [branch, org, edition] = await Promise.all([
      tx.branch.findUniqueOrThrow({ where: { id: cls.branchId } }),
      tx.organization.findUniqueOrThrow({ where: { id: s.organizationId } }),
      tx.curriculumEdition.findUniqueOrThrow({ where: { id: cls.editionId }, include: { level: true } }),
    ]);
    return { s, cls, branch, org, edition };
  }

  private deadline(s: ClassSession, editHours: number) {
    return new Date(s.endsAt.getTime() + editHours * 3_600_000);
  }

  private async rosterFor(tx: Tx, s: ClassSession, timezone: string) {
    const day = localDateOf(s.startsAt, timezone);
    const enrollments = await tx.enrollment.findMany({ where: { classId: s.classId } });
    const entries = enrollments.filter((e) => inRoster(e, day));
    // Một học viên có thể có nhiều ghi danh (vd. nghỉ rồi học lại): lấy bản mới nhất còn hiệu lực
    const byStudent = new Map<string, (typeof entries)[number]>();
    for (const e of entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) byStudent.set(e.studentUserId, e);
    return [...byStudent.values()].map((e) => ({ studentUserId: e.studentUserId, onHold: onHoldOn(e, day) }));
  }

  // ---------------------------------------------------------------- xem buổi

  async workspace(actor: Actor, sessionId: string, mode: Mode): Promise<SessionWorkspace> {
    return this.db.run(actor.dbScope(), async (tx) => {
      const { s, cls, branch, org, edition } = await this.loadForActor(tx, actor, sessionId, mode);
      const roster = await this.rosterFor(tx, s, branch.timezone);
      const ids = roster.map((r) => r.studentUserId);
      const [users, att, comments, log, taught, lessons, pending, view] = await Promise.all([
        tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }),
        tx.attendance.findMany({ where: { sessionId } }),
        tx.studentComment.findMany({ where: { sessionId } }),
        tx.sessionLog.findUnique({ where: { sessionId } }),
        tx.sessionLesson.findMany({ where: { sessionId } }),
        tx.lesson.findMany({ where: { editionId: cls.editionId, status: "ACTIVE" }, orderBy: { number: "asc" }, select: { id: true, number: true, titleVi: true } }),
        tx.attendanceChangeRequest.findFirst({ where: { sessionId, status: "PENDING" } }),
        this.classes.sessionViewsPublic(tx, [s], branch.timezone),
      ]);
      const deadline = this.deadline(s, org.attendanceEditHours);
      const now = new Date();
      const started = now >= zonedToUtc(localDateOf(s.startsAt, branch.timezone), "00:00", branch.timezone);
      const withinWindow = now <= deadline;
      const editable = s.status !== "CANCELLED" && started && (mode === "CENTER_ADMIN" || withinWindow);
      const rosterView: RosterEntry[] = roster
        .map((r) => {
          const a = att.find((x) => x.studentUserId === r.studentUserId);
          const c = comments.find((x) => x.studentUserId === r.studentUserId);
          return {
            student: users.find((u) => u.id === r.studentUserId)!,
            onHold: r.onHold,
            attendance: a ? { status: a.status, note: a.note } : null,
            comment: c ? { body: c.body, visibleToFamily: c.visibleToFamily } : null,
          };
        })
        .sort((a, b) => a.student.displayName.localeCompare(b.student.displayName, "vi"));
      return {
        session: view[0]!,
        class: { id: cls.id, name: cls.name, levelCode: edition.level.code, organizationId: org.id, organizationName: org.name, timezone: branch.timezone },
        roster: rosterView,
        lessons,
        taught: taught.map((t) => ({ lessonId: t.lessonId, coverage: t.coverage })),
        note: log?.note ?? null,
        editable,
        editDeadline: deadline.toISOString(),
        needsRequest: mode === "TEACHER" && started && !withinWindow && s.status !== "CANCELLED",
        pendingRequest: pending ? { id: pending.id, reason: pending.reason, createdAt: pending.createdAt.toISOString() } : null,
        recordedAt: att.length ? new Date(Math.max(...att.map((a) => a.recordedAt.getTime()))).toISOString() : null,
      };
    });
  }

  // ---------------------------------------------------------------- ghi buổi

  private async applyRecords(
    tx: Tx,
    s: ClassSession,
    records: SaveSessionInput["records"],
    by: string,
    source: "TEACHER" | "CENTER_ADMIN" | "REQUEST_APPROVED",
    reason?: string,
  ) {
    const existing = await tx.attendance.findMany({ where: { sessionId: s.id } });
    let changed = 0;
    for (const r of records) {
      const prev = existing.find((e) => e.studentUserId === r.studentUserId);
      const note = r.note || null;
      if (prev && prev.status === r.status && prev.note === note) continue;
      if (prev) {
        await tx.attendance.update({ where: { id: prev.id }, data: { status: r.status, note, recordedById: by, recordedAt: new Date(), version: { increment: 1 } } });
      } else {
        await tx.attendance.create({ data: { organizationId: s.organizationId, sessionId: s.id, studentUserId: r.studentUserId, status: r.status, note, recordedById: by } });
      }
      await tx.attendanceEvent.create({
        data: { organizationId: s.organizationId, sessionId: s.id, studentUserId: r.studentUserId, before: prev?.status ?? null, after: r.status, note, reason: reason ?? null, source, byUserId: by },
      });
      changed++;
    }
    return changed;
  }

  private assertRoster(roster: { studentUserId: string; onHold: boolean }[], records: { studentUserId: string }[], requireAll: boolean) {
    const allowed = new Set(roster.map((r) => r.studentUserId));
    const strangers = records.filter((r) => !allowed.has(r.studentUserId));
    if (strangers.length) throw bad("NOT_IN_ROSTER", "Có học viên không thuộc danh sách lớp trong buổi này.");
    if (requireAll) {
      const given = new Set(records.map((r) => r.studentUserId));
      const missing = roster.filter((r) => !r.onHold && !given.has(r.studentUserId));
      if (missing.length) throw bad("ATTENDANCE_INCOMPLETE", `Còn ${missing.length} học viên chưa điểm danh.`);
    }
  }

  async save(actor: Actor, sessionId: string, mode: Mode, input: SaveSessionInput, meta: ClientMeta) {
    return this.db.run(actor.dbScope(), async (tx) => {
      const { s, cls, branch, org } = await this.loadForActor(tx, actor, sessionId, mode);
      if (s.status === "CANCELLED") throw bad("SESSION_CANCELLED", "Buổi học đã nghỉ, không điểm danh.");
      const now = new Date();
      if (now < zonedToUtc(localDateOf(s.startsAt, branch.timezone), "00:00", branch.timezone)) throw bad("SESSION_NOT_STARTED", "Chưa đến ngày học, chưa điểm danh được.");
      const withinWindow = now <= this.deadline(s, org.attendanceEditHours);
      if (mode === "TEACHER" && !withinWindow) {
        throw new AppException(HttpStatus.CONFLICT, "EDIT_WINDOW_CLOSED", `Đã quá ${org.attendanceEditHours} giờ sau buổi học. Vui lòng gửi yêu cầu sửa để quản lý duyệt.`);
      }
      const firstRecord = s.status !== "COMPLETED";
      if (mode === "CENTER_ADMIN" && !withinWindow && !firstRecord && !input.reason) {
        throw bad("REASON_REQUIRED", "Sửa điểm danh sau thời hạn cần ghi lý do.");
      }
      const roster = await this.rosterFor(tx, s, branch.timezone);
      this.assertRoster(roster, input.records, true);
      const lessonIds = input.lessons.map((l) => l.lessonId);
      if (lessonIds.length) {
        const valid = await tx.lesson.count({ where: { id: { in: lessonIds }, editionId: cls.editionId } });
        if (valid !== new Set(lessonIds).size) throw bad("LESSON_INVALID", "Bài không thuộc giáo trình của lớp.");
      }

      const changed = await this.applyRecords(tx, s, input.records, actor.userId, mode, input.reason);
      await tx.sessionLesson.deleteMany({ where: { sessionId } });
      if (input.lessons.length) await tx.sessionLesson.createMany({ data: input.lessons.map((l) => ({ organizationId: s.organizationId, sessionId, ...l })) });
      await tx.sessionLog.upsert({
        where: { sessionId },
        create: { organizationId: s.organizationId, sessionId, note: input.note || null, recordedById: actor.userId },
        update: { note: input.note || null, recordedById: actor.userId },
      });
      for (const c of input.comments ?? []) {
        if (!roster.some((r) => r.studentUserId === c.studentUserId)) throw bad("NOT_IN_ROSTER", "Có học viên không thuộc danh sách lớp trong buổi này.");
        if (!c.body) {
          await tx.studentComment.deleteMany({ where: { sessionId, studentUserId: c.studentUserId } });
          continue;
        }
        await tx.studentComment.upsert({
          where: { sessionId_studentUserId: { sessionId, studentUserId: c.studentUserId } },
          create: { organizationId: s.organizationId, sessionId, studentUserId: c.studentUserId, body: c.body, visibleToFamily: c.visibleToFamily, authorId: actor.userId },
          update: { body: c.body, visibleToFamily: c.visibleToFamily, authorId: actor.userId },
        });
      }
      if (firstRecord) await tx.classSession.update({ where: { id: sessionId }, data: { status: "COMPLETED", version: { increment: 1 } } });
      await this.audit.record(
        {
          action: firstRecord ? "attendance.recorded" : "attendance.updated",
          resourceType: "class_session",
          resourceId: sessionId,
          actorUserId: actor.userId,
          organizationId: s.organizationId,
          data: { by: mode, changed, afterWindow: !withinWindow, reason: input.reason ?? null },
          ip: meta.ip,
          requestId: meta.requestId,
        },
        tx,
      );
      return { changed };
    });
  }

  // ---------------------------------------------------------------- yêu cầu sửa (D-B19)

  async requestChange(actor: Actor, sessionId: string, input: ChangeRequestInput, meta: ClientMeta) {
    return this.db.run(actor.dbScope(), async (tx) => {
      const { s, branch, org } = await this.loadForActor(tx, actor, sessionId, "TEACHER");
      if (new Date() <= this.deadline(s, org.attendanceEditHours)) throw bad("STILL_EDITABLE", "Vẫn trong thời hạn sửa: hãy sửa trực tiếp.");
      if (s.status === "CANCELLED") throw bad("SESSION_CANCELLED", "Buổi học đã nghỉ, không điểm danh.");
      this.assertRoster(await this.rosterFor(tx, s, branch.timezone), input.changes, false);
      const pending = await tx.attendanceChangeRequest.count({ where: { sessionId, status: "PENDING" } });
      if (pending) throw new AppException(HttpStatus.CONFLICT, "REQUEST_PENDING", "Buổi này đã có yêu cầu sửa đang chờ duyệt.");
      const r = await tx.attendanceChangeRequest.create({
        data: { organizationId: s.organizationId, sessionId, requestedById: actor.userId, changes: input.changes as Prisma.InputJsonValue, reason: input.reason },
      });
      await this.audit.record({ action: "attendance.change_requested", resourceType: "attendance_change_request", resourceId: r.id, actorUserId: actor.userId, organizationId: s.organizationId, data: { sessionId }, ip: meta.ip, requestId: meta.requestId }, tx);
      return { id: r.id };
    });
  }

  async decide(actor: Actor, organizationId: string, requestId: string, approve: boolean, note: string | undefined, meta: ClientMeta) {
    if (!actor.canManage(organizationId)) throw notFound();
    await this.db.run(actor.dbScope(), async (tx) => {
      const r = await tx.attendanceChangeRequest.findFirst({ where: { id: requestId, organizationId } });
      if (!r) throw notFound();
      if (r.status !== "PENDING") throw new AppException(HttpStatus.CONFLICT, "REQUEST_DECIDED", "Yêu cầu đã được xử lý.");
      this.assertNotSelfApprove(actor.userId, r.requestedById);
      const s = await tx.classSession.findUniqueOrThrow({ where: { id: r.sessionId } });
      if (approve) {
        const changes = r.changes as SaveSessionInput["records"];
        await this.applyRecords(tx, s, changes, actor.userId, "REQUEST_APPROVED", r.reason);
        // Điểm danh muộn (quá hạn mà chưa ghi) được duyệt → buổi được coi là đã học
        if (s.status === "SCHEDULED") await tx.classSession.update({ where: { id: s.id }, data: { status: "COMPLETED", version: { increment: 1 } } });
      }
      await tx.attendanceChangeRequest.update({ where: { id: r.id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: actor.userId, decidedAt: new Date(), decisionNote: note ?? null } });
      await this.audit.record(
        { action: approve ? "attendance.change_approved" : "attendance.change_rejected", resourceType: "attendance_change_request", resourceId: r.id, actorUserId: actor.userId, organizationId, data: { sessionId: r.sessionId }, ip: meta.ip, requestId: meta.requestId },
        tx,
      );
    });
  }

  // ---------------------------------------------------------------- tiến độ

  async progressTx(tx: Tx, cls: CourseClass, threshold: number): Promise<ClassProgress> {
    const [lessons, sessions] = await Promise.all([
      tx.lesson.findMany({ where: { editionId: cls.editionId, status: "ACTIVE" }, orderBy: { number: "asc" }, select: { id: true, number: true, titleVi: true } }),
      tx.classSession.findMany({ where: { classId: cls.id, status: { not: "CANCELLED" } }, orderBy: { startsAt: "asc" } }),
    ]);
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: cls.branchId } });
    const taught = await tx.sessionLesson.findMany({ where: { sessionId: { in: sessions.map((s) => s.id) } } });
    const status = (id: string) => (taught.some((t) => t.lessonId === id && t.coverage === "DONE") ? "DONE" : taught.some((t) => t.lessonId === id) ? "PARTIAL" : "NOT_STARTED");
    const pos = (id: string | null | undefined) => (id ? lessons.findIndex((l) => l.id === id) : -1);
    const startPos = Math.max(0, lessons.findIndex((l) => l.number === cls.startLessonNumber));
    const doneIdx = lessons.reduce((m, l, i) => (status(l.id) === "DONE" ? Math.max(m, i) : m), startPos - 1);
    const now = new Date();
    // Bài dự kiến lẽ ra đã dạy xong: theo các buổi đã kết thúc
    const pastPlanned = sessions.filter((s) => s.endsAt <= now && s.plannedLessonId);
    const plannedIdx = pastPlanned.length ? Math.max(...pastPlanned.map((s) => pos(s.plannedLessonId))) : startPos - 1;
    const behindBy = Math.max(0, plannedIdx - doneIdx);
    return {
      lessons: lessons.map((l) => {
        const first = sessions.find((s) => s.plannedLessonId === l.id);
        return { ...l, status: status(l.id), plannedDate: first ? localDateOf(first.startsAt, branch.timezone) : null };
      }),
      lastDoneLesson: doneIdx >= 0 && doneIdx >= startPos ? { number: lessons[doneIdx]!.number, titleVi: lessons[doneIdx]!.titleVi } : null,
      plannedLesson: plannedIdx >= 0 && plannedIdx >= startPos ? { number: lessons[plannedIdx]!.number, titleVi: lessons[plannedIdx]!.titleVi } : null,
      behindBy,
      behind: behindBy >= threshold,
      threshold,
      completedSessions: sessions.filter((s) => s.status === "COMPLETED").length,
      plannedSessions: cls.plannedSessions,
    };
  }

  async progress(actor: Actor, organizationId: string, classId: string): Promise<ClassProgress> {
    if (!actor.canManage(organizationId)) throw notFound();
    return this.db.run(actor.dbScope(), async (tx) => {
      const cls = await tx.courseClass.findFirst({ where: { id: classId, organizationId } });
      if (!cls) throw notFound();
      const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
      return this.progressTx(tx, cls, org.behindThresholdLessons);
    });
  }

  // ---------------------------------------------------------------- màn hình "Hôm nay"

  /** T-01: buổi dạy trong ngày và buổi đã qua chưa điểm danh (7 ngày), ở mọi trung tâm giáo viên đang dạy. */
  async teacherDay(actor: Actor, date?: string): Promise<TeacherDay> {
    const orgIds = actor.organizationIds("TEACHER");
    const tz = "Asia/Ho_Chi_Minh";
    const day = date ?? localDateOf(new Date(), tz);
    return this.db.run({ all: false, organizationIds: orgIds }, async (tx) => {
      const from = zonedToUtc(addDays(day, -1), "00:00", tz);
      const to = zonedToUtc(addDays(day, 2), "00:00", tz);
      const mine = await tx.classSession.findMany({ where: { teacherUserId: actor.userId, organizationId: { in: orgIds }, startsAt: { gte: from, lt: to } }, orderBy: { startsAt: "asc" } });
      const now = new Date();
      const past = await tx.classSession.findMany({
        where: { teacherUserId: actor.userId, organizationId: { in: orgIds }, status: "SCHEDULED", endsAt: { lt: now, gte: new Date(now.getTime() - 7 * 86_400_000) } },
        orderBy: { startsAt: "asc" },
      });
      const all = [...mine, ...past];
      const classes = await tx.courseClass.findMany({ where: { id: { in: [...new Set(all.map((s) => s.classId))] } } });
      const branches = await tx.branch.findMany({ where: { id: { in: classes.map((c) => c.branchId) } } });
      const orgs = await tx.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
      const editions = await tx.curriculumEdition.findMany({ where: { id: { in: classes.map((c) => c.editionId) } }, include: { level: true } });
      const att = await tx.attendance.findMany({ where: { sessionId: { in: mine.map((s) => s.id) } }, select: { sessionId: true, status: true } });
      const tzOf = (s: ClassSession) => branches.find((b) => b.id === classes.find((c) => c.id === s.classId)!.branchId)!.timezone;
      const view = async (s: ClassSession) => (await this.classes.sessionViewsPublic(tx, [s], tzOf(s)))[0]!;
      const meta = (s: ClassSession) => {
        const c = classes.find((x) => x.id === s.classId)!;
        return { class: { id: c.id, name: c.name, levelCode: editions.find((e) => e.id === c.editionId)!.level.code }, organization: orgs.find((o) => o.id === s.organizationId)! };
      };
      const todays = mine.filter((s) => localDateOf(s.startsAt, tzOf(s)) === day);
      return {
        date: day,
        sessions: await Promise.all(
          todays.map(async (s) => {
            const rows = att.filter((a) => a.sessionId === s.id);
            return { ...(await view(s)), ...meta(s), recorded: s.status === "COMPLETED", counts: rows.length ? counts(rows) : null };
          }),
        ),
        // Buổi hôm nay đã nằm trong "Lịch dạy hôm nay" (có nhãn chưa điểm danh) → không lặp lại ở đây
        unrecorded: await Promise.all(past.filter((s) => localDateOf(s.startsAt, tzOf(s)) < day).map(async (s) => ({ ...(await view(s)), ...meta(s) }))),
      };
    });
  }

  /** CA-01: tình hình hôm nay của trung tâm. */
  async centerToday(actor: Actor, organizationId: string): Promise<CenterToday> {
    if (!actor.canManage(organizationId)) throw notFound();
    return this.db.run(actor.dbScope(), async (tx) => {
      const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId } });
      const branches = await tx.branch.findMany({ where: { organizationId } });
      const tz = branches[0]?.timezone ?? "Asia/Ho_Chi_Minh";
      const day = localDateOf(new Date(), tz);
      const today = await this.classes.calendarTx(tx, organizationId, day, day, {});
      const att = await tx.attendance.findMany({ where: { sessionId: { in: today.map((s) => s.id) } } });
      const now = new Date();
      const pastUnrecorded = await tx.classSession.findMany({
        where: { organizationId, status: "SCHEDULED", endsAt: { lt: now, gte: new Date(now.getTime() - 7 * 86_400_000) } },
        orderBy: { startsAt: "asc" },
      });
      const classes = await tx.courseClass.findMany({ where: { organizationId } });
      const users = await tx.user.findMany({ where: { id: { in: [...new Set(att.map((a) => a.studentUserId))] } }, select: { id: true, displayName: true } });
      const unrecordedViews = [];
      for (const s of pastUnrecorded) {
        const c = classes.find((x) => x.id === s.classId)!;
        const b = branches.find((x) => x.id === c.branchId)!;
        // Buổi hôm nay đã hiển thị ở "Lớp học hôm nay"
        if (localDateOf(s.startsAt, b.timezone) >= day) continue;
        unrecordedViews.push({ ...(await this.classes.sessionViewsPublic(tx, [s], b.timezone))[0]!, class: { id: c.id, name: c.name } });
      }
      const behindClasses = [];
      for (const c of classes.filter((x) => x.status === "OPEN")) {
        const p = await this.progressTx(tx, c, org.behindThresholdLessons);
        if (p.behind) behindClasses.push({ id: c.id, name: c.name, behindBy: p.behindBy, plannedLesson: p.plannedLesson?.number ?? null, lastDoneLesson: p.lastDoneLesson?.number ?? null });
      }
      const requests = await tx.attendanceChangeRequest.findMany({ where: { organizationId, status: "PENDING" }, orderBy: { createdAt: "asc" } });
      const reqSessions = await tx.classSession.findMany({ where: { id: { in: requests.map((r) => r.sessionId) } } });
      const reqAtt = await tx.attendance.findMany({ where: { sessionId: { in: requests.map((r) => r.sessionId) } } });
      const reqUsers = await tx.user.findMany({
        where: { id: { in: [...requests.map((r) => r.requestedById), ...requests.flatMap((r) => (r.changes as { studentUserId: string }[]).map((c) => c.studentUserId))] } },
        select: { id: true, displayName: true },
      });
      const pendingRequests = [];
      for (const r of requests) {
        const s = reqSessions.find((x) => x.id === r.sessionId)!;
        const c = classes.find((x) => x.id === s.classId)!;
        const b = branches.find((x) => x.id === c.branchId)!;
        pendingRequests.push({
          id: r.id,
          session: (await this.classes.sessionViewsPublic(tx, [s], b.timezone))[0]!,
          class: { id: c.id, name: c.name },
          requestedBy: reqUsers.find((u) => u.id === r.requestedById)!,
          reason: r.reason,
          createdAt: r.createdAt.toISOString(),
          changes: (r.changes as { studentUserId: string; status: AttendanceStatus }[]).map((ch) => ({
            student: reqUsers.find((u) => u.id === ch.studentUserId)!,
            from: reqAtt.find((a) => a.sessionId === r.sessionId && a.studentUserId === ch.studentUserId)?.status ?? null,
            to: ch.status,
          })),
        });
      }
      return {
        date: day,
        sessions: today.map((s) => {
          const rows = att.filter((a) => a.sessionId === s.id);
          return { ...s, class: { id: s.class.id, name: s.class.name, levelCode: s.class.levelCode }, recorded: s.status === "COMPLETED", counts: rows.length ? counts(rows) : null };
        }),
        absentees: att
          .filter((a) => a.status === "ABSENT" || a.status === "EXCUSED")
          .map((a) => {
            const s = today.find((x) => x.id === a.sessionId)!;
            return { student: users.find((u) => u.id === a.studentUserId)!, class: { id: s.class.id, name: s.class.name }, status: a.status as "ABSENT" | "EXCUSED", sessionId: a.sessionId };
          }),
        unrecorded: unrecordedViews,
        behindClasses,
        pendingRequests,
      };
    });
  }

  /** T-03: lớp giáo viên đang phụ trách (không hiển thị SĐT học viên – tối thiểu dữ liệu). */
  async teacherClasses(actor: Actor) {
    const orgIds = actor.organizationIds("TEACHER");
    return this.db.run({ all: false, organizationIds: orgIds }, async (tx) => {
      const rows = await tx.classTeacher.findMany({ where: { teacherUserId: actor.userId, validTo: null, organizationId: { in: orgIds } } });
      const out = [];
      for (const r of rows) {
        const d = await this.classes.detailTx(tx, r.organizationId, r.classId);
        out.push({ ...d, organizationId: r.organizationId, enrollments: d.enrollments.map((e) => ({ ...e, student: { ...e.student, phone: null } })) });
      }
      return out;
    });
  }

  async teacherClass(actor: Actor, classId: string) {
    const orgIds = actor.organizationIds("TEACHER");
    return this.db.run({ all: false, organizationIds: orgIds }, async (tx) => {
      const assigned = await tx.classTeacher.findFirst({ where: { classId, teacherUserId: actor.userId, validTo: null, organizationId: { in: orgIds } } });
      if (!assigned) throw notFound();
      const d = await this.classes.detailTx(tx, assigned.organizationId, classId);
      const org = await tx.organization.findUniqueOrThrow({ where: { id: assigned.organizationId } });
      const cls = await tx.courseClass.findUniqueOrThrow({ where: { id: classId } });
      return {
        ...d,
        enrollments: d.enrollments.map((e) => ({ ...e, student: { ...e.student, phone: null } })),
        progress: await this.progressTx(tx, cls, org.behindThresholdLessons),
      };
    });
  }

  assertNotSelfApprove(actorId: string, requestedById: string) {
    if (actorId === requestedById) throw forbidden("Không thể tự duyệt yêu cầu của mình.");
  }
}
