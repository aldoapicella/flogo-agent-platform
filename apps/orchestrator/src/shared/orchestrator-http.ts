import {
  type ActiveJobRun,
  type RunnerJobSpec,
  type RunnerJobStatus,
  RunnerJobStatusSchema,
  type RunnerStepType,
  TaskEventPublishSchema,
  TaskStateSyncSchema,
  type TaskStatus,
  type OrchestratorStartRequest
} from "@flogo-agent/contracts";

const runnerWorkerBaseUrl = (process.env.RUNNER_WORKER_BASE_URL ?? "http://localhost:3010").replace(/\/$/, "");
const controlPlaneInternalUrl = process.env.CONTROL_PLANE_INTERNAL_URL?.replace(/\/$/, "");
const internalServiceToken = process.env.INTERNAL_SERVICE_TOKEN;

const defaultWorkflowRunnerSteps: RunnerStepType[] = ["build", "run", "generate_smoke", "run_smoke"];

export function resolveWorkflowRunnerSteps(start: OrchestratorStartRequest): RunnerStepType[] {
  const mode = start.request.inputs["mode"];
  if (mode === "catalog") {
    return ["catalog_contribs"];
  }
  if (mode === "mapping_preview") {
    return ["preview_mapping"];
  }
  return defaultWorkflowRunnerSteps;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toTaskStatus(runtimeStatus: string, approvalStatus?: string): TaskStatus {
  if (approvalStatus === "pending") {
    return "awaiting_approval";
  }

  switch (runtimeStatus) {
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
    case "terminated":
      return "failed";
    default:
      return "planning";
  }
}

export function buildRunnerJobSpec(start: OrchestratorStartRequest, stepType: RunnerStepType): RunnerJobSpec {
  const jobKind =
    stepType === "generate_smoke" || stepType === "run_smoke"
      ? "smoke_test"
      : stepType === "catalog_contribs"
        ? "catalog"
        : stepType === "preview_mapping"
          ? "mapping_preview"
          : stepType === "build" || stepType === "run"
        ? "build"
        : "eval";
  const sampleInput = start.request.inputs["sampleInput"];
  const analysisPayload =
    sampleInput && typeof sampleInput === "object" && !Array.isArray(sampleInput)
      ? (sampleInput as Record<string, unknown>)
      : undefined;
  const targetNodeId = typeof start.request.inputs["nodeId"] === "string" ? (start.request.inputs["nodeId"] as string) : undefined;
  const targetRef = typeof start.request.inputs["ref"] === "string" ? (start.request.inputs["ref"] as string) : undefined;

  return {
    taskId: start.taskId,
    jobKind,
    stepType,
    snapshotUri: `workspace://${start.request.projectId}/${start.taskId}`,
    workspaceBlobPrefix: `workspace-snapshots/${start.taskId}`,
    appPath: start.request.appPath ?? "flogo.json",
    env: {
      TARGET_ENV: start.request.constraints.targetEnv
    },
    envSecretRefs: {},
    timeoutSeconds: 900,
    artifactOutputUri: `artifact://${start.taskId}/${stepType}`,
    artifactBlobPrefix: `artifacts/${start.taskId}/${stepType}`,
    jobTemplateName: process.env.RUNNER_JOB_TEMPLATE_NAME ?? "flogo-runner",
    correlationId: start.taskId,
    analysisPayload,
    targetNodeId,
    targetRef,
    command: [],
    containerArgs: []
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

function buildInternalHeaders(includeContentType = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (includeContentType) {
    headers["content-type"] = "application/json";
  }
  if (internalServiceToken) {
    headers["x-internal-service-token"] = internalServiceToken;
  }
  return headers;
}

export async function startRunnerJob(spec: RunnerJobSpec): Promise<RunnerJobStatus> {
  return RunnerJobStatusSchema.parse(
    await fetchJson(`${runnerWorkerBaseUrl}/internal/jobs/start`, {
      method: "POST",
      headers: buildInternalHeaders(true),
      body: JSON.stringify(spec)
    })
  );
}

export async function getRunnerJobStatus(jobRunId: string): Promise<RunnerJobStatus> {
  return RunnerJobStatusSchema.parse(
    await fetchJson(`${runnerWorkerBaseUrl}/internal/jobs/${jobRunId}`, {
      headers: buildInternalHeaders()
    })
  );
}

export async function publishTaskEvent(
  taskId: string,
  type: "status" | "log" | "artifact" | "approval" | "tool",
  message: string,
  payload?: Record<string, unknown>
): Promise<void> {
  if (!controlPlaneInternalUrl) {
    return;
  }

  await fetch(`${controlPlaneInternalUrl}/internal/tasks/${taskId}/events`, {
    method: "POST",
    headers: buildInternalHeaders(true),
    body: JSON.stringify(
      TaskEventPublishSchema.parse({
        taskId,
        type,
        message,
        payload
      })
    )
  });
}

export async function syncTaskState(taskId: string, payload: Record<string, unknown>): Promise<void> {
  if (!controlPlaneInternalUrl) {
    return;
  }

  await fetch(`${controlPlaneInternalUrl}/internal/tasks/${taskId}/sync`, {
    method: "POST",
    headers: buildInternalHeaders(true),
    body: JSON.stringify(TaskStateSyncSchema.parse(payload))
  });
}

export function toActiveJobRun(job: RunnerJobStatus): ActiveJobRun {
  return {
    id: job.jobRunId,
    stepType: job.spec.stepType,
    jobTemplateName: job.spec.jobTemplateName,
    status: job.status,
    summary: job.summary,
    startedAt: job.result?.startedAt,
    finishedAt: job.result?.finishedAt
  };
}
