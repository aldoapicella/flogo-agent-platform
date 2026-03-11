import { Module } from "@nestjs/common";

import { InternalTasksController } from "./internal-tasks.controller.js";
import { TasksController } from "./tasks.controller.js";

@Module({
  controllers: [InternalTasksController, TasksController]
})
export class TasksModule {}
