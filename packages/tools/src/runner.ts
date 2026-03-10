import type {
  ArtifactRef,
  RunnerJobResult,
  RunnerJobSpec,
  SmokeTestSpec
} from "@flogo-agent/contracts";

export interface RunnerClient {
  build(spec: RunnerJobSpec): Promise<RunnerJobResult>;
  run(spec: RunnerJobSpec): Promise<RunnerJobResult>;
  collectLogs(spec: RunnerJobSpec): Promise<RunnerJobResult>;
  runSmoke(spec: RunnerJobSpec, tests: SmokeTestSpec[]): Promise<RunnerJobResult>;
}

export class InMemoryRunnerClient implements RunnerClient {
  private async result(spec: RunnerJobSpec, summary: string, artifacts: ArtifactRef[] = []) {
    return {
      taskId: spec.taskId,
      stepType: spec.stepType,
      ok: true,
      exitCode: 0,
      logUri: `${spec.outputUri}/${spec.stepType}.log`,
      artifactUris: artifacts.map((entry) => entry.uri),
      summary
    } satisfies RunnerJobResult;
  }

  async build(spec: RunnerJobSpec): Promise<RunnerJobResult> {
    return this.result(spec, `Simulated build completed for ${spec.appPath}.`);
  }

  async run(spec: RunnerJobSpec): Promise<RunnerJobResult> {
    return this.result(spec, `Simulated run completed for ${spec.appPath}.`);
  }

  async collectLogs(spec: RunnerJobSpec): Promise<RunnerJobResult> {
    return this.result(spec, `Collected logs for ${spec.taskId}.`);
  }

  async runSmoke(spec: RunnerJobSpec, tests: SmokeTestSpec[]): Promise<RunnerJobResult> {
    return this.result(spec, `Executed ${tests.length} smoke tests for ${spec.taskId}.`);
  }
}

