import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClassesModule } from "../classes/classes.module";
import { AttendanceService } from "./attendance.service";
import { CenterAttendanceController, TeachingController } from "./attendance.controller";

@Module({ imports: [AuthModule, ClassesModule], controllers: [TeachingController, CenterAttendanceController], providers: [AttendanceService], exports: [AttendanceService] })
export class AttendanceModule {}
