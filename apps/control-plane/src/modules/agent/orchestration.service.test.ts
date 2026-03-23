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
    kind:
      | "contrib_bundle"
      | "contrib_validation_report"
      | "contrib_package"
      | "contrib_install_plan"
      | "contrib_install_diff_plan"
      | "contrib_install_apply_result"
      | "contrib_update_plan"
      | "contrib_update_diff_plan"
      | "build_log"
      | "test_report"
      | "flogo_json";
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

  it("resolves contrib_package artifact ids for install planning tasks and fills the target app path from appId", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const taskStore = new FakeTaskStoreService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      taskStore as any,
      {
        prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs,
        resolveTaskAppPath: async () => "examples/hello-rest/flogo.json"
      } as any,
      storage as AppAnalysisStorageService
    );

    const sourceTask = await service.submitTask({
      type: "create",
      projectId: "demo",
      summary: "Package a trigger bundle",
      appPath: "examples/hello-rest/flogo.json"
    });

    await service.syncTaskState(sourceTask.id, {
      artifact: {
        id: "package-artifact-1",
        type: "contrib_package",
        name: "trigger-package-webhooktrigger",
        uri: "memory://task/trigger-package-webhooktrigger.json",
        metadata: {
          result: {
            bundle: {
              kind: "trigger",
              packageName: "webhooktrigger",
              modulePath: "example.com/acme/webhook",
              bundleRoot: "/tmp/flogo-trigger-webhooktrigger",
              descriptor: {
                ref: "example.com/acme/webhook",
                alias: "webhooktrigger",
                type: "trigger",
                name: "webhook-trigger",
                version: "0.1.0",
                title: "Webhook Trigger",
                settings: [],
                handlerSettings: [],
                outputs: [],
                reply: [],
                examples: [],
                compatibilityNotes: ["Generated scaffold"],
                source: "trigger_scaffold"
              },
              files: []
            },
            validation: { ok: true, stages: [], summary: "ok", artifacts: [] },
            build: { kind: "build", ok: true, command: ["go", "build", "./..."], exitCode: 0, summary: "ok", output: "" },
            test: { kind: "test", ok: true, command: ["go", "test", "./..."], exitCode: 0, summary: "ok", output: "" },
            package: {
              format: "zip",
              fileName: "trigger-webhooktrigger.zip",
              path: "/tmp/trigger-webhooktrigger.zip",
              bytes: 2048,
              sha256: "abc123",
              base64: "ZmFrZQ=="
            }
          }
        }
      }
    });

    const planTask = await service.submitTask({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      summary: "Plan how to install the packaged trigger contribution",
      inputs: {
        mode: "install_contrib_plan",
        packageArtifactId: "package-artifact-1"
      }
    });

    expect(planTask.request.appPath).toBe("examples/hello-rest/flogo.json");
    expect(planTask.request.inputs["packageArtifactId"]).toBe("package-artifact-1");
    expect(planTask.request.inputs["packageArtifact"]).toMatchObject({
      id: "package-artifact-1",
      type: "contrib_package"
    });
  });

  it("persists install-plan artifacts through blob-backed task artifact storage", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      new FakeTaskStoreService() as any,
      {
        prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs,
        resolveTaskAppPath: async () => "examples/hello-rest/flogo.json"
      } as any,
      storage as AppAnalysisStorageService
    );

    const task = await service.submitTask({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      summary: "Plan how to install a contribution into hello-rest"
    });

    await service.syncTaskState(task.id, {
      artifact: {
        id: "artifact-install-plan-1",
        type: "contrib_install_plan",
        name: "trigger-install-plan-webhooktrigger",
        uri: "memory://task-1/trigger-install-plan-webhooktrigger.json",
        metadata: {
          result: {
            contributionKind: "trigger",
            targetApp: { appId: "hello-rest", appPath: "examples/hello-rest/flogo.json" },
            selectedAlias: "webhooktrigger",
            installReady: true,
            readiness: "high"
          }
        }
      }
    });

    expect(storage.uploads).toHaveLength(1);
    expect(storage.uploads[0]).toMatchObject({
      projectId: "demo",
      taskId: task.id,
      artifactId: "artifact-install-plan-1",
      kind: "contrib_install_plan"
    });
  });

  it("resolves contrib_install_plan artifact ids for exact diff planning tasks and fills the target app path from appId", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const taskStore = new FakeTaskStoreService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      taskStore as any,
      {
        prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs,
        resolveTaskAppPath: async () => "examples/hello-rest/flogo.json"
      } as any,
      storage as AppAnalysisStorageService
    );

    const sourceTask = await service.submitTask({
      type: "review",
      projectId: "demo",
      appPath: "examples/hello-rest/flogo.json",
      summary: "Plan contribution install"
    });

    await service.syncTaskState(sourceTask.id, {
      artifact: {
        id: "install-plan-artifact-1",
        type: "contrib_install_plan",
        name: "trigger-install-plan-webhooktrigger",
        uri: "memory://task/trigger-install-plan-webhooktrigger.json",
        metadata: {
          result: {
            contributionKind: "trigger",
            source: "package_artifact",
            sourceArtifactId: "package-artifact-1",
            targetApp: {
              projectId: "demo",
              appId: "hello-rest",
              appPath: "examples/hello-rest/flogo.json",
              appName: "hello-rest"
            },
            bundle: {
              kind: "trigger",
              packageName: "webhooktrigger",
              modulePath: "example.com/acme/webhook",
              bundleRoot: "/tmp/flogo-trigger-webhooktrigger",
              descriptor: {
                ref: "example.com/acme/webhook",
                alias: "webhooktrigger",
                type: "trigger",
                name: "webhook-trigger",
                version: "0.1.0",
                title: "Webhook Trigger",
                settings: [],
                handlerSettings: [],
                outputs: [],
                reply: [],
                examples: [],
                compatibilityNotes: ["Generated scaffold"],
                source: "trigger_scaffold"
              },
              files: []
            },
            modulePath: "example.com/acme/webhook",
            packageName: "webhooktrigger",
            packagePath: "example.com/acme/webhook",
            descriptorRef: "example.com/acme/webhook",
            appFingerprint: "app-sha",
            planFingerprint: "plan-sha",
            selectedAlias: "webhooktrigger",
            installReady: true,
            readiness: "high",
            proposedImports: [{ alias: "webhooktrigger", ref: "example.com/acme/webhook", action: "add" }],
            proposedRefs: [{ surface: "triggerRef", value: "#webhooktrigger" }],
            predictedChanges: {
              importsToAdd: [{ alias: "webhooktrigger", ref: "example.com/acme/webhook", action: "add" }],
              importsToUpdate: [],
              reusableRefs: [],
              summaryLines: ["Add import alias \"webhooktrigger\" for ref \"example.com/acme/webhook\"."],
              noMutation: true
            },
            warnings: [],
            conflicts: [],
            diagnostics: [],
            recommendedNextAction: "Review the install plan.",
            limitations: ["Planning only."]
          }
        }
      }
    });

    const diffTask = await service.submitTask({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      summary: "Preview the exact canonical install diff",
      inputs: {
        mode: "install_contrib_diff_plan",
        installPlanArtifactId: "install-plan-artifact-1"
      }
    });

    expect(diffTask.request.appPath).toBe("examples/hello-rest/flogo.json");
    expect(diffTask.request.inputs["installPlanArtifactId"]).toBe("install-plan-artifact-1");
    expect(diffTask.request.inputs["installPlanArtifact"]).toMatchObject({
      id: "install-plan-artifact-1",
      type: "contrib_install_plan"
    });
  });

  it("persists install diff artifacts through blob-backed task artifact storage", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      new FakeTaskStoreService() as any,
      {
        prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs,
        resolveTaskAppPath: async () => "examples/hello-rest/flogo.json"
      } as any,
      storage as AppAnalysisStorageService
    );

    const task = await service.submitTask({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      summary: "Preview the exact canonical install diff"
    });

    await service.syncTaskState(task.id, {
      artifact: {
        id: "artifact-install-diff-plan-1",
        type: "contrib_install_diff_plan",
        name: "trigger-install-diff-plan-webhooktrigger",
        uri: "memory://task-1/trigger-install-diff-plan-webhooktrigger.json",
        metadata: {
          result: {
            contributionKind: "trigger",
            sourceContribution: {
              kind: "trigger",
              modulePath: "example.com/acme/webhook",
              packageName: "webhooktrigger",
              selectedAlias: "webhooktrigger",
              source: "package_artifact"
            },
            targetApp: { appId: "hello-rest", appPath: "examples/hello-rest/flogo.json" },
            basedOnInstallPlan: {
              sourceArtifactId: "artifact-install-plan-1",
              appFingerprint: "app-sha",
              planFingerprint: "plan-sha"
            },
            appFingerprintBefore: "app-sha",
            installPlanFingerprint: "plan-sha",
            isStale: false,
            previewAvailable: true,
            installReady: true,
            readiness: "high",
            warnings: [],
            conflicts: [],
            limitations: ["Diff preview only."],
            predictedChanges: {
              importsBefore: [],
              importsAfter: [],
              importsToAdd: [],
              importsToUpdate: [],
              aliasesToAdd: [],
              refsToAdd: [],
              refsToReuse: [],
              structuralChanges: ["Add import alias \"webhooktrigger\" for ref \"example.com/acme/webhook\"."],
              changedPaths: ["imports"],
              diffEntries: [],
              noMutation: true
            },
            diffSummary: ["imports: add \"webhooktrigger\" -> \"example.com/acme/webhook\""],
            canonicalBeforeJson: "{}",
            canonicalAfterJson: "{\"imports\":[{\"alias\":\"webhooktrigger\"}]}",
            recommendedNextAction: "Review the exact canonical import diff."
          }
        }
      }
    });

    expect(storage.uploads).toHaveLength(1);
    expect(storage.uploads[0]).toMatchObject({
      projectId: "demo",
      taskId: task.id,
      artifactId: "artifact-install-diff-plan-1",
      kind: "contrib_install_diff_plan"
    });
  });

  it("submits install apply tasks as approval-gated workflows and resolves the diff artifact", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const taskStore = new FakeTaskStoreService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      taskStore as any,
      {
        prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs,
        resolveTaskAppPath: async () => "examples/hello-rest/flogo.json"
      } as any,
      storage as AppAnalysisStorageService
    );

    const seedTask = await service.submitTask({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      summary: "Seed contribution install diff artifact",
      inputs: {
        mode: "install_contrib_diff_plan",
        installPlanResult: {
          contributionKind: "trigger",
          sourceContribution: {
            kind: "trigger",
            modulePath: "example.com/acme/webhook",
            packageName: "webhooktrigger",
            selectedAlias: "webhooktrigger",
            source: "package_artifact"
          },
          targetApp: {
            projectId: "demo",
            appId: "hello-rest",
            appPath: "examples/hello-rest/flogo.json"
          },
          basedOnInstallPlan: {
            sourceArtifactId: "install-plan-artifact-1",
            appFingerprint: "app-sha",
            planFingerprint: "plan-sha"
          },
          appFingerprintBefore: "app-sha",
          installPlanFingerprint: "plan-sha",
          isStale: false,
          previewAvailable: true,
          installReady: true,
          readiness: "high",
          warnings: [],
          conflicts: [],
          limitations: ["Diff preview only."],
          predictedChanges: {
            importsBefore: [],
            importsAfter: [],
            importsToAdd: [],
            importsToUpdate: [],
            aliasesToAdd: [],
            refsToAdd: [],
            refsToReuse: [],
            structuralChanges: [],
            changedPaths: ["imports"],
            diffEntries: [],
            noMutation: true
          },
          diffSummary: ["imports: add \"webhooktrigger\" -> \"example.com/acme/webhook\""],
          canonicalBeforeJson: "{}",
          canonicalAfterJson: "{\"imports\":[{\"alias\":\"webhooktrigger\",\"ref\":\"example.com/acme/webhook\"}]}",
          recommendedNextAction: "Review the exact canonical import diff."
        }
      }
    });

    await service.syncTaskState(seedTask.id, {
      artifact: {
        id: "artifact-install-diff-plan-2",
        type: "contrib_install_diff_plan",
        name: "trigger-install-diff-plan-webhooktrigger",
        uri: "memory://task-2/trigger-install-diff-plan-webhooktrigger.json",
        metadata: {
          result: {
            contributionKind: "trigger",
            sourceContribution: {
              kind: "trigger",
              modulePath: "example.com/acme/webhook",
              packageName: "webhooktrigger",
              selectedAlias: "webhooktrigger",
              source: "package_artifact",
              sourceArtifactId: "artifact-package-1"
            },
            targetApp: { projectId: "demo", appId: "hello-rest", appPath: "examples/hello-rest/flogo.json" },
            basedOnInstallPlan: {
              sourceArtifactId: "install-plan-artifact-1",
              appFingerprint: "app-sha",
              planFingerprint: "plan-sha"
            },
            appFingerprintBefore: "app-sha",
            appFingerprintAfter: "after-sha",
            installPlanFingerprint: "plan-sha",
            isStale: false,
            previewAvailable: true,
            installReady: true,
            readiness: "high",
            warnings: [],
            conflicts: [],
            limitations: ["Diff preview only."],
            predictedChanges: {
              importsBefore: [],
              importsAfter: [],
              importsToAdd: [],
              importsToUpdate: [],
              aliasesToAdd: ["webhooktrigger"],
              refsToAdd: [],
              refsToReuse: [],
              structuralChanges: ["Add import alias \"webhooktrigger\" for ref \"example.com/acme/webhook\"."],
              changedPaths: ["imports"],
              diffEntries: [],
              noMutation: true
            },
            diffSummary: ["imports: add \"webhooktrigger\" -> \"example.com/acme/webhook\""],
            canonicalBeforeJson: "{}",
            canonicalAfterJson: "{\"imports\":[{\"alias\":\"webhooktrigger\",\"ref\":\"example.com/acme/webhook\"}]}",
            recommendedNextAction: "Approve install apply to write the canonical import mutation."
          }
        }
      }
    });

    const applyTask = await service.submitTask({
      type: "update",
      projectId: "demo",
      appId: "hello-rest",
      summary: "Apply the approved contribution install diff",
      inputs: {
        mode: "install_contrib_apply",
        installDiffArtifactId: "artifact-install-diff-plan-2"
      }
    });

    expect(applyTask.result.status).toBe("awaiting_approval");
    expect(applyTask.result.approvalStatus).toBe("pending");
    expect(applyTask.result.requiredApprovals).toEqual(["install_contribution"]);
    expect(applyTask.request.inputs["installDiffArtifact"]).toMatchObject({
      id: "artifact-install-diff-plan-2",
      type: "contrib_install_diff_plan"
    });
  });

  it("persists install apply result and flogo_json artifacts through blob-backed task artifact storage", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      new FakeTaskStoreService() as any,
      {
        prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs,
        resolveTaskAppPath: async () => "examples/hello-rest/flogo.json"
      } as any,
      storage as AppAnalysisStorageService
    );

    const task = await service.submitTask({
      type: "update",
      projectId: "demo",
      appId: "hello-rest",
      summary: "Apply the approved install diff"
    });

    await service.syncTaskState(task.id, {
      artifact: {
        id: "artifact-install-apply-1",
        type: "contrib_install_apply_result",
        name: "trigger-install-apply-webhooktrigger.json",
        uri: "memory://task-3/trigger-install-apply-webhooktrigger.json",
        metadata: {
          result: {
            contributionKind: "trigger",
            sourceContribution: {
              kind: "trigger",
              modulePath: "example.com/acme/webhook",
              packageName: "webhooktrigger",
              selectedAlias: "webhooktrigger",
              source: "package_artifact"
            },
            targetApp: { appId: "hello-rest", appPath: "examples/hello-rest/flogo.json" },
            basedOnInstallDiffPlan: {
              sourceArtifactId: "artifact-install-diff-plan-2",
              installPlanArtifactId: "install-plan-artifact-1",
              diffFingerprint: "diff-sha",
              appFingerprintBefore: "before-sha",
              appFingerprintPreview: "after-sha"
            },
            appFingerprintBefore: "before-sha",
            appFingerprintAfter: "after-sha",
            isStale: false,
            applied: true,
            applyReady: true,
            readiness: "high",
            warnings: [],
            conflicts: [],
            limitations: [],
            changedPaths: ["imports"],
            appliedImports: [{ alias: "webhooktrigger", ref: "example.com/acme/webhook", action: "add" }],
            appliedRefs: [{ surface: "triggerRef", value: "#webhooktrigger" }],
            applySummary: ["Applied import alias \"webhooktrigger\" for ref \"example.com/acme/webhook\"."],
            canonicalBeforeJson: "{}",
            canonicalAfterJson: "{\"imports\":[{\"alias\":\"webhooktrigger\",\"ref\":\"example.com/acme/webhook\"}]}",
            canonicalApp: {
              name: "hello-rest",
              type: "flogo:app",
              appModel: "1.1.0",
              imports: [{ alias: "webhooktrigger", ref: "example.com/acme/webhook" }]
            },
            recommendedNextAction: "Review the updated canonical flogo.json artifact.",
            approvalRequired: true,
            mutationApplied: true
          }
        }
      }
    });

    await service.syncTaskState(task.id, {
      artifact: {
        id: "artifact-flogo-json-1",
        type: "flogo_json",
        name: "task-3-hello-rest-flogo.json",
        uri: "memory://task-3/hello-rest-flogo.json",
        metadata: {
          canonicalJson: "{\"imports\":[{\"alias\":\"webhooktrigger\",\"ref\":\"example.com/acme/webhook\"}]}",
          appPath: "examples/hello-rest/flogo.json"
        }
      }
    });

    expect(storage.uploads).toHaveLength(2);
    expect(storage.uploads[0]?.kind).toBe("contrib_install_apply_result");
    expect(storage.uploads[1]?.kind).toBe("flogo_json");
  });

  it("resolves contribution source artifacts for update planning and fills the target app path from appId", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const taskStore = new FakeTaskStoreService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      taskStore as any,
      {
        prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs,
        resolveTaskAppPath: async () => "examples/hello-rest/flogo.json"
      } as any,
      storage as AppAnalysisStorageService
    );

    const sourceTask = await service.submitTask({
      type: "review",
      projectId: "demo",
      appPath: "examples/hello-rest/flogo.json",
      summary: "Seed packaged contribution artifact"
    });

    await service.syncTaskState(sourceTask.id, {
      artifact: {
        id: "package-artifact-update-1",
        type: "contrib_package",
        name: "trigger-package-webhooktrigger",
        uri: "memory://task/trigger-package-webhooktrigger.json",
        metadata: {
          result: {
            bundle: {
              kind: "trigger",
              packageName: "webhooktrigger",
              modulePath: "example.com/acme/webhook",
              bundleRoot: "/tmp/flogo-trigger-webhooktrigger",
              descriptor: {
                ref: "example.com/acme/webhook",
                alias: "webhooktrigger",
                type: "trigger",
                name: "webhook-trigger",
                version: "0.2.0",
                title: "Webhook Trigger",
                settings: [],
                handlerSettings: [],
                outputs: [],
                reply: [],
                examples: [],
                compatibilityNotes: ["Generated scaffold"],
                source: "trigger_scaffold"
              },
              files: []
            },
            validation: { ok: true, stages: [], summary: "ok", artifacts: [] },
            build: { kind: "build", ok: true, command: ["go", "build", "./..."], exitCode: 0, summary: "ok", output: "" },
            test: { kind: "test", ok: true, command: ["go", "test", "./..."], exitCode: 0, summary: "ok", output: "" },
            package: {
              format: "zip",
              fileName: "trigger-webhooktrigger.zip",
              path: "/tmp/trigger-webhooktrigger.zip",
              bytes: 2048,
              sha256: "abc123",
              base64: "ZmFrZQ=="
            }
          }
        }
      }
    });

    const updateTask = await service.submitTask({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      summary: "Plan how to update the installed trigger contribution",
      inputs: {
        mode: "update_contrib_plan",
        packageArtifactId: "package-artifact-update-1"
      }
    });

    expect(updateTask.request.appPath).toBe("examples/hello-rest/flogo.json");
    expect(updateTask.request.inputs["packageArtifact"]).toMatchObject({
      id: "package-artifact-update-1",
      type: "contrib_package"
    });
  });

  it("persists contribution update-plan artifacts through blob-backed task artifact storage", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      new FakeTaskStoreService() as any,
      {
        prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs,
        resolveTaskAppPath: async () => "examples/hello-rest/flogo.json"
      } as any,
      storage as AppAnalysisStorageService
    );

    const task = await service.submitTask({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      summary: "Plan how to update a contribution in hello-rest"
    });

    await service.syncTaskState(task.id, {
      artifact: {
        id: "artifact-update-plan-1",
        type: "contrib_update_plan",
        name: "trigger-update-plan-webhooktrigger",
        uri: "memory://task/trigger-update-plan-webhooktrigger.json",
        metadata: {
          result: {
            contributionKind: "trigger",
            targetApp: { appId: "hello-rest", appPath: "examples/hello-rest/flogo.json" },
            matchQuality: "exact",
            compatibility: "compatible",
            updateReady: true,
            readiness: "high",
            recommendedNextAction: "Review the update plan before generating an exact diff preview."
          }
        }
      }
    });

    expect(storage.uploads).toHaveLength(1);
    expect(storage.uploads[0]).toMatchObject({
      projectId: "demo",
      taskId: task.id,
      artifactId: "artifact-update-plan-1",
      kind: "contrib_update_plan"
    });
  });

  it("resolves update-plan artifacts for exact update diff preview and fills the target app path from appId", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const taskStore = new FakeTaskStoreService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      taskStore as any,
      {
        prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs,
        resolveTaskAppPath: async () => "examples/hello-rest/flogo.json"
      } as any,
      storage as AppAnalysisStorageService
    );

    const sourceTask = await service.submitTask({
      type: "review",
      projectId: "demo",
      appPath: "examples/hello-rest/flogo.json",
      summary: "Seed contribution update-plan artifact"
    });

    await service.syncTaskState(sourceTask.id, {
      artifact: {
        id: "artifact-update-plan-2",
        type: "contrib_update_plan",
        name: "trigger-update-plan-webhooktrigger",
        uri: "memory://task/trigger-update-plan-webhooktrigger.json",
        metadata: {
          result: {
            contributionKind: "trigger",
            source: "package_artifact",
            sourceArtifactId: "package-artifact-update-2",
            targetApp: { appId: "hello-rest", appPath: "examples/hello-rest/flogo.json" },
            bundle: {
              kind: "trigger",
              modulePath: "example.com/acme/webhook",
              packageName: "webhooktrigger",
              bundleRoot: "/tmp/flogo-trigger-webhooktrigger",
              descriptor: {
                ref: "example.com/acme/webhook",
                alias: "webhooktrigger",
                type: "trigger",
                name: "webhook-trigger",
                version: "0.2.0",
                title: "Webhook Trigger",
                settings: [],
                handlerSettings: [],
                outputs: [],
                reply: [],
                examples: [],
                compatibilityNotes: ["Generated scaffold"],
                source: "trigger_scaffold"
              },
              files: []
            },
            modulePath: "example.com/acme/webhook",
            packageName: "webhooktrigger",
            packagePath: "example.com/acme/webhook",
            descriptorRef: "example.com/acme/webhook",
            appFingerprint: "app-sha",
            planFingerprint: "update-plan-sha",
            selectedAlias: "webhooktrigger",
            detectedInstalledContribution: {
              alias: "webhooktrigger",
              ref: "example.com/acme/webhook",
              version: "0.1.0",
              matchedBy: ["alias+ref"],
              confidence: "high"
            },
            matchQuality: "exact",
            compatibility: "compatible",
            updateReady: true,
            readiness: "high",
            predictedChanges: {
              importsToReplace: [{ alias: "webhooktrigger", ref: "example.com/acme/webhook", action: "replace_existing" }],
              importsToKeep: [],
              importsToAdd: [],
              importsToRemove: [],
              refsToReplace: [{ surface: "triggerRef", value: "#webhooktrigger" }],
              refsToKeep: [],
              refsToAdd: [],
              refsToRemove: [],
              changedPaths: ["imports"],
              summaryLines: ["Replace import alias \"webhooktrigger\" in place."],
              noMutation: true
            },
            warnings: [],
            conflicts: [],
            diagnostics: [],
            recommendedNextAction: "Review the update plan before requesting an exact update diff preview.",
            limitations: ["Planning only."]
          }
        }
      }
    });

    const diffTask = await service.submitTask({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      summary: "Preview the exact canonical update diff",
      inputs: {
        mode: "update_contrib_diff_plan",
        updatePlanArtifactId: "artifact-update-plan-2"
      }
    });

    expect(diffTask.request.appPath).toBe("examples/hello-rest/flogo.json");
    expect(diffTask.request.inputs["updatePlanArtifact"]).toMatchObject({
      id: "artifact-update-plan-2",
      type: "contrib_update_plan"
    });
  });

  it("persists contribution update diff-plan artifacts through blob-backed task artifact storage", async () => {
    const storage = new FakeAppAnalysisStorageService();
    const service = new OrchestrationService(
      new ToolsetService(),
      new OrchestratorClientService(),
      new TaskEventsService(),
      new FakeTaskStoreService() as any,
      {
        prepareRunComparisonTaskInputs: async (_projectId: string, _appId: string, inputs: Record<string, unknown>) => inputs,
        resolveTaskAppPath: async () => "examples/hello-rest/flogo.json"
      } as any,
      storage as AppAnalysisStorageService
    );

    const task = await service.submitTask({
      type: "review",
      projectId: "demo",
      appId: "hello-rest",
      summary: "Preview the exact canonical update diff"
    });

    await service.syncTaskState(task.id, {
      artifact: {
        id: "artifact-update-diff-plan-1",
        type: "contrib_update_diff_plan",
        name: "trigger-update-diff-plan-webhooktrigger",
        uri: "memory://task/trigger-update-diff-plan-webhooktrigger.json",
        metadata: {
          result: {
            contributionKind: "trigger",
            sourceContribution: {
              kind: "trigger",
              modulePath: "example.com/acme/webhook",
              packageName: "webhooktrigger",
              selectedAlias: "webhooktrigger",
              source: "package_artifact"
            },
            targetApp: { appId: "hello-rest", appPath: "examples/hello-rest/flogo.json" },
            basedOnUpdatePlan: {
              sourceArtifactId: "artifact-update-plan-2",
              appFingerprint: "app-sha",
              planFingerprint: "plan-sha"
            },
            appFingerprintBefore: "app-sha",
            updatePlanFingerprint: "plan-sha",
            isStale: false,
            previewAvailable: true,
            updateReady: true,
            readiness: "high",
            warnings: [],
            conflicts: [],
            limitations: ["Diff preview only."],
            predictedChanges: {
              importsBefore: [],
              importsAfter: [],
              importsToReplace: [],
              importsToKeep: [],
              importsToAdd: [],
              importsToRemove: [],
              refsToReplace: [],
              refsToKeep: [],
              refsToAdd: [],
              refsToRemove: [],
              structuralChanges: ["Replace import alias \"webhooktrigger\" in place."],
              changedPaths: ["imports"],
              diffEntries: [],
              noMutation: true
            },
            diffSummary: ["imports: update alias \"webhooktrigger\" in place"],
            canonicalBeforeJson: "{}",
            canonicalAfterJson: "{\"imports\":[{\"alias\":\"webhooktrigger\"}]}",
            recommendedNextAction: "Review the exact canonical update diff."
          }
        }
      }
    });

    expect(storage.uploads).toHaveLength(1);
    expect(storage.uploads[0]).toMatchObject({
      projectId: "demo",
      taskId: task.id,
      artifactId: "artifact-update-diff-plan-1",
      kind: "contrib_update_diff_plan"
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
    ).rejects.toThrow(/contribution scaffold, validate, package, install-plan, update-plan, update-diff-plan, install-diff-plan, or install-apply tasks/i);
  });
});
