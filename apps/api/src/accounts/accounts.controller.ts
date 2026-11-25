import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ImportAccountsInput, IssueAccountInput, UpdateProfileInput, importAccountsSchema, issueAccountSchema, updateProfileSchema } from "@th/contracts";
import { Role } from "@prisma/client";
import { clientMeta } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthContext, CurrentAuth } from "../auth/decorators";
import { OrganizationAdminGuard } from "../auth/organization-admin.guard";
import { AccountsService } from "./accounts.service";

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@Controller("organizations/:orgId/accounts")
@UseGuards(OrganizationAdminGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list(
    @CurrentAuth() auth: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Query("role", new ParseEnumPipe(Role, { optional: true, errorHttpStatusCode: 400 })) role?: Role,
  ) {
    return this.accounts.list(auth.userId, orgId, role);
  }

  @Patch(":userId")
  @HttpCode(204)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Param("userId", uuid) userId: string,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
    @Req() req: Request,
  ) {
    await this.accounts.updateProfile(auth.userId, orgId, userId, body, clientMeta(req));
  }

  @Post(":userId/roles/:role/revoke")
  @HttpCode(204)
  async revokeRole(
    @CurrentAuth() auth: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Param("userId", uuid) userId: string,
    @Param("role", new ParseEnumPipe(Role, { errorHttpStatusCode: 404 })) role: Role,
    @Req() req: Request,
  ) {
    await this.accounts.revokeRole(auth.userId, orgId, userId, role, clientMeta(req));
  }

  @Post()
  issue(
    @CurrentAuth() auth: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Body(new ZodValidationPipe(issueAccountSchema)) body: IssueAccountInput,
    @Req() req: Request,
  ) {
    return this.accounts.issue(auth.userId, orgId, body, clientMeta(req));
  }

  /** C-07: nhập danh sách; dryRun=true chỉ kiểm tra. */
  @Post("import")
  @HttpCode(200)
  import(
    @CurrentAuth() auth: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Body(new ZodValidationPipe(importAccountsSchema)) body: ImportAccountsInput,
    @Req() req: Request,
  ) {
    return this.accounts.importAccounts(auth.userId, orgId, body, clientMeta(req));
  }

  @Post(":userId/reset-password")
  @HttpCode(200)
  reset(@CurrentAuth() auth: AuthContext, @Param("orgId", uuid) orgId: string, @Param("userId", uuid) userId: string, @Req() req: Request) {
    return this.accounts.resetPassword(auth.userId, orgId, userId, clientMeta(req));
  }

  @Post(":userId/lock")
  @HttpCode(200)
  lock(@CurrentAuth() auth: AuthContext, @Param("orgId", uuid) orgId: string, @Param("userId", uuid) userId: string, @Req() req: Request) {
    return this.accounts.setLocked(auth.userId, orgId, userId, true, clientMeta(req));
  }

  @Post(":userId/unlock")
  @HttpCode(200)
  unlock(@CurrentAuth() auth: AuthContext, @Param("orgId", uuid) orgId: string, @Param("userId", uuid) userId: string, @Req() req: Request) {
    return this.accounts.setLocked(auth.userId, orgId, userId, false, clientMeta(req));
  }
}
