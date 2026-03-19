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
  if (mode === "flow_contracts") {
    return ["infer_flow_contracts"];
  }
  if (mode === "trigger_binding_plan") {
    return ["bind_trigger"];
  }
  if (mode === "subflow_extraction_plan") {
    return ["extract_subflow"];
  }
  if (mode === "subflow_inlining_plan") {
    return ["inline_subflow"];
  }
  if (mode === "iterator_plan") {
    return ["add_iterator"];
  }
  if (mode === "retry_policy_plan") {
    return ["add_retry_policy"];
  }
  if (mode === "dowhile_plan") {
    return ["add_dowhile"];
  }
  if (mode === "error_path_plan") {
    return ["add_error_path"];
  }
  if (mode === "run_trace_plan" || mode === "run_trace") {
    return ["capture_run_trace"];
  }
  if (mode === "replay_plan" || mode === "replay") {
    return ["replay_flow"];
  }
  if (mode === "run_comparison_plan" || mode === "run_comparison") {
    return ["compare_runs"];
  }
  if (mode === "run_comparison_plan" || mode === "run_comparison") {
    return ["compare_runs"];
  }
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
    case "infer_flow_contracts":
      jobKind = "flow_contracts";
      break;
    case "bind_trigger":
      jobKind = "trigger_binding";
      break;
    case "extract_subflow":
      jobKind = "subflow_extraction";
      break;
    case "inline_subflow":
      jobKind = "subflow_inlining";
      break;
    case "add_iterator":
      jobKind = "iterator_synthesis";
      break;
    case "add_retry_policy":
      jobKind = "retry_policy_synthesis";
      break;
    case "add_dowhile":
      jobKind = "dowhile_synthesis";
      break;
    case "add_error_path":
      jobKind = "error_path_synthesis";
      break;
    case "capture_run_trace":
      jobKind = "run_trace_capture";
      break;
    case "replay_flow":
      jobKind = "flow_replay";
      break;
    case "compare_runs":
      jobKind = "run_comparison";
      break;
    case "compare_runs":
      jobKind = "run_comparison";
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
    case "infer_flow_contracts":
      analysisPayload = {
        flowId:
          typeof start.request.inputs["flowId"] === "string"
            ? (start.request.inputs["flowId"] as string)
            : undefined
      };
      break;
    case "bind_trigger":
      analysisPayload = {
        flowId:
          typeof start.request.inputs["flowId"] === "string"
            ? (start.request.inputs["flowId"] as string)
            : undefined,
        profile:
          start.request.inputs["profile"] && typeof start.request.inputs["profile"] === "object" && !Array.isArray(start.request.inputs["profile"])
            ? (start.request.inputs["profile"] as Record<string, unknown>)
            : undefined,
        replaceExisting: start.request.inputs["replaceExisting"] === true,
        handlerName:
          typeof start.request.inputs["handlerName"] === "string"
            ? (start.request.inputs["handlerName"] as string)
            : undefined,
        triggerId:
          typeof start.request.inputs["triggerId"] === "string"
            ? (start.request.inputs["triggerId"] as string)
            : undefined,
        validateOnly: start.request.inputs["mode"] === "trigger_binding_plan" || start.request.inputs["validateOnly"] === true
      };
      break;
    case "extract_subflow":
      analysisPayload = {
        flowId:
          typeof start.request.inputs["flowId"] === "string"
            ? (start.request.inputs["flowId"] as string)
            : undefined,
        taskIds: Array.isArray(start.request.inputs["taskIds"])
          ? (start.request.inputs["taskIds"] as unknown[]).filter((value): value is string => typeof value === "string")
          : [],
        newFlowId:
          typeof start.request.inputs["newFlowId"] === "string"
            ? (start.request.inputs["newFlowId"] as string)
            : undefined,
        newFlowName:
          typeof start.request.inputs["newFlowName"] === "string"
            ? (start.request.inputs["newFlowName"] as string)
            : undefined,
        validateOnly: start.request.inputs["validateOnly"] !== false,
        replaceExisting: start.request.inputs["replaceExisting"] === true
      };
      break;
    case "inline_subflow":
      analysisPayload = {
        parentFlowId:
          typeof start.request.inputs["parentFlowId"] === "string"
            ? (start.request.inputs["parentFlowId"] as string)
            : undefined,
        invocationTaskId:
          typeof start.request.inputs["invocationTaskId"] === "string"
            ? (start.request.inputs["invocationTaskId"] as string)
            : undefined,
        validateOnly: start.request.inputs["validateOnly"] !== false,
        removeExtractedFlowIfUnused: start.request.inputs["removeExtractedFlowIfUnused"] === true
      };
      break;
    case "add_iterator":
      analysisPayload = {
        flowId:
          typeof start.request.inputs["flowId"] === "string"
            ? (start.request.inputs["flowId"] as string)
            : undefined,
        taskId:
          typeof start.request.inputs["taskId"] === "string"
            ? (start.request.inputs["taskId"] as string)
            : undefined,
        iterateExpr:
          typeof start.request.inputs["iterateExpr"] === "string"
            ? (start.request.inputs["iterateExpr"] as string)
            : undefined,
        accumulate:
          typeof start.request.inputs["accumulate"] === "boolean"
            ? (start.request.inputs["accumulate"] as boolean)
            : undefined,
        validateOnly: start.request.inputs["validateOnly"] !== false,
        replaceExisting: start.request.inputs["replaceExisting"] === true
      };
      break;
    case "add_retry_policy":
      analysisPayload = {
        flowId:
          typeof start.request.inputs["flowId"] === "string"
            ? (start.request.inputs["flowId"] as string)
            : undefined,
        taskId:
          typeof start.request.inputs["taskId"] === "string"
            ? (start.request.inputs["taskId"] as string)
            : undefined,
        count:
          typeof start.request.inputs["count"] === "number"
            ? (start.request.inputs["count"] as number)
            : undefined,
        intervalMs:
          typeof start.request.inputs["intervalMs"] === "number"
            ? (start.request.inputs["intervalMs"] as number)
            : undefined,
        validateOnly: start.request.inputs["validateOnly"] !== false,
        replaceExisting: start.request.inputs["replaceExisting"] === true
      };
      break;
    case "add_dowhile":
      analysisPayload = {
        flowId:
          typeof start.request.inputs["flowId"] === "string"
            ? (start.request.inputs["flowId"] as string)
            : undefined,
        taskId:
          typeof start.request.inputs["taskId"] === "string"
            ? (start.request.inputs["taskId"] as string)
            : undefined,
        condition:
          typeof start.request.inputs["condition"] === "string"
            ? (start.request.inputs["condition"] as string)
            : undefined,
        delayMs:
          typeof start.request.inputs["delayMs"] === "number"
            ? (start.request.inputs["delayMs"] as number)
            : undefined,
        accumulate:
          typeof start.request.inputs["accumulate"] === "boolean"
            ? (start.request.inputs["accumulate"] as boolean)
            : undefined,
        validateOnly: start.request.inputs["validateOnly"] !== false,
        replaceExisting: start.request.inputs["replaceExisting"] === true
      };
      break;
    case "add_error_path":
      analysisPayload = {
        flowId:
          typeof start.request.inputs["flowId"] === "string"
            ? (start.request.inputs["flowId"] as string)
            : undefined,
        taskId:
          typeof start.request.inputs["taskId"] === "string"
            ? (start.request.inputs["taskId"] as string)
            : undefined,
        template:
          typeof start.request.inputs["template"] === "string"
            ? (start.request.inputs["template"] as string)
            : undefined,
        validateOnly: start.request.inputs["validateOnly"] !== false,
        replaceExisting: start.request.inputs["replaceExisting"] === true,
        logMessage:
          typeof start.request.inputs["logMessage"] === "string"
            ? (start.request.inputs["logMessage"] as string)
            : undefined,
        generatedTaskPrefix:
          typeof start.request.inputs["generatedTaskPrefix"] === "string"
            ? (start.request.inputs["generatedTaskPrefix"] as string)
            : undefined
      };
      break;
    case "capture_run_trace":
      analysisPayload = {
        flowId:
          typeof start.request.inputs["flowId"] === "string"
            ? (start.request.inputs["flowId"] as string)
            : undefined,
        sampleInput:
          start.request.inputs["sampleInput"] && typeof start.request.inputs["sampleInput"] === "object" && !Array.isArray(start.request.inputs["sampleInput"])
            ? (start.request.inputs["sampleInput"] as Record<string, unknown>)
            : {},
        capture:
          start.request.inputs["capture"] && typeof start.request.inputs["capture"] === "object" && !Array.isArray(start.request.inputs["capture"])
            ? (start.request.inputs["capture"] as Record<string, unknown>)
            : undefined,
        validateOnly: start.request.inputs["mode"] === "run_trace_plan" || start.request.inputs["validateOnly"] === true
      };
      break;
    case "replay_flow":
      analysisPayload = {
        flowId:
          typeof start.request.inputs["flowId"] === "string"
            ? (start.request.inputs["flowId"] as string)
            : undefined,
        traceArtifactId:
          typeof start.request.inputs["traceArtifactId"] === "string"
            ? (start.request.inputs["traceArtifactId"] as string)
            : undefined,
        baseInput:
          start.request.inputs["baseInput"] && typeof start.request.inputs["baseInput"] === "object" && !Array.isArray(start.request.inputs["baseInput"])
            ? (start.request.inputs["baseInput"] as Record<string, unknown>)
            : undefined,
        overrides:
          start.request.inputs["overrides"] && typeof start.request.inputs["overrides"] === "object" && !Array.isArray(start.request.inputs["overrides"])
            ? (start.request.inputs["overrides"] as Record<string, unknown>)
            : undefined,
        capture:
          start.request.inputs["capture"] && typeof start.request.inputs["capture"] === "object" && !Array.isArray(start.request.inputs["capture"])
            ? (start.request.inputs["capture"] as Record<string, unknown>)
            : undefined,
        validateOnly: start.request.inputs["mode"] === "replay_plan" || start.request.inputs["validateOnly"] === true
      };
      break;
    case "compare_runs":
      analysisPayload = {
        leftArtifactId:
          typeof start.request.inputs["leftArtifactId"] === "string"
            ? (start.request.inputs["leftArtifactId"] as string)
            : undefined,
        rightArtifactId:
          typeof start.request.inputs["rightArtifactId"] === "string"
            ? (start.request.inputs["rightArtifactId"] as string)
            : undefined,
        leftArtifact:
          start.request.inputs["leftArtifact"] && typeof start.request.inputs["leftArtifact"] === "object" && !Array.isArray(start.request.inputs["leftArtifact"])
            ? (start.request.inputs["leftArtifact"] as Record<string, unknown>)
            : undefined,
        rightArtifact:
          start.request.inputs["rightArtifact"] && typeof start.request.inputs["rightArtifact"] === "object" && !Array.isArray(start.request.inputs["rightArtifact"])
            ? (start.request.inputs["rightArtifact"] as Record<string, unknown>)
            : undefined,
        compare:
          start.request.inputs["compare"] && typeof start.request.inputs["compare"] === "object" && !Array.isArray(start.request.inputs["compare"])
            ? (start.request.inputs["compare"] as Record<string, unknown>)
            : undefined,
        validateOnly: start.request.inputs["mode"] === "run_comparison_plan" || start.request.inputs["validateOnly"] === true
      };
      break;
    case "compare_runs":
      analysisPayload = {
        leftArtifactId:
          typeof start.request.inputs["leftArtifactId"] === "string"
            ? (start.request.inputs["leftArtifactId"] as string)
            : undefined,
        rightArtifactId:
          typeof start.request.inputs["rightArtifactId"] === "string"
            ? (start.request.inputs["rightArtifactId"] as string)
            : undefined,
        leftArtifact:
          start.request.inputs["leftArtifact"] &&
          typeof start.request.inputs["leftArtifact"] === "object" &&
          !Array.isArray(start.request.inputs["leftArtifact"])
            ? (start.request.inputs["leftArtifact"] as Record<string, unknown>)
            : undefined,
        rightArtifact:
          start.request.inputs["rightArtifact"] &&
          typeof start.request.inputs["rightArtifact"] === "object" &&
          !Array.isArray(start.request.inputs["rightArtifact"])
            ? (start.request.inputs["rightArtifact"] as Record<string, unknown>)
            : undefined,
        compare:
          start.request.inputs["compare"] &&
          typeof start.request.inputs["compare"] === "object" &&
          !Array.isArray(start.request.inputs["compare"])
            ? (start.request.inputs["compare"] as Record<string, unknown>)
            : undefined,
        validateOnly:
          start.request.inputs["mode"] === "run_comparison_plan" || start.request.inputs["validateOnly"] === true
      };
      break;
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
    case "infer_flow_contracts":
      analysisKind = "flow_contracts";
      break;
    case "bind_trigger":
      analysisKind = "trigger_binding_plan";
      break;
    case "extract_subflow":
      analysisKind = "subflow_extraction_plan";
      break;
    case "inline_subflow":
      analysisKind = "subflow_inlining_plan";
      break;
    case "add_iterator":
      analysisKind = "iterator_plan";
      break;
    case "add_retry_policy":
      analysisKind = "retry_policy_plan";
      break;
    case "add_dowhile":
      analysisKind = "dowhile_plan";
      break;
    case "add_error_path":
      analysisKind = "error_path_plan";
      break;
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
