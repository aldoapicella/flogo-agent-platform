import type { RunnerJobResult, RunnerJobSpec, ToolResult } from "@flogo-agent/contracts";

const ok = (summary: string, data?: unknown): ToolResult => ({
  ok: true,
  summary,
  data,
  diagnostics: [],
  artifacts: [],
  retryable: false
});

export interface RunnerClient {
  enqueue(spec: RunnerJobSpec): Promise<RunnerJobResult>;
}

export class StubRunnerClient implements RunnerClient {
  async enqueue(spec: RunnerJobSpec): Promise<RunnerJobResult> {
    return {
      taskId: spec.taskId,
      stepType: spec.stepType,
      success: true,
      exitCode: 0,
      summary: `Stub runner executed ${spec.stepType}`,
      logUri: `${spec.artifactOutputUri}/logs/${spec.stepType}.log`,
      artifacts: []
    };
  }
}

export class RunnerTools {
  constructor(private readonly client: RunnerClient = new StubRunnerClient()) {}

  async buildApp(spec: RunnerJobSpec): Promise<ToolResult> {
    const result = await this.client.enqueue({ ...spec, stepType: "build" });
    return ok("Queued build job", result);
  }

  async runApp(spec: RunnerJobSpec): Promise<ToolResult> {
    const result = await this.client.enqueue({ ...spec, stepType: "run" });
    return ok("Queued run job", result);
  }

  async collectLogs(spec: RunnerJobSpec): Promise<ToolResult> {
    const result = await this.client.enqueue({ ...spec, stepType: "collect_logs" });
    return ok("Queued log collection job", result);
  }
}
