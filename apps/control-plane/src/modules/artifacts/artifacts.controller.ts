import { Controller, Get, NotFoundException, Param } from "@nestjs/common";

import { OrchestrationService } from "../agent/orchestration.service.js";

@Controller("tasks/:taskId/artifacts")
export class ArtifactsController {
  constructor(private readonly orchestrationService: OrchestrationService) {}

  @Get()
  listArtifacts(@Param("taskId") taskId: string) {
    const task = this.orchestrationService.getTask(taskId);
    if (!task) {
      throw new NotFoundException(`Unknown task ${taskId}`);
    }
    return this.orchestrationService.listArtifacts(taskId);
  }
}

