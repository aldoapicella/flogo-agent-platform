import { describe, expect, it } from "vitest";

import { TaskEventsService } from "../events/task-events.service.js";
import { RunnerQueueService } from "../queue/runner-queue.service.js";
import { ToolsetService } from "../tools/toolset.service.js";
import { OrchestrationService } from "./orchestration.service.js";

describe("OrchestrationService", () => {
  it("submits tasks and emits events", async () => {
    const service = new OrchestrationService(new ToolsetService(), new RunnerQueueService(), new TaskEventsService());
    const task = await service.submitTask({
      type: "create",
      projectId: "demo",
      summary: "Create hello world",
      appPath: "examples/hello-rest/flogo.json"
    });

    expect(task.result.taskId).toBeDefined();
    expect(service.listTaskEvents(task.id).length).toBeGreaterThan(0);
  });
});

