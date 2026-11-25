import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { AppException } from "./app-exception";

export const CSRF_COOKIE = "th_csrf";
export const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Double-submit cookie: mọi request thay đổi dữ liệu phải gửi header trùng cookie th_csrf. */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    const cookie = req.cookies?.[CSRF_COOKIE];
    const header = req.header(CSRF_HEADER);
    if (typeof cookie === "string" && typeof header === "string" && cookie.length >= 32 && cookie.length === header.length) {
      if (timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) return true;
    }
    throw new AppException(HttpStatus.FORBIDDEN, "CSRF_INVALID", "Phiên làm việc không hợp lệ. Vui lòng tải lại trang.");
  }
}
