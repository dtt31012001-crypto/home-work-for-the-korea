import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AccessService } from "../auth/access.service";
import { RequireRole } from "../auth/workspace-role.guard";
import { AuthContext, CurrentAuth } from "../auth/decorators";
import { GuardiansService } from "../people/guardians.service";
import { LearnerService } from "./learner.service";

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const range = z
  .object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  .refine((r) => r.from <= r.to, "Khoảng ngày không hợp lệ");

/** HV-01/02: học viên xem dữ liệu của chính mình. */
@Controller("learning")
@RequireRole("STUDENT")
export class LearningController {
  constructor(
    private readonly learner: LearnerService,
    private readonly access: AccessService,
  ) {}

  @Get("overview")
  async overview(@CurrentAuth() a: AuthContext) {
    return this.learner.overview(await this.access.actor(a.userId), a.userId, "STUDENT");
  }

  @Get("schedule")
  async schedule(@CurrentAuth() a: AuthContext, @Query(new ZodValidationPipe(range)) q: z.infer<typeof range>) {
    return this.learner.schedule(await this.access.actor(a.userId), a.userId, "STUDENT", q.from, q.to);
  }
}

/** PH-01/02: phụ huynh xem dữ liệu con có liên kết hiệu lực. */
@Controller("family")
@RequireRole("PARENT")
export class FamilyController {
  constructor(
    private readonly learner: LearnerService,
    private readonly guardians: GuardiansService,
    private readonly access: AccessService,
  ) {}

  @Get("children")
  async children(@CurrentAuth() a: AuthContext) {
    return this.guardians.effectiveChildren(await this.access.actor(a.userId));
  }

  @Get("children/:studentId/overview")
  async overview(@CurrentAuth() a: AuthContext, @Param("studentId", uuid) studentId: string) {
    return this.learner.overview(await this.access.actor(a.userId), studentId, "PARENT");
  }

  @Get("children/:studentId/schedule")
  async schedule(@CurrentAuth() a: AuthContext, @Param("studentId", uuid) studentId: string, @Query(new ZodValidationPipe(range)) q: z.infer<typeof range>) {
    return this.learner.schedule(await this.access.actor(a.userId), studentId, "PARENT", q.from, q.to);
  }
}
