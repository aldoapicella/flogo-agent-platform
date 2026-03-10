import { z } from "zod";

export const TaskTypeSchema = z.enum(["create", "update", "debug", "review"]);
export const TaskStateSchema = z.enum([
  "queued",
  "planning",
  "running",
  "awaiting_approval",
  "succeeded",
  "failed",
  "cancelled"
]);
export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected"]);
export const ArtifactKindSchema = z.enum([
  "diff",
  "build_log",
  "runtime_log",
  "binary",
  "report",
  "patch",
  "graph",
  "other"
]);

export const ValidationIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
  severity: z.enum(["info", "warning", "error"]).default("error")
});

export const ValidationStageSchema = z.object({
  issues: z.array(ValidationIssueSchema).default([]),
  valid: z.boolean().default(true)
});

export const ValidationReportSchema = z.object({
  structural: ValidationStageSchema.default({ valid: true, issues: [] }),
  semantic: ValidationStageSchema.default({ valid: true, issues: [] }),
  dependency: ValidationStageSchema.default({ valid: true, issues: [] }),
  build: ValidationStageSchema.default({ valid: true, issues: [] }),
  runtime: ValidationStageSchema.default({ valid: true, issues: [] }),
  regression: ValidationStageSchema.default({ valid: true, issues: [] }),
  overallValid: z.boolean().default(true)
});

export const ArtifactRefSchema = z.object({
  id: z.string(),
  kind: ArtifactKindSchema,
  label: z.string(),
  uri: z.string(),
  metadata: z.record(z.unknown()).optional()
});

export const RepoRefSchema = z.object({
  root: z.string(),
  branch: z.string().optional(),
  revision: z.string().optional()
});

export const TaskConstraintsSchema = z.object({
  allowDependencyChanges: z.boolean().default(false),
  allowCustomCode: z.boolean().default(false),
  targetEnv: z.enum(["dev", "test", "prod"]).default("dev")
});

export const TaskRequestSchema = z.object({
  type: TaskTypeSchema,
  projectId: z.string(),
  appId: z.string().optional(),
  appPath: z.string(),
  prompt: z.string(),
  repo: RepoRefSchema.optional(),
  constraints: TaskConstraintsSchema.default({}),
  expectedOutputs: z.array(z.string()).default([])
});

export const ApprovalRequestSchema = z.object({
  type: z.enum([
    "delete_resource",
    "delete_flow",
    "public_contract_change",
    "dependency_upgrade",
    "custom_code",
    "external_endpoint_change",
    "deploy"
  ]),
  rationale: z.string(),
  diffSummary: z.string().optional()
});

export const ApprovalDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  rationale: z.string().min(1)
});

export const TaskEventSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  type: z.enum(["task.created", "task.updated", "task.log", "task.approval", "task.completed", "task.failed"]),
  timestamp: z.string(),
  payload: z.record(z.unknown())
});

export const TaskResultSchema = z.object({
  taskId: z.string(),
  state: TaskStateSchema,
  rootCause: z.string().optional(),
  patchSummary: z.string().optional(),
  validationReport: ValidationReportSchema.optional(),
  artifactRefs: z.array(ArtifactRefSchema).default([])
});

export const TaskSummarySchema = z.object({
  id: z.string(),
  type: TaskTypeSchema,
  state: TaskStateSchema,
  projectId: z.string(),
  appId: z.string(),
  appPath: z.string(),
  prompt: z.string(),
  planSummary: z.string().optional(),
  approvalStatus: ApprovalStatusSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  validationReport: ValidationReportSchema.optional(),
  artifacts: z.array(ArtifactRefSchema).default([])
});

export const ToolRequestSchema = z.object({
  tool: z.string(),
  requestId: z.string(),
  payload: z.record(z.unknown())
});

export const ToolResponseSchema = z.object({
  ok: z.boolean(),
  summary: z.string(),
  data: z.record(z.unknown()).default({}),
  diagnostics: z.array(ValidationIssueSchema).default([]),
  artifacts: z.array(ArtifactRefSchema).default([]),
  retryable: z.boolean().default(false)
});

export const FlogoImportSchema = z.object({
  alias: z.string(),
  ref: z.string(),
  version: z.string().optional()
});

export const FlogoHandlerSchema = z.object({
  id: z.string(),
  actionRef: z.string(),
  settings: z.record(z.unknown()).default({}),
  inputMappings: z.record(z.unknown()).optional(),
  outputMappings: z.record(z.unknown()).optional()
});

export const FlogoTriggerSchema = z.object({
  id: z.string(),
  ref: z.string(),
  settings: z.record(z.unknown()).default({}),
  handlers: z.array(FlogoHandlerSchema).default([])
});

export const FlogoTaskSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  activityRef: z.string().optional(),
  inputMappings: z.record(z.unknown()).optional(),
  outputMappings: z.record(z.unknown()).optional()
});

export const FlogoResourceSchema = z.object({
  id: z.string(),
  type: z.string(),
  input: z.array(z.string()).default([]),
  output: z.array(z.string()).default([]),
  tasks: z.array(FlogoTaskSchema).default([])
});

export const FlogoAppGraphSchema = z.object({
  name: z.string(),
  type: z.string(),
  appModel: z.string(),
  imports: z.array(FlogoImportSchema).default([]),
  triggers: z.array(FlogoTriggerSchema).default([]),
  resources: z.array(FlogoResourceSchema).default([]),
  diagnostics: z.array(ValidationIssueSchema).default([])
});

export const RunnerJobSpecSchema = z.object({
  jobId: z.string(),
  taskId: z.string(),
  stepType: z.enum(["build", "run", "debug", "smoke", "collect_logs"]),
  snapshotUri: z.string(),
  appPath: z.string(),
  env: z.record(z.string()).default({}),
  timeoutSeconds: z.number().int().positive().default(300),
  artifactOutputUri: z.string(),
  command: z.array(z.string()).default([])
});

export const RunnerJobResultSchema = z.object({
  jobId: z.string(),
  taskId: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  exitCode: z.number().int().optional(),
  summary: z.string(),
  artifacts: z.array(ArtifactRefSchema).default([])
});

export const SmokeTestSpecSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).default("GET"),
  url: z.string(),
  headers: z.record(z.string()).default({}),
  body: z.unknown().optional(),
  expectedStatus: z.number().int().default(200),
  expectedBodyContains: z.array(z.string()).default([])
});

export type TaskType = z.infer<typeof TaskTypeSchema>;
export type TaskState = z.infer<typeof TaskStateSchema>;
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
export type ValidationReport = z.infer<typeof ValidationReportSchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type TaskRequest = z.infer<typeof TaskRequestSchema>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export type TaskEvent = z.infer<typeof TaskEventSchema>;
export type TaskResult = z.infer<typeof TaskResultSchema>;
export type TaskSummary = z.infer<typeof TaskSummarySchema>;
export type ToolRequest = z.infer<typeof ToolRequestSchema>;
export type ToolResponse = z.infer<typeof ToolResponseSchema>;
export type FlogoImport = z.infer<typeof FlogoImportSchema>;
export type FlogoHandler = z.infer<typeof FlogoHandlerSchema>;
export type FlogoTrigger = z.infer<typeof FlogoTriggerSchema>;
export type FlogoTask = z.infer<typeof FlogoTaskSchema>;
export type FlogoResource = z.infer<typeof FlogoResourceSchema>;
export type FlogoAppGraph = z.infer<typeof FlogoAppGraphSchema>;
export type RunnerJobSpec = z.infer<typeof RunnerJobSpecSchema>;
export type RunnerJobResult = z.infer<typeof RunnerJobResultSchema>;
export type SmokeTestSpec = z.infer<typeof SmokeTestSpecSchema>;
