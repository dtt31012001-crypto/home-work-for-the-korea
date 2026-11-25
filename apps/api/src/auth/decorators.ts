import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";

export const IS_PUBLIC = "th:isPublic";
export const ALLOW_PENDING_PASSWORD_CHANGE = "th:allowPendingPasswordChange";

/** Không cần đăng nhập. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Cho phép gọi khi người dùng còn đang phải đổi mật khẩu tạm. */
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE, true);

export interface AuthContext {
  userId: string;
  sessionId: string;
  mustChangePassword: boolean;
}

export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  return ctx.switchToHttp().getRequest().auth;
});
