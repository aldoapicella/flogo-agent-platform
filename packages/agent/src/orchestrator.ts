import type { TaskRequest, TaskResult, ToolResponse } from "@flogo-agent/contracts";
import { promptCatalog } from "@flogo-agent/prompts";
import { FlogoTooling } from "@flogo-agent/tools";
import { PolicyEngine } from "./policy";

export interface ModelClient {
  complete(input: {
    systemPrompt: string;
    userPrompt: string;
  }): Promise<{ content: string }>;
}

export interface OrchestrationPlan {
  workflow: TaskRequest["type"];
  promptVersion: string;
  approvalRequired: boolean;
  validation: ToolResponse;
}

export class AgentOrchestrator {
  constructor(
    private readonly flogoTooling = new FlogoTooling(),
    private readonly policyEngine = new PolicyEngine()
  ) {}

  createPlan(task: TaskRequest): OrchestrationPlan {
    const approval = this.policyEngine.assess(task);
    const draftGraph = this.flogoTooling.generateApp(task.prompt);
    const validation = this.flogoTooling.validateApp(draftGraph);

    return {
      workflow: task.type,
      promptVersion: promptCatalog.orchestrator.version,
      approvalRequired: Boolean(approval),
      validation
    };
  }

  buildResult(task: TaskRequest): TaskResult {
    const plan = this.createPlan(task);
    return {
      status: plan.approvalRequired ? "awaiting_approval" : "planning",
      patchSummary: `Prepared ${task.type} workflow using prompt ${plan.promptVersion}.`,
      validationReport: plan.validation.data.report as TaskResult["validationReport"],
      artifactRefs: []
    };
  }
}

