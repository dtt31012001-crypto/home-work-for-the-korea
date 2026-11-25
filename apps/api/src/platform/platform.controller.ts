import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { clientMeta } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AccountsService } from "../accounts/accounts.service";
import { AuthContext, CurrentAuth } from "../auth/decorators";
import { SuperAdminGuard } from "../auth/super-admin.guard";
import { PlatformService } from "./platform.service";

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const userQuery = z.object({ q: z.string().trim().max(120).optional(), status: z.enum(["ACTIVE", "LOCKED", "DEACTIVATED"]).optional() });
const auditQuery = z.object({
  organizationId: z.string().uuid().optional(),
  actorUserId: z.string().uuid().optional(),
  resourceId: z.string().max(64).optional(),
  action: z.string().max(80).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  before: z.string().uuid().optional(),
});
export type AuditQuery = z.infer<typeof auditQuery>;

/** SA-03 Người dùng, SA-04 Nhật ký hệ thống. */
@Controller("admin")
@UseGuards(SuperAdminGuard)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly accounts: AccountsService,
  ) {}

  @Get("users")
  users(@Query(new ZodValidationPipe(userQuery)) q: z.infer<typeof userQuery>) {
    return this.platform.users(q.q, q.status);
  }

  @Post("users/:userId/reset-password")
  @HttpCode(200)
  reset(@CurrentAuth() a: AuthContext, @Param("userId", uuid) userId: string, @Req() r: Request) {
    return this.accounts.platformResetPassword(a.userId, userId, clientMeta(r));
  }

  @Post("users/:userId/lock")
  @HttpCode(200)
  lock(@CurrentAuth() a: AuthContext, @Param("userId", uuid) userId: string, @Req() r: Request) {
    return this.accounts.platformSetLocked(a.userId, userId, true, clientMeta(r));
  }

  @Post("users/:userId/unlock")
  @HttpCode(200)
  unlock(@CurrentAuth() a: AuthContext, @Param("userId", uuid) userId: string, @Req() r: Request) {
    return this.accounts.platformSetLocked(a.userId, userId, false, clientMeta(r));
  }

  @Get("audit")
  audit(@Query(new ZodValidationPipe(auditQuery)) q: AuditQuery) {
    return this.platform.audit(q);
  }
}
