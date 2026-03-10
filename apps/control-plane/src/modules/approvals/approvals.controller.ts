import { Body, Controller, NotFoundException, Param, Post } from "@nestjs/common";

import { ApprovalDecisionSchema } from "@flogo-agent/contracts";

import { OrchestrationService } from "../agent/orchestration.service.js";

@Controller("tasks/:taskId/approvals")
export class ApprovalsController {
  constructor(private readonly orchestrationService: OrchestrationService) {}

  @Post()
  async approve(@Param("taskId") taskId: string, @Body() body: unknown) {
    const decision = ApprovalDecisionSchema.parse({
      ...((body as Record<string, unknown>) ?? {}),
      taskId
    });
    const task = await this.orchestrationService.approveTask(taskId, decision.rationale);
    if (!task) {
      throw new NotFoundException(`Unknown task ${taskId}`);
    }
    return task.result;
  }
}

