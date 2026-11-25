import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminOrganizationsController, OrganizationController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  imports: [AuthModule],
  controllers: [AdminOrganizationsController, OrganizationController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
