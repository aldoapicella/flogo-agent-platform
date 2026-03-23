import { Body, Controller, NotFoundException, Param, Post } from "@nestjs/common";

import { ApprovalDecisionSchema } from "@flogo-agent/contracts";

import { OrchestrationService } from "../agent/orchestration.service.js";

@Controller("tasks/:taskId/approvals")
export class ApprovalsController {
  constructor(private readonly orchestrationService: OrchestrationService) {}

  @Post()
  async approve(@Param("taskId") taskId: string, @Body() body: unknown) {
    const task = await this.orchestrationService.getTask(taskId);
    if (!task) {
      throw new NotFoundException(`Unknown task ${taskId}`);
    }

    const requestedType = (body as Record<string, unknown>)?.type as string | undefined;
    const fallbackType =
      requestedType ??
      (task.result.requiredApprovals.length === 1 ? task.result.requiredApprovals[0] : "change_public_contract");
    const decision = ApprovalDecisionSchema.parse({
      ...((body as Record<string, unknown>) ?? {}),
      taskId,
      status: ((body as Record<string, unknown>)?.status as string | undefined) ?? "approved",
      type: fallbackType
    });
    const updated = await this.orchestrationService.approveTask(taskId, decision);
    return updated?.result ?? task.result;
  }
}
