import { Module } from "@nestjs/common";
import { AccessService } from "./access.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { PasswordService } from "./password.service";
import { OrganizationAdminGuard } from "./organization-admin.guard";
import { SuperAdminGuard } from "./super-admin.guard";
import { TokensService } from "./tokens.service";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokensService,
    AccessService,
    AuthGuard,
    SuperAdminGuard,
    OrganizationAdminGuard,
  ],
  exports: [AccessService, PasswordService, AuthGuard, TokensService, SuperAdminGuard, OrganizationAdminGuard],
})
export class AuthModule {}
