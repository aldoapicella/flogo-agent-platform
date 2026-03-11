import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { OrchestratorAgent, StaticModelClient } from "@flogo-agent/agent";
import {
  type ActiveJobRun,
  type ApprovalDecision,
  type ApprovalType,
  type ArtifactRef,
  type OrchestratorStatus,
  TaskEventPublishSchema,
  TaskRequestSchema,
  TaskResultSchema,
  TaskStateSyncSchema,
  type TaskStep,
  type TaskRequest,
  type TaskResult,
  type TaskStatus
} from "@flogo-agent/contracts";

import { TaskEventsService } from "../events/task-events.service.js";
import { ToolsetService } from "../tools/toolset.service.js";
import { OrchestratorClientService } from "./orchestrator-client.service.js";

export interface StoredTask {
  id: string;
  request: TaskRequest;
  result: TaskResult;
  approvals: ApprovalType[];
  artifacts: ArtifactRef[];
}

@Injectable()
export class OrchestrationService {
  private readonly tasks = new Map<string, StoredTask>();
  private readonly orchestrator: OrchestratorAgent;

  constructor(
    private readonly toolsetService: ToolsetService,
    private readonly orchestratorClient: OrchestratorClientService,
    private readonly eventsService: TaskEventsService
  ) {
    this.orchestrator = new OrchestratorAgent({
      modelClient: new StaticModelClient(),
      ...this.toolsetService.toolset
    });
  }

  async submitTask(value: unknown): Promise<StoredTask> {
    const request = TaskRequestSchema.parse(value);
    const plan = await this.orchestrator.planTask(request);
    const id = request.taskId ?? randomUUID();
    const steps: TaskStep[] = plan.steps.map((step, index) => ({
      id: `${id}-${step.id}`,
      order: index,
      type: index === 0 ? "plan" : index === plan.steps.length - 1 ? "test" : "patch",
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

    const storedTask: StoredTask = {
      id,
      request: {
        ...request,
        taskId: id
      },
      result,
      approvals: plan.requiredApprovals,
      artifacts: []
    };

    this.tasks.set(id, storedTask);
    this.eventsService.publish(id, "status", `Task created: ${request.summary}`, { status: result.status });
    this.eventsService.publish(id, "tool", "Execution plan prepared", { steps: plan.steps });
    const orchestration = await this.orchestratorClient.startWorkflow({
      taskId: id,
      request: storedTask.request,
      requiredApprovals: plan.requiredApprovals,
      planSummary: plan.summary,
      steps
    });

    storedTask.result = {
      ...storedTask.result,
      orchestrationId: orchestration.orchestrationId,
      status: plan.requiredApprovals.length > 0 ? "awaiting_approval" : "running",
      summary: orchestration.summary,
      activeJobRuns: orchestration.activeJobRuns
    };
    this.eventsService.publish(id, "status", orchestration.summary, {
      orchestrationId: orchestration.orchestrationId,
      status: storedTask.result.status
    });

    return storedTask;
  }

  listTaskEvents(taskId: string) {
    return this.eventsService.list(taskId);
  }

  streamTask(taskId: string) {
    return this.eventsService.stream(taskId);
  }

  async approveTask(taskId: string, decision: ApprovalDecision): Promise<StoredTask | undefined> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }

    const orchestrationId = task.result.orchestrationId;
    if (!orchestrationId) {
      return task;
    }

    const status = await this.orchestratorClient.signalApproval(orchestrationId, decision);

    task.result = {
      ...task.result,
      status: decision.status === "approved" ? "running" : "failed",
      summary: status?.summary ?? (decision.status === "approved" ? "Approval recorded; task resumed" : "Approval rejected"),
      approvalStatus: decision.status,
      activeJobRuns: status?.activeJobRuns ?? task.result.activeJobRuns,
      requiredApprovals: []
    };
    task.approvals = [];
    this.eventsService.publish(taskId, "approval", task.result.summary, { rationale: decision.rationale, status: decision.status });
    return task;
  }

  getTask(taskId: string): StoredTask | undefined {
    return this.tasks.get(taskId);
  }

  listArtifacts(taskId: string): ArtifactRef[] {
    return this.tasks.get(taskId)?.artifacts ?? [];
  }

  completeTask(taskId: string, status: TaskStatus, summary: string): StoredTask | undefined {
    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }

    task.result = {
      ...task.result,
      status,
      summary
    };
    this.eventsService.publish(taskId, "status", summary, { status });
    return task;
  }

  attachArtifact(taskId: string, artifact: ArtifactRef): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    task.artifacts.push(artifact);
    task.result = {
      ...task.result,
      artifacts: [...task.artifacts]
    };
    this.eventsService.publish(taskId, "artifact", `Artifact published: ${artifact.name}`, { artifact });
  }

  publishExternalEvent(taskId: string, payload: unknown): StoredTask | undefined {
    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }

    const event = TaskEventPublishSchema.parse(payload);
    this.eventsService.publish(taskId, event.type, event.message, event.payload);
    return task;
  }

  syncTaskState(taskId: string, payload: unknown): StoredTask | undefined {
    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }

    const sync = TaskStateSyncSchema.parse(payload);
    task.result = {
      ...task.result,
      orchestrationId: sync.orchestrationId ?? task.result.orchestrationId,
      status: sync.status ?? task.result.status,
      summary: sync.summary ?? task.result.summary,
      approvalStatus: sync.approvalStatus ?? task.result.approvalStatus,
      activeJobRuns: sync.activeJobRuns ?? task.result.activeJobRuns,
      validationReport: sync.validationReport ?? task.result.validationReport,
      requiredApprovals: sync.requiredApprovals ?? task.result.requiredApprovals,
      nextActions: sync.nextActions ?? task.result.nextActions
    };

    if (sync.artifact) {
      this.attachArtifact(taskId, sync.artifact);
    }
    if (sync.summary || sync.status || sync.approvalStatus || sync.activeJobRuns) {
      this.eventsService.publish(taskId, "status", task.result.summary, {
        status: task.result.status,
        approvalStatus: task.result.approvalStatus,
        activeJobRuns: task.result.activeJobRuns
      });
    }

    return task;
  }

  async refreshStatus(taskId: string): Promise<StoredTask | undefined> {
    const task = this.tasks.get(taskId);
    if (!task?.result.orchestrationId) {
      return task;
    }

    const status = await this.orchestratorClient.getStatus(task.result.orchestrationId);
    if (!status) {
      return task;
    }

    return this.applyOrchestratorStatus(task.id, status);
  }

  private applyOrchestratorStatus(taskId: string, status: OrchestratorStatus): StoredTask | undefined {
    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }

    task.result = {
      ...task.result,
      orchestrationId: status.orchestrationId,
      status: this.mapRuntimeStatus(status.runtimeStatus, status.approvalStatus),
      summary: status.summary,
      approvalStatus: status.approvalStatus,
      activeJobRuns: status.activeJobRuns
    };

    return task;
  }

  private mapRuntimeStatus(runtimeStatus: OrchestratorStatus["runtimeStatus"], approvalStatus?: OrchestratorStatus["approvalStatus"]): TaskStatus {
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
      default:
        return "planning";
    }
  }
}
