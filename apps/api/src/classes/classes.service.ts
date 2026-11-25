import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type ClassSession, type CourseClass } from "@prisma/client";
import type {
  AddSessionInput,
  CalendarSession,
  CancelSessionInput,
  ChangeScheduleInput,
  ChangeTeacherInput,
  ClassDetail,
  ClassPreview,
  ClassSummary,
  CreateClassInput,
  ScheduleConflict,
  SessionView,
  UpdateClassInput,
  UpdateSessionInput,
  WeeklyRuleInput,
} from "@th/contracts";
import { AppException, notFound } from "../common/app-exception";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../auth/access.service";
import type { ClientMeta } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantDb, type Tx } from "../prisma/tenant-db.service";
import { addDays, generateSlots, localDateOf, localTimeOf, plannedLessonFor, scheduleSummary, zonedToUtc } from "./schedule";

export const dateOnly = (s: string) => new Date(`${s}T00:00:00Z`);
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
const bad = (code: string, message: string, details?: unknown) => new AppException(HttpStatus.BAD_REQUEST, code, message, details);
const conflictError = (conflicts: ScheduleConflict[]) =>
  new AppException(HttpStatus.CONFLICT, "SCHEDULE_CONFLICT", "Lịch bị trùng phòng hoặc giáo viên. Vui lòng chọn giờ/phòng khác.", conflicts);

function isExclusionViolation(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /no_overlap|23P01|exclusion constraint/i.test(msg);
}

interface Slot {
  startsAt: Date;
  endsAt: Date;
  roomId: string | null;
  teacherUserId: string | null;
}

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ helpers

  private requireManage(actor: Actor, organizationId: string) {
    if (!actor.canManage(organizationId)) throw notFound();
  }

  private async assertTeacher(organizationId: string, teacherUserId: string) {
    const n = await this.prisma.roleAssignment.count({ where: { organizationId, userId: teacherUserId, role: "TEACHER", revokedAt: null } });
    if (n === 0) throw bad("TEACHER_NOT_IN_CENTER", "Giáo viên không thuộc trung tâm hoặc đã bị rút khỏi trung tâm.");
  }

  private async assertRoom(tx: Tx, organizationId: string, branchId: string, roomId: string | null | undefined) {
    if (!roomId) return;
    const room = await tx.room.findFirst({ where: { id: roomId, organizationId, branchId, status: "ACTIVE" } });
    if (!room) throw bad("ROOM_INVALID", "Phòng không thuộc cơ sở của lớp hoặc đã ngừng dùng.");
  }

  private async loadClass(tx: Tx, organizationId: string, classId: string) {
    const cls = await tx.courseClass.findFirst({ where: { id: classId, organizationId } });
    if (!cls) throw notFound();
    const branch = await tx.branch.findFirstOrThrow({ where: { id: cls.branchId } });
    return { cls, branch };
  }

  private async currentTeacherId(tx: Tx, classId: string): Promise<string | null> {
    const t = await tx.classTeacher.findFirst({ where: { classId, validTo: null }, orderBy: { validFrom: "desc" } });
    return t?.teacherUserId ?? null;
  }

  /** Tìm buổi trùng phòng/giáo viên trong trung tâm (bỏ qua buổi đã hủy và các buổi trong `exclude`). */
  private async findConflicts(tx: Tx, organizationId: string, slots: Slot[], exclude: string[] = []): Promise<ScheduleConflict[]> {
    if (slots.length === 0) return [];
    const rooms = [...new Set(slots.map((s) => s.roomId).filter(Boolean))] as string[];
    const teachers = [...new Set(slots.map((s) => s.teacherUserId).filter(Boolean))] as string[];
    if (rooms.length === 0 && teachers.length === 0) return [];
    const min = new Date(Math.min(...slots.map((s) => s.startsAt.getTime())));
    const max = new Date(Math.max(...slots.map((s) => s.endsAt.getTime())));
    const existing = await tx.classSession.findMany({
      where: {
        organizationId,
        status: { not: "CANCELLED" },
        id: { notIn: exclude },
        startsAt: { lt: max },
        endsAt: { gt: min },
        OR: [...(rooms.length ? [{ roomId: { in: rooms } }] : []), ...(teachers.length ? [{ teacherUserId: { in: teachers } }] : [])],
      },
    });
    if (existing.length === 0) return [];
    const classes = await tx.courseClass.findMany({ where: { id: { in: [...new Set(existing.map((e) => e.classId))] } }, select: { id: true, name: true } });
    const branches = await tx.branch.findMany({ where: { organizationId }, select: { id: true, timezone: true } });
    const tz = branches[0]?.timezone ?? "Asia/Ho_Chi_Minh";
    const out: ScheduleConflict[] = [];
    for (const s of slots) {
      for (const e of existing) {
        if (!(e.startsAt < s.endsAt && e.endsAt > s.startsAt)) continue;
        const withClass = classes.find((c) => c.id === e.classId)?.name ?? "";
        const base = { date: localDateOf(s.startsAt, tz), startTime: localTimeOf(s.startsAt, tz), endTime: localTimeOf(s.endsAt, tz), withClass };
        if (s.roomId && e.roomId === s.roomId) out.push({ ...base, type: "ROOM" });
        if (s.teacherUserId && e.teacherUserId === s.teacherUserId) out.push({ ...base, type: "TEACHER" });
      }
    }
    return out;
  }

  private async recordChange(tx: Tx, s: Pick<ClassSession, "id" | "organizationId">, changeType: string, by: string, before: object | null, after: object | null, reason?: string) {
    await tx.sessionChange.create({
      data: {
        organizationId: s.organizationId,
        sessionId: s.id,
        changeType,
        before: (before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (after ?? undefined) as Prisma.InputJsonValue | undefined,
        reason: reason ?? null,
        byUserId: by,
      },
    });
  }

  /** Dùng chung cho module điểm danh/workspace. */
  sessionViewsPublic(tx: Tx, sessions: ClassSession[], timezone: string): Promise<SessionView[]> {
    return this.sessionViews(tx, sessions, timezone);
  }

  private async sessionViews(tx: Tx, sessions: ClassSession[], timezone: string): Promise<SessionView[]> {
    const roomIds = [...new Set(sessions.map((s) => s.roomId).filter(Boolean))] as string[];
    const teacherIds = [...new Set(sessions.map((s) => s.teacherUserId).filter(Boolean))] as string[];
    const lessonIds = [...new Set(sessions.map((s) => s.plannedLessonId).filter(Boolean))] as string[];
    const [rooms, teachers, lessons] = await Promise.all([
      tx.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, name: true } }),
      tx.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, displayName: true } }),
      tx.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, number: true, titleVi: true } }),
    ]);
    return sessions.map((s) => ({
      id: s.id,
      number: s.number,
      kind: s.kind,
      status: s.status,
      date: localDateOf(s.startsAt, timezone),
      startTime: localTimeOf(s.startsAt, timezone),
      endTime: localTimeOf(s.endsAt, timezone),
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      room: rooms.find((r) => r.id === s.roomId) ?? null,
      teacher: teachers.find((t) => t.id === s.teacherUserId) ?? null,
      plannedLesson: lessons.find((l) => l.id === s.plannedLessonId) ?? null,
      cancelReason: s.cancelReason,
      makeupForId: s.makeupForId,
    }));
  }

  /** Kiểm tra đầu vào tạo lớp và tính các buổi dự kiến (dùng cho xem trước và tạo thật). */
  private async plan(tx: Tx, organizationId: string, input: CreateClassInput) {
    const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId, status: "ACTIVE" } });
    if (!branch) throw bad("BRANCH_INVALID", "Cơ sở không hợp lệ hoặc đã ngừng dùng.");
    const grant = await tx.organizationCurriculum.findFirst({ where: { organizationId, editionId: input.editionId, revokedAt: null } });
    const edition = grant ? await tx.curriculumEdition.findUnique({ where: { id: input.editionId } }) : null;
    if (!edition) throw bad("EDITION_NOT_GRANTED", "Trung tâm chưa được cấp phiên bản giáo trình này.");
    if (edition.status !== "ACTIVE") throw bad("EDITION_NOT_ACTIVE", "Phiên bản giáo trình chưa được đưa vào sử dụng.");
    const lessons = await tx.lesson.findMany({ where: { editionId: edition.id, status: "ACTIVE" }, orderBy: { number: "asc" } });
    if (!lessons.some((l) => l.number === input.startLessonNumber)) throw bad("START_LESSON_INVALID", "Bài bắt đầu không có trong phiên bản giáo trình.");
    await this.assertTeacher(organizationId, input.teacherUserId);
    await this.assertRoom(tx, organizationId, branch.id, input.defaultRoomId);
    const slots = generateSlots(input.startDate, input.rules, Array.from({ length: input.plannedSessions }, (_, i) => i + 1), branch.timezone);
    return { branch, edition, lessons, slots };
  }

  // ------------------------------------------------------------------ classes

  async preview(actor: Actor, organizationId: string, input: CreateClassInput): Promise<ClassPreview> {
    this.requireManage(actor, organizationId);
    return this.db.run(actor.dbScope(), async (tx) => {
      const { lessons, slots, branch } = await this.plan(tx, organizationId, input);
      const conflicts = await this.findConflicts(
        tx,
        organizationId,
        slots.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt, roomId: input.defaultRoomId ?? null, teacherUserId: input.teacherUserId })),
      );
      return {
        sessions: slots.map((s) => {
          const l = plannedLessonFor(s.number, lessons, input.startLessonNumber, input.sessionsPerLesson);
          return { number: s.number, date: s.localDate, startTime: localTimeOf(s.startsAt, branch.timezone), endTime: localTimeOf(s.endsAt, branch.timezone), plannedLesson: l && { number: l.number, titleVi: l.titleVi } };
        }),
        expectedEndDate: slots.at(-1)?.localDate ?? null,
        conflicts,
        lessonsAvailable: lessons.length,
      };
    });
  }

  async create(actor: Actor, organizationId: string, input: CreateClassInput, meta: ClientMeta) {
    this.requireManage(actor, organizationId);
    try {
      return await this.db.run(actor.dbScope(), async (tx) => {
        const { lessons, slots } = await this.plan(tx, organizationId, input);
        const conflicts = await this.findConflicts(
          tx,
          organizationId,
          slots.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt, roomId: input.defaultRoomId ?? null, teacherUserId: input.teacherUserId })),
        );
        if (conflicts.length) throw conflictError(conflicts);
        const cls = await tx.courseClass.create({
          data: {
            organizationId,
            branchId: input.branchId,
            editionId: input.editionId,
            name: input.name,
            startDate: dateOnly(input.startDate),
            plannedSessions: input.plannedSessions,
            startLessonNumber: input.startLessonNumber,
            sessionsPerLesson: input.sessionsPerLesson,
            defaultRoomId: input.defaultRoomId ?? null,
            tuitionAmount: input.tuitionAmount ?? null,
            createdById: actor.userId,
          },
        });
        await tx.classTeacher.create({ data: { organizationId, classId: cls.id, teacherUserId: input.teacherUserId, validFrom: dateOnly(input.startDate) } });
        await tx.scheduleRule.createMany({ data: input.rules.map((r) => ({ organizationId, classId: cls.id, ...r, validFrom: dateOnly(input.startDate) })) });
        await tx.classSession.createMany({
          data: slots.map((s) => ({
            organizationId,
            classId: cls.id,
            number: s.number,
            kind: "REGULAR" as const,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            roomId: input.defaultRoomId ?? null,
            teacherUserId: input.teacherUserId,
            plannedLessonId: plannedLessonFor(s.number, lessons, input.startLessonNumber, input.sessionsPerLesson)?.id ?? null,
          })),
        });
        await this.audit.record(
          { action: "class.created", resourceType: "class", resourceId: cls.id, actorUserId: actor.userId, organizationId, data: { name: cls.name, sessions: slots.length }, ip: meta.ip, requestId: meta.requestId },
          tx,
        );
        return { id: cls.id };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppException(HttpStatus.CONFLICT, "CLASS_NAME_TAKEN", "Tên lớp đã tồn tại.");
      if (isExclusionViolation(e)) throw conflictError([]);
      throw e;
    }
  }

  private async summaries(tx: Tx, classes: CourseClass[]): Promise<ClassSummary[]> {
    if (classes.length === 0) return [];
    const ids = classes.map((c) => c.id);
    const [branches, editions, teachers, rules, counts, next, lastRegular] = await Promise.all([
      tx.branch.findMany({ where: { id: { in: [...new Set(classes.map((c) => c.branchId))] } } }),
      tx.curriculumEdition.findMany({ where: { id: { in: [...new Set(classes.map((c) => c.editionId))] } }, include: { level: true } }),
      tx.classTeacher.findMany({ where: { classId: { in: ids }, validTo: null } }),
      tx.scheduleRule.findMany({ where: { classId: { in: ids }, validTo: null } }),
      tx.enrollment.groupBy({ by: ["classId"], where: { classId: { in: ids }, status: "ACTIVE" }, _count: { _all: true } }),
      tx.classSession.findMany({ where: { classId: { in: ids }, status: "SCHEDULED", startsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" }, distinct: ["classId"] }),
      tx.classSession.findMany({ where: { classId: { in: ids }, status: { not: "CANCELLED" } }, orderBy: { startsAt: "desc" }, distinct: ["classId"] }),
    ]);
    const users = await tx.user.findMany({ where: { id: { in: teachers.map((t) => t.teacherUserId) } }, select: { id: true, displayName: true } });
    const now = new Date();
    return classes.map((c) => {
      const branch = branches.find((b) => b.id === c.branchId)!;
      const edition = editions.find((e) => e.id === c.editionId)!;
      const t = teachers.find((x) => x.classId === c.id);
      const n = next.find((x) => x.classId === c.id);
      const last = lastRegular.find((x) => x.classId === c.id);
      const startDate = ymd(c.startDate);
      const today = localDateOf(now, branch.timezone);
      const phase: ClassSummary["phase"] =
        c.status === "CANCELLED" ? "CANCELLED" : c.status === "COMPLETED" || (!n && last && last.endsAt < now) ? "ENDED" : today < startDate ? "UPCOMING" : "RUNNING";
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        phase,
        level: { code: edition.level.code, nameVi: edition.level.nameVi },
        edition: { id: edition.id, name: edition.name },
        branch: { id: branch.id, name: branch.name, timezone: branch.timezone },
        teacher: t ? (users.find((u) => u.id === t.teacherUserId) ?? null) : null,
        schedule: scheduleSummary(rules.filter((r) => r.classId === c.id)),
        startDate,
        expectedEndDate: last ? localDateOf(last.startsAt, branch.timezone) : null,
        plannedSessions: c.plannedSessions,
        activeStudents: counts.find((x) => x.classId === c.id)?._count._all ?? 0,
        nextSession: n ? { date: localDateOf(n.startsAt, branch.timezone), startTime: localTimeOf(n.startsAt, branch.timezone) } : null,
      };
    });
  }

  async list(actor: Actor, organizationId: string): Promise<ClassSummary[]> {
    this.requireManage(actor, organizationId);
    return this.db.run(actor.dbScope(), async (tx) => this.summaries(tx, await tx.courseClass.findMany({ where: { organizationId }, orderBy: { startDate: "desc" } })));
  }

  /** Chi tiết lớp – dùng chung cho quản trị trung tâm và (đọc) cho giáo viên phụ trách. */
  async detailTx(tx: Tx, organizationId: string, classId: string): Promise<ClassDetail> {
    const { cls, branch } = await this.loadClass(tx, organizationId, classId);
    const [summary] = await this.summaries(tx, [cls]);
    const [rules, teacherRows, enrollments, sessions, room] = await Promise.all([
      tx.scheduleRule.findMany({ where: { classId, validTo: null }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] }),
      tx.classTeacher.findMany({ where: { classId }, orderBy: { validFrom: "asc" } }),
      tx.enrollment.findMany({ where: { classId }, orderBy: { createdAt: "asc" } }),
      tx.classSession.findMany({ where: { classId }, orderBy: { startsAt: "asc" } }),
      cls.defaultRoomId ? tx.room.findUnique({ where: { id: cls.defaultRoomId }, select: { id: true, name: true } }) : null,
    ]);
    const users = await tx.user.findMany({
      where: { id: { in: [...teacherRows.map((t) => t.teacherUserId), ...enrollments.map((e) => e.studentUserId)] } },
      include: { identities: { where: { type: "PHONE" } } },
    });
    const u = (id: string) => users.find((x) => x.id === id)!;
    return {
      ...summary!,
      defaultRoom: room,
      tuitionAmount: cls.tuitionAmount,
      startLessonNumber: cls.startLessonNumber,
      sessionsPerLesson: cls.sessionsPerLesson,
      rules: rules.map((r) => ({ weekday: r.weekday, startTime: r.startTime, endTime: r.endTime })),
      teachers: teacherRows.map((t) => ({ teacher: { id: t.teacherUserId, displayName: u(t.teacherUserId).displayName }, validFrom: ymd(t.validFrom), validTo: t.validTo ? ymd(t.validTo) : null })),
      enrollments: enrollments
        .map((e) => ({
          id: e.id,
          status: e.status,
          student: { id: e.studentUserId, displayName: u(e.studentUserId).displayName, phone: u(e.studentUserId).identities[0]?.value ?? null },
          startDate: ymd(e.startDate),
          endDate: e.endDate ? ymd(e.endDate) : null,
          holdFrom: e.holdFrom ? ymd(e.holdFrom) : null,
          holdUntil: e.holdUntil ? ymd(e.holdUntil) : null,
          note: e.note,
        }))
        .sort((a, b) => a.student.displayName.localeCompare(b.student.displayName, "vi")),
      sessions: await this.sessionViews(tx, sessions, branch.timezone),
    };
  }

  async detail(actor: Actor, organizationId: string, classId: string): Promise<ClassDetail> {
    this.requireManage(actor, organizationId);
    return this.db.run(actor.dbScope(), (tx) => this.detailTx(tx, organizationId, classId));
  }

  async update(actor: Actor, organizationId: string, classId: string, input: UpdateClassInput, meta: ClientMeta) {
    this.requireManage(actor, organizationId);
    try {
      await this.db.run(actor.dbScope(), async (tx) => {
        const { cls } = await this.loadClass(tx, organizationId, classId);
        await this.assertRoom(tx, organizationId, cls.branchId, input.defaultRoomId);
        await tx.courseClass.update({ where: { id: classId }, data: input });
        await this.audit.record({ action: "class.updated", resourceType: "class", resourceId: classId, actorUserId: actor.userId, organizationId, data: input, ip: meta.ip, requestId: meta.requestId }, tx);
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new AppException(HttpStatus.CONFLICT, "CLASS_NAME_TAKEN", "Tên lớp đã tồn tại.");
      throw e;
    }
  }

  /** Đổi giáo viên phụ trách từ một ngày: các buổi chưa học từ ngày đó chuyển sang giáo viên mới. */
  async changeTeacher(actor: Actor, organizationId: string, classId: string, input: ChangeTeacherInput, meta: ClientMeta) {
    this.requireManage(actor, organizationId);
    await this.assertTeacher(organizationId, input.teacherUserId);
    try {
      await this.db.run(actor.dbScope(), async (tx) => {
        const { branch } = await this.loadClass(tx, organizationId, classId);
        const current = await tx.classTeacher.findFirst({ where: { classId, validTo: null } });
        if (current?.teacherUserId === input.teacherUserId) throw bad("SAME_TEACHER", "Giáo viên này đang phụ trách lớp.");
        const from = dateOnly(input.fromDate);
        if (current && current.validFrom < from) {
          await tx.classTeacher.update({ where: { id: current.id }, data: { validTo: dateOnly(addDays(input.fromDate, -1)) } });
          await tx.classTeacher.create({ data: { organizationId, classId, teacherUserId: input.teacherUserId, validFrom: from } });
        } else if (current) {
          await tx.classTeacher.update({ where: { id: current.id }, data: { teacherUserId: input.teacherUserId, validFrom: from } });
        } else {
          await tx.classTeacher.create({ data: { organizationId, classId, teacherUserId: input.teacherUserId, validFrom: from } });
        }
        const startUtc = zonedToUtc(input.fromDate, "00:00", branch.timezone);
        const future = await tx.classSession.findMany({ where: { classId, status: "SCHEDULED", startsAt: { gte: startUtc } } });
        const conflicts = await this.findConflicts(
          tx,
          organizationId,
          future.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt, roomId: null, teacherUserId: input.teacherUserId })),
          future.map((s) => s.id),
        );
        if (conflicts.length) throw conflictError(conflicts);
        for (const s of future) {
          await tx.classSession.update({ where: { id: s.id }, data: { teacherUserId: input.teacherUserId, version: { increment: 1 } } });
          await this.recordChange(tx, s, "TEACHER_CHANGED", actor.userId, { teacherUserId: s.teacherUserId }, { teacherUserId: input.teacherUserId });
        }
        await this.audit.record(
          { action: "class.teacher_changed", resourceType: "class", resourceId: classId, actorUserId: actor.userId, organizationId, data: { ...input, sessions: future.length }, ip: meta.ip, requestId: meta.requestId },
          tx,
        );
      });
    } catch (e) {
      if (isExclusionViolation(e)) throw conflictError([]);
      throw e;
    }
  }

  /** Đổi lịch cố định từ một ngày: các buổi chính khóa chưa học từ ngày đó được dời theo lịch mới (giữ số buổi và bài dự kiến). */
  async changeSchedule(actor: Actor, organizationId: string, classId: string, input: ChangeScheduleInput, meta: ClientMeta) {
    this.requireManage(actor, organizationId);
    try {
      await this.db.run(actor.dbScope(), async (tx) => {
        const { cls, branch } = await this.loadClass(tx, organizationId, classId);
        await this.assertRoom(tx, organizationId, cls.branchId, input.roomId);
        const startUtc = zonedToUtc(input.fromDate, "00:00", branch.timezone);
        const moving = await tx.classSession.findMany({ where: { classId, kind: "REGULAR", status: "SCHEDULED", startsAt: { gte: startUtc } }, orderBy: { number: "asc" } });
        if (moving.length === 0) throw bad("NOTHING_TO_RESCHEDULE", "Không còn buổi chính khóa nào chưa học từ ngày này.");
        const slots = generateSlots(input.fromDate, input.rules as WeeklyRuleInput[], moving.map((s) => s.number!), branch.timezone);
        const roomId = input.roomId === undefined ? undefined : input.roomId;
        const planned = moving.map((s, i) => ({ s, slot: slots[i]!, roomId: roomId === undefined ? s.roomId : roomId }));
        const conflicts = await this.findConflicts(
          tx,
          organizationId,
          planned.map((p) => ({ startsAt: p.slot.startsAt, endsAt: p.slot.endsAt, roomId: p.roomId, teacherUserId: p.s.teacherUserId })),
          moving.map((s) => s.id),
        );
        if (conflicts.length) throw conflictError(conflicts);
        // Dời tạm ra khỏi khoảng thời gian để tránh vướng ràng buộc chồng giờ giữa chính các buổi đang dời
        for (const p of planned) {
          await tx.classSession.update({ where: { id: p.s.id }, data: { status: "CANCELLED" } });
        }
        for (const p of planned) {
          await tx.classSession.update({
            where: { id: p.s.id },
            data: { startsAt: p.slot.startsAt, endsAt: p.slot.endsAt, roomId: p.roomId, status: "SCHEDULED", version: { increment: 1 } },
          });
          await this.recordChange(
            tx,
            p.s,
            "RESCHEDULED",
            actor.userId,
            { startsAt: p.s.startsAt, endsAt: p.s.endsAt, roomId: p.s.roomId },
            { startsAt: p.slot.startsAt, endsAt: p.slot.endsAt, roomId: p.roomId },
            "Đổi lịch cố định",
          );
        }
        await tx.scheduleRule.updateMany({ where: { classId, validTo: null }, data: { validTo: dateOnly(addDays(input.fromDate, -1)) } });
        await tx.scheduleRule.createMany({ data: input.rules.map((r) => ({ organizationId, classId, ...r, validFrom: dateOnly(input.fromDate) })) });
        if (input.roomId !== undefined) await tx.courseClass.update({ where: { id: classId }, data: { defaultRoomId: input.roomId } });
        await this.audit.record(
          { action: "class.schedule_changed", resourceType: "class", resourceId: classId, actorUserId: actor.userId, organizationId, data: { fromDate: input.fromDate, sessions: moving.length }, ip: meta.ip, requestId: meta.requestId },
          tx,
        );
      });
    } catch (e) {
      if (isExclusionViolation(e)) throw conflictError([]);
      throw e;
    }
  }

  // ------------------------------------------------------------------ sessions

  private async loadSession(tx: Tx, organizationId: string, sessionId: string) {
    const s = await tx.classSession.findFirst({ where: { id: sessionId, organizationId } });
    if (!s) throw notFound();
    const { cls, branch } = await this.loadClass(tx, organizationId, s.classId);
    return { s, cls, branch };
  }

  async updateSession(actor: Actor, organizationId: string, sessionId: string, input: UpdateSessionInput, meta: ClientMeta) {
    this.requireManage(actor, organizationId);
    if (input.teacherUserId) await this.assertTeacher(organizationId, input.teacherUserId);
    try {
      await this.db.run(actor.dbScope(), async (tx) => {
        const { s, cls, branch } = await this.loadSession(tx, organizationId, sessionId);
        if (s.status !== "SCHEDULED") throw bad("SESSION_NOT_EDITABLE", "Chỉ đổi được buổi chưa diễn ra.");
        await this.assertRoom(tx, organizationId, cls.branchId, input.roomId);
        const date = input.date ?? localDateOf(s.startsAt, branch.timezone);
        const startsAt = zonedToUtc(date, input.startTime ?? localTimeOf(s.startsAt, branch.timezone), branch.timezone);
        const endsAt = zonedToUtc(date, input.endTime ?? localTimeOf(s.endsAt, branch.timezone), branch.timezone);
        if (endsAt <= startsAt) throw bad("TIME_INVALID", "Giờ kết thúc phải sau giờ bắt đầu.");
        const next = { startsAt, endsAt, roomId: input.roomId === undefined ? s.roomId : input.roomId, teacherUserId: input.teacherUserId === undefined ? s.teacherUserId : input.teacherUserId };
        const conflicts = await this.findConflicts(tx, organizationId, [next], [s.id]);
        if (conflicts.length) throw conflictError(conflicts);
        await tx.classSession.update({ where: { id: s.id }, data: { ...next, version: { increment: 1 } } });
        await this.recordChange(tx, s, "UPDATED", actor.userId, { startsAt: s.startsAt, endsAt: s.endsAt, roomId: s.roomId, teacherUserId: s.teacherUserId }, next, input.reason);
        await this.audit.record({ action: "session.updated", resourceType: "class_session", resourceId: s.id, actorUserId: actor.userId, organizationId, ip: meta.ip, requestId: meta.requestId }, tx);
      });
    } catch (e) {
      if (isExclusionViolation(e)) throw conflictError([]);
      throw e;
    }
  }

  /** Nghỉ một buổi (bắt buộc lý do); tùy chọn tạo buổi học bù kế thừa bài dự kiến. */
  async cancelSession(actor: Actor, organizationId: string, sessionId: string, input: CancelSessionInput, meta: ClientMeta) {
    this.requireManage(actor, organizationId);
    try {
      return await this.db.run(actor.dbScope(), async (tx) => {
        const { s, cls, branch } = await this.loadSession(tx, organizationId, sessionId);
        if (s.status !== "SCHEDULED") throw bad("SESSION_NOT_EDITABLE", "Chỉ cho nghỉ được buổi chưa diễn ra.");
        await tx.classSession.update({ where: { id: s.id }, data: { status: "CANCELLED", cancelReason: input.reason, version: { increment: 1 } } });
        await this.recordChange(tx, s, "CANCELLED", actor.userId, { status: s.status }, { status: "CANCELLED" }, input.reason);
        let makeupId: string | null = null;
        if (input.makeup) {
          await this.assertRoom(tx, organizationId, cls.branchId, input.makeup.roomId);
          const slot = {
            startsAt: zonedToUtc(input.makeup.date, input.makeup.startTime, branch.timezone),
            endsAt: zonedToUtc(input.makeup.date, input.makeup.endTime, branch.timezone),
            roomId: input.makeup.roomId === undefined ? s.roomId : input.makeup.roomId,
            teacherUserId: s.teacherUserId,
          };
          const conflicts = await this.findConflicts(tx, organizationId, [slot], [s.id]);
          if (conflicts.length) throw conflictError(conflicts);
          const m = await tx.classSession.create({
            data: { organizationId, classId: s.classId, kind: "MAKEUP", ...slot, plannedLessonId: s.plannedLessonId, makeupForId: s.id },
          });
          await this.recordChange(tx, m, "CREATED", actor.userId, null, { kind: "MAKEUP", makeupForId: s.id });
          makeupId = m.id;
        }
        await this.audit.record(
          { action: "session.cancelled", resourceType: "class_session", resourceId: s.id, actorUserId: actor.userId, organizationId, data: { reason: input.reason, makeupId }, ip: meta.ip, requestId: meta.requestId },
          tx,
        );
        return { makeupId };
      });
    } catch (e) {
      if (isExclusionViolation(e)) throw conflictError([]);
      throw e;
    }
  }

  async addSession(actor: Actor, organizationId: string, classId: string, input: AddSessionInput, meta: ClientMeta) {
    this.requireManage(actor, organizationId);
    try {
      return await this.db.run(actor.dbScope(), async (tx) => {
        const { cls, branch } = await this.loadClass(tx, organizationId, classId);
        await this.assertRoom(tx, organizationId, cls.branchId, input.roomId);
        if (input.plannedLessonId) {
          const l = await tx.lesson.findFirst({ where: { id: input.plannedLessonId, editionId: cls.editionId } });
          if (!l) throw bad("LESSON_INVALID", "Bài không thuộc giáo trình của lớp.");
        }
        const slot = {
          startsAt: zonedToUtc(input.date, input.startTime, branch.timezone),
          endsAt: zonedToUtc(input.date, input.endTime, branch.timezone),
          roomId: input.roomId === undefined ? cls.defaultRoomId : input.roomId,
          teacherUserId: await this.currentTeacherId(tx, classId),
        };
        const conflicts = await this.findConflicts(tx, organizationId, [slot]);
        if (conflicts.length) throw conflictError(conflicts);
        const s = await tx.classSession.create({ data: { organizationId, classId, kind: input.kind, ...slot, plannedLessonId: input.plannedLessonId ?? null } });
        await this.recordChange(tx, s, "CREATED", actor.userId, null, { kind: input.kind });
        await this.audit.record({ action: "session.added", resourceType: "class_session", resourceId: s.id, actorUserId: actor.userId, organizationId, data: { kind: input.kind }, ip: meta.ip, requestId: meta.requestId }, tx);
        return { id: s.id };
      });
    } catch (e) {
      if (isExclusionViolation(e)) throw conflictError([]);
      throw e;
    }
  }

  /** CA-06: lịch trung tâm trong khoảng thời gian. */
  async calendar(actor: Actor, organizationId: string, from: string, to: string, filter: { branchId?: string; teacherUserId?: string }): Promise<CalendarSession[]> {
    this.requireManage(actor, organizationId);
    return this.db.run(actor.dbScope(), async (tx) => this.calendarTx(tx, organizationId, from, to, filter));
  }

  async calendarTx(tx: Tx, organizationId: string, from: string, to: string, filter: { branchId?: string; teacherUserId?: string; classIds?: string[] }): Promise<CalendarSession[]> {
    const branches = await tx.branch.findMany({ where: { organizationId } });
    const tz = branches[0]?.timezone ?? "Asia/Ho_Chi_Minh";
    const classes = await tx.courseClass.findMany({
      where: { organizationId, ...(filter.branchId ? { branchId: filter.branchId } : {}), ...(filter.classIds ? { id: { in: filter.classIds } } : {}) },
    });
    const sessions = await tx.classSession.findMany({
      where: {
        organizationId,
        classId: { in: classes.map((c) => c.id) },
        startsAt: { gte: zonedToUtc(from, "00:00", tz), lt: zonedToUtc(addDays(to, 1), "00:00", tz) },
        ...(filter.teacherUserId ? { teacherUserId: filter.teacherUserId } : {}),
      },
      orderBy: { startsAt: "asc" },
    });
    const editions = await tx.curriculumEdition.findMany({ where: { id: { in: classes.map((c) => c.editionId) } }, include: { level: true } });
    const out: CalendarSession[] = [];
    for (const s of sessions) {
      const c = classes.find((x) => x.id === s.classId)!;
      const b = branches.find((x) => x.id === c.branchId)!;
      const [view] = await this.sessionViews(tx, [s], b.timezone);
      out.push({
        ...view!,
        class: { id: c.id, name: c.name, levelCode: editions.find((e) => e.id === c.editionId)!.level.code },
        branch: { id: b.id, name: b.name, timezone: b.timezone },
      });
    }
    return out;
  }
}
