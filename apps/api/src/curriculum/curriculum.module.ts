import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminCurriculumController, OrganizationCurriculumController } from "./curriculum.controller";
import { CurriculumService } from "./curriculum.service";

@Module({
  imports: [AuthModule],
  controllers: [AdminCurriculumController, OrganizationCurriculumController],
  providers: [CurriculumService],
  exports: [CurriculumService],
})
export class CurriculumModule {}
