import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  AddSessionInput,
  CancelSessionInput,
  ChangeScheduleInput,
  ChangeTeacherInput,
  CreateClassInput,
  EnrollInput,
  UpdateClassInput,
  UpdateSessionInput,
  addSessionSchema,
  cancelSessionSchema,
  changeScheduleSchema,
  changeTeacherSchema,
  createClassSchema,
  enrollSchema,
  holdSchema,
  resumeSchema,
  transferSchema,
  updateClassSchema,
  updateSessionSchema,
  withdrawSchema,
} from "@th/contracts";
import { z } from "zod";
import { clientMeta } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AccessService } from "../auth/access.service";
import { AuthContext, CurrentAuth } from "../auth/decorators";
import { OrganizationAdminGuard } from "../auth/organization-admin.guard";
import { ClassesService } from "./classes.service";
import { EnrollmentsService } from "./enrollments.service";

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const calendarQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchId: z.string().uuid().optional(),
  teacherUserId: z.string().uuid().optional(),
});

/** CA-02, CA-03, CA-06: lớp học, ghi danh, buổi học, lịch trung tâm. */
@Controller("organizations/:orgId")
@UseGuards(OrganizationAdminGuard)
export class ClassesController {
  constructor(
    private readonly classes: ClassesService,
    private readonly enrollments: EnrollmentsService,
    private readonly access: AccessService,
  ) {}

  private actor(a: AuthContext) {
    return this.access.actor(a.userId);
  }

  @Get("classes")
  async list(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string) {
    return this.classes.list(await this.actor(a), orgId);
  }

  @Post("classes/preview")
  @HttpCode(200)
  async preview(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Body(new ZodValidationPipe(createClassSchema)) b: CreateClassInput) {
    return this.classes.preview(await this.actor(a), orgId, b);
  }

  @Post("classes")
  async create(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Body(new ZodValidationPipe(createClassSchema)) b: CreateClassInput, @Req() r: Request) {
    return this.classes.create(await this.actor(a), orgId, b, clientMeta(r));
  }

  @Get("classes/:classId")
  async detail(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Param("classId", uuid) classId: string) {
    return this.classes.detail(await this.actor(a), orgId, classId);
  }

  @Patch("classes/:classId")
  @HttpCode(204)
  async update(
    @CurrentAuth() a: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Param("classId", uuid) classId: string,
    @Body(new ZodValidationPipe(updateClassSchema)) b: UpdateClassInput,
    @Req() r: Request,
  ) {
    await this.classes.update(await this.actor(a), orgId, classId, b, clientMeta(r));
  }

  @Post("classes/:classId/teacher")
  @HttpCode(204)
  async changeTeacher(
    @CurrentAuth() a: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Param("classId", uuid) classId: string,
    @Body(new ZodValidationPipe(changeTeacherSchema)) b: ChangeTeacherInput,
    @Req() r: Request,
  ) {
    await this.classes.changeTeacher(await this.actor(a), orgId, classId, b, clientMeta(r));
  }

  @Post("classes/:classId/schedule")
  @HttpCode(204)
  async changeSchedule(
    @CurrentAuth() a: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Param("classId", uuid) classId: string,
    @Body(new ZodValidationPipe(changeScheduleSchema)) b: ChangeScheduleInput,
    @Req() r: Request,
  ) {
    await this.classes.changeSchedule(await this.actor(a), orgId, classId, b, clientMeta(r));
  }

  @Post("classes/:classId/sessions")
  async addSession(
    @CurrentAuth() a: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Param("classId", uuid) classId: string,
    @Body(new ZodValidationPipe(addSessionSchema)) b: AddSessionInput,
    @Req() r: Request,
  ) {
    return this.classes.addSession(await this.actor(a), orgId, classId, b, clientMeta(r));
  }

  @Patch("sessions/:sessionId")
  @HttpCode(204)
  async updateSession(
    @CurrentAuth() a: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Param("sessionId", uuid) sessionId: string,
    @Body(new ZodValidationPipe(updateSessionSchema)) b: UpdateSessionInput,
    @Req() r: Request,
  ) {
    await this.classes.updateSession(await this.actor(a), orgId, sessionId, b, clientMeta(r));
  }

  @Post("sessions/:sessionId/cancel")
  @HttpCode(200)
  async cancelSession(
    @CurrentAuth() a: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Param("sessionId", uuid) sessionId: string,
    @Body(new ZodValidationPipe(cancelSessionSchema)) b: CancelSessionInput,
    @Req() r: Request,
  ) {
    return this.classes.cancelSession(await this.actor(a), orgId, sessionId, b, clientMeta(r));
  }

  @Post("classes/:classId/enrollments")
  async enroll(
    @CurrentAuth() a: AuthContext,
    @Param("orgId", uuid) orgId: string,
    @Param("classId", uuid) classId: string,
    @Body(new ZodValidationPipe(enrollSchema)) b: EnrollInput,
    @Req() r: Request,
  ) {
    return this.enrollments.enroll(await this.actor(a), orgId, classId, b, clientMeta(r));
  }

  @Post("enrollments/:id/hold")
  @HttpCode(204)
  async hold(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(holdSchema)) b: z.infer<typeof holdSchema>, @Req() r: Request) {
    await this.enrollments.hold(await this.actor(a), orgId, id, b, clientMeta(r));
  }

  @Post("enrollments/:id/resume")
  @HttpCode(204)
  async resume(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(resumeSchema)) b: z.infer<typeof resumeSchema>, @Req() r: Request) {
    await this.enrollments.resume(await this.actor(a), orgId, id, b, clientMeta(r));
  }

  @Post("enrollments/:id/withdraw")
  @HttpCode(204)
  async withdraw(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(withdrawSchema)) b: z.infer<typeof withdrawSchema>, @Req() r: Request) {
    await this.enrollments.withdraw(await this.actor(a), orgId, id, b, clientMeta(r));
  }

  @Post("enrollments/:id/transfer")
  async transfer(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(transferSchema)) b: z.infer<typeof transferSchema>, @Req() r: Request) {
    return this.enrollments.transfer(await this.actor(a), orgId, id, b, clientMeta(r));
  }

  @Get("calendar")
  async calendar(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Query(new ZodValidationPipe(calendarQuery)) q: z.infer<typeof calendarQuery>) {
    return this.classes.calendar(await this.actor(a), orgId, q.from, q.to, { branchId: q.branchId, teacherUserId: q.teacherUserId });
  }
}
