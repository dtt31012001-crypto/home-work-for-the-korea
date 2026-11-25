import { Body, Controller, Get, HttpCode, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { ChangePasswordInput, LoginInput, changePasswordSchema, loginSchema } from "@th/contracts";
import { clientMeta } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { REFRESH_COOKIE, clearAuthCookies, ensureCsrfCookie, setAuthCookies } from "./cookies";
import { AllowPendingPasswordChange, AuthContext, CurrentAuth, Public } from "./decorators";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Cấp cookie CSRF cho trình duyệt trước khi gửi form. */
  @Public()
  @Get("csrf")
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return { csrfToken: ensureCsrfCookie(req, res) };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { tokens, mustChangePassword } = await this.auth.login(body, clientMeta(req));
    setAuthCookies(res, tokens);
    return { mustChangePassword };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    try {
      const tokens = await this.auth.refresh(typeof token === "string" ? token : "", clientMeta(req));
      setAuthCookies(res, tokens);
      return { ok: true };
    } catch (e) {
      clearAuthCookies(res);
      throw e;
    }
  }

  /** Đăng xuất được cả khi access token đã hết hạn (dựa vào refresh token). */
  @Public()
  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (typeof token === "string" && token) await this.auth.logoutByRefreshToken(token);
    clearAuthCookies(res);
  }

  @AllowPendingPasswordChange()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("password")
  @HttpCode(200)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.changePassword(auth, body, clientMeta(req));
    setAuthCookies(res, tokens);
    return { ok: true };
  }

  @AllowPendingPasswordChange()
  @Get("me")
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth);
  }
}
