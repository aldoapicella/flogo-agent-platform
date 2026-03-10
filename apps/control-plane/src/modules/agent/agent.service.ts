import { Injectable } from "@nestjs/common";
import { TaskPlanner, PolicyEngine } from "@flogo-agent/agent";
import { type TaskRequest } from "@flogo-agent/contracts";

@Injectable()
export class AgentService {
  private readonly planner = new TaskPlanner();
  private readonly policy = new PolicyEngine();

  plan(request: TaskRequest) {
    return this.planner.plan(request);
  }

  approvals(request: TaskRequest) {
    return this.policy.evaluate(request);
  }
}

