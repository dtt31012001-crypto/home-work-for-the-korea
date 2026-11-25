import { Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Prisma, Role, SessionPolicy } from "@prisma/client";
import { AUTH_POLICY, config } from "../config";
import { PrismaService } from "../prisma/prisma.service";

export interface AccessClaims {
  sub: string; // user id
  sid: string; // session id
  tv: number; // token version
  pwc: boolean; // bắt buộc đổi mật khẩu
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  refreshExpiresAt: Date;
}

export interface SessionFamily {
  id: string;
  startedAt: Date;
  expiresAt: Date;
}

/** Thời hạn phiên theo nhóm vai trò cao nhất hiện có (cấu hình qua biến môi trường). */
export function sessionLimits(policy: SessionPolicy): { idleMs: number; maxMs: number } {
  const c = config();
  const H = 3_600_000;
  const D = 24 * H;
  switch (policy) {
    case "ADMIN":
      return { idleMs: c.SESSION_ADMIN_IDLE_MINUTES * 60_000, maxMs: c.SESSION_ADMIN_MAX_HOURS * H };
    case "TEACHER":
      return { idleMs: c.SESSION_TEACHER_IDLE_DAYS * D, maxMs: c.SESSION_TEACHER_MAX_DAYS * D };
    default:
      return { idleMs: c.SESSION_LEARNER_IDLE_DAYS * D, maxMs: c.SESSION_LEARNER_MAX_DAYS * D };
  }
}

export function policyForRoles(roles: Role[]): SessionPolicy {
  if (roles.includes("SUPER_ADMIN") || roles.includes("CENTER_ADMIN")) return "ADMIN";
  if (roles.includes("TEACHER")) return "TEACHER";
  return "LEARNER";
}

type Tx = Prisma.TransactionClient | PrismaService;
const JWT_OPTS = { issuer: "th-api", audience: "th-web" } as const;

export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

@Injectable()
export class TokensService {
  constructor(private readonly prisma: PrismaService) {}

  signAccess(claims: AccessClaims): string {
    return jwt.sign(claims, config().JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: AUTH_POLICY.accessTokenTtlSeconds,
      ...JWT_OPTS,
    });
  }

  verifyAccess(token: string): AccessClaims | null {
    try {
      const p = jwt.verify(token, config().JWT_SECRET, { algorithms: ["HS256"], ...JWT_OPTS }) as jwt.JwtPayload;
      if (typeof p.sub !== "string" || typeof p.sid !== "string" || typeof p.tv !== "number") return null;
      return { sub: p.sub, sid: p.sid, tv: p.tv, pwc: p.pwc === true };
    } catch {
      return null;
    }
  }

  /**
   * Tạo phiên (đăng nhập mới) hoặc phiên kế tiếp trong chuỗi (làm mới).
   * Chính sách được tính lại từ vai trò HIỆN TẠI → được gán quyền quản trị thì phiên siết lại ngay lần làm mới sau.
   * Trả về null nếu chuỗi phiên đã quá thời hạn tối đa.
   */
  async createSession(
    tx: Tx,
    user: { id: string; tokenVersion: number },
    mustChangePassword: boolean,
    meta: { ip: string | null; userAgent: string | null },
    family?: SessionFamily,
  ): Promise<IssuedTokens | null> {
    const roles = await tx.roleAssignment.findMany({ where: { userId: user.id, revokedAt: null }, select: { role: true } });
    const policy = policyForRoles(roles.map((r) => r.role));
    const { idleMs, maxMs } = sessionLimits(policy);
    const now = Date.now();
    const startedAt = family?.startedAt ?? new Date(now);
    const familyExpiresAt = new Date(Math.min(family?.expiresAt.getTime() ?? Infinity, startedAt.getTime() + maxMs));
    if (familyExpiresAt.getTime() <= now) return null;
    const expiresAt = new Date(Math.min(now + idleMs, familyExpiresAt.getTime()));

    const refreshToken = randomBytes(32).toString("base64url");
    const session = await tx.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        familyId: family?.id ?? randomUUID(),
        familyStartedAt: startedAt,
        familyExpiresAt,
        policy,
        expiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    const accessToken = this.signAccess({ sub: user.id, sid: session.id, tv: user.tokenVersion, pwc: mustChangePassword });
    return { accessToken, refreshToken, sessionId: session.id, refreshExpiresAt: expiresAt };
  }
}
