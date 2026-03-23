import type { RunnerJobResult, ToolResponse } from "@flogo-agent/contracts";
import { RunnerJobResultSchema, RunnerJobSpecSchema } from "@flogo-agent/contracts";

import { toolResponse } from "./shared.js";

export interface RunnerDispatcher {
  dispatch(spec: unknown): Promise<RunnerJobResult>;
}

export class LocalRunnerDispatcher implements RunnerDispatcher {
  async dispatch(spec: unknown): Promise<RunnerJobResult> {
    const job = RunnerJobSpecSchema.parse(spec);
    return RunnerJobResultSchema.parse({
      jobId: `${job.taskId}-${job.stepType}`,
      ok: true,
      summary: `Prepared local runner job for ${job.stepType}`,
      exitCode: 0,
      artifacts: [],
      diagnostics: []
    });
  }
}

export class RunnerTools {
  constructor(private readonly dispatcher: RunnerDispatcher = new LocalRunnerDispatcher()) {}

  async buildApp(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch(parsed);
    return toolResponse({
      ok: result.ok,
      summary: `Queued build job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async runApp(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({ ...parsed, stepType: "run" });
    return toolResponse({
      ok: result.ok,
      summary: `Queued run job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async collectLogs(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({ ...parsed, stepType: "collect_logs" });
    return toolResponse({
      ok: result.ok,
      summary: `Queued log collection job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async catalogContribs(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({ ...parsed, stepType: "catalog_contribs", jobKind: "catalog" });
    return toolResponse({
      ok: result.ok,
      summary: `Queued contribution catalog job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async inventoryContribs(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({ ...parsed, stepType: "inventory_contribs", jobKind: "inventory" });
    return toolResponse({
      ok: result.ok,
      summary: `Queued contribution inventory job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async inferFlowContracts(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "infer_flow_contracts",
      jobKind: "flow_contracts",
      analysisKind: "flow_contracts"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued flow-contract inference job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async bindTrigger(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "bind_trigger",
      jobKind: "trigger_binding",
      analysisKind: "trigger_binding_plan"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued trigger-binding job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async extractSubflow(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "extract_subflow",
      jobKind: "subflow_extraction",
      analysisKind: "subflow_extraction_plan"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued subflow-extraction job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async inlineSubflow(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "inline_subflow",
      jobKind: "subflow_inlining",
      analysisKind: "subflow_inlining_plan"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued subflow-inlining job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async addIterator(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "add_iterator",
      jobKind: "iterator_synthesis",
      analysisKind: "iterator_plan"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued iterator synthesis job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async addRetryPolicy(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "add_retry_policy",
      jobKind: "retry_policy_synthesis",
      analysisKind: "retry_policy_plan"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued retry policy synthesis job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async addDoWhile(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "add_dowhile",
      jobKind: "dowhile_synthesis",
      analysisKind: "dowhile_plan"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued doWhile synthesis job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async addErrorPath(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "add_error_path",
      jobKind: "error_path_synthesis",
      analysisKind: "error_path_plan"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued error-path synthesis job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async captureRunTrace(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const validateOnly = parsed.analysisPayload?.validateOnly === true;
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "capture_run_trace",
      jobKind: "run_trace_capture",
      analysisKind: validateOnly ? "run_trace_plan" : undefined
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued run-trace ${validateOnly ? "plan" : "capture"} job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async replayFlow(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const validateOnly = parsed.analysisPayload?.validateOnly === true;
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "replay_flow",
      jobKind: "flow_replay",
      analysisKind: validateOnly ? "replay_plan" : "replay"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued replay ${validateOnly ? "plan" : "execution"} job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async compareRuns(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const validateOnly = parsed.analysisPayload?.validateOnly === true;
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "compare_runs",
      jobKind: "run_comparison",
      analysisKind: validateOnly ? "run_comparison_plan" : "run_comparison"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued run comparison ${validateOnly ? "plan" : "analysis"} job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async previewMapping(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({ ...parsed, stepType: "preview_mapping", jobKind: "mapping_preview" });
    return toolResponse({
      ok: result.ok,
      summary: `Queued mapping preview job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async testMapping(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "test_mapping",
      jobKind: "mapping_test",
      analysisKind: "mapping_test"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued mapping test job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async planProperties(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "plan_properties",
      jobKind: "property_plan",
      analysisKind: "property_plan"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued property planning job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async inspectDescriptor(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({ ...parsed, stepType: "inspect_descriptor", jobKind: "catalog" });
    return toolResponse({
      ok: result.ok,
      summary: `Queued descriptor inspection job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async inspectContribEvidence(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "inspect_contrib_evidence",
      jobKind: "contrib_evidence",
      analysisKind: "contrib_evidence"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued contribution evidence inspection job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async scaffoldActivity(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "scaffold_activity",
      jobKind: "custom_contrib",
      analysisKind: "activity_scaffold"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued activity scaffold job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async scaffoldAction(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "scaffold_action",
      jobKind: "custom_contrib",
      analysisKind: "action_scaffold"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued action scaffold job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async scaffoldTrigger(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "scaffold_trigger",
      jobKind: "custom_contrib",
      analysisKind: "trigger_scaffold"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued trigger scaffold job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async validateContrib(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "validate_contrib",
      jobKind: "contrib_validation",
      analysisKind: "validate_contrib"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued contribution validation job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async packageContrib(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "package_contrib",
      jobKind: "contrib_package",
      analysisKind: "package_contrib"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued contribution packaging job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async installContribPlan(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "install_contrib_plan",
      jobKind: "contrib_install_plan",
      analysisKind: "install_contrib_plan"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued contribution install planning job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async updateContribPlan(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "update_contrib_plan",
      jobKind: "contrib_update_plan",
      analysisKind: "update_contrib_plan"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued contribution update planning job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async installContribDiffPlan(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "install_contrib_diff_plan",
      jobKind: "contrib_install_diff_plan",
      analysisKind: "install_contrib_diff_plan"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued contribution install diff planning job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async installContribApply(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "install_contrib_apply",
      jobKind: "contrib_install_apply",
      analysisKind: "install_contrib_apply"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued contribution install apply job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async validateGovernance(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "validate_governance",
      jobKind: "governance",
      analysisKind: "governance"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued governance validation job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async compareComposition(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "compare_composition",
      jobKind: "composition_compare",
      analysisKind: "composition_compare"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued composition comparison job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async diagnoseApp(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({
      ...parsed,
      stepType: "diagnose_app",
      jobKind: "diagnosis",
      analysisKind: "diagnosis"
    });
    return toolResponse({
      ok: result.ok,
      summary: `Queued diagnosis job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }
}
