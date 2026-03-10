import { Body, Controller, Inject, Param, Post, forwardRef } from "@nestjs/common";
import { ApprovalDecisionSchema } from "@flogo-agent/contracts";
import { ApprovalsService } from "./approvals.service";
import { TasksService } from "../tasks/tasks.service";

@Controller("tasks/:taskId/approvals")
export class ApprovalsController {
  constructor(
    private readonly approvalsService: ApprovalsService,
    @Inject(forwardRef(() => TasksService))
    private readonly tasksService: TasksService
  ) {}

  @Post()
  async decide(@Param("taskId") taskId: string, @Body() body: unknown) {
    const decision = ApprovalDecisionSchema.parse(body);
    const approvals = this.approvalsService.decide(taskId, decision);
    await this.tasksService.applyApproval(taskId, decision.status);
    return approvals;
  }
}
