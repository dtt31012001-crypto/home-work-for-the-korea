import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, type Role } from "@prisma/client";
import { ImportAccountsInput, ImportResult, ImportResultRow, IssueAccountInput, IssueAccountResponse, PersonRow, UpdateProfileInput, normalizeEmail, normalizePhone } from "@th/contracts";
import { AUTH_POLICY } from "../config";
import { AppException, forbidden, notFound } from "../common/app-exception";
import { AuditService } from "../audit/audit.service";
import { AccessService } from "../auth/access.service";
import type { ClientMeta } from "../auth/auth.service";
import { PasswordService } from "../auth/password.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantDb } from "../prisma/tenant-db.service";

type UserWithRelations = Prisma.UserGetPayload<{
  include: { identities: true; credential: { select: { mustChange: true; tempExpiresAt: true } }; roleAssignments: { select: { role: true; organizationId: true } } };
}>;

export function toPersonRow(u: UserWithRelations, organizationId: string): PersonRow {
  return {
    id: u.id,
    displayName: u.displayName,
    dateOfBirth: u.dateOfBirth ? u.dateOfBirth.toISOString().slice(0, 10) : null,
    status: u.status,
    roles: u.roleAssignments.filter((r) => r.organizationId === organizationId).map((r) => r.role),
    // Trung tâm cần SĐT/email đầy đủ để liên hệ người học của mình
    identities: u.identities.map((i) => ({ type: i.type, value: i.value })),
    mustChangePassword: u.credential?.mustChange ?? false,
    temporaryPasswordExpiresAt: u.credential?.mustChange && u.credential.tempExpiresAt ? u.credential.tempExpiresAt.toISOString() : null,
    otherCenters: u.roleAssignments.some((r) => r.organizationId !== organizationId),
  };
}

const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(`${v}T00:00:00Z`));

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
    private readonly db: TenantDb,
  ) {}

  async list(actorId: string, organizationId: string, role?: Role): Promise<PersonRow[]> {
    await this.access.assertCanManageOrganization(actorId, organizationId);
    const users = await this.prisma.user.findMany({
      where: { roleAssignments: { some: { organizationId, revokedAt: null, ...(role ? { role } : {}) } } },
      include: {
        identities: { orderBy: { type: "asc" } },
        credential: { select: { mustChange: true, tempExpiresAt: true } },
        roleAssignments: { where: { revokedAt: null }, select: { role: true, organizationId: true } },
      },
      orderBy: { displayName: "asc" },
    });
    return users.map((u) => toPersonRow(u, organizationId));
  }

  async issue(actorId: string, organizationId: string, input: IssueAccountInput, meta: ClientMeta): Promise<IssueAccountResponse> {
    const { superAdmin } = await this.access.assertCanManageOrganization(actorId, organizationId);
    if (input.role === "CENTER_ADMIN" && !superAdmin) {
      throw forbidden("Chỉ quản trị nền tảng được cấp tài khoản quản trị trung tâm.");
    }
    return this.issueInternal(actorId, organizationId, input, meta);
  }

  /** Dùng chung cho cấp tài khoản và tạo tài khoản phụ huynh (role PARENT). Người gọi đã kiểm tra quyền. */
  async issueInternal(
    actorId: string,
    organizationId: string,
    input: Omit<IssueAccountInput, "role"> & { role: Role },
    meta: ClientMeta,
  ): Promise<IssueAccountResponse> {
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
        return await this.linkExisting(actorId, organizationId, existingUserIds[0]!, input.role, meta, input.dateOfBirth);
      }
      return await this.createNew(actorId, organizationId, input, phone, email, meta);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppException(HttpStatus.CONFLICT, "ALREADY_EXISTS", "Tài khoản hoặc vai trò này đã tồn tại.");
      }
      throw e;
    }
  }

  private async linkExisting(actorId: string, organizationId: string, userId: string, role: Role, meta: ClientMeta, dateOfBirth?: string) {
    const has = await this.prisma.roleAssignment.count({ where: { userId, organizationId, role, revokedAt: null } });
    if (has > 0) {
      throw new AppException(HttpStatus.CONFLICT, "ALREADY_HAS_ROLE", "Người này đã có vai trò này tại trung tâm.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.roleAssignment.create({ data: { userId, organizationId, role, createdById: actorId } });
      if (dateOfBirth) await tx.user.updateMany({ where: { id: userId, dateOfBirth: null }, data: { dateOfBirth: toDate(dateOfBirth) } });
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
    input: Omit<IssueAccountInput, "role"> & { role: Role },
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
          dateOfBirth: toDate(input.dateOfBirth),
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
    return this.applyReset(actorId, organizationId, userId, meta);
  }

  async setLocked(actorId: string, organizationId: string, userId: string, locked: boolean, meta: ClientMeta) {
    if (actorId === userId) throw forbidden("Không thể tự khóa tài khoản của mình.");
    await this.access.assertControlsUser(actorId, organizationId, userId);
    return this.applyLock(actorId, organizationId, userId, locked, meta);
  }

  /** SA-03: Super Admin thao tác ở cấp nền tảng (kể cả người không thuộc trung tâm nào). */
  async platformResetPassword(actorId: string, userId: string, meta: ClientMeta) {
    await this.assertPlatformTarget(actorId, userId);
    return this.applyReset(actorId, null, userId, meta);
  }

  async platformSetLocked(actorId: string, userId: string, locked: boolean, meta: ClientMeta) {
    if (actorId === userId) throw forbidden("Không thể tự khóa tài khoản của mình.");
    await this.assertPlatformTarget(actorId, userId);
    return this.applyLock(actorId, null, userId, locked, meta);
  }

  private async assertPlatformTarget(actorId: string, userId: string) {
    if (!(await this.access.isSuperAdmin(actorId))) throw notFound();
    const exists = await this.prisma.user.count({ where: { id: userId } });
    if (!exists) throw notFound();
  }

  private async applyReset(actorId: string, organizationId: string | null, userId: string, meta: ClientMeta): Promise<IssueAccountResponse> {
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

  private async applyLock(actorId: string, organizationId: string | null, userId: string, locked: boolean, meta: ClientMeta) {
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

  /**
   * C-07: nhập danh sách học viên/giáo viên. Mỗi dòng đi qua đúng quy tắc của cấp tài khoản lẻ
   * (không tạo trùng; SĐT/email đã có → gắn thêm vai trò). Chạy thử trước (dryRun) để xem lỗi.
   * Khi chạy thật, dòng lỗi được bỏ qua, các dòng hợp lệ vẫn được tạo.
   */
  async importAccounts(actorId: string, organizationId: string, input: ImportAccountsInput, meta: ClientMeta): Promise<ImportResult> {
    await this.access.assertCanManageOrganization(actorId, organizationId);
    const rows: ImportResultRow[] = [];
    const seen = new Map<string, number>();
    let expiresAt: string | null = null;
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { maxStudents: true, maxTeachers: true } });
    const limit = input.role === "STUDENT" ? org.maxStudents : org.maxTeachers;
    let current = await this.prisma.roleAssignment.count({ where: { organizationId, role: input.role, revokedAt: null } });

    for (const [i, raw] of input.rows.entries()) {
      const line = i + 2;
      const phone = raw.phone ? normalizePhone(raw.phone) : null;
      const email = raw.email ? normalizeEmail(raw.email) : null;
      const identifier = [raw.phone, raw.email].filter(Boolean).join(" / ");
      const base = { line, displayName: raw.displayName, identifier };
      const err = (message: string) => rows.push({ ...base, outcome: "ERROR", message });
      if (!raw.displayName) {
        err("Thiếu họ tên");
        continue;
      }
      if (!raw.phone && !raw.email) {
        err("Cần số điện thoại hoặc email");
        continue;
      }
      if (raw.phone && !phone) {
        err("Số điện thoại không hợp lệ");
        continue;
      }
      if (raw.email && !email) {
        err("Email không hợp lệ");
        continue;
      }
      if (raw.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(raw.dateOfBirth)) {
        err("Ngày sinh phải theo dạng NNNN-TT-NN (vd. 2010-05-31)");
        continue;
      }
      const keys = [phone && `p:${phone}`, email && `e:${email}`].filter((k): k is string => Boolean(k));
      const dup = keys.map((k) => seen.get(k)).find((x) => x !== undefined);
      if (dup !== undefined) {
        err(`Trùng với dòng ${dup} trong file`);
        continue;
      }
      keys.forEach((k) => seen.set(k, line));

      const existing = await this.prisma.userIdentity.findMany({
        where: { OR: [phone ? { type: "PHONE" as const, value: phone } : undefined, email ? { type: "EMAIL" as const, value: email } : undefined].filter((x): x is NonNullable<typeof x> => Boolean(x)) },
        select: { userId: true },
      });
      const ids = [...new Set(existing.map((e) => e.userId))];
      if (ids.length > 1) {
        err("Số điện thoại và email thuộc hai tài khoản khác nhau");
        continue;
      }
      if (ids.length === 1) {
        const has = await this.prisma.roleAssignment.count({ where: { userId: ids[0], organizationId, role: input.role, revokedAt: null } });
        if (has) {
          rows.push({ ...base, outcome: "ALREADY_HAS_ROLE", message: "Đã có trong trung tâm – bỏ qua" });
          continue;
        }
      }
      if (limit != null && current >= limit) {
        err(`Vượt giới hạn ${limit} tài khoản của gói hiện tại`);
        continue;
      }
      current++;
      const outcome = ids.length === 1 ? "LINK_EXISTING" : "CREATE";
      if (input.dryRun) {
        rows.push({ ...base, outcome, message: outcome === "LINK_EXISTING" ? "Đã có tài khoản – sẽ gắn thêm vai trò, không cấp mật khẩu mới" : null });
        continue;
      }
      try {
        const r = await this.issueInternal(
          actorId,
          organizationId,
          { displayName: raw.displayName, phone: raw.phone || undefined, email: raw.email || undefined, role: input.role, dateOfBirth: raw.dateOfBirth || undefined },
          meta,
        );
        if (r.temporaryPasswordExpiresAt) expiresAt = r.temporaryPasswordExpiresAt;
        rows.push({ ...base, outcome, message: outcome === "LINK_EXISTING" ? "Đã gắn thêm vai trò vào tài khoản sẵn có" : null, temporaryPassword: r.temporaryPassword });
      } catch (e) {
        current--;
        rows.push({ ...base, outcome: "ERROR", message: e instanceof AppException ? (e.getResponse() as { error: { message: string } }).error.message : "Không tạo được" });
      }
    }
    const summary = { CREATE: 0, LINK_EXISTING: 0, ALREADY_HAS_ROLE: 0, ERROR: 0 };
    for (const r of rows) summary[r.outcome]++;
    if (!input.dryRun) {
      await this.audit.record({ action: "account.imported", resourceType: "organization", resourceId: organizationId, actorUserId: actorId, organizationId, data: { role: input.role, ...summary }, ip: meta.ip, requestId: meta.requestId });
    }
    return { dryRun: input.dryRun, rows, summary, temporaryPasswordExpiresAt: expiresAt };
  }

  /** Sửa họ tên / ngày sinh. Người thuộc nhiều trung tâm → chỉ quản trị nền tảng sửa (dữ liệu dùng chung). */
  async updateProfile(actorId: string, organizationId: string, userId: string, input: UpdateProfileInput, meta: ClientMeta) {
    await this.access.assertControlsUser(actorId, organizationId, userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { displayName: input.displayName, dateOfBirth: toDate(input.dateOfBirth) } });
      await this.audit.record(
        { action: "account.profile_updated", resourceType: "user", resourceId: userId, actorUserId: actorId, organizationId, data: { fields: Object.keys(input) }, ip: meta.ip, requestId: meta.requestId },
        tx,
      );
    });
  }

  /**
   * Rút một vai trò khỏi trung tâm (vd. giáo viên nghỉ, học viên rời trung tâm). Chỉ ảnh hưởng trung tâm này,
   * có hiệu lực ngay (mọi kiểm tra quyền đọc vai trò hiện tại). Lịch sử dữ liệu được giữ nguyên.
   */
  async revokeRole(actorId: string, organizationId: string, userId: string, role: Role, meta: ClientMeta) {
    const { superAdmin } = await this.access.assertCanManageOrganization(actorId, organizationId);
    if (role === "SUPER_ADMIN") throw notFound();
    if (role === "CENTER_ADMIN" && !superAdmin) throw forbidden("Chỉ quản trị nền tảng được rút quyền quản trị trung tâm.");
    if (userId === actorId && role === "CENTER_ADMIN") throw forbidden("Không thể tự rút quyền quản trị của mình.");
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.roleAssignment.updateMany({ where: { userId, organizationId, role, revokedAt: null }, data: { revokedAt: now } });
      if (count === 0) throw notFound();
      await this.audit.record(
        { action: "account.role_revoked", resourceType: "user", resourceId: userId, actorUserId: actorId, organizationId, data: { role }, ip: meta.ip, requestId: meta.requestId },
        tx,
      );
    });
    // Học viên rời trung tâm / phụ huynh bị rút: thu hồi các liên kết phụ huynh tại trung tâm này
    if (role === "STUDENT" || role === "PARENT") {
      const field = role === "STUDENT" ? "studentUserId" : "guardianUserId";
      await this.db.run({ all: false, organizationIds: [organizationId] }, (tx) =>
        tx.guardianLink.updateMany({
          where: { organizationId, [field]: userId, status: { in: ["PENDING_CONSENT", "ACTIVE"] } },
          data: { status: "REVOKED", revokedAt: now, revokedById: actorId, revokedReason: role === "STUDENT" ? "Học viên rời trung tâm" : "Phụ huynh bị rút khỏi trung tâm" },
        }),
      );
    }
  }
}
