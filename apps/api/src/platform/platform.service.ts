import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { normalizeEmail, normalizePhone, type AuditPage, type PlatformUserRow } from "@th/contracts";
import { zonedToUtc, addDays } from "../classes/schedule";
import { PrismaService } from "../prisma/prisma.service";
import type { AuditQuery } from "./platform.controller";

const TZ = "Asia/Ho_Chi_Minh";
const PAGE = 50;

/**
 * Truy vấn cấp nền tảng (chỉ Super Admin, đã chặn bằng SuperAdminGuard).
 * Chỉ đọc bảng cấp nền tảng (tài khoản, vai trò, trung tâm, nhật ký) – không đọc dữ liệu học tập của trung tâm.
 */
@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async users(q?: string, status?: PlatformUserRow["status"]): Promise<PlatformUserRow[]> {
    const where: Prisma.UserWhereInput = { ...(status ? { status } : {}) };
    if (q) {
      const phone = normalizePhone(q);
      const email = normalizeEmail(q);
      where.OR = [
        { displayName: { contains: q, mode: "insensitive" } },
        ...(phone ? [{ identities: { some: { type: "PHONE" as const, value: phone } } }] : []),
        ...(email ? [{ identities: { some: { type: "EMAIL" as const, value: email } } }] : []),
        { identities: { some: { value: { contains: q.replace(/\s/g, ""), mode: "insensitive" as const } } } },
      ];
    }
    const users = await this.prisma.user.findMany({
      where,
      include: {
        identities: { orderBy: { type: "asc" } },
        credential: { select: { mustChange: true } },
        roleAssignments: { where: { revokedAt: null }, include: { organization: { select: { id: true, name: true } } } },
        sessions: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      status: u.status,
      identities: u.identities.map((i) => ({ type: i.type, value: i.value })),
      roles: u.roleAssignments.map((r) => ({ role: r.role, organization: r.organization })),
      mustChangePassword: u.credential?.mustChange ?? false,
      lastLoginAt: u.sessions[0]?.createdAt.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async audit(q: AuditQuery): Promise<AuditPage> {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.organizationId ? { organizationId: q.organizationId } : {}),
      ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
      ...(q.resourceId ? { resourceId: q.resourceId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
    };
    const at: Prisma.DateTimeFilter = {};
    if (q.from) at.gte = zonedToUtc(q.from, "00:00", TZ);
    if (q.to) at.lt = zonedToUtc(addDays(q.to, 1), "00:00", TZ);
    if (q.from || q.to) where.at = at;
    // Phân trang theo id (UUIDv7 tăng theo thời gian)
    if (q.before) where.id = { lt: q.before };
    const rows = await this.prisma.auditLog.findMany({ where, orderBy: { id: "desc" }, take: PAGE + 1 });
    const page = rows.slice(0, PAGE);
    const [actors, orgs] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: [...page.map((r) => r.actorUserId), ...page.filter((r) => r.resourceType === "user").map((r) => r.resourceId)].filter((x): x is string => Boolean(x)) } },
        select: { id: true, displayName: true },
      }),
      this.prisma.organization.findMany({ where: { id: { in: page.map((r) => r.organizationId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
    ]);
    return {
      items: page.map((r) => ({
        id: r.id,
        at: r.at.toISOString(),
        action: r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        actor: actors.find((a) => a.id === r.actorUserId) ?? null,
        target: r.resourceType === "user" && r.resourceId !== r.actorUserId ? (actors.find((a) => a.id === r.resourceId)?.displayName ?? null) : null,
        organization: orgs.find((o) => o.id === r.organizationId) ?? null,
        ip: r.ip,
        data: r.data,
      })),
      nextCursor: rows.length > PAGE ? page[page.length - 1]!.id : null,
    };
  }
}
