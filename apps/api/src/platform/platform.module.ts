import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module";
import { AuthModule } from "../auth/auth.module";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";

@Module({ imports: [AuthModule, AccountsModule], controllers: [PlatformController], providers: [PlatformService] })
export class PlatformModule {}
