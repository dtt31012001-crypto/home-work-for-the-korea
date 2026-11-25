import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { notFound } from "../common/app-exception";
import { AccessService } from "./access.service";
import type { AuthContext } from "./decorators";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Route có tham số :orgId: chỉ Super Admin hoặc Center Admin của trung tâm đó đi tiếp.
 * Chạy trước bước kiểm tra dữ liệu → người ngoài luôn nhận 404, không biết route/trung tâm tồn tại.
 */
@Injectable()
export class OrganizationAdminGuard implements CanActivate {
  constructor(private readonly access: AccessService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ auth?: AuthContext; params: Record<string, string> }>();
    const orgId = req.params.orgId;
    if (!req.auth || !orgId || !UUID_RE.test(orgId)) throw notFound();
    await this.access.assertCanManageOrganization(req.auth.userId, orgId);
    return true;
  }
}
