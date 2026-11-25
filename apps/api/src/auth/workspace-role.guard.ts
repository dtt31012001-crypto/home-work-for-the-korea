import { CanActivate, ExecutionContext, Injectable, SetMetadata, UseGuards, applyDecorators } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Role } from "@prisma/client";
import { notFound } from "../common/app-exception";
import { AccessService } from "./access.service";
import type { AuthContext } from "./decorators";

const KEY = "workspace-role";

/** Chặn trước bước kiểm tra dữ liệu: người không có vai trò (còn hiệu lực, ở trung tâm đang hoạt động) nhận 404. */
@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    private readonly access: AccessService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const role = this.reflector.getAllAndOverride<Role>(KEY, [ctx.getHandler(), ctx.getClass()]);
    const auth = ctx.switchToHttp().getRequest<{ auth?: AuthContext }>().auth;
    if (!auth) throw notFound();
    const actor = await this.access.actor(auth.userId);
    if (actor.organizationIds(role).length === 0) throw notFound();
    return true;
  }
}

/** Workspace chỉ dành cho một vai trò (giáo viên, học viên, phụ huynh). */
export const RequireRole = (role: Role) => applyDecorators(SetMetadata(KEY, role), UseGuards(WorkspaceRoleGuard));
