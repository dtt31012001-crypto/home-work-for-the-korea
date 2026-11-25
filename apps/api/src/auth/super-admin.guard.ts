import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { notFound } from "../common/app-exception";
import { AccessService } from "./access.service";
import type { AuthContext } from "./decorators";

/** Chặn trước bước kiểm tra dữ liệu: người không phải Super Admin luôn nhận 404. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly access: AccessService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const auth = ctx.switchToHttp().getRequest<{ auth?: AuthContext }>().auth;
    if (!auth || !(await this.access.isSuperAdmin(auth.userId))) throw notFound();
    return true;
  }
}
