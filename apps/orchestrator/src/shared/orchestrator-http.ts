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
  if (mode === "inventory") {
    return ["inventory_contribs"];
  }
  if (mode === "catalog") {
    return ["catalog_contribs"];
  }
  if (mode === "contrib_evidence") {
    return ["inspect_contrib_evidence"];
  }
  if (mode === "mapping_preview") {
    return ["preview_mapping"];
  }
  if (mode === "mapping_test") {
    return ["test_mapping"];
  }
  if (mode === "property_plan") {
    return ["plan_properties"];
  }
  if (mode === "governance") {
    return ["validate_governance"];
  }
  if (mode === "composition_compare") {
    return ["compare_composition"];
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
  let jobKind: RunnerJobSpec["jobKind"] = "eval";
  switch (stepType) {
    case "generate_smoke":
    case "run_smoke":
      jobKind = "smoke_test";
      break;
    case "inventory_contribs":
      jobKind = "inventory";
      break;
    case "catalog_contribs":
      jobKind = "catalog";
      break;
    case "inspect_contrib_evidence":
      jobKind = "contrib_evidence";
      break;
    case "preview_mapping":
      jobKind = "mapping_preview";
      break;
    case "test_mapping":
      jobKind = "mapping_test";
      break;
    case "plan_properties":
      jobKind = "property_plan";
      break;
    case "validate_governance":
      jobKind = "governance";
      break;
    case "compare_composition":
      jobKind = "composition_compare";
      break;
    case "build":
    case "run":
      jobKind = "build";
      break;
    default:
      jobKind = "eval";
      break;
  }
  const sampleInput = start.request.inputs["sampleInput"];
  let analysisPayload: Record<string, unknown> | undefined;
  switch (stepType) {
    case "preview_mapping":
      analysisPayload =
        sampleInput && typeof sampleInput === "object" && !Array.isArray(sampleInput)
          ? (sampleInput as Record<string, unknown>)
          : undefined;
      break;
    case "test_mapping":
      analysisPayload = {
        sampleInput:
          sampleInput && typeof sampleInput === "object" && !Array.isArray(sampleInput)
            ? (sampleInput as Record<string, unknown>)
            : {},
        expectedOutput:
          start.request.inputs["expectedOutput"] &&
          typeof start.request.inputs["expectedOutput"] === "object" &&
          !Array.isArray(start.request.inputs["expectedOutput"])
            ? (start.request.inputs["expectedOutput"] as Record<string, unknown>)
            : {},
        strict: start.request.inputs["strict"] !== false
      };
      break;
    case "plan_properties":
      analysisPayload = {
        profile:
          typeof start.request.inputs["profile"] === "string"
            ? (start.request.inputs["profile"] as string)
            : "rest_service"
      };
      break;
    case "compare_composition":
      analysisPayload = {
        target:
          typeof start.request.inputs["target"] === "string"
            ? (start.request.inputs["target"] as string)
            : "app",
        resourceId:
          typeof start.request.inputs["resourceId"] === "string"
            ? (start.request.inputs["resourceId"] as string)
            : undefined
      };
      break;
    case "validate_governance":
      analysisPayload = { mode: "governance" };
      break;
    case "inspect_contrib_evidence":
      analysisPayload = { mode: "contrib_evidence" };
      break;
    default:
      analysisPayload = undefined;
      break;
  }
  const targetNodeId = typeof start.request.inputs["nodeId"] === "string" ? (start.request.inputs["nodeId"] as string) : undefined;
  const targetRef = typeof start.request.inputs["ref"] === "string" ? (start.request.inputs["ref"] as string) : undefined;
  let analysisKind: RunnerJobSpec["analysisKind"];
  switch (stepType) {
    case "inventory_contribs":
      analysisKind = "inventory";
      break;
    case "catalog_contribs":
      analysisKind = "catalog";
      break;
    case "inspect_descriptor":
      analysisKind = "descriptor";
      break;
    case "inspect_contrib_evidence":
      analysisKind = "contrib_evidence";
      break;
    case "preview_mapping":
      analysisKind = "mapping_preview";
      break;
    case "test_mapping":
      analysisKind = "mapping_test";
      break;
    case "plan_properties":
      analysisKind = "property_plan";
      break;
    case "validate_governance":
      analysisKind = "governance";
      break;
    case "compare_composition":
      analysisKind = "composition_compare";
      break;
    default:
      analysisKind = undefined;
      break;
  }

  return {
    taskId: start.taskId,
    jobKind,
    stepType,
    analysisKind,
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
