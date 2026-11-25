import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AccountsModule } from "./accounts/accounts.module";
import { AuditModule } from "./audit/audit.module";
import { AuthGuard } from "./auth/auth.guard";
import { AuthModule } from "./auth/auth.module";
import { Public } from "./auth/decorators";
import { CsrfGuard } from "./common/csrf.guard";
import { CurriculumModule } from "./curriculum/curriculum.module";
import { PeopleModule } from "./people/people.module";
import { ClassesModule } from "./classes/classes.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { LearnerModule } from "./learner/learner.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PrismaService } from "./prisma/prisma.service";

@Controller("health")
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuditModule,
    AuthModule,
    AccountsModule,
    OrganizationsModule,
    CurriculumModule,
    PeopleModule,
    ClassesModule,
    AttendanceModule,
    LearnerModule,
  ],
  controllers: [HealthController],
  providers: [
    // Thứ tự: giới hạn tần suất → CSRF → xác thực
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
  ],
})
export class AppModule {}
