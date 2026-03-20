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

function getAnalysisMode(
  task: TaskRequest
) :
  | "flow_contracts"
  | "trigger_binding_plan"
  | "subflow_extraction_plan"
  | "subflow_inlining_plan"
  | "iterator_plan"
  | "retry_policy_plan"
  | "dowhile_plan"
  | "error_path_plan"
  | "run_trace_plan"
  | "run_trace"
  | "replay_plan"
  | "replay"
  | "run_comparison_plan"
  | "run_comparison"
  | "inventory"
  | "catalog"
  | "contrib_evidence"
  | "activity_scaffold"
  | "action_scaffold"
  | "trigger_scaffold"
  | "mapping_preview"
  | "mapping_test"
  | "property_plan"
  | "governance"
  | "composition_compare"
  | "diagnosis"
  | undefined {
  const mode = task.inputs["mode"];
  return mode === "flow_contracts" ||
    mode === "trigger_binding_plan" ||
    mode === "subflow_extraction_plan" ||
    mode === "subflow_inlining_plan" ||
    mode === "iterator_plan" ||
    mode === "retry_policy_plan" ||
    mode === "dowhile_plan" ||
    mode === "error_path_plan" ||
    mode === "run_trace_plan" ||
    mode === "run_trace" ||
    mode === "replay_plan" ||
    mode === "replay" ||
    mode === "run_comparison_plan" ||
    mode === "run_comparison" ||
    mode === "inventory" ||
    mode === "catalog" ||
    mode === "contrib_evidence" ||
    mode === "activity_scaffold" ||
    mode === "action_scaffold" ||
    mode === "trigger_scaffold" ||
    mode === "mapping_preview" ||
    mode === "mapping_test" ||
    mode === "property_plan" ||
    mode === "governance" ||
    mode === "composition_compare" ||
    mode === "diagnosis"
    ? mode
    : undefined;
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
    let skipMutationTail = Boolean(analysisMode);
    const steps: ExecutionPlanStep[] = [
      { id: "graph", label: "Parse current Flogo graph", tool: "flogo.parseApp" },
      { id: "validate", label: "Validate structure and mappings", tool: "flogo.validateApp" }
    ];

    if (analysisMode === "flow_contracts") {
      steps.push({ id: "flow-contracts", label: "Infer reusable flow input/output contracts", tool: "runner.inferFlowContracts" });
    } else if (analysisMode === "trigger_binding_plan") {
      steps.push({ id: "bind-trigger", label: "Plan trigger binding for an existing flow", tool: "runner.bindTrigger" });
    } else if (analysisMode === "subflow_extraction_plan") {
      steps.push({ id: "extract-subflow", label: "Plan extracting a selected task region into a reusable subflow", tool: "runner.extractSubflow" });
    } else if (analysisMode === "subflow_inlining_plan") {
      steps.push({ id: "inline-subflow", label: "Plan inlining a subflow invocation back into the parent flow", tool: "runner.inlineSubflow" });
    } else if (analysisMode === "iterator_plan") {
      steps.push({ id: "iterator", label: "Plan iterator synthesis for a flow task", tool: "runner.addIterator" });
    } else if (analysisMode === "retry_policy_plan") {
      steps.push({ id: "retry", label: "Plan retryOnError synthesis for a flow task", tool: "runner.addRetryPolicy" });
    } else if (analysisMode === "dowhile_plan") {
      steps.push({ id: "dowhile", label: "Plan doWhile synthesis for a flow task", tool: "runner.addDoWhile" });
    } else if (analysisMode === "error_path_plan") {
      steps.push({ id: "error-path", label: "Plan a generated error branch for a flow task", tool: "runner.addErrorPath" });
    } else if (analysisMode === "run_trace_plan") {
      steps.push({ id: "run-trace", label: "Validate runtime trace capture for a flow", tool: "runner.captureRunTrace" });
    } else if (analysisMode === "run_trace") {
      steps.push({ id: "run-trace", label: "Execute a flow and capture a runtime trace", tool: "runner.captureRunTrace" });
    } else if (analysisMode === "replay_plan") {
      steps.push({ id: "replay", label: "Validate replay execution for a flow", tool: "runner.replayFlow" });
    } else if (analysisMode === "replay") {
      steps.push({ id: "replay", label: "Replay a flow execution with optional overrides", tool: "runner.replayFlow" });
    } else if (analysisMode === "run_comparison_plan") {
      steps.push({ id: "run-comparison", label: "Validate comparison of two captured runtime executions", tool: "runner.compareRuns" });
    } else if (analysisMode === "run_comparison") {
      steps.push({ id: "run-comparison", label: "Compare two captured runtime executions", tool: "runner.compareRuns" });
    } else if (analysisMode === "inventory") {
      steps.push({ id: "inventory", label: "Inventory Flogo contributions and package evidence", tool: "runner.inventoryContribs" });
    } else if (analysisMode === "catalog") {
      steps.push({ id: "catalog", label: "Catalog Flogo contributions and descriptors", tool: "runner.catalogContribs" });
    } else if (analysisMode === "contrib_evidence") {
      steps.push({ id: "evidence", label: "Inspect contribution evidence quality", tool: "runner.inspectContribEvidence" });
    } else if (analysisMode === "activity_scaffold") {
      steps.push({ id: "activity-scaffold", label: "Scaffold a custom Flogo activity bundle with isolated build/test proof", tool: "runner.scaffoldActivity" });
    } else if (analysisMode === "action_scaffold") {
      steps.push({ id: "action-scaffold", label: "Scaffold a custom Flogo action bundle with isolated build/test proof", tool: "runner.scaffoldAction" });
    } else if (analysisMode === "trigger_scaffold") {
      steps.push({ id: "trigger-scaffold", label: "Scaffold a custom Flogo trigger bundle with isolated build/test proof", tool: "runner.scaffoldTrigger" });
    } else if (analysisMode === "mapping_preview") {
      steps.push({ id: "mapping", label: "Preview mappings and suggest coercions", tool: "runner.previewMapping" });
      steps.push({ id: "properties", label: "Plan app properties and environment usage", tool: "flogo.planProperties" });
    } else if (analysisMode === "mapping_test") {
      steps.push({ id: "mapping-test", label: "Run deterministic mapping resolution test", tool: "runner.testMapping" });
    } else if (analysisMode === "property_plan") {
      steps.push({ id: "properties", label: "Plan app properties and environment usage", tool: "runner.planProperties" });
    } else if (analysisMode === "governance") {
      steps.push({ id: "governance", label: "Validate alias, orphan, and version governance", tool: "runner.validateGovernance" });
    } else if (analysisMode === "composition_compare") {
      steps.push({ id: "compare", label: "Compare canonical JSON to programmatic composition", tool: "runner.compareComposition" });
    } else if (analysisMode === "diagnosis") {
      steps.push({ id: "diagnosis", label: "Diagnose the reported failure using the narrowest evidence-backed proof path", tool: "runner.diagnoseApp" });
    } else {
      const diagnosisHeuristic = /(diagnos|root cause|why did|why does|why is|wrong response|mapping bug|replay mismatch|unexpected output|trigger issue|runtime issue)/i.test(summary);

      if (/(flow contract|flow signature|flow io|reusable flow)/i.test(summary)) {
        steps.push({ id: "flow-contracts", label: "Infer reusable flow input/output contracts", tool: "runner.inferFlowContracts" });
      }

      if (/(bind flow|bind trigger|expose this flow|timer trigger|cli trigger|channel trigger)/i.test(summary)) {
        steps.push({ id: "bind-trigger", label: "Plan trigger binding for an existing flow", tool: "runner.bindTrigger" });
      }

      if (/(extract subflow|make reusable flow|factor flow sequence|extract reusable sequence)/i.test(summary)) {
        steps.push({ id: "extract-subflow", label: "Plan extracting a selected task region into a reusable subflow", tool: "runner.extractSubflow" });
      }

      if (/(inline subflow|expand subflow|de-inline subflow)/i.test(summary)) {
        steps.push({ id: "inline-subflow", label: "Plan inlining a subflow invocation back into the parent flow", tool: "runner.inlineSubflow" });
      }

      if (/(iterate|for each|for every|loop over|repeat for each item)/i.test(summary)) {
        steps.push({ id: "iterator", label: "Plan iterator synthesis for a flow task", tool: "runner.addIterator" });
      }

      if (/(retry|retry on error)/i.test(summary)) {
        steps.push({ id: "retry", label: "Plan retryOnError synthesis for a flow task", tool: "runner.addRetryPolicy" });
      }

      if (/(do while|repeat while|repeat on true|repeat until false)/i.test(summary)) {
        steps.push({ id: "dowhile", label: "Plan doWhile synthesis for a flow task", tool: "runner.addDoWhile" });
      }

      if (/(error path|on error|failure branch|fallback branch|log and continue on failure|log and stop on failure)/i.test(summary)) {
        steps.push({ id: "error-path", label: "Plan a generated error branch for a flow task", tool: "runner.addErrorPath" });
      }

      if (diagnosisHeuristic) {
        steps.push({
          id: "diagnosis",
          label: "Diagnose the reported failure using the narrowest evidence-backed proof path",
          tool: "runner.diagnoseApp"
        });
        skipMutationTail = true;
      }

      if (!diagnosisHeuristic && /(trace this flow|show step execution|capture runtime trace|what happened during execution|execute and trace|runtime trace)/i.test(summary)) {
        steps.push({ id: "run-trace", label: "Execute a flow and capture a runtime trace", tool: "runner.captureRunTrace" });
        skipMutationTail = true;
      }

      if (!diagnosisHeuristic && /(replay|rerun with overrides|run again with different input|re-execute this trace|replay this run)/i.test(summary)) {
        steps.push({ id: "replay", label: "Replay a flow execution with optional overrides", tool: "runner.replayFlow" });
        skipMutationTail = true;
      }

      if (!diagnosisHeuristic && /(compare runs|compare traces|compare replay|show differences between runs|diff these executions)/i.test(summary)) {
        steps.push({ id: "run-comparison", label: "Compare two captured runtime executions", tool: "runner.compareRuns" });
        skipMutationTail = true;
      }

      if (/(inventory|package metadata|descriptor source|contrib inventory)/i.test(summary)) {
        steps.push({ id: "inventory", label: "Inventory Flogo contributions and package evidence", tool: "runner.inventoryContribs" });
      }

      if (/(trigger|activity|action|contrib|descriptor|catalog)/i.test(summary)) {
        steps.push({ id: "catalog", label: "Catalog Flogo contributions and descriptors", tool: "runner.catalogContribs" });
      }

      if (/(scaffold activity|custom activity|author activity|new flogo activity|generate activity bundle)/i.test(summary)) {
        steps.push({
          id: "activity-scaffold",
          label: "Scaffold a custom Flogo activity bundle with isolated build/test proof",
          tool: "runner.scaffoldActivity"
        });
        skipMutationTail = true;
      }

      if (/(scaffold action|custom action|author action|new flogo action|generate action bundle)/i.test(summary)) {
        steps.push({
          id: "action-scaffold",
          label: "Scaffold a custom Flogo action bundle with isolated build/test proof",
          tool: "runner.scaffoldAction"
        });
        skipMutationTail = true;
      }

      if (/(scaffold trigger|custom trigger|author trigger|new flogo trigger|generate trigger bundle)/i.test(summary)) {
        steps.push({
          id: "trigger-scaffold",
          label: "Scaffold a custom Flogo trigger bundle with isolated build/test proof",
          tool: "runner.scaffoldTrigger"
        });
        skipMutationTail = true;
      }

      if (/(evidence|confidence|package metadata proof|contrib proof)/i.test(summary)) {
        steps.push({ id: "evidence", label: "Inspect contribution evidence quality", tool: "runner.inspectContribEvidence" });
      }

      if (/(mapping|coercion|resolver|property|env)/i.test(summary)) {
        steps.push({ id: "mapping", label: "Preview mappings and suggest coercions", tool: "runner.previewMapping" });
      }

      if (/(mapping test|assert mapping|expected mapping output|mapping assertion)/i.test(summary)) {
        steps.push({ id: "mapping-test", label: "Run deterministic mapping resolution test", tool: "runner.testMapping" });
      }

      if (/(property|env|config)/i.test(summary)) {
        steps.push({ id: "properties", label: "Plan app properties and environment usage", tool: "flogo.planProperties" });
      }

      if (/(governance|orphan|alias|version drift|unused import)/i.test(summary)) {
        steps.push({ id: "governance", label: "Validate alias, orphan, and version governance", tool: "runner.validateGovernance" });
      }

      if (/(composition|programmatic|core api|compare json)/i.test(summary)) {
        steps.push({ id: "compare", label: "Compare canonical JSON to programmatic composition", tool: "runner.compareComposition" });
      }
    }

    if (!skipMutationTail) {
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
