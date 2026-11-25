import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClassesController } from "./classes.controller";
import { ClassesService } from "./classes.service";
import { EnrollmentsService } from "./enrollments.service";

@Module({ imports: [AuthModule], controllers: [ClassesController], providers: [ClassesService, EnrollmentsService], exports: [ClassesService] })
export class ClassesModule {}
