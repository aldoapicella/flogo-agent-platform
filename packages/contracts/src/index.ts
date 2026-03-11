import { z } from "zod";

export const TaskTypeSchema = z.enum(["create", "update", "debug", "review"]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const TaskStatusSchema = z.enum([
  "queued",
  "planning",
  "running",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled"
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const ApprovalTypeSchema = z.enum([
  "delete_flow",
  "delete_resource",
  "change_public_contract",
  "dependency_upgrade",
  "custom_code",
  "external_endpoint_change",
  "deploy"
]);
export type ApprovalType = z.infer<typeof ApprovalTypeSchema>;

export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ArtifactTypeSchema = z.enum([
  "flogo_json",
  "binary",
  "build_log",
  "runtime_log",
  "test_report",
  "patch_bundle",
  "review_report",
  "workspace_snapshot"
]);
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>;

export const DiagnosticSeveritySchema = z.enum(["info", "warning", "error"]);
export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>;

export const DiagnosticSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: DiagnosticSeveritySchema,
  path: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional()
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;

export const ArtifactRefSchema = z.object({
  id: z.string(),
  type: ArtifactTypeSchema,
  name: z.string(),
  uri: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;

export const ValidationStageSchema = z.enum([
  "structural",
  "semantic",
  "dependency",
  "build",
  "runtime",
  "regression"
]);
export type ValidationStage = z.infer<typeof ValidationStageSchema>;

export const ValidationStageResultSchema = z.object({
  stage: ValidationStageSchema,
  ok: z.boolean(),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type ValidationStageResult = z.infer<typeof ValidationStageResultSchema>;

export const ValidationReportSchema = z.object({
  ok: z.boolean(),
  stages: z.array(ValidationStageResultSchema),
  summary: z.string(),
  artifacts: z.array(ArtifactRefSchema).default([])
});
export type ValidationReport = z.infer<typeof ValidationReportSchema>;

export const RepoTargetSchema = z.object({
  rootPath: z.string().optional(),
  url: z.string().optional(),
  branch: z.string().default("main")
});
export type RepoTarget = z.infer<typeof RepoTargetSchema>;

export const TaskConstraintsSchema = z.object({
  allowDependencyChanges: z.boolean().default(false),
  allowCustomCode: z.boolean().default(false),
  targetEnv: z.string().default("dev"),
  requireApproval: z.boolean().default(true)
});
export type TaskConstraints = z.infer<typeof TaskConstraintsSchema>;

export const TaskRequestSchema = z.object({
  taskId: z.string().optional(),
  type: TaskTypeSchema,
  projectId: z.string(),
  appId: z.string().optional(),
  appPath: z.string().optional(),
  requestedBy: z.string().default("operator"),
  summary: z.string(),
  repo: RepoTargetSchema.optional(),
  inputs: z.record(z.string(), z.unknown()).default({}),
  constraints: TaskConstraintsSchema.default({})
});
export type TaskRequest = z.infer<typeof TaskRequestSchema>;

export const TaskStepSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  type: z.enum(["plan", "validate", "patch", "build", "run", "test", "review", "approve", "artifact"]),
  status: TaskStatusSchema,
  summary: z.string(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional()
});
export type TaskStep = z.infer<typeof TaskStepSchema>;

export const OrchestrationRuntimeStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "terminated",
  "continued_as_new",
  "unknown"
]);
export type OrchestrationRuntimeStatus = z.infer<typeof OrchestrationRuntimeStatusSchema>;

export const TaskResultSchema = z.object({
  taskId: z.string(),
  type: TaskTypeSchema,
  status: TaskStatusSchema,
  summary: z.string(),
  orchestrationId: z.string().optional(),
  approvalStatus: ApprovalStatusSchema.optional(),
  activeJobRuns: z.array(z.lazy(() => ActiveJobRunSchema)).default([]),
  rootCause: z.string().optional(),
  validationReport: ValidationReportSchema.optional(),
  artifacts: z.array(ArtifactRefSchema).default([]),
  requiredApprovals: z.array(ApprovalTypeSchema).default([]),
  nextActions: z.array(z.string()).default([])
});
export type TaskResult = z.infer<typeof TaskResultSchema>;

export const TaskSummarySchema = z.object({
  id: z.string(),
  type: TaskTypeSchema,
  state: TaskStatusSchema,
  projectId: z.string(),
  appId: z.string().optional(),
  appPath: z.string().optional(),
  prompt: z.string(),
  planSummary: z.string().optional(),
  approvalStatus: ApprovalStatusSchema.optional(),
  orchestrationId: z.string().optional(),
  activeJobRuns: z.array(z.lazy(() => ActiveJobRunSchema)).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  validationReport: ValidationReportSchema.optional(),
  artifacts: z.array(ArtifactRefSchema).default([]),
  requiredApprovals: z.array(ApprovalTypeSchema).default([]),
  nextActions: z.array(z.string()).default([])
});
export type TaskSummary = z.infer<typeof TaskSummarySchema>;

export const ApprovalRequestSchema = z.object({
  taskId: z.string(),
  type: ApprovalTypeSchema,
  requestedFrom: z.string(),
  rationale: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional()
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const ApprovalDecisionSchema = z.object({
  taskId: z.string(),
  type: ApprovalTypeSchema,
  status: ApprovalStatusSchema,
  rationale: z.string().optional()
});
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ToolEnvelopeSchema = z.object({
  tool: z.string(),
  requestId: z.string(),
  payload: z.record(z.string(), z.unknown())
});
export type ToolEnvelope = z.infer<typeof ToolEnvelopeSchema>;

export const ToolResponseSchema = z.object({
  ok: z.boolean(),
  summary: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
  diagnostics: z.array(DiagnosticSchema).default([]),
  artifacts: z.array(ArtifactRefSchema).default([]),
  retryable: z.boolean().default(false)
});
export type ToolResponse = z.infer<typeof ToolResponseSchema>;

export const FlogoImportSchema = z.object({
  alias: z.string(),
  ref: z.string(),
  version: z.string().optional()
});
export type FlogoImport = z.infer<typeof FlogoImportSchema>;

export const FlogoTaskSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  activityRef: z.string().optional(),
  input: z.record(z.string(), z.unknown()).default({}),
  output: z.record(z.string(), z.unknown()).default({}),
  settings: z.record(z.string(), z.unknown()).default({})
});
export type FlogoTask = z.infer<typeof FlogoTaskSchema>;

export const FlogoFlowSchema = z.object({
  id: z.string(),
  data: z.object({
    name: z.string().optional(),
    metadata: z
      .object({
        input: z.array(z.record(z.string(), z.unknown())).default([]),
        output: z.array(z.record(z.string(), z.unknown())).default([])
      })
      .default({ input: [], output: [] }),
    tasks: z.array(FlogoTaskSchema).default([]),
    links: z.array(z.record(z.string(), z.unknown())).default([])
  }).passthrough()
});
export type FlogoFlow = z.infer<typeof FlogoFlowSchema>;

export const FlogoHandlerSchema = z.object({
  settings: z.record(z.string(), z.unknown()).default({}),
  action: z.object({
    ref: z.string()
  }).passthrough(),
  input: z.record(z.string(), z.unknown()).default({}),
  output: z.record(z.string(), z.unknown()).default({})
}).passthrough();
export type FlogoHandler = z.infer<typeof FlogoHandlerSchema>;

export const FlogoTriggerSchema = z.object({
  id: z.string(),
  ref: z.string(),
  settings: z.record(z.string(), z.unknown()).default({}),
  handlers: z.array(FlogoHandlerSchema).default([])
}).passthrough();
export type FlogoTrigger = z.infer<typeof FlogoTriggerSchema>;

export const FlogoAppSchema = z.object({
  name: z.string(),
  type: z.literal("flogo:app"),
  appModel: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  imports: z.array(FlogoImportSchema).default([]),
  triggers: z.array(FlogoTriggerSchema).default([]),
  resources: z.array(FlogoFlowSchema).default([])
}).passthrough();
export type FlogoApp = z.infer<typeof FlogoAppSchema>;

export const FlogoAppGraphSchema = z.object({
  app: FlogoAppSchema,
  importsByAlias: z.record(z.string(), z.string()),
  resourceIds: z.array(z.string()),
  taskIds: z.array(z.string()),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type FlogoAppGraph = z.infer<typeof FlogoAppGraphSchema>;

export const RunnerStepTypeSchema = z.enum([
  "build",
  "run",
  "collect_logs",
  "generate_smoke",
  "run_smoke"
]);
export type RunnerStepType = z.infer<typeof RunnerStepTypeSchema>;

export const RunnerJobKindSchema = z.enum(["build", "smoke_test", "custom_contrib", "eval"]);
export type RunnerJobKind = z.infer<typeof RunnerJobKindSchema>;

export const RunnerJobStateSchema = z.enum(["pending", "running", "succeeded", "failed", "cancelled"]);
export type RunnerJobState = z.infer<typeof RunnerJobStateSchema>;

export const ActiveJobRunSchema = z.object({
  id: z.string(),
  stepType: RunnerStepTypeSchema,
  jobTemplateName: z.string(),
  status: RunnerJobStateSchema,
  summary: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional()
});
export type ActiveJobRun = z.infer<typeof ActiveJobRunSchema>;

export const RunnerJobSpecSchema = z.object({
  taskId: z.string(),
  jobKind: RunnerJobKindSchema.default("build"),
  stepType: RunnerStepTypeSchema,
  snapshotUri: z.string(),
  workspaceBlobPrefix: z.string().optional(),
  appPath: z.string(),
  env: z.record(z.string(), z.string()).default({}),
  envSecretRefs: z.record(z.string(), z.string()).default({}),
  timeoutSeconds: z.number().int().positive().default(900),
  artifactOutputUri: z.string(),
  artifactBlobPrefix: z.string().optional(),
  jobTemplateName: z.string().default("flogo-runner"),
  jobRunId: z.string().optional(),
  correlationId: z.string().optional(),
  command: z.array(z.string()).default([]),
  containerArgs: z.array(z.string()).default([])
});
export type RunnerJobSpec = z.infer<typeof RunnerJobSpecSchema>;

export const RunnerJobResultSchema = z.object({
  jobId: z.string(),
  jobRunId: z.string().optional(),
  azureJobExecutionName: z.string().optional(),
  azureJobResourceId: z.string().optional(),
  ok: z.boolean(),
  status: RunnerJobStateSchema.default("succeeded"),
  summary: z.string(),
  exitCode: z.number().int(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  jobTemplateName: z.string().optional(),
  logArtifact: ArtifactRefSchema.optional(),
  artifacts: z.array(ArtifactRefSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type RunnerJobResult = z.infer<typeof RunnerJobResultSchema>;

export const RunnerJobStatusSchema = z.object({
  jobRunId: z.string(),
  status: RunnerJobStateSchema,
  summary: z.string(),
  spec: RunnerJobSpecSchema,
  azureJobExecutionName: z.string().optional(),
  azureJobResourceId: z.string().optional(),
  result: RunnerJobResultSchema.optional()
});
export type RunnerJobStatus = z.infer<typeof RunnerJobStatusSchema>;

export const TaskRunSchema = z.object({
  id: z.string(),
  category: z.enum(["build", "test"]),
  stepType: RunnerStepTypeSchema,
  jobRunId: z.string().optional(),
  jobTemplateName: z.string().optional(),
  status: RunnerJobStateSchema,
  summary: z.string(),
  exitCode: z.number().int().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  logUri: z.string().optional(),
  reportUri: z.string().optional(),
  binaryUri: z.string().optional(),
  azureJobExecutionName: z.string().optional(),
  azureJobResourceId: z.string().optional(),
  artifacts: z.array(ArtifactRefSchema).default([])
});
export type TaskRun = z.infer<typeof TaskRunSchema>;

export const TaskRunsSchema = z.object({
  taskId: z.string(),
  buildRuns: z.array(TaskRunSchema).default([]),
  testRuns: z.array(TaskRunSchema).default([])
});
export type TaskRuns = z.infer<typeof TaskRunsSchema>;

export const OrchestratorStartRequestSchema = z.object({
  taskId: z.string(),
  request: TaskRequestSchema,
  requiredApprovals: z.array(ApprovalTypeSchema).default([]),
  planSummary: z.string(),
  steps: z.array(TaskStepSchema).default([])
});
export type OrchestratorStartRequest = z.infer<typeof OrchestratorStartRequestSchema>;

export const OrchestratorStartResponseSchema = z.object({
  orchestrationId: z.string(),
  status: OrchestrationRuntimeStatusSchema,
  activeJobRuns: z.array(ActiveJobRunSchema).default([]),
  summary: z.string()
});
export type OrchestratorStartResponse = z.infer<typeof OrchestratorStartResponseSchema>;

export const OrchestratorApprovalSignalSchema = z.object({
  taskId: z.string(),
  type: ApprovalTypeSchema,
  status: ApprovalStatusSchema,
  rationale: z.string().optional()
});
export type OrchestratorApprovalSignal = z.infer<typeof OrchestratorApprovalSignalSchema>;

export const OrchestratorStatusSchema = z.object({
  orchestrationId: z.string(),
  taskId: z.string(),
  runtimeStatus: OrchestrationRuntimeStatusSchema,
  approvalStatus: ApprovalStatusSchema.optional(),
  activeJobRuns: z.array(ActiveJobRunSchema).default([]),
  summary: z.string(),
  lastUpdatedAt: z.string()
});
export type OrchestratorStatus = z.infer<typeof OrchestratorStatusSchema>;

export const SmokeAssertionSchema = z.object({
  field: z.string(),
  operator: z.enum(["equals", "contains", "exists"]),
  expected: z.unknown().optional()
});
export type SmokeAssertion = z.infer<typeof SmokeAssertionSchema>;

export const SmokeTestSpecSchema = z.object({
  name: z.string(),
  method: z.string().default("GET"),
  url: z.string(),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
  assertions: z.array(SmokeAssertionSchema).default([])
});
export type SmokeTestSpec = z.infer<typeof SmokeTestSpecSchema>;

export const TaskEventSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  type: z.enum(["status", "log", "artifact", "approval", "tool"]),
  message: z.string(),
  timestamp: z.string(),
  payload: z.record(z.string(), z.unknown()).optional()
});
export type TaskEvent = z.infer<typeof TaskEventSchema>;

export const TaskEventPublishSchema = TaskEventSchema.omit({
  id: true,
  timestamp: true
});
export type TaskEventPublish = z.infer<typeof TaskEventPublishSchema>;

export const TaskStateSyncSchema = z.object({
  orchestrationId: z.string().optional(),
  status: TaskStatusSchema.optional(),
  summary: z.string().optional(),
  approvalStatus: ApprovalStatusSchema.optional(),
  activeJobRuns: z.array(ActiveJobRunSchema).optional(),
  jobRunStatus: RunnerJobStatusSchema.optional(),
  artifact: ArtifactRefSchema.optional(),
  validationReport: ValidationReportSchema.optional(),
  rootCause: z.string().optional(),
  requiredApprovals: z.array(ApprovalTypeSchema).optional(),
  nextActions: z.array(z.string()).optional()
});
export type TaskStateSync = z.infer<typeof TaskStateSyncSchema>;

export const EvalCaseSchema = z.object({
  id: z.string(),
  type: TaskTypeSchema,
  title: z.string(),
  prompt: z.string(),
  expectedSignals: z.array(z.string()).default([])
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export function parseWithSchema<T>(schema: z.ZodSchema<T>, value: unknown): T {
  return schema.parse(value);
}
