import { describe, expect, it } from "vitest";
import { RunnerExecutorService } from "./runner-executor.service";

describe("RunnerExecutorService", () => {
  it("returns a successful mock result by default", async () => {
    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-1",
      jobKind: "build",
      stepType: "build",
      snapshotUri: ".",
      appPath: "flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://build",
      jobTemplateName: "flogo-runner",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts).toHaveLength(1);
  });
});
