import { Injectable } from "@nestjs/common";
import type { AttendanceCounts, AttendanceReport } from "@th/contracts";
import { notFound } from "../common/app-exception";
import type { Actor } from "../auth/access.service";
import { addDays, zonedToUtc } from "../classes/schedule";
import { TenantDb } from "../prisma/tenant-db.service";

const empty = (): AttendanceCounts => ({ PRESENT: 0, LATE: 0, EXCUSED: 0, ABSENT: 0, total: 0 });
const rate = (c: AttendanceCounts) => (c.total ? (c.PRESENT + c.LATE) / c.total : null);

/** CA-07: báo cáo chuyên cần theo lớp và theo học viên trong khoảng ngày. */
@Injectable()
export class AttendanceReportService {
  constructor(private readonly db: TenantDb) {}

  async report(actor: Actor, organizationId: string, from: string, to: string, classId?: string): Promise<AttendanceReport> {
    if (!actor.canManage(organizationId)) throw notFound();
    return this.db.run(actor.dbScope(), async (tx) => {
      const branches = await tx.branch.findMany({ where: { organizationId } });
      const tz = branches[0]?.timezone ?? "Asia/Ho_Chi_Minh";
      const start = zonedToUtc(from, "00:00", tz);
      const end = new Date(Math.min(zonedToUtc(addDays(to, 1), "00:00", tz).getTime(), Date.now()));
      const classes = await tx.courseClass.findMany({
        where: { organizationId, ...(classId ? { id: classId } : {}) },
        orderBy: { name: "asc" },
      });
      if (classId && classes.length === 0) throw notFound();
      const editions = await tx.curriculumEdition.findMany({ where: { id: { in: classes.map((c) => c.editionId) } }, include: { level: true } });
      const sessions = await tx.classSession.findMany({
        where: { organizationId, classId: { in: classes.map((c) => c.id) }, startsAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
        orderBy: { startsAt: "asc" },
      });
      const att = await tx.attendance.findMany({ where: { sessionId: { in: sessions.map((s) => s.id) } } });
      const teachers = await tx.classTeacher.findMany({ where: { classId: { in: classes.map((c) => c.id) }, validTo: null } });
      const people = await tx.user.findMany({
        where: { id: { in: [...new Set([...att.map((a) => a.studentUserId), ...teachers.map((t) => t.teacherUserId)])] } },
        select: { id: true, displayName: true },
      });
      const name = (id: string) => people.find((p) => p.id === id)?.displayName ?? "";

      const classRows = classes
        .map((c) => {
          const ss = sessions.filter((s) => s.classId === c.id);
          const ids = new Set(ss.map((s) => s.id));
          const rows = att.filter((a) => ids.has(a.sessionId));
          const counts = empty();
          for (const a of rows) {
            counts[a.status]++;
            counts.total++;
          }
          const t = teachers.find((x) => x.classId === c.id);
          return {
            id: c.id,
            name: c.name,
            levelCode: editions.find((e) => e.id === c.editionId)?.level.code ?? "",
            teacher: t ? name(t.teacherUserId) : null,
            heldSessions: ss.length,
            recordedSessions: new Set(rows.map((a) => a.sessionId)).size,
            counts,
            rate: rate(counts),
          };
        })
        .filter((c) => c.heldSessions > 0);

      const startsAt = new Map(sessions.map((s) => [s.id, s.startsAt.getTime()]));
      const classOf = new Map(sessions.map((s) => [s.id, classes.find((c) => c.id === s.classId)!.name]));
      const byStudent = new Map<string, typeof att>();
      for (const a of att) byStudent.set(a.studentUserId, [...(byStudent.get(a.studentUserId) ?? []), a]);
      const students = [...byStudent.entries()].map(([id, rows]) => {
        const counts = empty();
        for (const a of rows) {
          counts[a.status]++;
          counts.total++;
        }
        const recent = [...rows].sort((x, y) => startsAt.get(y.sessionId)! - startsAt.get(x.sessionId)!);
        let absentStreak = 0;
        for (const a of recent) {
          if (a.status !== "ABSENT") break;
          absentStreak++;
        }
        return { id, displayName: name(id), classes: [...new Set(rows.map((a) => classOf.get(a.sessionId)!))].sort(), counts, rate: rate(counts), absentStreak };
      });
      // Học viên cần chú ý lên đầu: vắng liên tiếp nhiều, tỷ lệ thấp
      students.sort((a, b) => b.absentStreak - a.absentStreak || (a.rate ?? 1) - (b.rate ?? 1) || a.displayName.localeCompare(b.displayName, "vi"));
      return { from, to, classes: classRows, students };
    });
  }
}
