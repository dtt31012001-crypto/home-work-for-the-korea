import { Body, Controller, Get, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Request } from "express";
import { CreateOrganizationInput, createOrganizationSchema } from "@th/contracts";
import { AppException } from "../common/app-exception";
import { clientMeta } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuditService } from "../audit/audit.service";
import { AuthContext, CurrentAuth } from "../auth/decorators";
import { PrismaService } from "../prisma/prisma.service";
import { SuperAdminGuard } from "../auth/super-admin.guard";

/** Super Admin tạo/xem trung tâm (tenant). Phần cấu hình cơ sở, phòng, giáo trình thuộc lát cắt sau. */
@Controller("admin/organizations")
@UseGuards(SuperAdminGuard)
export class OrganizationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list() {
    return this.prisma.organization.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, code: true, name: true, status: true } });
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
}
