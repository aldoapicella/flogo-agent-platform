import { Injectable } from "@nestjs/common";

import {
  ActiveJobRunSchema,
  ApprovalTypeSchema,
  type ApprovalDecision,
  type ApprovalType,
  type ArtifactRef,
  ArtifactRefSchema,
  type RunnerJobStatus,
  RunnerJobStatusSchema,
  type TaskEvent,
  TaskEventSchema,
  type TaskRequest,
  TaskRequestSchema,
  type TaskResult,
  TaskResultSchema,
  type TaskRuns,
  TaskRunsSchema,
  type TaskStep,
  type TaskSummary,
  TaskSummarySchema,
  type ValidationReport,
  ValidationReportSchema
} from "@flogo-agent/contracts";

import { PrismaService } from "../prisma/prisma.service.js";

const defaultOrganizationId = process.env.DEFAULT_ORGANIZATION_ID ?? "local-organization";
const defaultOrganizationName = process.env.DEFAULT_ORGANIZATION_NAME ?? "Local Organization";
const appAnalysisRequestedBy = "system:app-analysis";

type DbArtifact = {
  id: string;
  kind: string;
  name: string;
  uri: string;
  metadata?: unknown;
};

type DbTaskEvent = {
  id: string;
  taskId: string;
  type: TaskEvent["type"];
  message: string;
  payload?: unknown;
  createdAt: Date;
};

type DbTaskRecord = {
  id: string;
  projectId: string;
  type: TaskRequest["type"];
  status: TaskResult["status"];
  prompt: string;
  summary?: string | null;
  appPath?: string | null;
  inputPayload: unknown;
  planSummary?: string | null;
  approvalStatus?: TaskResult["approvalStatus"];
  orchestrationId?: string | null;
  activeJobRuns?: unknown;
  validationReport?: unknown;
  requiredApprovals?: unknown;
  nextActions?: unknown;
  rootCause?: string | null;
  createdAt: Date;
  updatedAt: Date;
  artifacts: DbArtifact[];
};

type DbRunRecord = {
  id: string;
  stepType?: string | null;
  jobRunId?: string | null;
  jobTemplateName?: string | null;
  status: string;
  summary?: string | null;
  summaryText?: string | null;
  exitCode?: number | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  logUri?: string | null;
  reportUri?: string | null;
  binaryUri?: string | null;
  azureJobExecutionName?: string | null;
  azureJobResourceId?: string | null;
  type?: string | null;
};

export interface StoredTask {
  id: string;
  request: TaskRequest;
  result: TaskResult;
  approvals: ApprovalType[];
  artifacts: ArtifactRef[];
}

@Injectable()
export class TaskStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async createTaskRecord(args: {
    id: string;
    request: TaskRequest;
    result: TaskResult;
    planSummary: string;
    steps: TaskStep[];
    requiredApprovals: ApprovalType[];
  }): Promise<StoredTask> {
    const projectId = await this.ensureProject(args.request);
    const prisma = this.prisma as any;
    const task = (await prisma.task.create({
      data: {
        id: args.id,
        projectId,
        type: args.request.type,
        status: args.result.status,
        requestedBy: args.request.requestedBy,
        prompt: args.request.summary,
        summary: args.result.summary,
        appPath: args.request.appPath,
        inputPayload: args.request,
        planSummary: args.planSummary,
        approvalStatus: args.result.approvalStatus ?? undefined,
        requiredApprovals: args.requiredApprovals,
        nextActions: args.result.nextActions,
        activeJobRuns: args.result.activeJobRuns,
        validationReport: args.result.validationReport ?? undefined,
        steps: {
          create: args.steps.map((step) => ({
            id: step.id,
            stepOrder: step.order,
            type: step.type,
            status: this.mapStepStatus(step.status),
            summary: step.summary,
            startedAt: step.startedAt ? new Date(step.startedAt) : undefined,
            finishedAt: step.finishedAt ? new Date(step.finishedAt) : undefined
          }))
        },
        approvals: {
          create: args.requiredApprovals.map((type) => ({
            type,
            status: "pending",
            rationale: "Approval required by policy",
            requestedFrom: args.request.requestedBy
          }))
        }
      },
      include: {
        approvals: true,
        artifacts: true
      }
    })) as DbTaskRecord;

    return this.toStoredTask(task);
  }

  async listTasks(): Promise<TaskSummary[]> {
    const prisma = this.prisma as any;
    const tasks = (await prisma.task.findMany({
      where: {
        requestedBy: {
          not: appAnalysisRequestedBy
        }
      },
      include: {
        approvals: true,
        artifacts: true
      },
      orderBy: {
        updatedAt: "desc"
      }
    })) as DbTaskRecord[];

    return tasks.map((task) => this.toTaskSummary(task));
  }

  async getTask(taskId: string): Promise<StoredTask | undefined> {
    const prisma = this.prisma as any;
    const task = (await prisma.task.findUnique({
      where: {
        id: taskId
      },
      include: {
        approvals: true,
        artifacts: true
      }
    })) as DbTaskRecord | null;

    return task ? this.toStoredTask(task) : undefined;
  }

  async listArtifacts(taskId: string): Promise<ArtifactRef[]> {
    const prisma = this.prisma as any;
    const artifacts = (await prisma.artifact.findMany({
      where: {
        taskId
      },
      orderBy: {
        createdAt: "asc"
      }
    })) as DbArtifact[];

    return artifacts.map((artifact) => this.toArtifactRef(artifact));
  }

  async listTaskEvents(taskId: string): Promise<TaskEvent[]> {
    const prisma = this.prisma as any;
    const events = (await prisma.taskEvent.findMany({
      where: {
        taskId
      },
      orderBy: {
        createdAt: "asc"
      }
    })) as DbTaskEvent[];

    return events.map((event) => this.toTaskEvent(event));
  }

  async listTaskRuns(taskId: string): Promise<TaskRuns> {
    const prisma = this.prisma as any;
    const [buildRuns, testRuns] = (await Promise.all([
      prisma.buildRun.findMany({
        where: {
          taskId
        },
        orderBy: {
          startedAt: "desc"
        }
      }),
      prisma.testRun.findMany({
        where: {
          taskId
        },
        orderBy: {
          startedAt: "desc"
        }
      })
    ])) as [DbRunRecord[], DbRunRecord[]];

    return TaskRunsSchema.parse({
      taskId,
      buildRuns: buildRuns.map((run) => this.toBuildTaskRun(run)),
      testRuns: testRuns.map((run) => this.toTestTaskRun(run))
    });
  }

  async appendEvent(taskId: string, type: TaskEvent["type"], message: string, payload?: Record<string, unknown>): Promise<TaskEvent> {
    const prisma = this.prisma as any;
    const event = (await prisma.taskEvent.create({
      data: {
        taskId,
        type,
        message,
        payload: payload ?? null
      }
    })) as DbTaskEvent;

    return this.toTaskEvent(event);
  }

  async applyApprovalDecision(taskId: string, decision: ApprovalDecision): Promise<StoredTask | undefined> {
    const prisma = this.prisma as any;
    const existing = await prisma.approval.findFirst({
      where: {
        taskId,
        type: decision.type
      }
    });

    if (existing) {
      await prisma.approval.update({
        where: {
          id: existing.id
        },
        data: {
          status: decision.status,
          rationale: decision.rationale ?? existing.rationale,
          respondedAt: new Date()
        }
      });
    } else {
      await prisma.approval.create({
        data: {
          taskId,
          type: decision.type,
          status: decision.status,
          rationale: decision.rationale ?? "Approval decision recorded",
          requestedFrom: "operator",
          respondedAt: new Date()
        }
      });
    }

    await prisma.task.update({
      where: {
        id: taskId
      },
      data: {
        approvalStatus: decision.status,
        requiredApprovals: []
      }
    });

    return this.getTask(taskId);
  }

  async updateTaskStatus(taskId: string, status: TaskResult["status"], summary: string): Promise<StoredTask | undefined> {
    const prisma = this.prisma as any;
    await prisma.task.update({
      where: {
        id: taskId
      },
      data: {
        status,
        summary
      }
    });

    return this.getTask(taskId);
  }

  async syncTaskState(taskId: string, payload: {
    orchestrationId?: string;
    status?: TaskResult["status"];
    summary?: string;
    approvalStatus?: TaskResult["approvalStatus"];
    activeJobRuns?: TaskResult["activeJobRuns"];
    artifact?: ArtifactRef;
    validationReport?: ValidationReport;
    requiredApprovals?: ApprovalType[];
    nextActions?: string[];
    rootCause?: string;
    jobRunStatus?: RunnerJobStatus;
  }): Promise<StoredTask | undefined> {
    const prisma = this.prisma as any;
    const task = (await prisma.task.findUnique({
      where: {
        id: taskId
      }
    })) as Record<string, unknown> | null;
    if (!task) {
      return undefined;
    }

    if (payload.jobRunStatus) {
      await this.upsertJobRun(taskId, payload.jobRunStatus);
    }

    if (payload.artifact) {
      await this.upsertArtifact(taskId, payload.artifact);
    }

    await prisma.task.update({
      where: {
        id: taskId
      },
      data: {
        orchestrationId: payload.orchestrationId ?? task["orchestrationId"],
        status: payload.status ?? task["status"],
        summary: payload.summary ?? task["summary"],
        approvalStatus: payload.approvalStatus ?? task["approvalStatus"],
        activeJobRuns: payload.activeJobRuns ?? task["activeJobRuns"] ?? undefined,
        validationReport: payload.validationReport ?? task["validationReport"] ?? undefined,
        requiredApprovals: payload.requiredApprovals ?? task["requiredApprovals"] ?? undefined,
        nextActions: payload.nextActions ?? task["nextActions"] ?? undefined,
        rootCause: payload.rootCause ?? task["rootCause"]
      }
    });

    return this.getTask(taskId);
  }

  private async upsertArtifact(taskId: string, artifact: ArtifactRef): Promise<void> {
    const prisma = this.prisma as any;
    await prisma.artifact.upsert({
      where: {
        id: artifact.id
      },
      update: {
        kind: artifact.type,
        name: artifact.name,
        uri: artifact.uri,
        metadata: artifact.metadata ?? undefined
      },
      create: {
        id: artifact.id,
        taskId,
        kind: artifact.type,
        name: artifact.name,
        uri: artifact.uri,
        metadata: artifact.metadata ?? undefined
      }
    });
  }

  private async upsertJobRun(taskId: string, statusInput: RunnerJobStatus): Promise<void> {
    const prisma = this.prisma as any;
    const status = RunnerJobStatusSchema.parse(statusInput);
    const artifactRefs = status.result?.artifacts ?? [];
    const logUri =
      status.result?.logArtifact?.uri ??
      artifactRefs.find((artifact) => artifact.type === "build_log" || artifact.type === "runtime_log")?.uri;
    const binaryUri = artifactRefs.find((artifact) => artifact.type === "binary")?.uri;
    const reportUri = artifactRefs.find((artifact) => artifact.type === "test_report")?.uri;
    const runnerData = {
      jobId: status.result?.jobId ?? `${taskId}-${status.spec.stepType}`,
      jobRunId: status.jobRunId,
      jobTemplateName: status.spec.jobTemplateName,
      stepType: status.spec.stepType,
      status: status.status,
      summary: status.summary,
      commandLine: status.spec.command.join(" "),
      logUri,
      binaryUri,
      reportUri,
      exitCode: status.result?.exitCode,
      azureJobExecutionName: status.result?.azureJobExecutionName ?? status.azureJobExecutionName,
      azureJobResourceId: status.result?.azureJobResourceId ?? status.azureJobResourceId,
      result: status.result ?? undefined,
      startedAt: status.result?.startedAt ? new Date(status.result.startedAt) : undefined,
      finishedAt: status.result?.finishedAt ? new Date(status.result.finishedAt) : undefined
    };

    if (status.spec.stepType === "generate_smoke" || status.spec.stepType === "run_smoke") {
      const existing = await prisma.testRun.findFirst({
        where: {
          taskId,
          OR: [{ jobRunId: status.jobRunId }, { stepType: status.spec.stepType }]
        }
      });

      if (existing) {
        await prisma.testRun.update({
          where: {
            id: existing.id
          },
          data: {
            jobId: runnerData.jobId,
            jobRunId: runnerData.jobRunId,
            jobTemplateName: runnerData.jobTemplateName,
            stepType: runnerData.stepType,
            type: "smoke",
            status: runnerData.status,
            summaryText: runnerData.summary,
            reportUri: runnerData.reportUri,
            logUri: runnerData.logUri,
            azureJobExecutionName: runnerData.azureJobExecutionName,
            azureJobResourceId: runnerData.azureJobResourceId,
            summary: status.result ?? undefined,
            exitCode: runnerData.exitCode,
            startedAt: runnerData.startedAt,
            finishedAt: runnerData.finishedAt
          }
        });
      } else {
        await prisma.testRun.create({
          data: {
            taskId,
            jobId: runnerData.jobId,
            jobRunId: runnerData.jobRunId,
            jobTemplateName: runnerData.jobTemplateName,
            stepType: runnerData.stepType,
            type: "smoke",
            status: runnerData.status,
            summaryText: runnerData.summary,
            reportUri: runnerData.reportUri,
            logUri: runnerData.logUri,
            azureJobExecutionName: runnerData.azureJobExecutionName,
            azureJobResourceId: runnerData.azureJobResourceId,
            summary: status.result ?? undefined,
            exitCode: runnerData.exitCode,
            startedAt: runnerData.startedAt,
            finishedAt: runnerData.finishedAt
          }
        });
      }

      return;
    }

    const existing = await prisma.buildRun.findFirst({
      where: {
        taskId,
        OR: [{ jobRunId: status.jobRunId }, { stepType: status.spec.stepType }]
      }
    });

    if (existing) {
      await prisma.buildRun.update({
        where: {
          id: existing.id
        },
        data: runnerData
      });
    } else {
      await prisma.buildRun.create({
        data: {
          taskId,
          ...runnerData
        }
      });
    }
  }

  private async ensureProject(request: TaskRequest): Promise<string> {
    const prisma = this.prisma as any;
    await prisma.organization.upsert({
      where: {
        id: defaultOrganizationId
      },
      update: {
        name: defaultOrganizationName
      },
      create: {
        id: defaultOrganizationId,
        name: defaultOrganizationName
      }
    });

    const project = await prisma.project.upsert({
      where: {
        id: request.projectId
      },
      update: {
        name: request.projectId,
        repoUrl: request.repo?.url ?? request.repo?.rootPath ?? "local://workspace",
        defaultBranch: request.repo?.branch ?? "main"
      },
      create: {
        id: request.projectId,
        organizationId: defaultOrganizationId,
        name: request.projectId,
        repoUrl: request.repo?.url ?? request.repo?.rootPath ?? "local://workspace",
        defaultBranch: request.repo?.branch ?? "main"
      }
    });

    return project.id as string;
  }

  private toStoredTask(task: DbTaskRecord): StoredTask {
    const request = TaskRequestSchema.parse(task.inputPayload);
    const artifacts = task.artifacts.map((artifact) => this.toArtifactRef(artifact));
    const approvals = this.parseApprovalTypes(task.requiredApprovals);

    return {
      id: task.id,
      request,
      approvals,
      artifacts,
      result: TaskResultSchema.parse({
        taskId: task.id,
        type: task.type,
        status: task.status,
        summary: task.summary ?? task.prompt,
        orchestrationId: task.orchestrationId ?? undefined,
        approvalStatus: task.approvalStatus ?? undefined,
        activeJobRuns: this.parseActiveJobRuns(task.activeJobRuns),
        rootCause: task.rootCause ?? undefined,
        validationReport: this.parseValidationReport(task.validationReport),
        artifacts,
        requiredApprovals: approvals,
        nextActions: this.parseStringArray(task.nextActions)
      })
    };
  }

  private toTaskSummary(task: DbTaskRecord): TaskSummary {
    const request = TaskRequestSchema.parse(task.inputPayload);
    return TaskSummarySchema.parse({
      id: task.id,
      type: task.type,
      state: task.status,
      projectId: task.projectId,
      appId: request.appId,
      appPath: task.appPath ?? request.appPath,
      prompt: task.prompt,
      planSummary: task.planSummary ?? undefined,
      approvalStatus: task.approvalStatus ?? undefined,
      orchestrationId: task.orchestrationId ?? undefined,
      activeJobRuns: this.parseActiveJobRuns(task.activeJobRuns),
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
      validationReport: this.parseValidationReport(task.validationReport),
      artifacts: task.artifacts.map((artifact) => this.toArtifactRef(artifact)),
      requiredApprovals: this.parseApprovalTypes(task.requiredApprovals),
      nextActions: this.parseStringArray(task.nextActions)
    });
  }

  private toArtifactRef(artifact: DbArtifact): ArtifactRef {
    return ArtifactRefSchema.parse({
      id: artifact.id,
      type: artifact.kind,
      name: artifact.name,
      uri: artifact.uri,
      metadata: artifact.metadata && typeof artifact.metadata === "object" ? (artifact.metadata as Record<string, unknown>) : undefined
    });
  }

  private toTaskEvent(event: DbTaskEvent): TaskEvent {
    return TaskEventSchema.parse({
      id: event.id,
      taskId: event.taskId,
      type: event.type,
      message: event.message,
      timestamp: event.createdAt.toISOString(),
      payload: event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : undefined
    });
  }

  private toBuildTaskRun(run: DbRunRecord) {
    return {
      id: run.id,
      category: "build",
      stepType: run.stepType ?? "build",
      jobRunId: run.jobRunId ?? undefined,
      jobTemplateName: run.jobTemplateName ?? undefined,
      status: run.status,
      summary: run.summary ?? `Build step ${run.stepType ?? "build"}`,
      exitCode: run.exitCode ?? undefined,
      startedAt: run.startedAt?.toISOString(),
      finishedAt: run.finishedAt?.toISOString(),
      logUri: run.logUri ?? undefined,
      reportUri: run.reportUri ?? undefined,
      binaryUri: run.binaryUri ?? undefined,
      azureJobExecutionName: run.azureJobExecutionName ?? undefined,
      azureJobResourceId: run.azureJobResourceId ?? undefined,
      artifacts: []
    };
  }

  private toTestTaskRun(run: DbRunRecord) {
    return {
      id: run.id,
      category: "test",
      stepType: run.stepType ?? "run_smoke",
      jobRunId: run.jobRunId ?? undefined,
      jobTemplateName: run.jobTemplateName ?? undefined,
      status: run.status,
      summary: run.summaryText ?? run.summary ?? `Test step ${run.type ?? "smoke"}`,
      exitCode: run.exitCode ?? undefined,
      startedAt: run.startedAt?.toISOString(),
      finishedAt: run.finishedAt?.toISOString(),
      logUri: run.logUri ?? undefined,
      reportUri: run.reportUri ?? undefined,
      azureJobExecutionName: run.azureJobExecutionName ?? undefined,
      azureJobResourceId: run.azureJobResourceId ?? undefined,
      artifacts: []
    };
  }

  private parseApprovalTypes(value: unknown): ApprovalType[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => ApprovalTypeSchema.safeParse(item))
      .filter((result) => result.success)
      .map((result) => result.data);
  }

  private parseActiveJobRuns(value: unknown): TaskResult["activeJobRuns"] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => ActiveJobRunSchema.safeParse(item))
      .filter((result) => result.success)
      .map((result) => result.data);
  }

  private parseStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }

  private parseValidationReport(value: unknown): ValidationReport | undefined {
    const parsed = ValidationReportSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  }

  private mapStepStatus(status: TaskStep["status"]): "pending" | "running" | "completed" | "failed" {
    switch (status) {
      case "completed":
        return "completed";
      case "failed":
      case "cancelled":
        return "failed";
      case "running":
        return "running";
      default:
        return "pending";
    }
  }
}
