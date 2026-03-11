import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";

import {
  type ArtifactRef,
  type Diagnostic,
  type RunnerJobResult,
  type RunnerJobSpec,
  RunnerJobSpecSchema,
  RunnerJobResultSchema
} from "@flogo-agent/contracts";

export interface RunnerExecutor {
  execute(spec: RunnerJobSpec): Promise<RunnerJobResult>;
}

function createLogArtifact(taskId: string, stepType: string, log: string): ArtifactRef {
  return {
    id: randomUUID(),
    type: "runtime_log",
    name: `${taskId}-${stepType}.log`,
    uri: `memory://${taskId}/${stepType}.log`,
    metadata: { log }
  };
}

function createCommand(spec: RunnerJobSpec): string[] {
  if (spec.command.length > 0) {
    return spec.command;
  }

  switch (spec.stepType) {
    case "build":
      return ["echo", `build:${spec.appPath}`];
    case "run":
      return ["echo", `run:${spec.appPath}`];
    case "collect_logs":
      return ["echo", `logs:${spec.taskId}`];
    case "run_smoke":
      return ["echo", `smoke:${spec.appPath}`];
    default:
      return ["echo", `runner:${spec.stepType}`];
  }
}

export class RunnerExecutorService implements RunnerExecutor {
  async execute(specInput: RunnerJobSpec): Promise<RunnerJobResult> {
    const spec = RunnerJobSpecSchema.parse(specInput);
    const command = createCommand(spec);
    const [binary, ...args] = command;
    const startedAt = new Date().toISOString();

    return new Promise((resolve) => {
      const child = spawn(binary, args, {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32"
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        const logArtifact = createLogArtifact(spec.taskId, spec.stepType, `${stdout}\n${stderr}`.trim());
        resolve(
          RunnerJobResultSchema.parse({
            jobId: `${spec.taskId}-${spec.stepType}`,
            jobRunId: spec.jobRunId,
            ok: code === 0,
            status: code === 0 ? "succeeded" : "failed",
            summary: code === 0 ? `Executed ${spec.stepType}` : `Execution failed for ${spec.stepType}`,
            exitCode: code ?? 1,
            startedAt,
            finishedAt: new Date().toISOString(),
            jobTemplateName: spec.jobTemplateName,
            logArtifact,
            artifacts: [logArtifact],
            diagnostics: (stderr
              ? [
                  {
                    code: "runner.stderr",
                    message: stderr.trim(),
                    severity: "warning"
                  } satisfies Diagnostic
                ]
              : [])
          })
        );
      });

      child.on("error", (error) => {
        resolve(
          RunnerJobResultSchema.parse({
            jobId: `${spec.taskId}-${spec.stepType}`,
            jobRunId: spec.jobRunId,
            ok: false,
            status: "failed",
            summary: `Failed to spawn command for ${spec.stepType}`,
            exitCode: 1,
            startedAt,
            finishedAt: new Date().toISOString(),
            jobTemplateName: spec.jobTemplateName,
            logArtifact: createLogArtifact(spec.taskId, spec.stepType, error.message),
            artifacts: [createLogArtifact(spec.taskId, spec.stepType, error.message)],
            diagnostics: [
              {
                code: "runner.spawn_error",
                message: error.message,
                severity: "error"
              }
            ]
          })
        );
      });
    });
  }
}

export class ContainerAppsJobRunnerExecutor implements RunnerExecutor {
  async execute(specInput: RunnerJobSpec): Promise<RunnerJobResult> {
    const spec = RunnerJobSpecSchema.parse(specInput);
    const artifact = createLogArtifact(spec.taskId, spec.stepType, "Container Apps Job execution placeholder");
    return RunnerJobResultSchema.parse({
      jobId: `${spec.taskId}-${spec.stepType}`,
      jobRunId: spec.jobRunId,
      ok: true,
      status: "succeeded",
      summary: "Prepared Container Apps Job payload",
      exitCode: 0,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      jobTemplateName: spec.jobTemplateName,
      logArtifact: artifact,
      artifacts: [artifact],
      diagnostics: []
    });
  }
}

export function createRunnerExecutor(): RunnerExecutor {
  return process.env.RUNNER_EXECUTION_MODE === "container-apps-job"
    ? new ContainerAppsJobRunnerExecutor()
    : new RunnerExecutorService();
}
