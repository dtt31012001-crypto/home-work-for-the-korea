import { Module } from "@nestjs/common";
import { AttendanceModule } from "../attendance/attendance.module";
import { AuthModule } from "../auth/auth.module";
import { ClassesModule } from "../classes/classes.module";
import { PeopleModule } from "../people/people.module";
import { FamilyController, LearningController } from "./learner.controller";
import { LearnerService } from "./learner.service";

@Module({ imports: [AuthModule, ClassesModule, AttendanceModule, PeopleModule], controllers: [LearningController, FamilyController], providers: [LearnerService] })
export class LearnerModule {}
