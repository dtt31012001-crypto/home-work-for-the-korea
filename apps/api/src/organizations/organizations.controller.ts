import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import {
  AdminUpdateOrganizationInput,
  BranchInput,
  CreateOrganizationInput,
  RoomInput,
  UpdateBranchInput,
  UpdateOrganizationInput,
  UpdateRoomInput,
  adminUpdateOrganizationSchema,
  branchSchema,
  createOrganizationSchema,
  roomSchema,
  updateBranchSchema,
  updateOrganizationSchema,
  updateRoomSchema,
} from "@th/contracts";
import { AppException } from "../common/app-exception";
import { clientMeta } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { AccessService } from "../auth/access.service";
import { AuthContext, CurrentAuth } from "../auth/decorators";
import { OrganizationAdminGuard } from "../auth/organization-admin.guard";
import { SuperAdminGuard } from "../auth/super-admin.guard";
import { PrismaService } from "../prisma/prisma.service";
import { OrganizationsService } from "./organizations.service";

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/** SA-01: Super Admin quản lý trung tâm (tenant), trạng thái và giới hạn tài khoản. */
@Controller("admin/organizations")
@UseGuards(SuperAdminGuard)
export class AdminOrganizationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly orgs: OrganizationsService,
    private readonly access: AccessService,
  ) {}

  @Get()
  list() {
    return this.orgs.listForAdmin();
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createOrganizationSchema)) body: CreateOrganizationInput,
    @Req() req: Request,
  ) {
    const meta = clientMeta(req);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({ data: { code: body.code, name: body.name, createdById: auth.userId } });
        await this.audit.record(
          { action: "organization.created", resourceType: "organization", resourceId: org.id, actorUserId: auth.userId, organizationId: org.id, ip: meta.ip, requestId: meta.requestId },
          tx,
        );
        return { id: org.id, code: org.code, name: org.name, status: org.status };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new AppException(HttpStatus.CONFLICT, "ORGANIZATION_CODE_TAKEN", "Mã trung tâm đã được dùng.");
      }
      throw e;
    }
  }

  @Patch(":orgId")
  @HttpCode(204)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Body(new ZodValidationPipe(adminUpdateOrganizationSchema)) body: AdminUpdateOrganizationInput,
    @Req() req: Request,
  ) {
    await this.orgs.adminUpdate(auth.userId, orgId, body, clientMeta(req));
  }
}

/** CA-08: thông tin trung tâm, cơ sở, phòng, cấu hình vận hành. */
@Controller("organizations/:orgId")
@UseGuards(OrganizationAdminGuard)
export class OrganizationController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async detail(@CurrentAuth() auth: AuthContext, @Param("orgId", uuid) orgId: string) {
    return this.orgs.detail(await this.access.actor(auth.userId), orgId);
  }

  @Patch()
  @HttpCode(204)
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Body(new ZodValidationPipe(updateOrganizationSchema)) body: UpdateOrganizationInput,
    @Req() req: Request,
  ) {
    await this.orgs.update(auth.userId, orgId, body, clientMeta(req));
  }

  @Post("branches")
  async createBranch(@CurrentAuth() auth: AuthContext, @Param("orgId", uuid) orgId: string, @Body(new ZodValidationPipe(branchSchema)) body: BranchInput) {
    return this.orgs.createBranch(await this.access.actor(auth.userId), orgId, body);
  }

  @Patch("branches/:branchId")
  async updateBranch(
    @CurrentAuth() auth: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Param("branchId", uuid) branchId: string,
    @Body(new ZodValidationPipe(updateBranchSchema)) body: UpdateBranchInput,
  ) {
    return this.orgs.updateBranch(await this.access.actor(auth.userId), orgId, branchId, body);
  }

  @Post("rooms")
  async createRoom(@CurrentAuth() auth: AuthContext, @Param("orgId", uuid) orgId: string, @Body(new ZodValidationPipe(roomSchema)) body: RoomInput) {
    return this.orgs.createRoom(await this.access.actor(auth.userId), orgId, body);
  }

  @Patch("rooms/:roomId")
  async updateRoom(
    @CurrentAuth() auth: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Param("roomId", uuid) roomId: string,
    @Body(new ZodValidationPipe(updateRoomSchema)) body: UpdateRoomInput,
  ) {
    return this.orgs.updateRoom(await this.access.actor(auth.userId), orgId, roomId, body);
  }
}
