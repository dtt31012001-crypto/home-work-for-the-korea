import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AppException } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";
import { ACCESS_COOKIE } from "./cookies";
import { ALLOW_PENDING_PASSWORD_CHANGE, AuthContext, IS_PUBLIC } from "./decorators";
import { TokensService } from "./tokens.service";

const unauthenticated = () => new AppException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Vui lòng đăng nhập.");

/**
 * Guard toàn cục. Mỗi request kiểm tra: chữ ký token, phiên chưa bị thu hồi,
 * tài khoản đang hoạt động và token_version khớp → khóa tài khoản / đổi mật khẩu có hiệu lực ngay.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const raw = req.cookies?.[ACCESS_COOKIE];
    const claims = typeof raw === "string" ? this.tokens.verifyAccess(raw) : null;
    if (!claims) throw unauthenticated();

    const session = await this.prisma.session.findUnique({
      where: { id: claims.sid },
      select: { userId: true, revokedAt: true, expiresAt: true, user: { select: { status: true, tokenVersion: true } } },
    });
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== "ACTIVE" ||
      session.user.tokenVersion !== claims.tv
    ) {
      throw unauthenticated();
    }

    if (claims.pwc && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_PASSWORD_CHANGE, targets)) {
      throw new AppException(HttpStatus.FORBIDDEN, "PASSWORD_CHANGE_REQUIRED", "Vui lòng đổi mật khẩu tạm trước khi tiếp tục.");
    }

    req.auth = { userId: claims.sub, sessionId: claims.sid, mustChangePassword: claims.pwc };
    return true;
  }
}
