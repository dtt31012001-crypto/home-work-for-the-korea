import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { IssueAccountInput, issueAccountSchema } from "@th/contracts";
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
  list(@CurrentAuth() auth: AuthContext, @Param("orgId", uuid) orgId: string) {
    return this.accounts.list(auth.userId, orgId);
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
