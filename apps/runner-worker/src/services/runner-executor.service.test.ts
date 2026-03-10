import { describe, expect, it } from "vitest";
import { RunnerExecutorService } from "./runner-executor.service";

describe("RunnerExecutorService", () => {
  it("returns a successful mock result by default", async () => {
    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-1",
      stepType: "build",
      snapshotUri: ".",
      appPath: "flogo.json",
      env: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://build",
      command: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts).toHaveLength(1);
  });
});
