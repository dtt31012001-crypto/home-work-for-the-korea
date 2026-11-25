import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClassesModule } from "../classes/classes.module";
import { AttendanceService } from "./attendance.service";
import { AttendanceReportService } from "./report.service";
import { CenterAttendanceController, TeachingController } from "./attendance.controller";

@Module({ imports: [AuthModule, ClassesModule], controllers: [TeachingController, CenterAttendanceController], providers: [AttendanceService, AttendanceReportService], exports: [AttendanceService] })
export class AttendanceModule {}
