import { randomBytes } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";
import { AUTH_POLICY, config } from "../config";
import { CSRF_COOKIE } from "../common/csrf.guard";
import type { IssuedTokens } from "./tokens.service";

export const ACCESS_COOKIE = "th_at";
export const REFRESH_COOKIE = "th_rt";
const REFRESH_PATH = "/api/auth";

const base = (): CookieOptions => ({ httpOnly: true, secure: config().COOKIE_SECURE, sameSite: "lax" });

export function setAuthCookies(res: Response, tokens: IssuedTokens) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base(), path: "/", maxAge: AUTH_POLICY.accessTokenTtlSeconds * 1000 });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(),
    path: REFRESH_PATH,
    maxAge: AUTH_POLICY.refreshTokenTtlDays * 86_400_000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...base(), path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...base(), path: REFRESH_PATH });
}

/** Cấp cookie CSRF (JS đọc được để gửi lại trong header) nếu chưa có. */
export function ensureCsrfCookie(req: Request, res: Response): string {
  const existing = req.cookies?.[CSRF_COOKIE];
  if (typeof existing === "string" && existing.length >= 32) return existing;
  const token = randomBytes(32).toString("base64url");
  res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: config().COOKIE_SECURE, sameSite: "lax", path: "/" });
  return token;
}
