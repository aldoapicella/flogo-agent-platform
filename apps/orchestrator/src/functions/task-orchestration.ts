import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from "@azure/functions";
import * as df from "durable-functions";

import {
  type ActiveJobRun,
  ApprovalDecisionSchema,
  type OrchestratorStartRequest,
  OrchestratorStartRequestSchema,
  OrchestratorStartResponseSchema,
  OrchestratorStatusSchema,
  type RunnerJobStatus,
  TaskStateSyncSchema,
  type TaskStatus
} from "@flogo-agent/contracts";

import {
  buildRunnerJobSpec,
  getRunnerJobStatus,
  publishTaskEvent,
  startRunnerJob,
  syncTaskState,
  toActiveJobRun,
  toTaskStatus,
  workflowRunnerSteps
} from "../shared/orchestrator-http.js";

const durableClientInput = df.input.durableClient();

type SyncTaskStateActivityInput = {
  taskId: string;
  payload: Record<string, unknown>;
};

type PublishTaskEventActivityInput = {
  taskId: string;
  type: "status" | "log" | "artifact" | "approval" | "tool";
  message: string;
  payload?: Record<string, unknown>;
};

type StartRunnerJobActivityInput = {
  start: OrchestratorStartRequest;
  stepType: (typeof workflowRunnerSteps)[number];
};

type GetRunnerJobStatusActivityInput = {
  jobRunId: string;
};

function buildSyncPayload(
  start: OrchestratorStartRequest,
  orchestrationId: string,
  runtimeStatus: string,
  summary: string,
  activeJobRuns: ActiveJobRun[],
  approvalStatus?: "pending" | "approved" | "rejected"
): Record<string, unknown> {
  const status = toTaskStatus(runtimeStatus, approvalStatus) satisfies TaskStatus;

  return TaskStateSyncSchema.parse({
    orchestrationId,
    status,
    summary,
    approvalStatus,
    activeJobRuns,
    requiredApprovals: approvalStatus === "pending" ? start.requiredApprovals : [],
    nextActions: start.steps.map((step) => step.summary)
  });
}

df.app.orchestration("taskWorkflow", function* (context: any) {
  const start = OrchestratorStartRequestSchema.parse(context.df.getInput());
  const orchestrationId = context.df.instanceId as string;
  let activeJobRuns: ActiveJobRun[] = [];
  let approvalStatus: "pending" | "approved" | "rejected" | undefined =
    start.requiredApprovals.length > 0 ? "pending" : undefined;

  yield context.df.callActivity("syncTaskStateActivity", {
    taskId: start.taskId,
    payload: buildSyncPayload(
      start,
      orchestrationId,
      approvalStatus === "pending" ? "running" : "running",
      approvalStatus === "pending" ? "Workflow paused for approval" : "Workflow started",
      activeJobRuns,
      approvalStatus
    )
  } satisfies SyncTaskStateActivityInput);

  if (approvalStatus === "pending") {
    yield context.df.callActivity("publishTaskEventActivity", {
      taskId: start.taskId,
      type: "approval",
      message: "Workflow is waiting for approval",
      payload: {
        requiredApprovals: start.requiredApprovals
      }
    } satisfies PublishTaskEventActivityInput);

    const approval = ApprovalDecisionSchema.parse(yield context.df.waitForExternalEvent("approval-decision"));
    approvalStatus = approval.status;

    if (approval.status !== "approved") {
      const rejectedPayload = buildSyncPayload(
        start,
        orchestrationId,
        "terminated",
        "Workflow stopped because approval was not granted",
        activeJobRuns,
        approval.status
      );
      yield context.df.callActivity("syncTaskStateActivity", {
        taskId: start.taskId,
        payload: rejectedPayload
      } satisfies SyncTaskStateActivityInput);
      return OrchestratorStatusSchema.parse({
        orchestrationId,
        taskId: start.taskId,
        runtimeStatus: "terminated",
        approvalStatus: approval.status,
        activeJobRuns,
        summary: "Workflow stopped because approval was not granted",
        lastUpdatedAt: new Date().toISOString()
      });
    }
  }

  for (const stepType of workflowRunnerSteps) {
    const job = (yield context.df.callActivity("startRunnerJobActivity", {
      start,
      stepType
    } satisfies StartRunnerJobActivityInput)) as RunnerJobStatus;

    activeJobRuns = [...activeJobRuns.filter((item) => item.stepType !== stepType), toActiveJobRun(job)];

    yield context.df.callActivity("syncTaskStateActivity", {
      taskId: start.taskId,
      payload: buildSyncPayload(start, orchestrationId, "running", `Runner step started: ${stepType}`, activeJobRuns, "approved")
    } satisfies SyncTaskStateActivityInput);

    let current = job;
    while (current.status === "pending" || current.status === "running") {
      const wakeAt = new Date(context.df.currentUtcDateTime.getTime() + 5000);
      yield context.df.createTimer(wakeAt);
      current = (yield context.df.callActivity("getRunnerJobStatusActivity", {
        jobRunId: current.jobRunId
      } satisfies GetRunnerJobStatusActivityInput)) as RunnerJobStatus;

      activeJobRuns = [...activeJobRuns.filter((item) => item.stepType !== stepType), toActiveJobRun(current)];
      context.df.setCustomStatus({
        taskId: start.taskId,
        activeJobRuns,
        summary: current.summary
      });
    }

    if (!current.result?.ok) {
      yield context.df.callActivity("syncTaskStateActivity", {
        taskId: start.taskId,
        payload: buildSyncPayload(start, orchestrationId, "failed", current.summary, activeJobRuns, "approved")
      } satisfies SyncTaskStateActivityInput);

      return OrchestratorStatusSchema.parse({
        orchestrationId,
        taskId: start.taskId,
        runtimeStatus: "failed",
        approvalStatus: "approved",
        activeJobRuns,
        summary: current.summary,
        lastUpdatedAt: new Date().toISOString()
      });
    }

    if (current.result?.artifacts.length) {
      for (const artifact of current.result.artifacts) {
        yield context.df.callActivity("syncTaskStateActivity", {
          taskId: start.taskId,
          payload: {
            artifact
          }
        } satisfies SyncTaskStateActivityInput);
      }
    }
  }

  const completedPayload = buildSyncPayload(
    start,
    orchestrationId,
    "completed",
    "Workflow completed successfully",
    activeJobRuns,
    "approved"
  );
  yield context.df.callActivity("syncTaskStateActivity", {
    taskId: start.taskId,
    payload: completedPayload
  } satisfies SyncTaskStateActivityInput);

  return OrchestratorStatusSchema.parse({
    orchestrationId,
    taskId: start.taskId,
    runtimeStatus: "completed",
    approvalStatus: "approved",
    activeJobRuns,
    summary: "Workflow completed successfully",
    lastUpdatedAt: new Date().toISOString()
  });
});

df.app.activity("startRunnerJobActivity", {
  handler: async (input: StartRunnerJobActivityInput) => startRunnerJob(buildRunnerJobSpec(input.start, input.stepType))
});

df.app.activity("getRunnerJobStatusActivity", {
  handler: async (input: GetRunnerJobStatusActivityInput) => getRunnerJobStatus(input.jobRunId)
});

df.app.activity("syncTaskStateActivity", {
  handler: async (input: SyncTaskStateActivityInput) => syncTaskState(input.taskId, input.payload)
});

df.app.activity("publishTaskEventActivity", {
  handler: async (input: PublishTaskEventActivityInput) =>
    publishTaskEvent(input.taskId, input.type, input.message, input.payload)
});

app.http("startTaskOrchestration", {
  route: "orchestrations/tasks",
  methods: ["POST"],
  authLevel: "function",
  extraInputs: [durableClientInput],
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const client = df.getClient(context as any);
    const body = OrchestratorStartRequestSchema.parse(await request.json());
    const orchestrationId = await (client as any).scheduleNew("taskWorkflow", {
      instanceId: body.taskId,
      input: body
    });

    return {
      status: 202,
      jsonBody: OrchestratorStartResponseSchema.parse({
        orchestrationId,
        status: body.requiredApprovals.length > 0 ? "pending" : "running",
        activeJobRuns: [],
        summary: body.requiredApprovals.length > 0 ? "Workflow waiting for approval" : "Workflow started"
      })
    };
  }
});

app.http("getTaskOrchestrationStatus", {
  route: "orchestrations/{orchestrationId}",
  methods: ["GET"],
  authLevel: "function",
  extraInputs: [durableClientInput],
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const client = df.getClient(context as any);
    const orchestrationId = request.params.orchestrationId;
    const status = await (client as any).getStatus(orchestrationId);

    return {
      status: status ? 200 : 404,
      jsonBody: status
        ? OrchestratorStatusSchema.parse({
            orchestrationId,
            taskId: status.instanceId,
            runtimeStatus: status.runtimeStatus?.toLowerCase() ?? "unknown",
            approvalStatus: status.customStatus?.approvalStatus,
            activeJobRuns: status.customStatus?.activeJobRuns ?? [],
            summary: status.customStatus?.summary ?? status.runtimeStatus ?? "Unknown",
            lastUpdatedAt: status.lastUpdatedAt
          })
        : {
            message: `Unknown orchestration ${orchestrationId}`
          }
    };
  }
});

app.http("signalTaskApproval", {
  route: "orchestrations/{orchestrationId}/approvals",
  methods: ["POST"],
  authLevel: "function",
  extraInputs: [durableClientInput],
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const client = df.getClient(context as any);
    const orchestrationId = request.params.orchestrationId;
    const decision = ApprovalDecisionSchema.parse(await request.json());

    await (client as any).raiseEvent(orchestrationId, "approval-decision", decision);

    return {
      status: 202,
      jsonBody: {
        orchestrationId,
        accepted: true
      }
    };
  }
});
