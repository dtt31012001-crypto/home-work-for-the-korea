import { HttpStatus, Injectable } from "@nestjs/common";
import type { Role } from "@prisma/client";
import { AppException, forbidden, notFound } from "../common/app-exception";
import { PrismaService } from "../prisma/prisma.service";
import type { DbScope } from "../prisma/tenant-db.service";

export interface Assignment {
  role: Role;
  organizationId: string | null;
}

/**
 * Người đang thao tác: toàn bộ vai trò còn hiệu lực ở các trung tâm đang hoạt động.
 * Một người có thể có nhiều vai trò ở nhiều trung tâm; mọi kiểm tra quyền dựa trên tài nguyên cụ thể,
 * không dựa vào "vai trò đang chọn" trên giao diện.
 */
export class Actor {
  constructor(
    readonly userId: string,
    readonly assignments: Assignment[],
  ) {}

  get superAdmin(): boolean {
    return this.assignments.some((a) => a.role === "SUPER_ADMIN");
  }

  organizationIds(...roles: Role[]): string[] {
    const ids = this.assignments
      .filter((a) => a.organizationId && (roles.length === 0 || roles.includes(a.role)))
      .map((a) => a.organizationId as string);
    return [...new Set(ids)];
  }

  hasRole(organizationId: string, ...roles: Role[]): boolean {
    return this.assignments.some((a) => a.organizationId === organizationId && roles.includes(a.role));
  }

  canManage(organizationId: string): boolean {
    return this.superAdmin || this.hasRole(organizationId, "CENTER_ADMIN");
  }

  /** Phạm vi Row-Level Security cho mọi truy vấn bảng dữ liệu trung tâm. */
  dbScope(): DbScope {
    return this.superAdmin ? { all: true } : { all: false, organizationIds: this.organizationIds() };
  }
}

/** Chính sách quyền tập trung (RBAC theo phạm vi trung tâm). */
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

  async actor(userId: string): Promise<Actor> {
    const rows = await this.activeAssignments(userId);
    return new Actor(
      userId,
      rows.map((r) => ({ role: r.role, organizationId: r.organizationId })),
    );
  }

  async isSuperAdmin(userId: string): Promise<boolean> {
    return (await this.actor(userId)).superAdmin;
  }

  /** Super Admin hoặc Center Admin của chính trung tâm đó. Sai → 404 (không lộ trung tâm tồn tại). */
  async assertCanManageOrganization(actorId: string, organizationId: string): Promise<{ superAdmin: boolean; actor: Actor }> {
    const actor = await this.actor(actorId);
    if (actor.superAdmin) {
      const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
      if (!org) throw notFound();
      return { superAdmin: true, actor };
    }
    if (!actor.hasRole(organizationId, "CENTER_ADMIN")) throw notFound();
    return { superAdmin: false, actor };
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

  /** D-B10: vượt giới hạn tài khoản → chặn tạo mới, không ảnh hưởng người đang dùng. */
  async assertWithinLimit(organizationId: string, role: Role) {
    if (role !== "STUDENT" && role !== "TEACHER") return;
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { maxStudents: true, maxTeachers: true },
    });
    const max = role === "STUDENT" ? org.maxStudents : org.maxTeachers;
    if (max === null) return;
    const used = await this.prisma.roleAssignment.count({ where: { organizationId, role, revokedAt: null } });
    if (used >= max) {
      throw new AppException(
        HttpStatus.CONFLICT,
        "ACCOUNT_LIMIT_REACHED",
        `Trung tâm đã dùng hết ${max} tài khoản ${role === "STUDENT" ? "học viên" : "giáo viên"} được cấp. Vui lòng liên hệ quản trị nền tảng.`,
      );
    }
  }
}
