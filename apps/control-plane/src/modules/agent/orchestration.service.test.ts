import { describe, expect, it } from "vitest";

import { TaskEventsService } from "../events/task-events.service.js";
import { ToolsetService } from "../tools/toolset.service.js";
import { OrchestratorClientService } from "./orchestrator-client.service.js";
import { OrchestrationService } from "./orchestration.service.js";

describe("OrchestrationService", () => {
  it("submits a task and publishes initial events", async () => {
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService()
    );

    const task = await service.submitTask({
      type: "create",
      projectId: "demo",
      summary: "Create hello world",
      appPath: "examples/hello-rest/flogo.json"
    });

    expect(task.result.taskId).toBeDefined();
    expect(task.result.orchestrationId).toBeDefined();
    expect(service.listTaskEvents(task.id).length).toBeGreaterThan(0);
  });
});
