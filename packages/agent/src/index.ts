import type {
  ApprovalType,
  TaskRequest,
  TaskResult,
  ToolResponse,
  ValidationReport
} from "@flogo-agent/contracts";
import { TaskResultSchema } from "@flogo-agent/contracts";
import { promptCatalog, type PromptTemplate } from "@flogo-agent/prompts";
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
  validation?: ToolResponse;
  summary: string;
}

const approvalMap: Record<TaskRequest["type"], ApprovalType[]> = {
  create: [],
  update: ["change_public_contract"],
  debug: [],
  review: []
};

function getAnalysisMode(task: TaskRequest): "catalog" | "mapping_preview" | undefined {
  const mode = task.inputs["mode"];
  return mode === "catalog" || mode === "mapping_preview" ? mode : undefined;
}

export class PolicyEngine {
  evaluate(task: TaskRequest): ApprovalType[] {
    if (getAnalysisMode(task)) {
      return [];
    }

    const approvals = new Set<ApprovalType>(approvalMap[task.type]);
    const summary = task.summary.toLowerCase();

    if (!task.constraints.allowDependencyChanges && summary.includes("upgrade")) {
      approvals.add("dependency_upgrade");
    }

    if (!task.constraints.allowCustomCode && (summary.includes("custom activity") || summary.includes("custom trigger"))) {
      approvals.add("custom_code");
    }

    if (summary.includes("delete") || summary.includes("remove")) {
      approvals.add("delete_flow");
    }

    if (summary.includes("deploy")) {
      approvals.add("deploy");
    }

    return Array.from(approvals);
  }
}

export class TaskPlanner {
  private readonly policy = new PolicyEngine();

  plan(task: TaskRequest): ExecutionPlan {
    const validation = task.type === "create" ? undefined : this.validateDraft(task);
    const summary = task.summary.toLowerCase();
    const analysisMode = getAnalysisMode(task);
    const steps: ExecutionPlanStep[] = [
      { id: "graph", label: "Parse current Flogo graph", tool: "flogo.parseApp" },
      { id: "validate", label: "Validate structure and mappings", tool: "flogo.validateApp" }
    ];

    if (analysisMode === "catalog") {
      steps.push({ id: "catalog", label: "Catalog Flogo contributions and descriptors", tool: "runner.catalogContribs" });
    } else if (analysisMode === "mapping_preview") {
      steps.push({ id: "mapping", label: "Preview mappings and suggest coercions", tool: "runner.previewMapping" });
      steps.push({ id: "properties", label: "Plan app properties and environment usage", tool: "flogo.planProperties" });
    } else {
      if (/(trigger|activity|action|contrib|descriptor|catalog)/i.test(summary)) {
        steps.push({ id: "catalog", label: "Catalog Flogo contributions and descriptors", tool: "runner.catalogContribs" });
      }

      if (/(mapping|coercion|resolver|property|env)/i.test(summary)) {
        steps.push({ id: "mapping", label: "Preview mappings and suggest coercions", tool: "runner.previewMapping" });
      }

      if (/(property|env|config)/i.test(summary)) {
        steps.push({ id: "properties", label: "Plan app properties and environment usage", tool: "flogo.planProperties" });
      }
    }

    if (!analysisMode) {
      steps.push(
        { id: "patch", label: "Generate or patch flogo.json", tool: task.type === "create" ? "flogo.generateApp" : "flogo.patchApp" },
        { id: "build", label: "Queue build step", tool: "runner.buildApp" },
        { id: "smoke", label: "Queue smoke validation", tool: "test.runSmoke" }
      );
    }

    return {
      taskType: task.type,
      requiredApprovals: this.policy.evaluate(task),
      validation,
      summary: `Prepared ${task.type} workflow for ${task.summary}.`,
      steps
    };
  }

  private validateDraft(task: TaskRequest): ToolResponse | undefined {
    if (!task.appPath) {
      return undefined;
    }

    return {
      ok: true,
      summary: `Validation deferred until ${task.appPath} is loaded.`,
      data: {},
      diagnostics: [],
      artifacts: [],
      retryable: false
    };
  }
}

export class OrchestratorAgent {
  private readonly planner = new TaskPlanner();

  constructor(private readonly dependencies: AgentDependencies) {}

  async planTask(task: TaskRequest): Promise<ExecutionPlan> {
    await this.dependencies.modelClient.complete(promptCatalog.orchestrator, { task });
    return this.planner.plan(task);
  }

  buildResult(task: TaskRequest, validationReport?: ValidationReport): TaskResult {
    const plan = this.planner.plan(task);
    return TaskResultSchema.parse({
      taskId: task.taskId ?? "pending",
      type: task.type,
      status: plan.requiredApprovals.length > 0 ? "awaiting_approval" : "planning",
      summary: plan.summary,
      validationReport,
      artifacts: [],
      requiredApprovals: plan.requiredApprovals,
      nextActions: plan.steps.map((step) => step.label)
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
