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

export const TaskResultSchema = z.object({
  taskId: z.string(),
  type: TaskTypeSchema,
  status: TaskStatusSchema,
  summary: z.string(),
  rootCause: z.string().optional(),
  validationReport: ValidationReportSchema.optional(),
  artifacts: z.array(ArtifactRefSchema).default([]),
  requiredApprovals: z.array(ApprovalTypeSchema).default([]),
  nextActions: z.array(z.string()).default([])
});
export type TaskResult = z.infer<typeof TaskResultSchema>;

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

export const RunnerJobSpecSchema = z.object({
  taskId: z.string(),
  stepType: RunnerStepTypeSchema,
  snapshotUri: z.string(),
  appPath: z.string(),
  env: z.record(z.string(), z.string()).default({}),
  timeoutSeconds: z.number().int().positive().default(900),
  artifactOutputUri: z.string(),
  command: z.array(z.string()).default([])
});
export type RunnerJobSpec = z.infer<typeof RunnerJobSpecSchema>;

export const RunnerJobResultSchema = z.object({
  jobId: z.string(),
  ok: z.boolean(),
  summary: z.string(),
  exitCode: z.number().int(),
  logArtifact: ArtifactRefSchema.optional(),
  artifacts: z.array(ArtifactRefSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type RunnerJobResult = z.infer<typeof RunnerJobResultSchema>;

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
