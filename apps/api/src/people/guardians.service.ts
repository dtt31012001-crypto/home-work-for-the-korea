import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type GuardianLink } from "@prisma/client";
import { type AddGuardianInput, type ConsentRequest, type GuardianLinkView, type LinkDisplayStatus, type StudentDetail, isMinor, normalizeEmail, normalizePhone, todayVN } from "@th/contracts";
import { AppException, forbidden, notFound } from "../common/app-exception";
import { AuditService } from "../audit/audit.service";
import { AccountsService, toPersonRow } from "../accounts/accounts.service";
import type { Actor } from "../auth/access.service";
import type { ClientMeta } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantDb, type Tx } from "../prisma/tenant-db.service";

const dob = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Trạng thái hiển thị + hiệu lực thực tế của liên kết (D-B21):
 * hiệu lực khi đang ACTIVE và (học viên chưa thành niên HOẶC học viên đã đồng ý).
 * Học viên tròn 18 tuổi mà chưa đồng ý → liên kết tự tạm dừng.
 */
export function linkState(link: Pick<GuardianLink, "status" | "consentAt">, studentDob: string | null, today = todayVN()): { status: LinkDisplayStatus; effective: boolean } {
  if (link.status !== "ACTIVE") return { status: link.status, effective: false };
  if (link.consentAt || isMinor(studentDob, today)) return { status: "ACTIVE", effective: true };
  return { status: "PAUSED_ADULT", effective: false };
}

@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
    private readonly accounts: AccountsService,
    private readonly audit: AuditService,
  ) {}

  private async view(tx: Tx, links: GuardianLink[]): Promise<GuardianLinkView[]> {
    const ids = [...new Set(links.flatMap((l) => [l.guardianUserId, l.studentUserId]))];
    const users = await tx.user.findMany({ where: { id: { in: ids } }, include: { identities: { orderBy: { type: "asc" } } } });
    const u = (id: string) => users.find((x) => x.id === id)!;
    return links.map((l) => {
      const g = u(l.guardianUserId);
      const st = u(l.studentUserId);
      const state = linkState(l, dob(st.dateOfBirth));
      return {
        id: l.id,
        organizationId: l.organizationId,
        relationship: l.relationship,
        status: state.status,
        effective: state.effective,
        guardian: { id: g.id, displayName: g.displayName, identities: g.identities.map((i) => ({ type: i.type, value: i.value })) },
        student: { id: st.id, displayName: st.displayName },
        verificationNote: l.verificationNote,
        createdAt: l.createdAt.toISOString(),
      };
    });
  }

  private async assertStudent(organizationId: string, studentId: string) {
    const n = await this.prisma.roleAssignment.count({ where: { userId: studentId, organizationId, role: "STUDENT", revokedAt: null } });
    if (n === 0) throw notFound();
  }

  async studentDetail(actor: Actor, organizationId: string, studentId: string): Promise<StudentDetail> {
    if (!actor.canManage(organizationId)) throw notFound();
    await this.assertStudent(organizationId, studentId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: studentId },
      include: {
        identities: { orderBy: { type: "asc" } },
        credential: { select: { mustChange: true, tempExpiresAt: true } },
        roleAssignments: { where: { revokedAt: null }, select: { role: true, organizationId: true } },
      },
    });
    const guardians = await this.db.run(actor.dbScope(), async (tx) =>
      this.view(tx, await tx.guardianLink.findMany({ where: { organizationId, studentUserId: studentId }, orderBy: { createdAt: "desc" } })),
    );
    return { ...toPersonRow(user, organizationId), guardians };
  }

  /** Trung tâm thêm phụ huynh cho học viên: tạo/gắn tài khoản phụ huynh + tạo liên kết đã xác thực. */
  async addGuardian(actor: Actor, organizationId: string, studentId: string, input: AddGuardianInput, meta: ClientMeta) {
    if (!actor.canManage(organizationId)) throw notFound();
    await this.assertStudent(organizationId, studentId);
    const student = await this.prisma.user.findUniqueOrThrow({ where: { id: studentId } });
    const minor = isMinor(dob(student.dateOfBirth));
    if (minor && !input.verificationNote) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        "GUARDIAN_VERIFICATION_REQUIRED",
        "Học viên chưa thành niên: cần ghi rõ cách trung tâm đã xác minh người giám hộ.",
      );
    }

    // Tài khoản phụ huynh: tạo mới hoặc gắn vai trò PARENT vào tài khoản sẵn có (không trùng)
    let account;
    try {
      account = await this.accounts.issueInternal(actor.userId, organizationId, { displayName: input.displayName, phone: input.phone, email: input.email, role: "PARENT" }, meta);
    } catch (e) {
      if (!(e instanceof AppException && e.code === "ALREADY_HAS_ROLE")) throw e;
      // Người này đã là phụ huynh tại trung tâm: dùng lại tài khoản
      const ident = input.phone ? { type: "PHONE" as const, value: normalizePhone(input.phone)! } : { type: "EMAIL" as const, value: normalizeEmail(input.email!)! };
      const found = await this.prisma.userIdentity.findUniqueOrThrow({ where: { type_value: ident } });
      account = { userId: found.userId, linkedExisting: true };
    }
    if (account.userId === studentId) throw new AppException(HttpStatus.BAD_REQUEST, "SELF_LINK", "Không thể liên kết học viên với chính mình.");

    try {
      const link = await this.db.run(actor.dbScope(), async (tx) => {
        const l = await tx.guardianLink.create({
          data: {
            organizationId,
            guardianUserId: account.userId,
            studentUserId: studentId,
            relationship: input.relationship,
            status: minor ? "ACTIVE" : "PENDING_CONSENT",
            verifiedById: actor.userId,
            verificationNote: input.verificationNote ?? null,
          },
        });
        await this.audit.record(
          {
            action: "guardian_link.created",
            resourceType: "guardian_link",
            resourceId: l.id,
            actorUserId: actor.userId,
            organizationId,
            data: { studentMinor: minor, status: l.status },
            ip: meta.ip,
            requestId: meta.requestId,
          },
          tx,
        );
        return (await this.view(tx, [l]))[0]!;
      });
      return { link, account };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppException(HttpStatus.CONFLICT, "LINK_EXISTS", "Phụ huynh này đã được liên kết với học viên.");
      }
      throw e;
    }
  }

  async revokeByCenter(actor: Actor, organizationId: string, linkId: string, reason: string | undefined, meta: ClientMeta) {
    if (!actor.canManage(organizationId)) throw notFound();
    await this.db.run(actor.dbScope(), async (tx) => {
      const { count } = await tx.guardianLink.updateMany({
        where: { id: linkId, organizationId, status: { in: ["PENDING_CONSENT", "ACTIVE"] } },
        data: { status: "REVOKED", revokedAt: new Date(), revokedById: actor.userId, revokedReason: reason ?? "Trung tâm thu hồi" },
      });
      if (count === 0) throw notFound();
      await this.audit.record({ action: "guardian_link.revoked", resourceType: "guardian_link", resourceId: linkId, actorUserId: actor.userId, organizationId, data: { by: "center" }, ip: meta.ip, requestId: meta.requestId }, tx);
    });
  }

  // ----- Phía học viên / phụ huynh -----

  /** Liên kết liên quan tới tôi (là học viên hoặc phụ huynh), ở các trung tâm tôi còn vai trò. */
  async mine(actor: Actor) {
    return this.db.run(actor.dbScope(), async (tx) => {
      const asStudent = await tx.guardianLink.findMany({ where: { studentUserId: actor.userId, organizationId: { in: actor.organizationIds("STUDENT") } }, orderBy: { createdAt: "desc" } });
      const asGuardian = await tx.guardianLink.findMany({ where: { guardianUserId: actor.userId, organizationId: { in: actor.organizationIds("PARENT") } }, orderBy: { createdAt: "desc" } });
      return { asStudent: await this.view(tx, asStudent), asGuardian: await this.view(tx, asGuardian) };
    });
  }

  async consentRequests(actor: Actor): Promise<ConsentRequest[]> {
    const { asStudent } = await this.mine(actor);
    const pending = asStudent.filter((l) => l.status === "PENDING_CONSENT" || l.status === "PAUSED_ADULT");
    const orgs = await this.prisma.organization.findMany({ where: { id: { in: pending.map((l) => l.organizationId) } }, select: { id: true, name: true } });
    return pending.map((l) => ({
      id: l.id,
      organization: orgs.find((o) => o.id === l.organizationId)!,
      guardian: { displayName: l.guardian.displayName },
      relationship: l.relationship,
      status: l.status,
    }));
  }

  /** Học viên trưởng thành đồng ý / từ chối chia sẻ dữ liệu với phụ huynh. */
  async respond(actor: Actor, linkId: string, accept: boolean, meta: ClientMeta) {
    await this.db.run(actor.dbScope(), async (tx) => {
      const link = await tx.guardianLink.findFirst({
        where: { id: linkId, studentUserId: actor.userId, organizationId: { in: actor.organizationIds("STUDENT") } },
      });
      if (!link) throw notFound();
      const student = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
      const state = linkState(link, dob(student.dateOfBirth));
      if (state.status !== "PENDING_CONSENT" && state.status !== "PAUSED_ADULT") {
        throw new AppException(HttpStatus.CONFLICT, "LINK_NOT_PENDING", "Liên kết này không còn chờ xác nhận.");
      }
      const now = new Date();
      await tx.guardianLink.update({
        where: { id: linkId },
        data: accept ? { status: "ACTIVE", consentAt: now } : { status: "REJECTED", rejectedAt: now },
      });
      await this.audit.record(
        { action: accept ? "guardian_link.consented" : "guardian_link.rejected", resourceType: "guardian_link", resourceId: linkId, actorUserId: actor.userId, organizationId: link.organizationId, ip: meta.ip, requestId: meta.requestId },
        tx,
      );
    });
  }

  /** Học viên trưởng thành thu hồi, hoặc phụ huynh tự rời liên kết. Học viên chưa thành niên: do trung tâm quản lý. */
  async revokeByUser(actor: Actor, linkId: string, meta: ClientMeta) {
    await this.db.run(actor.dbScope(), async (tx) => {
      const link = await tx.guardianLink.findFirst({
        where: { id: linkId, OR: [{ studentUserId: actor.userId }, { guardianUserId: actor.userId }], status: { in: ["PENDING_CONSENT", "ACTIVE"] } },
      });
      if (!link) throw notFound();
      if (link.studentUserId === actor.userId) {
        const me = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
        if (isMinor(dob(me.dateOfBirth))) throw forbidden("Học viên chưa thành niên: vui lòng liên hệ trung tâm để thay đổi liên kết.");
      }
      await tx.guardianLink.update({
        where: { id: linkId },
        data: { status: "REVOKED", revokedAt: new Date(), revokedById: actor.userId, revokedReason: link.studentUserId === actor.userId ? "Học viên thu hồi" : "Phụ huynh rời liên kết" },
      });
      await this.audit.record({ action: "guardian_link.revoked", resourceType: "guardian_link", resourceId: linkId, actorUserId: actor.userId, organizationId: link.organizationId, data: { by: "user" }, ip: meta.ip, requestId: meta.requestId }, tx);
    });
  }

  /** Các con phụ huynh ĐƯỢC PHÉP xem (liên kết hiệu lực). Dùng cho mọi dữ liệu ở cổng phụ huynh. */
  async effectiveChildren(actor: Actor): Promise<{ linkId: string; organizationId: string; studentId: string; displayName: string; relationship: string }[]> {
    const { asGuardian } = await this.mine(actor);
    return asGuardian
      .filter((l) => l.effective)
      .map((l) => ({ linkId: l.id, organizationId: l.organizationId, studentId: l.student.id, displayName: l.student.displayName, relationship: l.relationship }));
  }
}
