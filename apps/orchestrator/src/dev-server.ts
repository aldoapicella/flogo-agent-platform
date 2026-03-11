import Fastify from "fastify";
import { randomUUID } from "node:crypto";

import {
  ApprovalDecisionSchema,
  OrchestratorStartRequestSchema,
  OrchestratorStartResponseSchema,
  OrchestratorStatusSchema,
  type OrchestratorStartRequest,
  type OrchestratorStatus,
  type RunnerJobStatus
} from "@flogo-agent/contracts";

import {
  buildRunnerJobSpec,
  getRunnerJobStatus,
  publishTaskEvent,
  sleep,
  startRunnerJob,
  syncTaskState,
  toActiveJobRun,
  workflowRunnerSteps
} from "./shared/orchestrator-http.js";

type LocalOrchestrationState = OrchestratorStatus & {
  request: OrchestratorStartRequest;
  pipelineStarted: boolean;
};

const states = new Map<string, LocalOrchestrationState>();

function assertInternalAccess(headers: Record<string, unknown>): void {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) {
    return;
  }

  const candidate = headers["x-internal-service-token"];
  const value = Array.isArray(candidate) ? candidate[0] : candidate;
  if (typeof value !== "string" || value !== token) {
    throw new Error("Missing or invalid internal service token");
  }
}

function mapStatus(state: LocalOrchestrationState) {
  return OrchestratorStatusSchema.parse({
    orchestrationId: state.orchestrationId,
    taskId: state.taskId,
    runtimeStatus: state.runtimeStatus,
    approvalStatus: state.approvalStatus,
    activeJobRuns: state.activeJobRuns,
    summary: state.summary,
    lastUpdatedAt: state.lastUpdatedAt
  });
}

async function syncState(state: LocalOrchestrationState): Promise<void> {
  await syncTaskState(state.taskId, {
    orchestrationId: state.orchestrationId,
    status:
      state.approvalStatus === "pending"
        ? "awaiting_approval"
        : state.runtimeStatus === "completed"
          ? "completed"
          : state.runtimeStatus === "failed" || state.runtimeStatus === "terminated"
            ? "failed"
            : "running",
    summary: state.summary,
    approvalStatus: state.approvalStatus,
    activeJobRuns: state.activeJobRuns,
    requiredApprovals: state.approvalStatus === "pending" ? state.request.requiredApprovals : [],
    nextActions: state.request.steps.map((step) => step.summary)
  });
}

async function runPipeline(state: LocalOrchestrationState): Promise<void> {
  if (state.pipelineStarted) {
    return;
  }
  state.pipelineStarted = true;

  await publishTaskEvent(state.taskId, "status", "Workflow execution started", {
    orchestrationId: state.orchestrationId
  });

  for (const stepType of workflowRunnerSteps) {
    const startedJob = await startRunnerJob(buildRunnerJobSpec(state.request, stepType));
    state.activeJobRuns = [
      ...state.activeJobRuns.filter((item) => item.stepType !== stepType),
      toActiveJobRun(startedJob)
    ];
    state.runtimeStatus = "running";
    state.summary = `Runner step started: ${stepType}`;
    state.lastUpdatedAt = new Date().toISOString();

    await syncTaskState(state.taskId, {
      orchestrationId: state.orchestrationId,
      status: "running",
      summary: state.summary,
      approvalStatus: state.approvalStatus,
      activeJobRuns: state.activeJobRuns,
      jobRunStatus: startedJob,
      requiredApprovals: state.approvalStatus === "pending" ? state.request.requiredApprovals : [],
      nextActions: state.request.steps.map((step) => step.summary)
    });
    await publishTaskEvent(state.taskId, "tool", `Runner job started for ${stepType}`, {
      jobRunId: startedJob.jobRunId,
      stepType
    });

    let currentJob: RunnerJobStatus = startedJob;
    while (currentJob.status === "pending" || currentJob.status === "running") {
      await sleep(250);
      currentJob = await getRunnerJobStatus(currentJob.jobRunId);
      state.activeJobRuns = [
        ...state.activeJobRuns.filter((item) => item.stepType !== stepType),
        toActiveJobRun(currentJob)
      ];
      state.summary = currentJob.summary;
      state.lastUpdatedAt = new Date().toISOString();
      await syncTaskState(state.taskId, {
        orchestrationId: state.orchestrationId,
        status: "running",
        summary: state.summary,
        approvalStatus: state.approvalStatus,
        activeJobRuns: state.activeJobRuns,
        jobRunStatus: currentJob,
        requiredApprovals: state.approvalStatus === "pending" ? state.request.requiredApprovals : [],
        nextActions: state.request.steps.map((step) => step.summary)
      });
    }

    if (!currentJob.result?.ok) {
      state.runtimeStatus = "failed";
      state.summary = currentJob.summary;
      state.lastUpdatedAt = new Date().toISOString();
      await syncTaskState(state.taskId, {
        orchestrationId: state.orchestrationId,
        status: "failed",
        summary: state.summary,
        approvalStatus: state.approvalStatus,
        activeJobRuns: state.activeJobRuns,
        jobRunStatus: currentJob,
        requiredApprovals: [],
        nextActions: state.request.steps.map((step) => step.summary)
      });
      await publishTaskEvent(state.taskId, "status", currentJob.summary, {
        stepType,
        result: currentJob.result
      });
      return;
    }

    if (currentJob.result?.artifacts.length) {
      for (const artifact of currentJob.result.artifacts) {
        await syncTaskState(state.taskId, { artifact });
      }
    }
  }

  state.runtimeStatus = "completed";
  state.summary = "Workflow completed successfully";
  state.lastUpdatedAt = new Date().toISOString();
  await syncState(state);
  await publishTaskEvent(state.taskId, "status", state.summary, {
    orchestrationId: state.orchestrationId
  });
}

async function bootstrap(): Promise<void> {
  const app = Fastify({
    logger: true
  });

  app.get("/health", async () => ({
    ok: true,
    service: "orchestrator"
  }));

  app.post("/api/orchestrations/tasks", async (request, reply) => {
    assertInternalAccess(request.headers as Record<string, unknown>);
    const body = OrchestratorStartRequestSchema.parse(request.body);
    const orchestrationId = `local-${body.taskId}-${randomUUID()}`;
    const state: LocalOrchestrationState = {
      orchestrationId,
      taskId: body.taskId,
      runtimeStatus: body.requiredApprovals.length > 0 ? "running" : "running",
      approvalStatus: body.requiredApprovals.length > 0 ? "pending" : undefined,
      activeJobRuns: [],
      summary: body.requiredApprovals.length > 0 ? "Workflow waiting for approval" : "Workflow started",
      lastUpdatedAt: new Date().toISOString(),
      request: body,
      pipelineStarted: false
    };

    states.set(orchestrationId, state);
    await syncState(state);

    if (state.approvalStatus === "pending") {
      await publishTaskEvent(body.taskId, "approval", "Workflow is waiting for approval", {
        requiredApprovals: body.requiredApprovals
      });
    } else {
      void runPipeline(state);
    }

    return reply.code(202).send(
      OrchestratorStartResponseSchema.parse({
        orchestrationId,
        status: state.approvalStatus === "pending" ? "pending" : "running",
        activeJobRuns: state.activeJobRuns,
        summary: state.summary
      })
    );
  });

  app.get<{ Params: { orchestrationId: string } }>("/api/orchestrations/:orchestrationId", async (request, reply) => {
    assertInternalAccess(request.headers as Record<string, unknown>);
    const state = states.get(request.params.orchestrationId);
    if (!state) {
      return reply.code(404).send({
        message: `Unknown orchestration ${request.params.orchestrationId}`
      });
    }

    return reply.send(mapStatus(state));
  });

  app.post<{ Params: { orchestrationId: string } }>(
    "/api/orchestrations/:orchestrationId/approvals",
    async (request, reply) => {
      assertInternalAccess(request.headers as Record<string, unknown>);
      const state = states.get(request.params.orchestrationId);
      if (!state) {
        return reply.code(404).send({
          message: `Unknown orchestration ${request.params.orchestrationId}`
        });
      }

      const decision = ApprovalDecisionSchema.parse(request.body);
      state.approvalStatus = decision.status;
      state.summary =
        decision.status === "approved"
          ? "Approval recorded; workflow resumed"
          : "Approval rejected; workflow terminated";
      state.runtimeStatus = decision.status === "approved" ? "running" : "terminated";
      state.lastUpdatedAt = new Date().toISOString();

      await syncState(state);
      await publishTaskEvent(state.taskId, "approval", state.summary, {
        rationale: decision.rationale,
        status: decision.status
      });

      if (decision.status === "approved") {
        void runPipeline(state);
      }

      return reply.code(202).send(mapStatus(state));
    }
  );

  const port = Number(process.env.ORCHESTRATOR_PORT ?? 7071);
  await app.listen({
    port,
    host: "0.0.0.0"
  });
}

bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
