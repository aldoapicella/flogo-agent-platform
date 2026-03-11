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

  async start(specInput: unknown): Promise<RunnerJobStatus> {
    const requestedSpec = RunnerJobSpecSchema.parse(specInput);
    const jobRunId = requestedSpec.jobRunId ?? randomUUID();
    const spec: RunnerJobSpec = {
      ...requestedSpec,
      jobRunId
    };

    const status = RunnerJobStatusSchema.parse({
      jobRunId,
      status: "running",
      summary: `Runner job accepted for ${spec.stepType}`,
      spec
    });
    this.jobs.set(jobRunId, status);

    void this.execute(spec);

    return status;
  }

  get(jobRunId: string): RunnerJobStatus | undefined {
    return this.jobs.get(jobRunId);
  }

  private async execute(spec: RunnerJobSpec): Promise<void> {
    let result: RunnerJobResult;

    if (spec.stepType === "generate_smoke") {
      const smokeTest = this.smokeTests.generate(spec);
      result = RunnerJobResultSchema.parse({
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
    } else {
      result = await this.executor.execute(spec);
    }

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
}
