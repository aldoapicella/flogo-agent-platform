import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { OrchestratorAgent, StaticModelClient } from "@flogo-agent/agent";
import {
  type ApprovalDecision,
  type ArtifactRef,
  type OrchestratorStatus,
  type TaskRequest,
  TaskEventPublishSchema,
  TaskRequestSchema,
  TaskResultSchema,
  TaskStateSyncSchema,
  type TaskEvent,
  type TaskRuns,
  type TaskStep,
  type TaskSummary
} from "@flogo-agent/contracts";

import { TaskEventsService } from "../events/task-events.service.js";
import { AppAnalysisStorageService } from "../flogo-apps/app-analysis-storage.service.js";
import { ToolsetService } from "../tools/toolset.service.js";
import { FlogoAppsService } from "../flogo-apps/flogo-apps.service.js";
import { OrchestratorClientService } from "./orchestrator-client.service.js";
import { type StoredTask, TaskStoreService } from "./task-store.service.js";

@Injectable()
export class OrchestrationService {
  private readonly orchestrator: OrchestratorAgent;

  constructor(
    private readonly toolsetService: ToolsetService,
    private readonly orchestratorClient: OrchestratorClientService,
    private readonly eventsService: TaskEventsService,
    private readonly taskStore: TaskStoreService,
    private readonly flogoAppsService: FlogoAppsService,
    private readonly storage: AppAnalysisStorageService
  ) {
    this.orchestrator = new OrchestratorAgent({
      modelClient: new StaticModelClient(),
      ...this.toolsetService.toolset
    });
  }

  async submitTask(value: unknown): Promise<StoredTask> {
    const parsedRequest = TaskRequestSchema.parse(value);
    const request = await this.prepareTaskRequest(parsedRequest);
    const plan = await this.orchestrator.planTask(request);
    const id = request.taskId ?? randomUUID();
    const steps: TaskStep[] = plan.steps.map((step, index) => ({
      id: `${id}-${step.id}`,
      order: index,
      type: this.mapPlanStepType(step.tool),
      status: "planning",
      summary: step.label
    }));
    const result = TaskResultSchema.parse({
      taskId: id,
      type: request.type,
      status: plan.requiredApprovals.length > 0 ? "awaiting_approval" : "planning",
      summary: plan.requiredApprovals.length > 0 ? "Task submitted and waiting for approval" : "Task submitted to orchestrator",
      approvalStatus: plan.requiredApprovals.length > 0 ? "pending" : undefined,
      artifacts: [],
      requiredApprovals: plan.requiredApprovals,
      nextActions: plan.steps.map((step) => step.label)
    });

    await this.taskStore.createTaskRecord({
      id,
      request: {
        ...request,
        taskId: id
      },
      result,
      planSummary: plan.summary,
      steps,
      requiredApprovals: plan.requiredApprovals
    });

    await this.publishEvent(id, "status", `Task created: ${request.summary}`, { status: result.status });
    await this.publishEvent(id, "tool", "Execution plan prepared", { steps: plan.steps });

    const orchestration = await this.orchestratorClient.startWorkflow({
      taskId: id,
      request: {
        ...request,
        taskId: id
      },
      requiredApprovals: plan.requiredApprovals,
      planSummary: plan.summary,
      steps
    });

    const updated = await this.taskStore.syncTaskState(id, {
      orchestrationId: orchestration.orchestrationId,
      status: plan.requiredApprovals.length > 0 ? "awaiting_approval" : "running",
      summary: orchestration.summary,
      approvalStatus: plan.requiredApprovals.length > 0 ? "pending" : undefined,
      activeJobRuns: orchestration.activeJobRuns
    });

    await this.publishEvent(id, "status", orchestration.summary, {
      orchestrationId: orchestration.orchestrationId,
      status: updated?.result.status ?? (plan.requiredApprovals.length > 0 ? "awaiting_approval" : "running")
    });

    return updated ?? (await this.requireTask(id));
  }

  listTaskEvents(taskId: string): Promise<TaskEvent[]> {
    return this.taskStore.listTaskEvents(taskId);
  }

  listTasks(): Promise<TaskSummary[]> {
    return this.taskStore.listTasks();
  }

  listTaskRuns(taskId: string): Promise<TaskRuns> {
    return this.taskStore.listTaskRuns(taskId);
  }

  streamTask(taskId: string) {
    return this.eventsService.stream(taskId);
  }

  async approveTask(taskId: string, decision: ApprovalDecision): Promise<StoredTask | undefined> {
    const task = await this.taskStore.getTask(taskId);
    if (!task) {
      return undefined;
    }

    const orchestrationId = task.result.orchestrationId;
    if (!orchestrationId) {
      return task;
    }

    const status = await this.orchestratorClient.signalApproval(orchestrationId, decision);

    await this.taskStore.applyApprovalDecision(taskId, decision);

    const updated = await this.taskStore.syncTaskState(taskId, {
      status: decision.status === "approved" ? "running" : "failed",
      summary: status?.summary ?? (decision.status === "approved" ? "Approval recorded; task resumed" : "Approval rejected"),
      approvalStatus: decision.status,
      activeJobRuns: status?.activeJobRuns ?? task.result.activeJobRuns,
      requiredApprovals: []
    });

    await this.publishEvent(taskId, "approval", updated?.result.summary ?? "Approval decision recorded", {
      rationale: decision.rationale,
      status: decision.status
    });

    return updated;
  }

  getTask(taskId: string): Promise<StoredTask | undefined> {
    return this.taskStore.getTask(taskId);
  }

  listArtifacts(taskId: string): Promise<ArtifactRef[]> {
    return this.taskStore.listArtifacts(taskId);
  }

  async completeTask(taskId: string, status: TaskSummary["state"], summary: string): Promise<StoredTask | undefined> {
    const task = await this.taskStore.updateTaskStatus(taskId, status, summary);
    if (task) {
      await this.publishEvent(taskId, "status", summary, { status });
    }
    return task;
  }

  async attachArtifact(taskId: string, artifact: ArtifactRef): Promise<void> {
    const persistedArtifact = await this.persistArtifactIfNeeded(taskId, artifact);
    await this.taskStore.syncTaskState(taskId, { artifact: persistedArtifact });
    await this.publishEvent(taskId, "artifact", `Artifact published: ${persistedArtifact.name}`, { artifact: persistedArtifact });
  }

  async publishExternalEvent(taskId: string, payload: unknown): Promise<StoredTask | undefined> {
    const task = await this.taskStore.getTask(taskId);
    if (!task) {
      return undefined;
    }

    const event = TaskEventPublishSchema.parse(payload);
    await this.publishEvent(taskId, event.type, event.message, event.payload);
    return this.taskStore.getTask(taskId);
  }

  async syncTaskState(taskId: string, payload: unknown): Promise<StoredTask | undefined> {
    const parsed = TaskStateSyncSchema.parse(payload);
    const sync = parsed.artifact
      ? {
          ...parsed,
          artifact: await this.persistArtifactIfNeeded(taskId, parsed.artifact)
        }
      : parsed;
    const task = await this.taskStore.syncTaskState(taskId, sync);
    if (!task) {
      return undefined;
    }

    if (sync.artifact) {
      await this.publishEvent(taskId, "artifact", `Artifact published: ${sync.artifact.name}`, {
        artifact: sync.artifact
      });
    }

    if (sync.summary || sync.status || sync.approvalStatus || sync.activeJobRuns || sync.jobRunStatus) {
      await this.publishEvent(taskId, "status", task.result.summary, {
        status: task.result.status,
        approvalStatus: task.result.approvalStatus,
        activeJobRuns: task.result.activeJobRuns,
        latestJobRun: sync.jobRunStatus
      });
    }

    return task;
  }

  async refreshStatus(taskId: string): Promise<StoredTask | undefined> {
    const task = await this.taskStore.getTask(taskId);
    if (!task?.result.orchestrationId) {
      return task;
    }

    const status = await this.orchestratorClient.getStatus(task.result.orchestrationId);
    if (!status) {
      return task;
    }

    return this.applyOrchestratorStatus(task.id, status);
  }

  private async applyOrchestratorStatus(taskId: string, status: OrchestratorStatus): Promise<StoredTask | undefined> {
    return this.taskStore.syncTaskState(taskId, {
      orchestrationId: status.orchestrationId,
      status: this.mapRuntimeStatus(status.runtimeStatus, status.approvalStatus),
      summary: status.summary,
      approvalStatus: status.approvalStatus,
      activeJobRuns: status.activeJobRuns
    });
  }

  private mapRuntimeStatus(runtimeStatus: OrchestratorStatus["runtimeStatus"], approvalStatus?: OrchestratorStatus["approvalStatus"]) {
    if (approvalStatus === "pending") {
      return "awaiting_approval";
    }

    switch (runtimeStatus) {
      case "completed":
        return "completed";
      case "failed":
      case "terminated":
        return "failed";
      case "running":
        return "running";
      case "pending":
        return "planning";
      default:
        return "planning";
    }
  }

  private async publishEvent(
    taskId: string,
    type: TaskEvent["type"],
    message: string,
    payload?: Record<string, unknown>
  ): Promise<TaskEvent> {
    const event = await this.taskStore.appendEvent(taskId, type, message, payload);
    this.eventsService.emit(event);
    return event;
  }

  private async requireTask(taskId: string): Promise<StoredTask> {
    const task = await this.taskStore.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} was not persisted`);
    }
    return task;
  }

  private async prepareTaskRequest(parsedRequest: TaskRequest) {
    let inputs = parsedRequest.inputs;
    const mode = parsedRequest.inputs["mode"];
    let appPath = parsedRequest.appPath;

    if ((mode === "run_comparison" || mode === "run_comparison_plan") && parsedRequest.appId) {
      inputs = await this.flogoAppsService.prepareRunComparisonTaskInputs(
        parsedRequest.projectId,
        parsedRequest.appId,
        parsedRequest.inputs
      );
    }

    if (
      (mode === "validate_contrib" || mode === "package_contrib" || mode === "install_contrib_plan") &&
      typeof inputs["bundleArtifactId"] === "string" &&
      !inputs["bundleArtifact"] &&
      !inputs["result"]
    ) {
      const artifact = await this.taskStore.getArtifact(inputs["bundleArtifactId"] as string);
      if (!artifact) {
        throw new Error(`Contribution bundle artifact ${String(inputs["bundleArtifactId"])} was not found`);
      }
      if (artifact.type !== "contrib_bundle") {
        throw new Error(`Artifact ${artifact.id} is ${artifact.type}, expected contrib_bundle`);
      }
      inputs = {
        ...inputs,
        bundleArtifact: artifact
      };
    }

    if (
      mode === "install_contrib_plan" &&
      typeof inputs["packageArtifactId"] === "string" &&
      !inputs["packageArtifact"] &&
      !inputs["packageResult"]
    ) {
      const artifact = await this.taskStore.getArtifact(inputs["packageArtifactId"] as string);
      if (!artifact) {
        throw new Error(`Contribution package artifact ${String(inputs["packageArtifactId"])} was not found`);
      }
      if (artifact.type !== "contrib_package") {
        throw new Error(`Artifact ${artifact.id} is ${artifact.type}, expected contrib_package`);
      }
      inputs = {
        ...inputs,
        packageArtifact: artifact
      };
    }

    if (
      mode === "install_contrib_diff_plan" &&
      typeof inputs["installPlanArtifactId"] === "string" &&
      !inputs["installPlanArtifact"] &&
      !inputs["installPlanResult"]
    ) {
      const artifact = await this.taskStore.getArtifact(inputs["installPlanArtifactId"] as string);
      if (!artifact) {
        throw new Error(`Contribution install-plan artifact ${String(inputs["installPlanArtifactId"])} was not found`);
      }
      if (artifact.type !== "contrib_install_plan") {
        throw new Error(`Artifact ${artifact.id} is ${artifact.type}, expected contrib_install_plan`);
      }
      inputs = {
        ...inputs,
        installPlanArtifact: artifact
      };
    }

    if (
      mode === "install_contrib_apply" &&
      typeof inputs["installDiffArtifactId"] === "string" &&
      !inputs["installDiffArtifact"] &&
      !inputs["installDiffResult"]
    ) {
      const artifact = await this.taskStore.getArtifact(inputs["installDiffArtifactId"] as string);
      if (!artifact) {
        throw new Error(`Contribution install-diff artifact ${String(inputs["installDiffArtifactId"])} was not found`);
      }
      if (artifact.type !== "contrib_install_diff_plan") {
        throw new Error(`Artifact ${artifact.id} is ${artifact.type}, expected contrib_install_diff_plan`);
      }
      inputs = {
        ...inputs,
        installDiffArtifact: artifact
      };
    }

    if (mode === "install_contrib_plan" || mode === "install_contrib_diff_plan" || mode === "install_contrib_apply") {
      const targetApp =
        inputs["targetApp"] && typeof inputs["targetApp"] === "object" && !Array.isArray(inputs["targetApp"])
          ? (inputs["targetApp"] as Record<string, unknown>)
          : {};
      const inlinePlanResult =
        inputs["installPlanResult"] && typeof inputs["installPlanResult"] === "object" && !Array.isArray(inputs["installPlanResult"])
          ? (inputs["installPlanResult"] as Record<string, unknown>)
          : undefined;
      const artifactPlanResult =
        inputs["installPlanArtifact"] &&
        typeof inputs["installPlanArtifact"] === "object" &&
        !Array.isArray(inputs["installPlanArtifact"]) &&
        typeof (inputs["installPlanArtifact"] as Record<string, unknown>).metadata === "object" &&
        !Array.isArray((inputs["installPlanArtifact"] as Record<string, unknown>).metadata)
          ? ((((inputs["installPlanArtifact"] as Record<string, unknown>).metadata as Record<string, unknown>).result as Record<string, unknown> | undefined))
          : undefined;
      const planTargetApp =
        inlinePlanResult?.targetApp && typeof inlinePlanResult.targetApp === "object" && !Array.isArray(inlinePlanResult.targetApp)
          ? (inlinePlanResult.targetApp as Record<string, unknown>)
          : artifactPlanResult?.targetApp && typeof artifactPlanResult.targetApp === "object" && !Array.isArray(artifactPlanResult.targetApp)
            ? (artifactPlanResult.targetApp as Record<string, unknown>)
            : undefined;
      const inlineDiffResult =
        inputs["installDiffResult"] && typeof inputs["installDiffResult"] === "object" && !Array.isArray(inputs["installDiffResult"])
          ? (inputs["installDiffResult"] as Record<string, unknown>)
          : undefined;
      const artifactDiffResult =
        inputs["installDiffArtifact"] &&
        typeof inputs["installDiffArtifact"] === "object" &&
        !Array.isArray(inputs["installDiffArtifact"]) &&
        typeof (inputs["installDiffArtifact"] as Record<string, unknown>).metadata === "object" &&
        !Array.isArray((inputs["installDiffArtifact"] as Record<string, unknown>).metadata)
          ? ((((inputs["installDiffArtifact"] as Record<string, unknown>).metadata as Record<string, unknown>).result as Record<string, unknown> | undefined))
          : undefined;
      const diffTargetApp =
        inlineDiffResult?.targetApp && typeof inlineDiffResult.targetApp === "object" && !Array.isArray(inlineDiffResult.targetApp)
          ? (inlineDiffResult.targetApp as Record<string, unknown>)
          : artifactDiffResult?.targetApp && typeof artifactDiffResult.targetApp === "object" && !Array.isArray(artifactDiffResult.targetApp)
            ? (artifactDiffResult.targetApp as Record<string, unknown>)
            : undefined;

      if (!appPath && parsedRequest.appId) {
        appPath = await this.flogoAppsService.resolveTaskAppPath(parsedRequest.projectId, parsedRequest.appId);
      }
      if (!appPath && typeof targetApp["appPath"] === "string") {
        appPath = targetApp["appPath"] as string;
      }
      if (!appPath && planTargetApp && typeof planTargetApp["appPath"] === "string") {
        appPath = planTargetApp["appPath"] as string;
      }
      if (!appPath && diffTargetApp && typeof diffTargetApp["appPath"] === "string") {
        appPath = diffTargetApp["appPath"] as string;
      }
      if (!appPath) {
        const resolvedAppId =
          parsedRequest.appId ??
          (typeof targetApp["appId"] === "string" ? (targetApp["appId"] as string) : undefined) ??
          (planTargetApp && typeof planTargetApp["appId"] === "string" ? (planTargetApp["appId"] as string) : undefined) ??
          (diffTargetApp && typeof diffTargetApp["appId"] === "string" ? (diffTargetApp["appId"] as string) : undefined);
        if (resolvedAppId) {
          appPath = await this.flogoAppsService.resolveTaskAppPath(parsedRequest.projectId, resolvedAppId);
        }
      }
      if (!appPath) {
        throw new Error("Contribution install planning, diff planning, and apply require a target appPath or a resolvable appId.");
      }

      inputs = {
        ...inputs,
        targetApp: {
          ...planTargetApp,
          ...diffTargetApp,
          ...targetApp,
          projectId: parsedRequest.projectId,
          appId:
            parsedRequest.appId ??
            (typeof targetApp["appId"] === "string" ? (targetApp["appId"] as string) : undefined) ??
            (planTargetApp && typeof planTargetApp["appId"] === "string" ? (planTargetApp["appId"] as string) : undefined) ??
            (diffTargetApp && typeof diffTargetApp["appId"] === "string" ? (diffTargetApp["appId"] as string) : undefined),
          appPath
        }
      };
    }

    return {
      ...parsedRequest,
      appPath,
      inputs
    };
  }

  private async persistArtifactIfNeeded(taskId: string, artifact: ArtifactRef): Promise<ArtifactRef> {
    if (
      !this.shouldPersistTaskArtifact(artifact) ||
      (isRecord(artifact.metadata.storage) && artifact.metadata.storage.kind === "blob")
    ) {
      return artifact;
    }

    if (!this.storage.isConfigured()) {
      throw new Error(
        "Contribution artifact storage is not configured. Set APP_ANALYSIS_STORAGE_CONNECTION_STRING, AZURITE_CONNECTION_STRING, or DURABLE_STORAGE_CONNECTION_STRING before running contribution scaffold, validate, package, install-plan, install-diff-plan, or install-apply tasks."
      );
    }

    const task = await this.taskStore.getTask(taskId);
    if (!task) {
      return artifact;
    }

    const stored = await this.storage.storeTaskArtifact({
      projectId: task.request.projectId,
      taskId,
      artifactId: artifact.id,
      kind: artifact.type,
      payload: artifact.metadata
    });

    return {
      ...artifact,
      uri: stored.uri,
      metadata: {
        ...artifact.metadata,
        storage: {
          kind: "blob",
          blobPath: stored.blobPath,
          contentType: stored.contentType,
          durablePayload: true
        }
      }
    };
  }

  private shouldPersistTaskArtifact(
    artifact: ArtifactRef
  ): artifact is ArtifactRef & {
    type: "contrib_bundle" | "contrib_validation_report" | "contrib_package" | "contrib_install_plan" | "contrib_install_diff_plan" | "contrib_install_apply_result" | "build_log" | "test_report" | "flogo_json";
    metadata: Record<string, unknown>;
  } {
    return (
      (
        artifact.type === "contrib_bundle" ||
        artifact.type === "contrib_validation_report" ||
        artifact.type === "contrib_package" ||
        artifact.type === "contrib_install_plan" ||
        artifact.type === "contrib_install_diff_plan" ||
        artifact.type === "contrib_install_apply_result" ||
        artifact.type === "flogo_json" ||
        artifact.type === "build_log" ||
        artifact.type === "test_report"
      ) &&
      isRecord(artifact.metadata)
    );
  }

  private mapPlanStepType(tool?: string): TaskStep["type"] {
    if (!tool) {
      return "plan";
    }
    if (tool.includes("validate")) {
      return "validate";
    }
    if (tool.includes("generateApp") || tool.includes("patchApp")) {
      return "patch";
    }
    if (tool.includes("installContribApply")) {
      return "patch";
    }
    if (tool.includes("buildApp") || tool.includes("runSmoke")) {
      return "test";
    }
    if (tool.includes("catalogContribs") || tool.includes("previewMapping") || tool.includes("planProperties")) {
      return "review";
    }
    if (tool.includes("diagnoseApp")) {
      return "review";
    }
    return "plan";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
