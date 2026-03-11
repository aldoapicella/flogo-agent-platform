import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { type ArtifactRef, type TaskEvent, TaskEventSchema, type TaskRuns, TaskRunsSchema } from "@flogo-agent/contracts";

import { TaskEventsService } from "../events/task-events.service.js";
import { ToolsetService } from "../tools/toolset.service.js";
import { OrchestratorClientService } from "./orchestrator-client.service.js";
import { OrchestrationService } from "./orchestration.service.js";
import { type StoredTask } from "./task-store.service.js";

class FakeTaskStoreService {
  private readonly tasks = new Map<string, StoredTask>();
  private readonly history = new Map<string, TaskEvent[]>();

  async createTaskRecord(args: {
    id: string;
    request: StoredTask["request"];
    result: StoredTask["result"];
    requiredApprovals: StoredTask["approvals"];
  }): Promise<StoredTask> {
    const stored: StoredTask = {
      id: args.id,
      request: args.request,
      result: args.result,
      approvals: args.requiredApprovals,
      artifacts: []
    };
    this.tasks.set(args.id, stored);
    this.history.set(args.id, []);
    return stored;
  }

  async getTask(taskId: string): Promise<StoredTask | undefined> {
    return this.tasks.get(taskId);
  }

  async listTaskEvents(taskId: string): Promise<TaskEvent[]> {
    return this.history.get(taskId) ?? [];
  }

  async listTasks() {
    return [];
  }

  async listTaskRuns(taskId: string): Promise<TaskRuns> {
    return TaskRunsSchema.parse({
      taskId,
      buildRuns: [],
      testRuns: []
    });
  }

  async listArtifacts(taskId: string): Promise<ArtifactRef[]> {
    return this.tasks.get(taskId)?.artifacts ?? [];
  }

  async appendEvent(taskId: string, type: TaskEvent["type"], message: string, payload?: Record<string, unknown>): Promise<TaskEvent> {
    const event = TaskEventSchema.parse({
      id: randomUUID(),
      taskId,
      type,
      message,
      timestamp: new Date().toISOString(),
      payload
    });
    const current = this.history.get(taskId) ?? [];
    current.push(event);
    this.history.set(taskId, current);
    return event;
  }

  async applyApprovalDecision() {
    return undefined;
  }

  async updateTaskStatus() {
    return undefined;
  }

  async syncTaskState(taskId: string, payload: Record<string, unknown>): Promise<StoredTask | undefined> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }

    const artifact = payload.artifact as ArtifactRef | undefined;
    if (artifact) {
      task.artifacts.push(artifact);
    }

    task.result = {
      ...task.result,
      orchestrationId: (payload.orchestrationId as string | undefined) ?? task.result.orchestrationId,
      status: (payload.status as StoredTask["result"]["status"] | undefined) ?? task.result.status,
      summary: (payload.summary as string | undefined) ?? task.result.summary,
      approvalStatus:
        (payload.approvalStatus as StoredTask["result"]["approvalStatus"] | undefined) ?? task.result.approvalStatus,
      activeJobRuns:
        (payload.activeJobRuns as StoredTask["result"]["activeJobRuns"] | undefined) ?? task.result.activeJobRuns,
      artifacts: [...task.artifacts]
    };

    this.tasks.set(taskId, task);
    return task;
  }
}

describe("OrchestrationService", () => {
  it("submits a task and publishes initial events", async () => {
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      new FakeTaskStoreService() as any
    );

    const task = await service.submitTask({
      type: "create",
      projectId: "demo",
      summary: "Create hello world",
      appPath: "examples/hello-rest/flogo.json"
    });

    expect(task.result.taskId).toBeDefined();
    expect(task.result.orchestrationId).toBeDefined();
    expect((await service.listTaskEvents(task.id)).length).toBeGreaterThan(0);
  });
});
