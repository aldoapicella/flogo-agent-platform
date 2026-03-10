import { Global, Module, forwardRef } from "@nestjs/common";
import { TasksController } from "./tasks.controller";
import { TasksService } from "./tasks.service";
import { ApprovalsModule } from "../approvals/approvals.module";

@Global()
@Module({
  imports: [forwardRef(() => ApprovalsModule)],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService]
})
export class TasksModule {}
