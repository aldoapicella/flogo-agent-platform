import { Body, Controller, Headers, NotFoundException, Param, Post } from "@nestjs/common";

import { OrchestrationService } from "../agent/orchestration.service.js";
import { InternalAuthService } from "../auth/internal-auth.service.js";

@Controller("internal/tasks/:taskId")
export class InternalTasksController {
  constructor(
    private readonly orchestrationService: OrchestrationService,
    private readonly internalAuthService: InternalAuthService
  ) {}

  @Post("events")
  async publishEvent(@Param("taskId") taskId: string, @Headers() headers: Record<string, unknown>, @Body() body: unknown) {
    this.internalAuthService.assert(headers);
    const task = await this.orchestrationService.publishExternalEvent(taskId, body);
    if (!task) {
      throw new NotFoundException(`Unknown task ${taskId}`);
    }

    return {
      ok: true
    };
  }

  @Post("sync")
  async syncTask(@Param("taskId") taskId: string, @Headers() headers: Record<string, unknown>, @Body() body: unknown) {
    this.internalAuthService.assert(headers);
    const task = await this.orchestrationService.syncTaskState(taskId, body);
    if (!task) {
      throw new NotFoundException(`Unknown task ${taskId}`);
    }

    return task.result;
  }
}
