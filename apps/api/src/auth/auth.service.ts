import { HttpStatus, Injectable } from "@nestjs/common";
import {
  ChangePasswordInput,
  LoginInput,
  MeResponse,
  PASSWORD_PROBLEM_MESSAGE,
  checkPassword,
  maskIdentifier,
  normalizeIdentifier,
} from "@th/contracts";
import { AUTH_POLICY } from "../config";
import { AppException } from "../common/app-exception";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { AccessService } from "./access.service";
import type { AuthContext } from "./decorators";
import { PasswordService } from "./password.service";
import { IssuedTokens, TokensService, sha256 } from "./tokens.service";

export interface ClientMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

const invalidCredentials = () =>
  new AppException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Số điện thoại/email hoặc mật khẩu không đúng.");
const tooManyAttempts = () =>
  new AppException(
    HttpStatus.TOO_MANY_REQUESTS,
    "TOO_MANY_ATTEMPTS",
    `Bạn đã nhập sai nhiều lần. Vui lòng thử lại sau ${AUTH_POLICY.lockoutMinutes} phút.`,
  );
const sessionExpired = () => new AppException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "Phiên đăng nhập đã hết hạn.");

/** Khoảng thời gian coi việc dùng lại refresh token vừa xoay là do 2 tab gọi đồng thời, không phải bị đánh cắp. */
const ROTATION_GRACE_MS = 30_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async login(input: LoginInput, meta: ClientMeta): Promise<{ tokens: IssuedTokens; mustChangePassword: boolean }> {
    const id = normalizeIdentifier(input.identifier);
    const identity = id
      ? await this.prisma.userIdentity.findUnique({
          where: { type_value: { type: id.type, value: id.value } },
          include: { user: { include: { credential: true } } },
        })
      : null;

    if (!identity?.user.credential) {
      await this.passwords.verifyDummy(input.password);
      throw invalidCredentials();
    }
    const user = identity.user;
    const credential = identity.user.credential;
    const now = new Date();

    if (user.lockedUntil && user.lockedUntil > now) throw tooManyAttempts();

    if (!(await this.passwords.verify(credential.hash, input.password))) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= AUTH_POLICY.maxFailedLogins;
      await this.prisma.user.update({
        where: { id: user.id },
        data: lock
          ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + AUTH_POLICY.lockoutMinutes * 60_000) }
          : { failedLoginCount: failed },
      });
      await this.audit.record({
        action: lock ? "auth.login.locked_out" : "auth.login.failed",
        resourceType: "user",
        resourceId: user.id,
        ip: meta.ip,
        requestId: meta.requestId,
      });
      if (lock) throw tooManyAttempts();
      throw invalidCredentials();
    }

    if (user.status !== "ACTIVE") {
      throw new AppException(HttpStatus.FORBIDDEN, "ACCOUNT_LOCKED", "Tài khoản đã bị khóa. Vui lòng liên hệ trung tâm.");
    }
    if (credential.mustChange && credential.tempExpiresAt && credential.tempExpiresAt <= now) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        "TEMP_PASSWORD_EXPIRED",
        "Mật khẩu tạm đã hết hạn. Vui lòng liên hệ trung tâm để được cấp lại.",
      );
    }

    const tokens = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now } });
      const issued = await this.tokens.createSession(tx, user, credential.mustChange, meta);
      await this.audit.record(
        { action: "auth.login.succeeded", resourceType: "user", resourceId: user.id, actorUserId: user.id, ip: meta.ip, requestId: meta.requestId },
        tx,
      );
      return issued;
    });
    return { tokens, mustChangePassword: credential.mustChange };
  }

  /** Xoay vòng refresh token. Dùng lại token đã xoay (ngoài thời gian ân hạn) → thu hồi toàn bộ chuỗi phiên. */
  async refresh(refreshToken: string, meta: ClientMeta): Promise<IssuedTokens> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { include: { credential: true } } },
    });
    if (!session) throw sessionExpired();
    const now = new Date();

    if (session.revokedAt) {
      const withinGrace = session.revokedReason === "ROTATED" && now.getTime() - session.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (session.revokedReason === "ROTATED" && !withinGrace) {
        await this.prisma.session.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: now, revokedReason: "REUSE_DETECTED" },
        });
        await this.audit.record({
          action: "auth.refresh.reuse_detected",
          resourceType: "session",
          resourceId: session.id,
          actorUserId: session.userId,
          ip: meta.ip,
          requestId: meta.requestId,
        });
      }
      throw sessionExpired();
    }
    if (session.expiresAt <= now || session.user.status !== "ACTIVE") throw sessionExpired();

    return this.prisma.$transaction(async (tx) => {
      const mustChange = session.user.credential?.mustChange ?? false;
      const issued = await this.tokens.createSession(tx, session.user, mustChange, meta, session.familyId);
      const { count } = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: "ROTATED", replacedById: issued.sessionId },
      });
      if (count === 0) throw sessionExpired(); // request song song đã xoay trước; transaction bị hủy
      return issued;
    });
  }

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "LOGOUT" },
    });
  }

  async logoutByRefreshToken(refreshToken: string) {
    await this.prisma.session.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "LOGOUT" },
    });
  }

  /** Đổi mật khẩu (kể cả mật khẩu tạm). Thu hồi mọi phiên khác, cấp phiên mới cho thiết bị hiện tại. */
  async changePassword(auth: AuthContext, input: ChangePasswordInput, meta: ClientMeta): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      include: { credential: true, identities: { where: { type: "PHONE" } } },
    });
    if (!user.credential || !(await this.passwords.verify(user.credential.hash, input.currentPassword))) {
      throw new AppException(HttpStatus.BAD_REQUEST, "WRONG_CURRENT_PASSWORD", "Mật khẩu hiện tại không đúng.");
    }
    const problem = checkPassword(input.newPassword, user.identities[0]?.value);
    if (problem) throw new AppException(HttpStatus.BAD_REQUEST, `PASSWORD_${problem}`, PASSWORD_PROBLEM_MESSAGE[problem]);
    if (input.newPassword === input.currentPassword) {
      throw new AppException(HttpStatus.BAD_REQUEST, "PASSWORD_SAME_AS_CURRENT", "Mật khẩu mới phải khác mật khẩu hiện tại.");
    }
    const newHash = await this.passwords.hash(input.newPassword);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.passwordCredential.update({
        where: { userId: user.id },
        data: { hash: newHash, mustChange: false, tempExpiresAt: null, changedAt: now },
      });
      const updated = await tx.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: "PASSWORD_CHANGED" },
      });
      const issued = await this.tokens.createSession(tx, updated, false, meta);
      await this.audit.record(
        {
          action: user.credential!.mustChange ? "auth.password.temporary_replaced" : "auth.password.changed",
          resourceType: "user",
          resourceId: user.id,
          actorUserId: user.id,
          ip: meta.ip,
          requestId: meta.requestId,
        },
        tx,
      );
      return issued;
    });
  }

  async me(auth: AuthContext): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      include: { identities: { orderBy: { type: "asc" } } },
    });
    const assignments = await this.access.activeAssignments(auth.userId);
    return {
      user: { id: user.id, displayName: user.displayName },
      identities: user.identities.map((i) => ({ type: i.type, masked: maskIdentifier({ type: i.type, value: i.value }) })),
      mustChangePassword: auth.mustChangePassword,
      contexts: assignments.map((a) => ({ role: a.role, organization: a.organization })),
    };
  }
}
