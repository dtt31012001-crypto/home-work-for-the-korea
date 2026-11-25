import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AddGuardianInput, addGuardianSchema, consentSchema, revokeLinkSchema } from "@th/contracts";
import { clientMeta } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AccessService } from "../auth/access.service";
import { AllowPendingPasswordChange, AuthContext, CurrentAuth } from "../auth/decorators";
import { OrganizationAdminGuard } from "../auth/organization-admin.guard";
import { GuardiansService } from "./guardians.service";

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/** CA-04: hồ sơ học viên và liên kết phụ huynh do trung tâm quản lý. */
@Controller("organizations/:orgId")
@UseGuards(OrganizationAdminGuard)
export class CenterPeopleController {
  constructor(
    private readonly guardians: GuardiansService,
    private readonly access: AccessService,
  ) {}

  @Get("students/:studentId")
  async student(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Param("studentId", uuid) studentId: string) {
    return this.guardians.studentDetail(await this.access.actor(a.userId), orgId, studentId);
  }

  @Post("students/:studentId/guardians")
  async addGuardian(
    @CurrentAuth() a: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Param("studentId", uuid) studentId: string,
    @Body(new ZodValidationPipe(addGuardianSchema)) body: AddGuardianInput,
    @Req() req: Request,
  ) {
    return this.guardians.addGuardian(await this.access.actor(a.userId), orgId, studentId, body, clientMeta(req));
  }

  @Post("guardian-links/:linkId/revoke")
  @HttpCode(204)
  async revoke(
    @CurrentAuth() a: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Param("linkId", uuid) linkId: string,
    @Body(new ZodValidationPipe(revokeLinkSchema)) body: { reason?: string },
    @Req() req: Request,
  ) {
    await this.guardians.revokeByCenter(await this.access.actor(a.userId), orgId, linkId, body.reason, clientMeta(req));
  }
}

/** Phía người dùng: học viên đồng ý/từ chối/thu hồi; phụ huynh xem con và rời liên kết. */
@Controller("me")
export class MeController {
  constructor(
    private readonly guardians: GuardiansService,
    private readonly access: AccessService,
  ) {}

  @Get("guardian-links")
  async links(@CurrentAuth() a: AuthContext) {
    return this.guardians.mine(await this.access.actor(a.userId));
  }

  @AllowPendingPasswordChange()
  @Get("guardian-requests")
  async requests(@CurrentAuth() a: AuthContext) {
    return this.guardians.consentRequests(await this.access.actor(a.userId));
  }

  @Post("guardian-links/:linkId/consent")
  @HttpCode(204)
  async consent(@CurrentAuth() a: AuthContext, @Param("linkId", uuid) linkId: string, @Body(new ZodValidationPipe(consentSchema)) b: { accept: boolean }, @Req() req: Request) {
    await this.guardians.respond(await this.access.actor(a.userId), linkId, b.accept, clientMeta(req));
  }

  @Post("guardian-links/:linkId/revoke")
  @HttpCode(204)
  async revoke(@CurrentAuth() a: AuthContext, @Param("linkId", uuid) linkId: string, @Req() req: Request) {
    await this.guardians.revokeByUser(await this.access.actor(a.userId), linkId, clientMeta(req));
  }

  @Get("children")
  async children(@CurrentAuth() a: AuthContext) {
    return this.guardians.effectiveChildren(await this.access.actor(a.userId));
  }
}
