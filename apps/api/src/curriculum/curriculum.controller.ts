import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import {
  CreateEditionInput,
  CreateLevelInput,
  LessonInput,
  UpdateEditionInput,
  UpdateLessonInput,
  UpdateLevelInput,
  UpdateSeriesInput,
  bulkLessonsSchema,
  createEditionSchema,
  createLevelSchema,
  grantSchema,
  lessonSchema,
  updateEditionSchema,
  updateLessonSchema,
  updateLevelSchema,
  updateSeriesSchema,
} from "@th/contracts";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AccessService } from "../auth/access.service";
import { AuthContext, CurrentAuth } from "../auth/decorators";
import { OrganizationAdminGuard } from "../auth/organization-admin.guard";
import { SuperAdminGuard } from "../auth/super-admin.guard";
import { CurriculumService } from "./curriculum.service";

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

/** SA-02: quản lý giáo trình (chỉ Super Admin). */
@Controller("admin/curricula")
@UseGuards(SuperAdminGuard)
export class AdminCurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Get()
  tree() {
    return this.curriculum.tree();
  }

  @Patch("series/:id")
  @HttpCode(204)
  updateSeries(@CurrentAuth() a: AuthContext, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(updateSeriesSchema)) b: UpdateSeriesInput) {
    return this.curriculum.updateSeries(a.userId, id, b);
  }

  @Post("levels")
  createLevel(@CurrentAuth() a: AuthContext, @Body(new ZodValidationPipe(createLevelSchema)) b: CreateLevelInput) {
    return this.curriculum.createLevel(a.userId, b);
  }

  @Patch("levels/:id")
  @HttpCode(204)
  updateLevel(@CurrentAuth() a: AuthContext, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(updateLevelSchema)) b: UpdateLevelInput) {
    return this.curriculum.updateLevel(a.userId, id, b);
  }

  @Post("editions")
  createEdition(@CurrentAuth() a: AuthContext, @Body(new ZodValidationPipe(createEditionSchema)) b: CreateEditionInput) {
    return this.curriculum.createEdition(a.userId, b);
  }

  @Get("editions/:id")
  edition(@Param("id", uuid) id: string) {
    return this.curriculum.edition(id);
  }

  @Patch("editions/:id")
  @HttpCode(204)
  updateEdition(@CurrentAuth() a: AuthContext, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(updateEditionSchema)) b: UpdateEditionInput) {
    return this.curriculum.updateEdition(a.userId, id, b);
  }

  @Post("editions/:id/lessons")
  addLesson(@CurrentAuth() a: AuthContext, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(lessonSchema)) b: LessonInput) {
    return this.curriculum.addLesson(a.userId, id, b);
  }

  @Post("editions/:id/lessons/bulk")
  addLessonsBulk(@CurrentAuth() a: AuthContext, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(bulkLessonsSchema)) b: { text: string }) {
    return this.curriculum.addLessonsBulk(a.userId, id, b.text);
  }

  @Patch("lessons/:id")
  @HttpCode(204)
  updateLesson(@CurrentAuth() a: AuthContext, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(updateLessonSchema)) b: UpdateLessonInput) {
    return this.curriculum.updateLesson(a.userId, id, b);
  }
}

/** Giáo trình được cấp cho trung tâm: Center Admin xem; Super Admin cấp/thu hồi. */
@Controller("organizations/:orgId/curricula")
@UseGuards(OrganizationAdminGuard)
export class OrganizationCurriculumController {
  constructor(
    private readonly curriculum: CurriculumService,
    private readonly access: AccessService,
  ) {}

  @Get()
  async list(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string) {
    return this.curriculum.granted(await this.access.actor(a.userId), orgId);
  }

  @Post()
  @UseGuards(SuperAdminGuard)
  async grant(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Body(new ZodValidationPipe(grantSchema)) b: { editionId: string }) {
    return this.curriculum.grant(await this.access.actor(a.userId), orgId, b.editionId);
  }

  @Post(":grantId/revoke")
  @UseGuards(SuperAdminGuard)
  @HttpCode(204)
  async revoke(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Param("grantId", uuid) grantId: string) {
    await this.curriculum.revokeGrant(await this.access.actor(a.userId), orgId, grantId);
  }
}
