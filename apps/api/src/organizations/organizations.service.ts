import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  AdminUpdateOrganizationInput,
  BranchInput,
  OrganizationDetail,
  RoomInput,
  UpdateBranchInput,
  UpdateOrganizationInput,
  UpdateRoomInput,
} from "@th/contracts";
import { AppException, notFound } from "../common/app-exception";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../auth/access.service";
import type { ClientMeta } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantDb } from "../prisma/tenant-db.service";

const duplicate = (what: string) => new AppException(HttpStatus.CONFLICT, "DUPLICATE_NAME", `${what} này đã tồn tại.`);

function uniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly db: TenantDb,
    private readonly audit: AuditService,
  ) {}

  private async counts(organizationId: string) {
    const rows = await this.prisma.roleAssignment.groupBy({
      by: ["role"],
      where: { organizationId, revokedAt: null },
      _count: { _all: true },
    });
    const c = (r: string) => rows.find((x) => x.role === r)?._count._all ?? 0;
    return { students: c("STUDENT"), teachers: c("TEACHER"), parents: c("PARENT") };
  }

  async listForAdmin() {
    const orgs = await this.prisma.organization.findMany({ orderBy: { createdAt: "asc" } });
    return Promise.all(
      orgs.map(async (o) => ({
        id: o.id,
        code: o.code,
        name: o.name,
        status: o.status,
        maxStudents: o.maxStudents,
        maxTeachers: o.maxTeachers,
        counts: await this.counts(o.id),
      })),
    );
  }

  async detail(actor: Actor, organizationId: string): Promise<OrganizationDetail> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw notFound();
    const branches = await this.db.run(actor.dbScope(), (tx) =>
      tx.branch.findMany({
        where: { organizationId },
        orderBy: { createdAt: "asc" },
        include: { rooms: { orderBy: { name: "asc" } } },
      }),
    );
    return {
      id: org.id,
      code: org.code,
      name: org.name,
      status: org.status,
      contactPhone: org.contactPhone,
      contactEmail: org.contactEmail,
      address: org.address,
      maxStudents: org.maxStudents,
      maxTeachers: org.maxTeachers,
      attendanceEditHours: org.attendanceEditHours,
      behindThresholdLessons: org.behindThresholdLessons,
      counts: await this.counts(organizationId),
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        address: b.address,
        timezone: b.timezone,
        status: b.status,
        rooms: b.rooms.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity, status: r.status })),
      })),
    };
  }

  async adminUpdate(actorId: string, organizationId: string, input: AdminUpdateOrganizationInput, meta: ClientMeta) {
    const before = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!before) throw notFound();
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: organizationId }, data: input });
      await this.audit.record(
        {
          action: "organization.admin_updated",
          resourceType: "organization",
          resourceId: organizationId,
          organizationId,
          actorUserId: actorId,
          data: { before: { status: before.status, maxStudents: before.maxStudents, maxTeachers: before.maxTeachers }, after: input },
          ip: meta.ip,
          requestId: meta.requestId,
        },
        tx,
      );
    });
  }

  async update(actorId: string, organizationId: string, input: UpdateOrganizationInput, meta: ClientMeta) {
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: organizationId }, data: input });
      await this.audit.record(
        { action: "organization.updated", resourceType: "organization", resourceId: organizationId, organizationId, actorUserId: actorId, data: input, ip: meta.ip, requestId: meta.requestId },
        tx,
      );
    });
  }

  async createBranch(actor: Actor, organizationId: string, input: BranchInput) {
    try {
      return await this.db.run(actor.dbScope(), (tx) => tx.branch.create({ data: { organizationId, ...input } }));
    } catch (e) {
      if (uniqueViolation(e)) throw duplicate("Cơ sở");
      throw e;
    }
  }

  async updateBranch(actor: Actor, organizationId: string, branchId: string, input: UpdateBranchInput) {
    try {
      return await this.db.run(actor.dbScope(), async (tx) => {
        const found = await tx.branch.findFirst({ where: { id: branchId, organizationId } });
        if (!found) throw notFound();
        return tx.branch.update({ where: { id: branchId }, data: input });
      });
    } catch (e) {
      if (uniqueViolation(e)) throw duplicate("Cơ sở");
      throw e;
    }
  }

  async createRoom(actor: Actor, organizationId: string, input: RoomInput) {
    try {
      return await this.db.run(actor.dbScope(), async (tx) => {
        const branch = await tx.branch.findFirst({ where: { id: input.branchId, organizationId } });
        if (!branch) throw notFound();
        return tx.room.create({ data: { organizationId, branchId: input.branchId, name: input.name, capacity: input.capacity ?? null } });
      });
    } catch (e) {
      if (uniqueViolation(e)) throw duplicate("Phòng");
      throw e;
    }
  }

  async updateRoom(actor: Actor, organizationId: string, roomId: string, input: UpdateRoomInput) {
    try {
      return await this.db.run(actor.dbScope(), async (tx) => {
        const found = await tx.room.findFirst({ where: { id: roomId, organizationId } });
        if (!found) throw notFound();
        return tx.room.update({ where: { id: roomId }, data: input });
      });
    } catch (e) {
      if (uniqueViolation(e)) throw duplicate("Phòng");
      throw e;
    }
  }
}
