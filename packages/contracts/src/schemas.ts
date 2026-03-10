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
export const SeveritySchema = z.enum(["info", "warning", "error"]);
export const ValidationStageSchema = z.enum([
  "structural",
  "semantic",
  "dependency",
  "build",
  "runtime",
  "regression"
]);
export const ArtifactKindSchema = z.enum([
  "snapshot",
  "patch",
  "build_log",
  "runtime_log",
  "binary",
  "report",
  "diff"
]);

export const DiagnosticSchema = z.object({
  code: z.string(),
  message: z.string(),
  severity: SeveritySchema,
  path: z.string().optional()
});

export const ArtifactRefSchema = z.object({
  kind: ArtifactKindSchema,
  uri: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const ValidationOutcomeSchema = z.object({
  stage: ValidationStageSchema,
  ok: z.boolean(),
  diagnostics: z.array(DiagnosticSchema).default([])
});

export const ValidationReportSchema = z.object({
  summary: z.string(),
  stages: z.array(ValidationOutcomeSchema)
});

export const ApprovalRequestSchema = z.object({
  type: z.string(),
  rationale: z.string(),
  requestedFrom: z.string(),
  diffSummary: z.string().optional()
});

export const ApprovalDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  rationale: z.string().optional(),
  decidedBy: z.string().optional()
});

export const FlogoImportSchema = z.object({
  alias: z.string(),
  ref: z.string(),
  version: z.string().optional()
});

export const FlogoHandlerSchema = z.object({
  settings: z.record(z.string(), z.unknown()).default({}),
  actionRef: z.string(),
  inputMappings: z.record(z.string(), z.unknown()).default({}),
  outputMappings: z.record(z.string(), z.unknown()).default({})
});

export const FlogoTriggerSchema = z.object({
  id: z.string(),
  ref: z.string(),
  settings: z.record(z.string(), z.unknown()).default({}),
  handlers: z.array(FlogoHandlerSchema).default([])
});

export const FlogoTaskNodeSchema = z.object({
  id: z.string(),
  ref: z.string(),
  input: z.record(z.string(), z.unknown()).default({}),
  output: z.record(z.string(), z.unknown()).default({})
});

export const FlogoResourceSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.record(z.string(), z.unknown()),
  tasks: z.array(FlogoTaskNodeSchema).default([])
});

export const FlogoAppGraphSchema = z.object({
  name: z.string(),
  type: z.string(),
  appModel: z.string(),
  imports: z.array(FlogoImportSchema).default([]),
  triggers: z.array(FlogoTriggerSchema).default([]),
  resources: z.array(FlogoResourceSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([])
});

export const TaskConstraintsSchema = z.object({
  allowDependencyChanges: z.boolean().default(false),
  allowCustomCode: z.boolean().default(false),
  targetEnv: z.enum(["dev", "qa", "prod"]).default("dev")
});

export const TaskRequestSchema = z.object({
  type: TaskTypeSchema,
  projectId: z.string().min(1),
  appPath: z.string().min(1),
  prompt: z.string().min(1),
  requestedBy: z.string().default("system"),
  constraints: TaskConstraintsSchema.default({}),
  expectedOutputs: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export const TaskResultSchema = z.object({
  status: TaskStateSchema,
  rootCause: z.string().optional(),
  patchSummary: z.string().default(""),
  validationReport: ValidationReportSchema.optional(),
  smokeTestResult: z.record(z.string(), z.unknown()).optional(),
  artifactRefs: z.array(ArtifactRefSchema).default([])
});

export const TaskRecordSchema = z.object({
  id: z.string(),
  type: TaskTypeSchema,
  status: TaskStateSchema,
  projectId: z.string(),
  appPath: z.string(),
  prompt: z.string(),
  requestedBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  planSummary: z.string().optional(),
  requiresApproval: z.boolean().default(false),
  approval: ApprovalRequestSchema.optional(),
  result: TaskResultSchema.optional(),
  artifacts: z.array(ArtifactRefSchema).default([])
});

export const ProgressEventSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  type: z.enum([
    "task.created",
    "task.updated",
    "task.log",
    "task.approval_requested",
    "task.completed",
    "task.failed"
  ]),
  timestamp: z.string(),
  payload: z.record(z.string(), z.unknown())
});

export const ToolRequestSchema = z.object({
  tool: z.string(),
  requestId: z.string(),
  payload: z.record(z.string(), z.unknown())
});

export const ToolResponseSchema = z.object({
  ok: z.boolean(),
  summary: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
  diagnostics: z.array(DiagnosticSchema).default([]),
  artifacts: z.array(ArtifactRefSchema).default([]),
  retryable: z.boolean().default(false)
});

export const RunnerStepTypeSchema = z.enum([
  "build",
  "run",
  "collect_logs",
  "generate_smoke",
  "run_smoke"
]);

export const RunnerJobSpecSchema = z.object({
  taskId: z.string(),
  stepType: RunnerStepTypeSchema,
  snapshotUri: z.string(),
  appPath: z.string(),
  env: z.record(z.string(), z.string()).default({}),
  timeoutSeconds: z.number().int().positive().default(300),
  outputUri: z.string()
});

export const RunnerJobResultSchema = z.object({
  taskId: z.string(),
  stepType: RunnerStepTypeSchema,
  ok: z.boolean(),
  exitCode: z.number().int().optional(),
  logUri: z.string().optional(),
  artifactUris: z.array(z.string()).default([]),
  summary: z.string()
});

export const SmokeTestSpecSchema = z.object({
  name: z.string(),
  method: z.string().default("GET"),
  url: z.string(),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.unknown().optional(),
  expectedStatus: z.number().int().default(200)
});

export type TaskType = z.infer<typeof TaskTypeSchema>;
export type TaskState = z.infer<typeof TaskStateSchema>;
export type Diagnostic = z.infer<typeof DiagnosticSchema>;
export type ArtifactRef = z.infer<typeof ArtifactRefSchema>;
export type ValidationReport = z.infer<typeof ValidationReportSchema>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export type FlogoAppGraph = z.infer<typeof FlogoAppGraphSchema>;
export type TaskRequest = z.infer<typeof TaskRequestSchema>;
export type TaskResult = z.infer<typeof TaskResultSchema>;
export type TaskRecord = z.infer<typeof TaskRecordSchema>;
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;
export type ToolRequest = z.infer<typeof ToolRequestSchema>;
export type ToolResponse = z.infer<typeof ToolResponseSchema>;
export type RunnerJobSpec = z.infer<typeof RunnerJobSpecSchema>;
export type RunnerJobResult = z.infer<typeof RunnerJobResultSchema>;
export type SmokeTestSpec = z.infer<typeof SmokeTestSpecSchema>;

