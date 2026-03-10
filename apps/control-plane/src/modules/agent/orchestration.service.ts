import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

import { OrchestratorAgent, StaticModelClient } from "@flogo-agent/agent";
import {
  type ApprovalType,
  type ArtifactRef,
  type RunnerJobSpec,
  TaskRequestSchema,
  TaskResultSchema,
  type TaskRequest,
  type TaskResult,
  type TaskStatus
} from "@flogo-agent/contracts";

import { TaskEventsService } from "../events/task-events.service.js";
import { RunnerQueueService } from "../queue/runner-queue.service.js";
import { ToolsetService } from "../tools/toolset.service.js";

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
    private readonly queueService: RunnerQueueService,
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
    const result = TaskResultSchema.parse({
      taskId: id,
      type: request.type,
      status: plan.requiredApprovals.length > 0 ? "awaiting_approval" : "running",
      summary: `Task queued: ${request.summary}`,
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

    if (plan.requiredApprovals.length === 0) {
      await this.enqueueDefaultRunnerJob(storedTask);
    }

    return storedTask;
  }

  listTaskEvents(taskId: string) {
    return this.eventsService.list(taskId);
  }

  streamTask(taskId: string) {
    return this.eventsService.stream(taskId);
  }

  async approveTask(taskId: string, rationale?: string): Promise<StoredTask | undefined> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return undefined;
    }

    task.result = {
      ...task.result,
      status: "running",
      summary: "Approval recorded; task resumed",
      requiredApprovals: []
    };
    task.approvals = [];
    this.eventsService.publish(taskId, "approval", "Approval recorded", { rationale });
    await this.enqueueDefaultRunnerJob(task);
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

  private async enqueueDefaultRunnerJob(task: StoredTask): Promise<void> {
    const spec: RunnerJobSpec = {
      taskId: task.id,
      stepType: "build",
      snapshotUri: `workspace://${task.request.projectId}/${task.id}`,
      appPath: task.request.appPath ?? "flogo.json",
      env: {},
      timeoutSeconds: 900,
      artifactOutputUri: `artifact://${task.id}`,
      command: ["echo", `build ${task.request.appPath ?? "flogo.json"}`]
    };

    const queued = await this.queueService.enqueue(spec);
    this.eventsService.publish(task.id, "log", `Runner job queued in ${queued.mode} mode`, { spec: queued.spec });
  }
}

