import { Injectable } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { Prisma } from "@prisma/client";
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

  /** Tạo phiên mới (refresh token ngẫu nhiên 256 bit, chỉ lưu hash). */
  async createSession(
    tx: Tx,
    user: { id: string; tokenVersion: number },
    mustChangePassword: boolean,
    meta: { ip: string | null; userAgent: string | null },
    familyId: string = randomUUID(),
  ): Promise<IssuedTokens> {
    const refreshToken = randomBytes(32).toString("base64url");
    const session = await tx.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        familyId,
        expiresAt: new Date(Date.now() + AUTH_POLICY.refreshTokenTtlDays * 86_400_000),
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    const accessToken = this.signAccess({ sub: user.id, sid: session.id, tv: user.tokenVersion, pwc: mustChangePassword });
    return { accessToken, refreshToken, sessionId: session.id };
  }
}
