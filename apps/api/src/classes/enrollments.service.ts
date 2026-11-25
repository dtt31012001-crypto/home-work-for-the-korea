import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { EnrollInput } from "@th/contracts";
import { AppException, notFound } from "../common/app-exception";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../auth/access.service";
import type { ClientMeta } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantDb, type Tx } from "../prisma/tenant-db.service";
import { dateOnly } from "./classes.service";

const bad = (code: string, message: string) => new AppException(HttpStatus.BAD_REQUEST, code, message);

/** Ghi danh: thêm học viên, bảo lưu/tiếp tục, nghỉ học, chuyển lớp. Lịch sử không bị xóa. */
@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  private requireManage(actor: Actor, organizationId: string) {
    if (!actor.canManage(organizationId)) throw notFound();
  }

  private async load(tx: Tx, organizationId: string, enrollmentId: string) {
    const e = await tx.enrollment.findFirst({ where: { id: enrollmentId, organizationId } });
    if (!e) throw notFound();
    return e;
  }

  private async log(tx: Tx, actor: Actor, organizationId: string, action: string, enrollmentId: string, data: object, meta: ClientMeta) {
    await this.audit.record(
      { action, resourceType: "enrollment", resourceId: enrollmentId, actorUserId: actor.userId, organizationId, data: data as Prisma.InputJsonValue, ip: meta.ip, requestId: meta.requestId },
      tx,
    );
  }

  async enroll(actor: Actor, organizationId: string, classId: string, input: EnrollInput, meta: ClientMeta) {
    this.requireManage(actor, organizationId);
    const valid = await this.prisma.roleAssignment.findMany({
      where: { organizationId, role: "STUDENT", revokedAt: null, userId: { in: input.studentUserIds } },
      select: { userId: true },
    });
    const validIds = new Set(valid.map((v) => v.userId));
    if (input.studentUserIds.some((id) => !validIds.has(id))) throw bad("STUDENT_NOT_IN_CENTER", "Có học viên không thuộc trung tâm.");
    return this.db.run(actor.dbScope(), async (tx) => {
      const cls = await tx.courseClass.findFirst({ where: { id: classId, organizationId } });
      if (!cls) throw notFound();
      if (cls.status !== "OPEN") throw bad("CLASS_CLOSED", "Lớp đã kết thúc hoặc đã hủy.");
      const open = await tx.enrollment.findMany({ where: { classId, studentUserId: { in: input.studentUserIds }, status: { in: ["ACTIVE", "ON_HOLD"] } } });
      const already = new Set(open.map((o) => o.studentUserId));
      const toAdd = input.studentUserIds.filter((id) => !already.has(id));
      for (const studentUserId of toAdd) {
        const e = await tx.enrollment.create({ data: { organizationId, classId, studentUserId, startDate: dateOnly(input.startDate) } });
        await this.log(tx, actor, organizationId, "enrollment.created", e.id, { classId, studentUserId }, meta);
      }
      return { added: toAdd.length, skipped: already.size };
    });
  }

  /** Bảo lưu: không tính vắng, không nhận bài mới; giữ nguyên lịch sử. */
  async hold(actor: Actor, organizationId: string, enrollmentId: string, input: { fromDate: string; untilDate?: string | null; note?: string }, meta: ClientMeta) {
    this.requireManage(actor, organizationId);
    await this.db.run(actor.dbScope(), async (tx) => {
      const e = await this.load(tx, organizationId, enrollmentId);
      if (e.status !== "ACTIVE") throw bad("ENROLLMENT_NOT_ACTIVE", "Chỉ bảo lưu được học viên đang học.");
      if (input.untilDate && input.untilDate < input.fromDate) throw bad("DATE_INVALID", "Ngày quay lại phải sau ngày bảo lưu.");
      await tx.enrollment.update({
        where: { id: e.id },
        data: { status: "ON_HOLD", holdFrom: dateOnly(input.fromDate), holdUntil: input.untilDate ? dateOnly(input.untilDate) : null, note: input.note ?? e.note },
      });
      await this.log(tx, actor, organizationId, "enrollment.on_hold", e.id, input, meta);
    });
  }

  async resume(actor: Actor, organizationId: string, enrollmentId: string, input: { date: string }, meta: ClientMeta) {
    this.requireManage(actor, organizationId);
    await this.db.run(actor.dbScope(), async (tx) => {
      const e = await this.load(tx, organizationId, enrollmentId);
      if (e.status !== "ON_HOLD") throw bad("ENROLLMENT_NOT_ON_HOLD", "Học viên không ở trạng thái bảo lưu.");
      await tx.enrollment.update({ where: { id: e.id }, data: { status: "ACTIVE", holdUntil: dateOnly(input.date) } });
      await this.log(tx, actor, organizationId, "enrollment.resumed", e.id, input, meta);
    });
  }

  async withdraw(actor: Actor, organizationId: string, enrollmentId: string, input: { date: string; note?: string }, meta: ClientMeta) {
    this.requireManage(actor, organizationId);
    await this.db.run(actor.dbScope(), async (tx) => {
      const e = await this.load(tx, organizationId, enrollmentId);
      if (e.status !== "ACTIVE" && e.status !== "ON_HOLD") throw bad("ENROLLMENT_CLOSED", "Ghi danh đã kết thúc.");
      if (input.date < e.startDate.toISOString().slice(0, 10)) throw bad("DATE_INVALID", "Ngày nghỉ phải sau ngày bắt đầu học.");
      await tx.enrollment.update({ where: { id: e.id }, data: { status: "WITHDRAWN", endDate: dateOnly(input.date), note: input.note ?? e.note } });
      await this.log(tx, actor, organizationId, "enrollment.withdrawn", e.id, input, meta);
    });
  }

  /** Chuyển lớp: ghi danh cũ kết thúc (giữ lịch sử điểm danh), tạo ghi danh mới ở lớp đích từ ngày hiệu lực. */
  async transfer(actor: Actor, organizationId: string, enrollmentId: string, input: { toClassId: string; date: string; note?: string }, meta: ClientMeta) {
    this.requireManage(actor, organizationId);
    return this.db.run(actor.dbScope(), async (tx) => {
      const e = await this.load(tx, organizationId, enrollmentId);
      if (e.status !== "ACTIVE" && e.status !== "ON_HOLD") throw bad("ENROLLMENT_CLOSED", "Ghi danh đã kết thúc.");
      if (e.classId === input.toClassId) throw bad("SAME_CLASS", "Lớp đích trùng lớp hiện tại.");
      const target = await tx.courseClass.findFirst({ where: { id: input.toClassId, organizationId } });
      if (!target) throw notFound();
      if (target.status !== "OPEN") throw bad("CLASS_CLOSED", "Lớp đích đã kết thúc hoặc đã hủy.");
      const exists = await tx.enrollment.count({ where: { classId: target.id, studentUserId: e.studentUserId, status: { in: ["ACTIVE", "ON_HOLD"] } } });
      if (exists) throw new AppException(HttpStatus.CONFLICT, "ALREADY_ENROLLED", "Học viên đã có trong lớp đích.");
      const next = await tx.enrollment.create({ data: { organizationId, classId: target.id, studentUserId: e.studentUserId, startDate: dateOnly(input.date), note: input.note ?? null } });
      await tx.enrollment.update({ where: { id: e.id }, data: { status: "TRANSFERRED", endDate: dateOnly(input.date), transferredToId: next.id } });
      await this.log(tx, actor, organizationId, "enrollment.transferred", e.id, { toClassId: target.id, newEnrollmentId: next.id, date: input.date }, meta);
      return { id: next.id };
    });
  }
}
