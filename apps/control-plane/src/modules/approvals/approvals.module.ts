import { Global, Module, forwardRef } from "@nestjs/common";
import { ApprovalsController } from "./approvals.controller";
import { ApprovalsService } from "./approvals.service";
import { TasksModule } from "../tasks/tasks.module";

@Global()
@Module({
  imports: [forwardRef(() => TasksModule)],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService]
})
export class ApprovalsModule {}
