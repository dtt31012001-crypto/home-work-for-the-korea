import { Injectable } from "@nestjs/common";
import type { Role } from "@prisma/client";
import { forbidden, notFound } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";

/** Chính sách quyền tập trung cho Identity & Access (RBAC theo phạm vi trung tâm). */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Vai trò đang hiệu lực; bỏ qua vai trò thuộc trung tâm đã tạm ngưng. */
  activeAssignments(userId: string) {
    return this.prisma.roleAssignment.findMany({
      where: {
        userId,
        revokedAt: null,
        OR: [{ organizationId: null }, { organization: { status: "ACTIVE" } }],
      },
      include: { organization: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async isSuperAdmin(userId: string): Promise<boolean> {
    const n = await this.prisma.roleAssignment.count({ where: { userId, role: "SUPER_ADMIN", revokedAt: null } });
    return n > 0;
  }

  /** Người thao tác phải là Super Admin hoặc Center Admin của chính trung tâm đó. Sai → 404 (không lộ trung tâm tồn tại). */
  async assertCanManageOrganization(actorId: string, organizationId: string): Promise<{ superAdmin: boolean }> {
    if (await this.isSuperAdmin(actorId)) {
      const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
      if (!org) throw notFound();
      return { superAdmin: true };
    }
    const n = await this.prisma.roleAssignment.count({
      where: { userId: actorId, role: "CENTER_ADMIN", organizationId, revokedAt: null, organization: { status: "ACTIVE" } },
    });
    if (n === 0) throw notFound();
    return { superAdmin: false };
  }

  /**
   * Quyền của trung tâm trên một tài khoản (đặt lại mật khẩu, khóa/mở khóa).
   * - Tài khoản phải có vai trò đang hiệu lực tại trung tâm, nếu không → 404.
   * - Center Admin không được thao tác trên Super Admin, Center Admin khác,
   *   hoặc người dùng đồng thời thuộc trung tâm khác (ảnh hưởng ngoài phạm vi) → 403.
   */
  async assertControlsUser(actorId: string, organizationId: string, targetUserId: string) {
    const { superAdmin } = await this.assertCanManageOrganization(actorId, organizationId);
    const assignments = await this.prisma.roleAssignment.findMany({
      where: { userId: targetUserId, revokedAt: null },
      select: { role: true, organizationId: true },
    });
    if (!assignments.some((a) => a.organizationId === organizationId)) throw notFound();
    if (superAdmin) return;
    const blocked: Role[] = ["SUPER_ADMIN", "CENTER_ADMIN"];
    if (assignments.some((a) => blocked.includes(a.role))) {
      throw forbidden("Chỉ quản trị nền tảng được thao tác trên tài khoản quản trị.");
    }
    if (assignments.some((a) => a.organizationId !== organizationId)) {
      throw forbidden("Tài khoản này thuộc nhiều trung tâm. Vui lòng liên hệ quản trị nền tảng.");
    }
  }
}
