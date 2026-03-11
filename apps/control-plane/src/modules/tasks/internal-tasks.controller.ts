import { Body, Controller, NotFoundException, Param, Post } from "@nestjs/common";

import { OrchestrationService } from "../agent/orchestration.service.js";

@Controller("internal/tasks/:taskId")
export class InternalTasksController {
  constructor(private readonly orchestrationService: OrchestrationService) {}

  @Post("events")
  publishEvent(@Param("taskId") taskId: string, @Body() body: unknown) {
    const task = this.orchestrationService.publishExternalEvent(taskId, body);
    if (!task) {
      throw new NotFoundException(`Unknown task ${taskId}`);
    }

    return {
      ok: true
    };
  }

  @Post("sync")
  syncTask(@Param("taskId") taskId: string, @Body() body: unknown) {
    const task = this.orchestrationService.syncTaskState(taskId, body);
    if (!task) {
      throw new NotFoundException(`Unknown task ${taskId}`);
    }

    return task.result;
  }
}
