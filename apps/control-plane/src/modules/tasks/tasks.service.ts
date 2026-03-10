import { Inject, Injectable, NotFoundException, forwardRef } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { TaskRequestSchema, TaskSummarySchema, type TaskRequest, type TaskSummary } from "@flogo-agent/contracts";
import { AgentService } from "../agent/agent.service";
import { ApprovalsService } from "../approvals/approvals.service";
import { ArtifactsService } from "../artifacts/artifacts.service";
import { EventStreamService } from "../events/event-stream.service";
import { FlogoAppsService } from "../flogo-apps/flogo-apps.service";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import { ToolsService } from "../tools/tools.service";

@Injectable()
export class TasksService {
  private readonly tasks = new Map<string, TaskSummary>();
  private readonly requests = new Map<string, TaskRequest>();

  constructor(
    private readonly agentService: AgentService,
    @Inject(forwardRef(() => ApprovalsService))
    private readonly approvalsService: ApprovalsService,
    private readonly artifactsService: ArtifactsService,
    private readonly events: EventStreamService,
    private readonly flogoAppsService: FlogoAppsService,
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly toolsService: ToolsService
  ) {}

  async create(payload: unknown): Promise<TaskSummary> {
    const request = TaskRequestSchema.parse(payload);
    const plan = await this.agentService.plan(request);
    const now = new Date().toISOString();
    const id = randomUUID();
    const appId = await this.flogoAppsService.register(
      request.projectId,
      request.appPath,
      request.appId ?? path.basename(request.appPath, path.extname(request.appPath))
    );
    const validationReport = request.type === "create" ? undefined : await this.toolsService.validateApp(request.appPath);
    const approvalStatus = plan.approvals.length > 0 ? "pending" : undefined;

    const summary = TaskSummarySchema.parse({
      id,
      type: request.type,
      state: approvalStatus === "pending" ? "awaiting_approval" : "queued",
      projectId: request.projectId,
      appId,
      appPath: request.appPath,
      prompt: request.prompt,
      planSummary: plan.summary,
      approvalStatus,
      createdAt: now,
      updatedAt: now,
      validationReport,
      artifacts: []
    });

    this.tasks.set(id, summary);
    this.requests.set(id, { ...request, appId });
    this.approvalsService.initialize(id, plan.approvals);

    const planArtifact = this.toolsService.publishArtifact("report", "task-plan", `memory://tasks/${id}/plan`, {
      summary: plan.summary,
      steps: plan.steps
    });
    this.artifactsService.add(id, planArtifact);

    if (validationReport) {
      const validationArtifact = this.toolsService.publishArtifact(
        "report",
        "validation-report",
        `memory://tasks/${id}/validation`,
        validationReport
      );
      this.artifactsService.add(id, validationArtifact);
      summary.artifacts = this.artifactsService.list(id);
    }

    this.events.publish(id, "task.created", {
      task: summary,
      plan: plan.steps
    });

    await this.persistTask(summary);

    if (!approvalStatus) {
      await this.enqueueRunnerWork(id);
    }

    return this.get(id);
  }

  get(taskId: string): TaskSummary {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new NotFoundException(`Task ${taskId} was not found.`);
    }
    return { ...task, artifacts: this.artifactsService.list(taskId) };
  }

  listArtifacts(taskId: string) {
    this.get(taskId);
    return this.artifactsService.list(taskId);
  }

  getHistory(taskId: string) {
    this.get(taskId);
    return this.events.getHistory(taskId);
  }

  async applyApproval(taskId: string, status: "approved" | "rejected") {
    const task = this.get(taskId);
    task.approvalStatus = status;
    task.updatedAt = new Date().toISOString();

    if (status === "rejected") {
      task.state = "cancelled";
      this.events.publish(taskId, "task.failed", {
        taskId,
        reason: "Approval rejected."
      });
    } else {
      task.state = "queued";
      this.events.publish(taskId, "task.updated", {
        taskId,
        state: task.state
      });
      await this.enqueueRunnerWork(taskId);
    }

    this.tasks.set(taskId, task);
    await this.persistTask(task);
  }

  private async enqueueRunnerWork(taskId: string) {
    const task = this.get(taskId);
    const request = this.requests.get(taskId);
    if (!request) {
      throw new NotFoundException(`Request for task ${taskId} is unavailable.`);
    }

    task.state = "planning";
    task.updatedAt = new Date().toISOString();
    this.tasks.set(taskId, task);
    this.events.publish(taskId, "task.updated", {
      taskId,
      state: task.state
    });

    const buildSpec = this.toolsService.prepareBuildJob(taskId, request);
    const smokeSpec = this.toolsService.prepareSmokeJob(taskId, request);

    await this.queueService.enqueueRunnerJob(buildSpec);
    await this.queueService.enqueueRunnerJob(smokeSpec);

    const smoke = this.toolsService.generateSmoke(request);
    const smokeArtifact = this.toolsService.publishArtifact("report", "smoke-spec", `memory://tasks/${taskId}/smoke`, smoke);
    this.artifactsService.add(taskId, smokeArtifact);

    task.state = "running";
    task.updatedAt = new Date().toISOString();
    task.artifacts = this.artifactsService.list(taskId);
    this.tasks.set(taskId, task);

    this.events.publish(taskId, "task.log", {
      taskId,
      message: "Queued build and smoke jobs for runner worker.",
      jobs: [buildSpec.jobId, smokeSpec.jobId]
    });

    await this.persistTask(task);
  }

  private async persistTask(task: TaskSummary) {
    try {
      await this.prisma.task.upsert({
        where: { id: task.id },
        create: {
          id: task.id,
          projectId: task.projectId,
          type: task.type,
          state: task.state,
          prompt: task.prompt,
          planSummary: task.planSummary,
          validationJson: task.validationReport as never
        },
        update: {
          state: task.state,
          planSummary: task.planSummary,
          validationJson: task.validationReport as never
        }
      });
    } catch {
      // Database availability is optional during bootstrap. In-memory state remains authoritative.
    }
  }
}
