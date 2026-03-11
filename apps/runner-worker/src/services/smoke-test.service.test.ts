import { describe, expect, it } from "vitest";

import { SmokeTestService } from "./smoke-test.service.js";

describe("SmokeTestService", () => {
  it("creates a default smoke test shape", () => {
    const service = new SmokeTestService();
    const smokeTest = service.generate({
      taskId: "task-1",
      stepType: "generate_smoke",
      snapshotUri: "workspace://task-1",
      appPath: "flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "artifact://task-1",
      jobTemplateName: "flogo-runner",
      command: [],
      containerArgs: []
    });

    expect(smokeTest.assertions[0]?.expected).toBe(200);
  });
});
