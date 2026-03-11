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
}
