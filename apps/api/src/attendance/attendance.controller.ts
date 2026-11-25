import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ChangeRequestInput, SaveSessionInput, changeRequestSchema, decideRequestSchema, saveSessionSchema } from "@th/contracts";
import { z } from "zod";
import { clientMeta } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AccessService } from "../auth/access.service";
import { RequireRole } from "../auth/workspace-role.guard";
import { AuthContext, CurrentAuth } from "../auth/decorators";
import { OrganizationAdminGuard } from "../auth/organization-admin.guard";
import { AttendanceService } from "./attendance.service";

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const dayQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/** Workspace giáo viên (T-01, T-02, T-03): chỉ buổi/lớp giáo viên đang phụ trách, ở mọi trung tâm. */
@Controller("teaching")
@RequireRole("TEACHER")
export class TeachingController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly access: AccessService,
  ) {}

  @Get("today")
  async today(@CurrentAuth() a: AuthContext, @Query(new ZodValidationPipe(dayQuery)) q: z.infer<typeof dayQuery>) {
    return this.attendance.teacherDay(await this.access.actor(a.userId), q.date);
  }

  @Get("sessions/:id")
  async session(@CurrentAuth() a: AuthContext, @Param("id", uuid) id: string) {
    return this.attendance.workspace(await this.access.actor(a.userId), id, "TEACHER");
  }

  @Put("sessions/:id")
  async save(@CurrentAuth() a: AuthContext, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(saveSessionSchema)) b: SaveSessionInput, @Req() r: Request) {
    return this.attendance.save(await this.access.actor(a.userId), id, "TEACHER", b, clientMeta(r));
  }

  @Post("sessions/:id/change-requests")
  async request(@CurrentAuth() a: AuthContext, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(changeRequestSchema)) b: ChangeRequestInput, @Req() r: Request) {
    return this.attendance.requestChange(await this.access.actor(a.userId), id, b, clientMeta(r));
  }

  @Get("classes")
  async classes(@CurrentAuth() a: AuthContext) {
    return this.attendance.teacherClasses(await this.access.actor(a.userId));
  }

  @Get("classes/:id")
  async klass(@CurrentAuth() a: AuthContext, @Param("id", uuid) id: string) {
    return this.attendance.teacherClass(await this.access.actor(a.userId), id);
  }
}

/** Quản trị trung tâm: hôm nay (CA-01), sửa điểm danh, duyệt yêu cầu sửa, tiến độ lớp. */
@Controller("organizations/:orgId")
@UseGuards(OrganizationAdminGuard)
export class CenterAttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly access: AccessService,
  ) {}

  @Get("today")
  async today(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string) {
    return this.attendance.centerToday(await this.access.actor(a.userId), orgId);
  }

  @Get("sessions/:id/attendance")
  async session(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) _orgId: string, @Param("id", uuid) id: string) {
    return this.attendance.workspace(await this.access.actor(a.userId), id, "CENTER_ADMIN");
  }

  @Put("sessions/:id/attendance")
  async save(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) _orgId: string, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(saveSessionSchema)) b: SaveSessionInput, @Req() r: Request) {
    return this.attendance.save(await this.access.actor(a.userId), id, "CENTER_ADMIN", b, clientMeta(r));
  }

  @Post("attendance-requests/:id/approve")
  @HttpCode(204)
  async approve(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(decideRequestSchema)) b: { note?: string }, @Req() r: Request) {
    await this.attendance.decide(await this.access.actor(a.userId), orgId, id, true, b.note, clientMeta(r));
  }

  @Post("attendance-requests/:id/reject")
  @HttpCode(204)
  async reject(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Param("id", uuid) id: string, @Body(new ZodValidationPipe(decideRequestSchema)) b: { note?: string }, @Req() r: Request) {
    await this.attendance.decide(await this.access.actor(a.userId), orgId, id, false, b.note, clientMeta(r));
  }

  @Get("classes/:classId/progress")
  async progress(@CurrentAuth() a: AuthContext, @Param("orgId", uuid) orgId: string, @Param("classId", uuid) classId: string) {
    return this.attendance.progress(await this.access.actor(a.userId), orgId, classId);
  }
}
