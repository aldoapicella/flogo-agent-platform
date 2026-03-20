import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { type ArtifactRef, type TaskEvent, TaskEventSchema, type TaskRuns, TaskRunsSchema } from "@flogo-agent/contracts";

import { TaskEventsService } from "../events/task-events.service.js";
import { AppAnalysisStorageService } from "../flogo-apps/app-analysis-storage.service.js";
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

  async getArtifact(artifactId: string): Promise<ArtifactRef | undefined> {
    for (const task of this.tasks.values()) {
      const artifact = task.artifacts.find((entry) => entry.id === artifactId);
      if (artifact) {
        return artifact;
      }
    }
    return undefined;
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

class FakeAppAnalysisStorageService {
  readonly uploads: Array<{ projectId: string; taskId: string; artifactId: string; kind: string; payload: Record<string, unknown> }> = [];

  isConfigured(): boolean {
    return true;
  }

  async storeTaskArtifact(args: {
    projectId: string;
    taskId: string;
    artifactId: string;
    kind: "contrib_bundle" | "contrib_validation_report" | "contrib_package" | "build_log" | "test_report";
    payload: Record<string, unknown>;
  }) {
    this.uploads.push(args);
    return {
      uri: `https://storage.test/${args.taskId}/${args.kind}/${args.artifactId}.json`,
      blobPath: `task-artifacts/${args.projectId}/${args.taskId}/${args.kind}/${args.artifactId}.json`,
      contentType: "application/json"
    };
  }
}

class UnconfiguredAppAnalysisStorageService extends FakeAppAnalysisStorageService {
  override isConfigured(): boolean {
    return false;
  }
}

describe("OrchestrationService", () => {
  it("submits a task and publishes initial events", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      new FakeTaskStoreService() as any,
      { prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs } as any,
      storage as AppAnalysisStorageService
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

  it("persists contribution authoring artifacts through blob-backed task artifact storage", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      new FakeTaskStoreService() as any,
      { prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs } as any,
      storage as AppAnalysisStorageService
    );

    const task = await service.submitTask({
      type: "create",
      projectId: "demo",
      summary: "Scaffold a trigger bundle",
      appPath: "examples/hello-rest/flogo.json"
    });

    await service.syncTaskState(task.id, {
      artifact: {
        id: "artifact-1",
        type: "contrib_bundle",
        name: "trigger-bundle-webhook",
        uri: "memory://task-1/trigger-bundle-webhook.json",
        metadata: {
          result: {
            bundle: {
              kind: "trigger",
              packageName: "webhooktrigger"
            }
          }
        }
      }
    });

    const artifacts = await service.listArtifacts(task.id);
    const artifact = artifacts.find((entry) => entry.id === "artifact-1");

    expect(storage.uploads).toHaveLength(1);
    expect(storage.uploads[0]).toMatchObject({
      projectId: "demo",
      taskId: task.id,
      artifactId: "artifact-1",
      kind: "contrib_bundle"
    });
    expect(artifact?.uri).toContain("https://storage.test/");
    expect((artifact?.metadata as { storage?: { durablePayload?: boolean; blobPath?: string } } | undefined)?.storage?.durablePayload).toBe(true);
    expect((artifact?.metadata as { storage?: { blobPath?: string } } | undefined)?.storage?.blobPath).toContain(
      `task-artifacts/demo/${task.id}/contrib_bundle/artifact-1.json`
    );
  });

  it("resolves contrib_bundle artifact ids for validate/package authoring tasks before orchestration", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const taskStore = new FakeTaskStoreService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      taskStore as any,
      { prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs } as any,
      storage as AppAnalysisStorageService
    );

    const sourceTask = await service.submitTask({
      type: "create",
      projectId: "demo",
      summary: "Scaffold an action bundle",
      appPath: "examples/hello-rest/flogo.json"
    });

    await service.syncTaskState(sourceTask.id, {
      artifact: {
        id: "bundle-artifact-1",
        type: "contrib_bundle",
        name: "action-bundle-flowaction",
        uri: "memory://task-1/action-bundle-flowaction.json",
        metadata: {
          result: {
            bundle: {
              kind: "action",
              packageName: "flowaction",
              modulePath: "example.com/acme/flow-action",
              bundleRoot: "/tmp/flogo-action-flowaction",
              descriptor: {
                ref: "example.com/acme/flow-action",
                alias: "flowaction",
                type: "action",
                name: "flow-action",
                version: "0.1.0",
                title: "Flow Action",
                settings: [],
                inputs: [],
                outputs: [],
                examples: [],
                compatibilityNotes: ["Generated scaffold"],
                source: "action_scaffold"
              },
              files: []
            },
            validation: { ok: true, stages: [], summary: "ok", artifacts: [] },
            build: { kind: "build", ok: true, command: ["go", "build", "./..."], exitCode: 0, summary: "ok", output: "" },
            test: { kind: "test", ok: true, command: ["go", "test", "./..."], exitCode: 0, summary: "ok", output: "" }
          }
        }
      }
    });

    const validationTask = await service.submitTask({
      type: "review",
      projectId: "demo",
      summary: "Validate the scaffolded contribution bundle",
      appPath: "examples/hello-rest/flogo.json",
      inputs: {
        mode: "validate_contrib",
        bundleArtifactId: "bundle-artifact-1"
      }
    });

    expect(validationTask.request.inputs["bundleArtifactId"]).toBe("bundle-artifact-1");
    expect(validationTask.request.inputs["bundleArtifact"]).toMatchObject({
      id: "bundle-artifact-1",
      type: "contrib_bundle"
    });
  });

  it("persists packaged contribution artifacts through blob-backed task artifact storage", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      new FakeTaskStoreService() as any,
      { prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs } as any,
      storage as AppAnalysisStorageService
    );

    const task = await service.submitTask({
      type: "create",
      projectId: "demo",
      summary: "Package an action bundle",
      appPath: "examples/hello-rest/flogo.json"
    });

    await service.syncTaskState(task.id, {
      artifact: {
        id: "artifact-package-1",
        type: "contrib_package",
        name: "action-package-flowaction",
        uri: "memory://task-1/action-package-flowaction.json",
        metadata: {
          result: {
            bundle: {
              kind: "action",
              packageName: "flowaction",
              modulePath: "example.com/acme/flow-action"
            },
            package: {
              format: "zip",
              fileName: "flowaction.zip"
            }
          }
        }
      }
    });

    expect(storage.uploads).toHaveLength(1);
    expect(storage.uploads[0]).toMatchObject({
      projectId: "demo",
      taskId: task.id,
      artifactId: "artifact-package-1",
      kind: "contrib_package"
    });
  });

  it("fails loudly when contribution artifact storage is not configured", async () => {
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      new FakeTaskStoreService() as any,
      { prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs } as any,
      new UnconfiguredAppAnalysisStorageService() as AppAnalysisStorageService
    );

    const task = await service.submitTask({
      type: "create",
      projectId: "demo",
      summary: "Scaffold an activity bundle",
      appPath: "examples/hello-rest/flogo.json"
    });

    await expect(
      service.syncTaskState(task.id, {
        artifact: {
          id: "artifact-unconfigured",
          type: "contrib_bundle",
          name: "activity-bundle-echo",
          uri: "memory://task-1/activity-bundle-echo.json",
          metadata: {
            result: {
              bundle: {
                kind: "activity",
                packageName: "echoactivity"
              }
            }
          }
        }
      })
    ).rejects.toThrow(/contribution scaffold, validate, or package tasks/i);
  });
});
