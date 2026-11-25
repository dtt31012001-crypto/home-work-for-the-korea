import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module";
import { AuthModule } from "../auth/auth.module";
import { GuardiansService } from "./guardians.service";
import { CenterPeopleController, MeController } from "./people.controller";

@Module({
  imports: [AuthModule, AccountsModule],
  controllers: [CenterPeopleController, MeController],
  providers: [GuardiansService],
  exports: [GuardiansService],
})
export class PeopleModule {}
