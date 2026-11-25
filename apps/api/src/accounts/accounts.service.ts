import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { IssueAccountInput, IssueAccountResponse, normalizeEmail, normalizePhone } from "@th/contracts";
import { AUTH_POLICY } from "../config";
import { AppException, forbidden } from "../common/app-exception";
import { AuditService } from "../audit/audit.service";
import { AccessService } from "../auth/access.service";
import type { ClientMeta } from "../auth/auth.service";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../prisma/prisma.service";

const tempExpiry = () => new Date(Date.now() + AUTH_POLICY.temporaryPasswordTtlDays * 86_400_000);

/**
 * D-B17: trung tâm cấp tài khoản bằng SĐT/email + mật khẩu tạm (hiển thị một lần,
 * hết hạn sau 7 ngày, bắt buộc đổi ở lần đăng nhập đầu). SĐT/email đã có tài khoản
 * → chỉ gắn thêm vai trò vào tài khoản sẵn có, không tạo trùng.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async list(actorId: string, organizationId: string) {
    await this.access.assertCanManageOrganization(actorId, organizationId);
    const users = await this.prisma.user.findMany({
      where: { roleAssignments: { some: { organizationId, revokedAt: null } } },
      include: {
        identities: { orderBy: { type: "asc" } },
        credential: { select: { mustChange: true, tempExpiresAt: true } },
        roleAssignments: { where: { organizationId, revokedAt: null }, select: { role: true } },
      },
      orderBy: { displayName: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      status: u.status,
      roles: u.roleAssignments.map((r) => r.role),
      // Trung tâm cần SĐT/email đầy đủ để liên hệ người học của mình
      identities: u.identities.map((i) => ({ type: i.type, value: i.value })),
      mustChangePassword: u.credential?.mustChange ?? false,
      temporaryPasswordExpiresAt: u.credential?.mustChange ? u.credential.tempExpiresAt : null,
    }));
  }

  async issue(actorId: string, organizationId: string, input: IssueAccountInput, meta: ClientMeta): Promise<IssueAccountResponse> {
    const { superAdmin } = await this.access.assertCanManageOrganization(actorId, organizationId);
    if (input.role === "CENTER_ADMIN" && !superAdmin) {
      throw forbidden("Chỉ quản trị nền tảng được cấp tài khoản quản trị trung tâm.");
    }
    await this.access.assertWithinLimit(organizationId, input.role);

    const phone = input.phone ? normalizePhone(input.phone) : null;
    const email = input.email ? normalizeEmail(input.email) : null;
    if (input.phone && !phone) throw new AppException(HttpStatus.BAD_REQUEST, "INVALID_PHONE", "Số điện thoại không hợp lệ.");
    if (input.email && !email) throw new AppException(HttpStatus.BAD_REQUEST, "INVALID_EMAIL", "Email không hợp lệ.");

    const existing = await this.prisma.userIdentity.findMany({
      where: {
        OR: [phone ? { type: "PHONE" as const, value: phone } : undefined, email ? { type: "EMAIL" as const, value: email } : undefined].filter(
          (x): x is NonNullable<typeof x> => Boolean(x),
        ),
      },
      select: { userId: true },
    });
    const existingUserIds = [...new Set(existing.map((e) => e.userId))];
    if (existingUserIds.length > 1) {
      throw new AppException(
        HttpStatus.CONFLICT,
        "IDENTIFIER_CONFLICT",
        "Số điện thoại và email này thuộc hai tài khoản khác nhau. Vui lòng kiểm tra lại.",
      );
    }

    try {
      if (existingUserIds.length === 1) {
        return await this.linkExisting(actorId, organizationId, existingUserIds[0]!, input.role, meta);
      }
      return await this.createNew(actorId, organizationId, input, phone, email, meta);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppException(HttpStatus.CONFLICT, "ALREADY_EXISTS", "Tài khoản hoặc vai trò này đã tồn tại.");
      }
      throw e;
    }
  }

  private async linkExisting(actorId: string, organizationId: string, userId: string, role: IssueAccountInput["role"], meta: ClientMeta) {
    const has = await this.prisma.roleAssignment.count({ where: { userId, organizationId, role, revokedAt: null } });
    if (has > 0) {
      throw new AppException(HttpStatus.CONFLICT, "ALREADY_HAS_ROLE", "Người này đã có vai trò này tại trung tâm.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.roleAssignment.create({ data: { userId, organizationId, role, createdById: actorId } });
      await this.audit.record(
        { action: "account.role_linked", resourceType: "user", resourceId: userId, actorUserId: actorId, organizationId, data: { role }, ip: meta.ip, requestId: meta.requestId },
        tx,
      );
    });
    return { userId, linkedExisting: true };
  }

  private async createNew(
    actorId: string,
    organizationId: string,
    input: IssueAccountInput,
    phone: string | null,
    email: string | null,
    meta: ClientMeta,
  ): Promise<IssueAccountResponse> {
    const temporaryPassword = this.passwords.generateTemporary();
    const hash = await this.passwords.hash(temporaryPassword);
    const expiresAt = tempExpiry();
    const identities: Prisma.UserIdentityCreateWithoutUserInput[] = [];
    if (phone) identities.push({ type: "PHONE", value: phone });
    if (email) identities.push({ type: "EMAIL", value: email });

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          displayName: input.displayName,
          identities: { create: identities },
          credential: { create: { hash, mustChange: true, tempExpiresAt: expiresAt } },
          roleAssignments: { create: { role: input.role, organizationId, createdById: actorId } },
        },
      });
      await this.audit.record(
        { action: "account.issued", resourceType: "user", resourceId: created.id, actorUserId: actorId, organizationId, data: { role: input.role }, ip: meta.ip, requestId: meta.requestId },
        tx,
      );
      return created;
    });
    return { userId: user.id, linkedExisting: false, temporaryPassword, temporaryPasswordExpiresAt: expiresAt.toISOString() };
  }

  /** Cấp lại mật khẩu tạm; mọi phiên đang đăng nhập của tài khoản bị thu hồi ngay. */
  async resetPassword(actorId: string, organizationId: string, userId: string, meta: ClientMeta): Promise<IssueAccountResponse> {
    await this.access.assertControlsUser(actorId, organizationId, userId);
    const temporaryPassword = this.passwords.generateTemporary();
    const hash = await this.passwords.hash(temporaryPassword);
    const expiresAt = tempExpiry();
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordCredential.upsert({
        where: { userId },
        create: { userId, hash, mustChange: true, tempExpiresAt: expiresAt },
        update: { hash, mustChange: true, tempExpiresAt: expiresAt, changedAt: now },
      });
      await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null } });
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now, revokedReason: "PASSWORD_RESET" } });
      await this.audit.record(
        { action: "account.password_reset", resourceType: "user", resourceId: userId, actorUserId: actorId, organizationId, ip: meta.ip, requestId: meta.requestId },
        tx,
      );
    });
    return { userId, linkedExisting: true, temporaryPassword, temporaryPasswordExpiresAt: expiresAt.toISOString() };
  }

  async setLocked(actorId: string, organizationId: string, userId: string, locked: boolean, meta: ClientMeta) {
    if (actorId === userId) throw forbidden("Không thể tự khóa tài khoản của mình.");
    await this.access.assertControlsUser(actorId, organizationId, userId);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: locked ? { status: "LOCKED", tokenVersion: { increment: 1 } } : { status: "ACTIVE", failedLoginCount: 0, lockedUntil: null },
      });
      if (locked) {
        await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now, revokedReason: "ACCOUNT_LOCKED" } });
      }
      await this.audit.record(
        { action: locked ? "account.locked" : "account.unlocked", resourceType: "user", resourceId: userId, actorUserId: actorId, organizationId, ip: meta.ip, requestId: meta.requestId },
        tx,
      );
    });
    return { ok: true };
  }
}
