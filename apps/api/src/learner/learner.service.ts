import { Injectable } from "@nestjs/common";
import type { AttendanceStatus, ClassSession, Enrollment } from "@prisma/client";
import type { AttendanceCounts, LearnerOverview, LearnerSession } from "@th/contracts";
import { notFound } from "../common/app-exception";
import type { Actor } from "../auth/access.service";
import { AttendanceService, inRoster, onHoldOn } from "../attendance/attendance.service";
import { ClassesService } from "../classes/classes.service";
import { addDays, localDateOf, scheduleSummary, zonedToUtc } from "../classes/schedule";
import { GuardiansService } from "../people/guardians.service";
import { TenantDb, type Tx } from "../prisma/tenant-db.service";

const TZ = "Asia/Ho_Chi_Minh";

/**
 * HV-01/02 và PH-01/02: dữ liệu của MỘT học viên trong phạm vi trung tâm được phép.
 * - Học viên: các trung tâm mình đang có vai trò học viên.
 * - Phụ huynh: chỉ trung tâm của liên kết đang hiệu lực (D-B21).
 */
@Injectable()
export class LearnerService {
  constructor(
    private readonly db: TenantDb,
    private readonly classes: ClassesService,
    private readonly attendance: AttendanceService,
    private readonly guardians: GuardiansService,
  ) {}

  /** Trung tâm người xem được phép xem dữ liệu của học viên này. */
  async scopeFor(actor: Actor, studentId: string, as: "STUDENT" | "PARENT"): Promise<string[]> {
    if (as === "STUDENT") {
      if (studentId !== actor.userId) throw notFound();
      const orgs = actor.organizationIds("STUDENT");
      if (orgs.length === 0) throw notFound();
      return orgs;
    }
    const children = await this.guardians.effectiveChildren(actor);
    const orgs = [...new Set(children.filter((c) => c.studentId === studentId).map((c) => c.organizationId))];
    if (orgs.length === 0) throw notFound();
    return orgs;
  }

  private async load(tx: Tx, studentId: string, orgIds: string[]) {
    const enrollments = await tx.enrollment.findMany({ where: { studentUserId: studentId, organizationId: { in: orgIds } } });
    const classIds = [...new Set(enrollments.map((e) => e.classId))];
    const classes = await tx.courseClass.findMany({ where: { id: { in: classIds } } });
    const [branches, editions, orgs] = await Promise.all([
      tx.branch.findMany({ where: { id: { in: classes.map((c) => c.branchId) } } }),
      tx.curriculumEdition.findMany({ where: { id: { in: classes.map((c) => c.editionId) } }, include: { level: true } }),
      tx.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }),
    ]);
    return { enrollments, classes, branches, editions, orgs };
  }

  /** Buổi học của học viên trong khoảng [from, to] (ngày địa phương), chỉ trong thời gian đã ghi danh. */
  private async sessions(tx: Tx, studentId: string, ctx: Awaited<ReturnType<LearnerService["load"]>>, from: Date, to: Date): Promise<LearnerSession[]> {
    const rows = await tx.classSession.findMany({ where: { classId: { in: ctx.classes.map((c) => c.id) }, startsAt: { gte: from, lt: to } }, orderBy: { startsAt: "asc" } });
    const att = await tx.attendance.findMany({ where: { sessionId: { in: rows.map((r) => r.id) }, studentUserId: studentId } });
    const out: LearnerSession[] = [];
    for (const s of rows) {
      const c = ctx.classes.find((x) => x.id === s.classId)!;
      const b = ctx.branches.find((x) => x.id === c.branchId)!;
      const day = localDateOf(s.startsAt, b.timezone);
      const e = this.enrollmentOn(ctx.enrollments, s, day);
      if (!e) continue;
      const [view] = await this.classes.sessionViewsPublic(tx, [s], b.timezone);
      out.push({
        ...view!,
        class: { id: c.id, name: c.name, levelCode: ctx.editions.find((x) => x.id === c.editionId)!.level.code },
        organization: ctx.orgs.find((o) => o.id === s.organizationId)!,
        branch: { name: b.name, address: b.address },
        attendance: att.find((a) => a.sessionId === s.id)?.status ?? null,
        onHold: onHoldOn(e, day),
      });
    }
    return out;
  }

  private enrollmentOn(enrollments: Enrollment[], s: ClassSession, day: string) {
    return enrollments.filter((e) => e.classId === s.classId && inRoster(e, day)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  async overview(actor: Actor, studentId: string, as: "STUDENT" | "PARENT"): Promise<LearnerOverview> {
    const orgIds = await this.scopeFor(actor, studentId, as);
    return this.db.run({ all: false, organizationIds: orgIds }, async (tx) => {
      const ctx = await this.load(tx, studentId, orgIds);
      const student = await tx.user.findUniqueOrThrow({ where: { id: studentId }, select: { id: true, displayName: true } });
      const today = localDateOf(new Date(), TZ);
      const now = new Date();
      const window = await this.sessions(tx, studentId, ctx, zonedToUtc(addDays(today, -30), "00:00", TZ), zonedToUtc(addDays(today, 60), "00:00", TZ));
      const recorded = window.filter((s) => s.attendance);
      const counts: AttendanceCounts = { PRESENT: 0, LATE: 0, EXCUSED: 0, ABSENT: 0, total: recorded.length };
      for (const s of recorded) counts[s.attendance as AttendanceStatus]++;

      const current = ctx.enrollments.filter((e) => e.status === "ACTIVE" || e.status === "ON_HOLD");
      const classes = [];
      for (const e of current) {
        const c = ctx.classes.find((x) => x.id === e.classId)!;
        const org = await tx.organization.findUniqueOrThrow({ where: { id: c.organizationId } });
        const progress = await this.attendance.progressTx(tx, c, org.behindThresholdLessons);
        const [teacherRow, rules] = await Promise.all([
          tx.classTeacher.findFirst({ where: { classId: c.id, validTo: null } }),
          tx.scheduleRule.findMany({ where: { classId: c.id, validTo: null } }),
        ]);
        const teacher = teacherRow ? await tx.user.findUnique({ where: { id: teacherRow.teacherUserId }, select: { displayName: true } }) : null;
        const ed = ctx.editions.find((x) => x.id === c.editionId)!;
        classes.push({
          id: c.id,
          name: c.name,
          level: { code: ed.level.code, nameVi: ed.level.nameVi },
          organization: ctx.orgs.find((o) => o.id === c.organizationId)!,
          enrollmentStatus: e.status,
          teacher: teacher?.displayName ?? null,
          schedule: scheduleSummary(rules),
          currentLesson: progress.lastDoneLesson,
          completedSessions: progress.completedSessions,
          plannedSessions: progress.plannedSessions,
        });
      }

      // Nhận xét giáo viên chỉ hiển thị khi giáo viên chọn chia sẻ với học viên/phụ huynh
      const comments = await tx.studentComment.findMany({
        where: { studentUserId: studentId, organizationId: { in: orgIds }, visibleToFamily: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      const commentSessions = await tx.classSession.findMany({ where: { id: { in: comments.map((c) => c.sessionId) } } });
      const authors = await tx.user.findMany({ where: { id: { in: comments.map((c) => c.authorId) } }, select: { id: true, displayName: true } });

      return {
        student,
        today,
        classes,
        todaySessions: window.filter((s) => s.date === today),
        nextSession: window.find((s) => s.status === "SCHEDULED" && new Date(s.startsAt) > now && !s.onHold) ?? null,
        attendance: counts,
        recentAttendance: recorded.filter((s) => new Date(s.startsAt) <= now).slice(-10).reverse(),
        comments: comments.map((cm) => {
          const s = commentSessions.find((x) => x.id === cm.sessionId)!;
          const c = ctx.classes.find((x) => x.id === s.classId);
          const b = ctx.branches.find((x) => x.id === c?.branchId);
          return { date: localDateOf(s.startsAt, b?.timezone ?? TZ), class: c?.name ?? "", teacher: authors.find((a) => a.id === cm.authorId)?.displayName ?? "", body: cm.body };
        }),
      };
    });
  }

  async schedule(actor: Actor, studentId: string, as: "STUDENT" | "PARENT", from: string, to: string): Promise<LearnerSession[]> {
    const orgIds = await this.scopeFor(actor, studentId, as);
    return this.db.run({ all: false, organizationIds: orgIds }, async (tx) => {
      const ctx = await this.load(tx, studentId, orgIds);
      return this.sessions(tx, studentId, ctx, zonedToUtc(from, "00:00", TZ), zonedToUtc(addDays(to, 1), "00:00", TZ));
    });
  }
}
