import {
  type ApprovalType,
  type TaskRequest,
  TaskResultSchema,
  type TaskResult
} from "@flogo-agent/contracts";
import { validateFlogoApp } from "@flogo-agent/flogo-graph";
import type { PromptTemplate } from "@flogo-agent/prompts";
import { promptCatalog } from "@flogo-agent/prompts";
import type { ArtifactTools, FlogoTools, RepoTools, RunnerDispatcher, TestTools } from "@flogo-agent/tools";

export interface ModelClient {
  complete(prompt: PromptTemplate, input: Record<string, unknown>): Promise<{ content: string; confidence: number }>;
}

export interface AgentDependencies {
  modelClient: ModelClient;
  repo: RepoTools;
  flogo: FlogoTools;
  runner: RunnerDispatcher;
  test: TestTools;
  artifact: ArtifactTools;
}

export interface ExecutionPlanStep {
  id: string;
  label: string;
  tool?: string;
}

export interface ExecutionPlan {
  taskType: TaskRequest["type"];
  steps: ExecutionPlanStep[];
  requiredApprovals: ApprovalType[];
}

const approvalMap: Record<TaskRequest["type"], ApprovalType[]> = {
  create: [],
  update: ["change_public_contract"],
  debug: [],
  review: []
};

export class PolicyAgent {
  evaluate(task: TaskRequest): ApprovalType[] {
    const approvals = new Set<ApprovalType>(approvalMap[task.type]);
    if (!task.constraints.allowDependencyChanges && task.inputs.requiresDependencyChange === true) {
      approvals.add("dependency_upgrade");
    }
    if (!task.constraints.allowCustomCode && task.inputs.requiresCustomCode === true) {
      approvals.add("custom_code");
    }
    return Array.from(approvals);
  }
}

export class BuilderAgent {
  async createPlan(task: TaskRequest, modelClient: ModelClient): Promise<ExecutionPlan> {
    await modelClient.complete(promptCatalog.builder, { task });
    return {
      taskType: task.type,
      requiredApprovals: [],
      steps: [
        { id: "plan", label: "Plan the requested Flogo change" },
        { id: "generate", label: "Generate or patch flogo.json", tool: "flogo.generateApp" },
        { id: "validate-structural", label: "Run structural validation", tool: "flogo.validateApp" },
        { id: "validate-mappings", label: "Run mapping validation", tool: "flogo.validateMappings" },
        { id: "build", label: "Queue build job", tool: "runner.buildApp" },
        { id: "smoke", label: "Queue smoke test", tool: "test.runSmoke" }
      ]
    };
  }
}

export class DebuggerAgent {
  async createPlan(task: TaskRequest, modelClient: ModelClient): Promise<ExecutionPlan> {
    await modelClient.complete(promptCatalog.debugger, { task });
    return {
      taskType: task.type,
      requiredApprovals: [],
      steps: [
        { id: "parse", label: "Parse current flogo.json", tool: "flogo.parseApp" },
        { id: "classify", label: "Classify the failure and root cause" },
        { id: "patch", label: "Prepare minimal patch", tool: "flogo.patchApp" },
        { id: "validate", label: "Validate the fix", tool: "flogo.validateApp" },
        { id: "retest", label: "Re-run smoke test", tool: "test.runSmoke" }
      ]
    };
  }
}

export class ReviewerAgent {
  async createPlan(task: TaskRequest, modelClient: ModelClient): Promise<ExecutionPlan> {
    await modelClient.complete(promptCatalog.reviewer, { task });
    return {
      taskType: task.type,
      requiredApprovals: [],
      steps: [
        { id: "parse", label: "Parse the current app", tool: "flogo.parseApp" },
        { id: "review", label: "Review maintainability, mapping correctness, and security posture" },
        { id: "artifact", label: "Publish review report", tool: "artifact.publish" }
      ]
    };
  }
}

export class OrchestratorAgent {
  private readonly builder = new BuilderAgent();
  private readonly debugger = new DebuggerAgent();
  private readonly reviewer = new ReviewerAgent();
  private readonly policy = new PolicyAgent();

  constructor(private readonly dependencies: AgentDependencies) {}

  async planTask(task: TaskRequest): Promise<ExecutionPlan> {
    const requiredApprovals = this.policy.evaluate(task);
    let plan: ExecutionPlan;

    switch (task.type) {
      case "create":
      case "update":
        plan = await this.builder.createPlan(task, this.dependencies.modelClient);
        break;
      case "debug":
        plan = await this.debugger.createPlan(task, this.dependencies.modelClient);
        break;
      case "review":
        plan = await this.reviewer.createPlan(task, this.dependencies.modelClient);
        break;
    }

    return { ...plan, requiredApprovals };
  }

  async validateDocument(document: string | object): Promise<TaskResult> {
    const validationReport = validateFlogoApp(document);
    return TaskResultSchema.parse({
      taskId: "validation",
      type: "review",
      status: validationReport.ok ? "completed" : "failed",
      summary: validationReport.summary,
      validationReport,
      artifacts: [],
      requiredApprovals: [],
      nextActions: validationReport.ok ? ["Queue build and smoke test"] : ["Fix validation errors"]
    });
  }
}

export class StaticModelClient implements ModelClient {
  async complete(prompt: PromptTemplate, input: Record<string, unknown>): Promise<{ content: string; confidence: number }> {
    return {
      content: `${prompt.id}:${JSON.stringify(input)}`,
      confidence: 0.5
    };
  }
}
