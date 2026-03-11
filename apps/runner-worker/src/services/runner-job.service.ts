import { randomUUID } from "node:crypto";

import {
  RunnerJobResultSchema,
  RunnerJobSpecSchema,
  RunnerJobStatusSchema,
  type RunnerJobResult,
  type RunnerJobSpec,
  type RunnerJobStatus
} from "@flogo-agent/contracts";

import { SmokeTestService } from "./smoke-test.service.js";
import { createRunnerExecutor } from "./runner-executor.service.js";

export class RunnerJobService {
  private readonly executor = createRunnerExecutor();
  private readonly smokeTests = new SmokeTestService();
  private readonly jobs = new Map<string, RunnerJobStatus>();
  private readonly executionMode = process.env.RUNNER_EXECUTION_MODE ?? "local-process";

  async start(specInput: unknown): Promise<RunnerJobStatus> {
    const requestedSpec = RunnerJobSpecSchema.parse(specInput);
    const jobRunId = requestedSpec.jobRunId ?? randomUUID();
    const spec: RunnerJobSpec = {
      ...requestedSpec,
      jobRunId,
      jobTemplateName: this.resolveJobTemplateName(requestedSpec)
    };

    if (spec.stepType === "generate_smoke") {
      const smokeTest = this.smokeTests.generate(spec);
      const result = RunnerJobResultSchema.parse({
        jobId: `${spec.taskId}-${spec.stepType}`,
        jobRunId: spec.jobRunId,
        ok: true,
        status: "succeeded",
        summary: `Generated smoke test ${smokeTest.name}`,
        exitCode: 0,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        jobTemplateName: spec.jobTemplateName,
        artifacts: [],
        diagnostics: []
      });
      const status = RunnerJobStatusSchema.parse({
        jobRunId,
        status: "succeeded",
        summary: result.summary,
        spec,
        result
      });
      this.jobs.set(jobRunId, status);
      return status;
    }

    if (this.executionMode === "container-apps-job") {
      const result = await this.executor.execute(spec);
      const status = RunnerJobStatusSchema.parse({
        jobRunId,
        status: result.status,
        summary: result.summary,
        spec,
        azureJobExecutionName: result.azureJobExecutionName,
        azureJobResourceId: result.azureJobResourceId,
        result
      });
      this.jobs.set(jobRunId, status);
      return status;
    }

    const status = RunnerJobStatusSchema.parse({
      jobRunId,
      status: "running",
      summary: `Runner job accepted for ${spec.stepType}`,
      spec
    });
    this.jobs.set(jobRunId, status);

    void this.executeLocal(spec);

    return status;
  }

  async get(jobRunId: string): Promise<RunnerJobStatus | undefined> {
    const current = this.jobs.get(jobRunId);
    if (!current) {
      return undefined;
    }

    if (
      this.executionMode === "container-apps-job" &&
      (current.status === "pending" || current.status === "running") &&
      this.executor.getStatus
    ) {
      const refreshed = await this.executor.getStatus(current);
      this.jobs.set(jobRunId, refreshed);
      return refreshed;
    }

    return current;
  }

  private async executeLocal(spec: RunnerJobSpec): Promise<void> {
    const result: RunnerJobResult = await this.executor.execute(spec);
    this.jobs.set(
      spec.jobRunId!,
      RunnerJobStatusSchema.parse({
        jobRunId: spec.jobRunId,
        status: result.ok ? "succeeded" : "failed",
        summary: result.summary,
        spec,
        result
      })
    );
  }

  private resolveJobTemplateName(spec: RunnerJobSpec): string {
    if (spec.jobTemplateName && spec.jobTemplateName !== "flogo-runner") {
      return spec.jobTemplateName;
    }

    switch (spec.jobKind) {
      case "build":
        return process.env.RUNNER_BUILD_JOB_TEMPLATE_NAME ?? process.env.RUNNER_JOB_TEMPLATE_NAME ?? "flogo-build-job";
      case "smoke_test":
        return process.env.RUNNER_SMOKE_JOB_TEMPLATE_NAME ?? process.env.RUNNER_JOB_TEMPLATE_NAME ?? "flogo-test-job";
      case "custom_contrib":
        return (
          process.env.RUNNER_CUSTOM_CONTRIB_JOB_TEMPLATE_NAME ??
          process.env.RUNNER_JOB_TEMPLATE_NAME ??
          "flogo-custom-contrib-job"
        );
      case "eval":
        return process.env.RUNNER_EVAL_JOB_TEMPLATE_NAME ?? process.env.RUNNER_JOB_TEMPLATE_NAME ?? "flogo-eval-job";
      default:
        return process.env.RUNNER_JOB_TEMPLATE_NAME ?? "flogo-runner";
    }
  }
}
