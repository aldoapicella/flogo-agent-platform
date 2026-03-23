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
  "install_contribution",
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
  "workspace_snapshot",
  "contrib_inventory",
  "contrib_catalog",
  "contrib_evidence",
  "mapping_preview",
  "mapping_test",
  "property_plan",
  "governance_report",
  "composition_compare",
  "flow_contract",
  "trigger_binding_plan",
  "trigger_binding_result",
  "subflow_extraction_plan",
  "subflow_extraction_result",
  "subflow_inlining_plan",
  "subflow_inlining_result",
  "iterator_plan",
  "iterator_result",
  "retry_policy_plan",
  "retry_policy_result",
  "dowhile_plan",
  "dowhile_result",
  "error_path_plan",
  "error_path_result",
  "run_trace_plan",
  "run_trace",
  "replay_plan",
  "replay_report",
  "run_comparison_plan",
  "run_comparison",
  "diagnosis_report",
  "contrib_bundle",
  "contrib_validation_report",
  "contrib_package",
  "contrib_install_plan",
  "contrib_update_plan",
  "contrib_update_diff_plan",
  "contrib_install_diff_plan",
  "contrib_install_apply_result"
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

export const FlogoPropertySchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  value: z.unknown().optional(),
  required: z.boolean().optional()
});
export type FlogoProperty = z.infer<typeof FlogoPropertySchema>;

export const FlogoTaskSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.string().optional(),
  activityRef: z.string().optional(),
  input: z.record(z.string(), z.unknown()).default({}),
  output: z.record(z.string(), z.unknown()).default({}),
  settings: z.record(z.string(), z.unknown()).default({})
});
export type FlogoTask = z.infer<typeof FlogoTaskSchema>;

export const FlogoLinkSchema = z
  .object({
    id: z.string().optional(),
    from: z.string(),
    to: z.string(),
    type: z.enum(["dependency", "expression"]).default("dependency"),
    value: z.string().optional()
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.type === "expression" && (!value.value || value.value.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expression links require a non-empty value",
        path: ["value"]
      });
    }
  });
export type FlogoLink = z.infer<typeof FlogoLinkSchema>;

export const FlogoFlowSchema = z.object({
  id: z.string(),
  type: z.string().default("flow"),
  data: z.object({
    name: z.string().optional(),
    metadata: z
      .object({
        input: z.array(z.record(z.string(), z.unknown())).default([]),
        output: z.array(z.record(z.string(), z.unknown())).default([])
      })
      .default({ input: [], output: [] }),
    tasks: z.array(FlogoTaskSchema).default([]),
    links: z.array(FlogoLinkSchema).default([])
  }).passthrough()
}).passthrough();
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
  properties: z.array(FlogoPropertySchema).default([]),
  channels: z.array(z.string()).default([]),
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

export const ContribTypeSchema = z.enum(["trigger", "activity", "action"]);
export type ContribType = z.infer<typeof ContribTypeSchema>;

export const ContribEvidenceSourceSchema = z.enum([
  "descriptor",
  "app_descriptor",
  "workspace_descriptor",
  "package_descriptor",
  "package_source",
  "registry",
  "inferred",
  "flow_resource"
]);
export type ContribEvidenceSource = z.infer<typeof ContribEvidenceSourceSchema>;

export const EvidenceConfidenceSchema = z.enum(["high", "medium", "low"]);
export type EvidenceConfidence = z.infer<typeof EvidenceConfidenceSchema>;

export const ContribFieldSchema = z.object({
  name: z.string(),
  type: z.string().optional(),
  required: z.boolean().default(false),
  description: z.string().optional()
});
export type ContribField = z.infer<typeof ContribFieldSchema>;

export const ContribResolutionEvidenceSchema = z.object({
  source: ContribEvidenceSourceSchema,
  resolvedRef: z.string(),
  descriptorPath: z.string().optional(),
  packageRoot: z.string().optional(),
  modulePath: z.string().optional(),
  goPackagePath: z.string().optional(),
  importAlias: z.string().optional(),
  version: z.string().optional(),
  confidence: EvidenceConfidenceSchema.default("low"),
  packageDescriptorFound: z.boolean().default(false),
  packageMetadataFound: z.boolean().default(false),
  versionSource: z.enum(["descriptor", "package", "import", "unknown"]).optional(),
  signatureCompleteness: z.enum(["complete", "partial", "minimal"]).default("minimal"),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type ContribResolutionEvidence = z.infer<typeof ContribResolutionEvidenceSchema>;

export const ContribDescriptorSchema = z.object({
  ref: z.string(),
  alias: z.string().optional(),
  type: ContribTypeSchema,
  name: z.string(),
  version: z.string().optional(),
  title: z.string().optional(),
  settings: z.array(ContribFieldSchema).default([]),
  handlerSettings: z.array(ContribFieldSchema).default([]),
  inputs: z.array(ContribFieldSchema).default([]),
  outputs: z.array(ContribFieldSchema).default([]),
  reply: z.array(ContribFieldSchema).default([]),
  examples: z.array(z.string()).default([]),
  compatibilityNotes: z.array(z.string()).default([]),
  source: z.string().optional(),
  evidence: ContribResolutionEvidenceSchema.optional()
});
export type ContribDescriptor = z.infer<typeof ContribDescriptorSchema>;

export const ContribCatalogSchema = z.object({
  appName: z.string().optional(),
  entries: z.array(ContribDescriptorSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type ContribCatalog = z.infer<typeof ContribCatalogSchema>;

export const ContribCatalogResponseSchema = z.object({
  catalog: ContribCatalogSchema,
  artifact: ArtifactRefSchema.optional()
});
export type ContribCatalogResponse = z.infer<typeof ContribCatalogResponseSchema>;

export const ContributionInventoryEntrySchema = z.object({
  ref: z.string(),
  alias: z.string().optional(),
  type: ContribTypeSchema,
  name: z.string(),
  version: z.string().optional(),
  title: z.string().optional(),
  source: ContribEvidenceSourceSchema,
  descriptorPath: z.string().optional(),
  packageRoot: z.string().optional(),
  modulePath: z.string().optional(),
  goPackagePath: z.string().optional(),
  confidence: EvidenceConfidenceSchema.default("low"),
  discoveryReason: z.string().optional(),
  packageDescriptorFound: z.boolean().default(false),
  packageMetadataFound: z.boolean().default(false),
  versionSource: z.enum(["descriptor", "package", "import", "unknown"]).optional(),
  signatureCompleteness: z.enum(["complete", "partial", "minimal"]).default("minimal"),
  settings: z.array(ContribFieldSchema).default([]),
  inputs: z.array(ContribFieldSchema).default([]),
  outputs: z.array(ContribFieldSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([]),
  descriptor: ContribDescriptorSchema.optional()
});
export type ContributionInventoryEntry = z.infer<typeof ContributionInventoryEntrySchema>;

export const ContributionInventorySchema = z.object({
  appName: z.string().optional(),
  entries: z.array(ContributionInventoryEntrySchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type ContributionInventory = z.infer<typeof ContributionInventorySchema>;

export const ContributionInventoryResponseSchema = z.object({
  inventory: ContributionInventorySchema,
  artifact: ArtifactRefSchema.optional()
});
export type ContributionInventoryResponse = z.infer<typeof ContributionInventoryResponseSchema>;

export const ContribEvidenceDetailSchema = ContributionInventoryEntrySchema.extend({
  descriptor: ContribDescriptorSchema.optional()
});
export type ContribEvidenceDetail = z.infer<typeof ContribEvidenceDetailSchema>;

export const ContribEvidenceResponseSchema = z.object({
  evidence: ContribEvidenceDetailSchema,
  artifact: ArtifactRefSchema.optional()
});
export type ContribEvidenceResponse = z.infer<typeof ContribEvidenceResponseSchema>;

export const ContribDescriptorResponseSchema = z.object({
  descriptor: ContribDescriptorSchema,
  diagnostics: z.array(DiagnosticSchema).default([]),
  artifact: ArtifactRefSchema.optional()
});
export type ContribDescriptorResponse = z.infer<typeof ContribDescriptorResponseSchema>;

export const ContributionKindSchema = z.enum(["activity", "action", "trigger"]);
export type ContributionKind = z.infer<typeof ContributionKindSchema>;

export const ActivityScaffoldRequestSchema = z.object({
  activityName: z.string().min(1),
  modulePath: z.string().min(1),
  packageName: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1).default("0.0.1"),
  homepage: z.string().min(1).optional(),
  settings: z.array(ContribFieldSchema).default([]),
  inputs: z.array(ContribFieldSchema).default([]),
  outputs: z.array(ContribFieldSchema).default([]),
  usage: z.string().optional()
}).superRefine((value, ctx) => {
  const supportedTypes = new Set(["string", "integer", "number", "boolean", "object", "array", "any"]);
  for (const [group, fields] of [["settings", value.settings], ["inputs", value.inputs], ["outputs", value.outputs]] as const) {
    fields.forEach((field, index) => {
      const normalized = (field.type ?? "any").trim().toLowerCase();
      if (!supportedTypes.has(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsupported activity scaffold field type ${JSON.stringify(field.type)}. Supported types: string, integer, number, boolean, object, array, any.`,
          path: [group, index, "type"]
        });
      }
    });
  }
});
export type ActivityScaffoldRequest = z.infer<typeof ActivityScaffoldRequestSchema>;

export const ActionScaffoldRequestSchema = z.object({
  actionName: z.string().min(1),
  modulePath: z.string().min(1),
  packageName: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1).default("0.0.1"),
  homepage: z.string().min(1).optional(),
  settings: z.array(ContribFieldSchema).default([]),
  inputs: z.array(ContribFieldSchema).default([]),
  outputs: z.array(ContribFieldSchema).default([]),
  usage: z.string().optional()
}).superRefine((value, ctx) => {
  const supportedTypes = new Set(["string", "integer", "number", "boolean", "object", "array", "any"]);
  for (const [group, fields] of [["settings", value.settings], ["inputs", value.inputs], ["outputs", value.outputs]] as const) {
    fields.forEach((field, index) => {
      const normalized = (field.type ?? "any").trim().toLowerCase();
      if (!supportedTypes.has(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsupported action scaffold field type ${JSON.stringify(field.type)}. Supported types: string, integer, number, boolean, object, array, any.`,
          path: [group, index, "type"]
        });
      }
    });
  }
});
export type ActionScaffoldRequest = z.infer<typeof ActionScaffoldRequestSchema>;

export const TriggerScaffoldRequestSchema = z.object({
  triggerName: z.string().min(1),
  modulePath: z.string().min(1),
  packageName: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  version: z.string().min(1).default("0.0.1"),
  homepage: z.string().min(1).optional(),
  settings: z.array(ContribFieldSchema).default([]),
  handlerSettings: z.array(ContribFieldSchema).default([]),
  outputs: z.array(ContribFieldSchema).default([]),
  replies: z.array(ContribFieldSchema).default([]),
  usage: z.string().optional()
}).superRefine((value, ctx) => {
  const supportedTypes = new Set(["string", "integer", "number", "boolean", "object", "array", "any"]);
  for (const [group, fields] of [
    ["settings", value.settings],
    ["handlerSettings", value.handlerSettings],
    ["outputs", value.outputs],
    ["replies", value.replies]
  ] as const) {
    fields.forEach((field, index) => {
      const normalized = (field.type ?? "any").trim().toLowerCase();
      if (!supportedTypes.has(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsupported trigger scaffold field type ${JSON.stringify(field.type)}. Supported types: string, integer, number, boolean, object, array, any.`,
          path: [group, index, "type"]
        });
      }
    });
  }
});
export type TriggerScaffoldRequest = z.infer<typeof TriggerScaffoldRequestSchema>;

export const ContribGeneratedFileSchema = z.object({
  path: z.string(),
  kind: z.enum(["descriptor", "metadata", "implementation", "test", "module", "readme"]),
  bytes: z.number().int().nonnegative(),
  content: z.string().optional()
});
export type ContribGeneratedFile = z.infer<typeof ContribGeneratedFileSchema>;

export const ContribProofStepSchema = z.object({
  kind: z.enum(["build", "test"]),
  ok: z.boolean(),
  command: z.array(z.string()).default([]),
  exitCode: z.number().int(),
  summary: z.string(),
  output: z.string().default("")
});
export type ContribProofStep = z.infer<typeof ContribProofStepSchema>;

export const ActivityScaffoldBundleSchema = z.object({
  kind: z.literal("activity"),
  modulePath: z.string(),
  packageName: z.string(),
  bundleRoot: z.string(),
  descriptor: ContribDescriptorSchema,
  files: z.array(ContribGeneratedFileSchema).default([]),
  readmePath: z.string().optional()
});
export type ActivityScaffoldBundle = z.infer<typeof ActivityScaffoldBundleSchema>;

export const ActionScaffoldBundleSchema = z.object({
  kind: z.literal("action"),
  modulePath: z.string(),
  packageName: z.string(),
  bundleRoot: z.string(),
  descriptor: ContribDescriptorSchema,
  files: z.array(ContribGeneratedFileSchema).default([]),
  readmePath: z.string().optional()
});
export type ActionScaffoldBundle = z.infer<typeof ActionScaffoldBundleSchema>;

export const TriggerScaffoldBundleSchema = z.object({
  kind: z.literal("trigger"),
  modulePath: z.string(),
  packageName: z.string(),
  bundleRoot: z.string(),
  descriptor: ContribDescriptorSchema,
  files: z.array(ContribGeneratedFileSchema).default([]),
  readmePath: z.string().optional()
});
export type TriggerScaffoldBundle = z.infer<typeof TriggerScaffoldBundleSchema>;

export const ContributionScaffoldBundleSchema = z.discriminatedUnion("kind", [
  ActivityScaffoldBundleSchema,
  ActionScaffoldBundleSchema,
  TriggerScaffoldBundleSchema
]);
export type ContributionScaffoldBundle = z.infer<typeof ContributionScaffoldBundleSchema>;

export const ActivityScaffoldResultSchema = z.object({
  bundle: ActivityScaffoldBundleSchema,
  validation: ValidationReportSchema,
  build: ContribProofStepSchema,
  test: ContribProofStepSchema
});
export type ActivityScaffoldResult = z.infer<typeof ActivityScaffoldResultSchema>;

export const ActivityScaffoldResponseSchema = z.object({
  result: ActivityScaffoldResultSchema
});
export type ActivityScaffoldResponse = z.infer<typeof ActivityScaffoldResponseSchema>;

export const ActionScaffoldResultSchema = z.object({
  bundle: ActionScaffoldBundleSchema,
  validation: ValidationReportSchema,
  build: ContribProofStepSchema,
  test: ContribProofStepSchema
});
export type ActionScaffoldResult = z.infer<typeof ActionScaffoldResultSchema>;

export const ActionScaffoldResponseSchema = z.object({
  result: ActionScaffoldResultSchema
});
export type ActionScaffoldResponse = z.infer<typeof ActionScaffoldResponseSchema>;

export const TriggerScaffoldResultSchema = z.object({
  bundle: TriggerScaffoldBundleSchema,
  validation: ValidationReportSchema,
  build: ContribProofStepSchema,
  test: ContribProofStepSchema
});
export type TriggerScaffoldResult = z.infer<typeof TriggerScaffoldResultSchema>;

export const TriggerScaffoldResponseSchema = z.object({
  result: TriggerScaffoldResultSchema
});
export type TriggerScaffoldResponse = z.infer<typeof TriggerScaffoldResponseSchema>;

export const ContributionScaffoldResultSchema = z.object({
  bundle: ContributionScaffoldBundleSchema,
  validation: ValidationReportSchema,
  build: ContribProofStepSchema,
  test: ContribProofStepSchema
});
export type ContributionScaffoldResult = z.infer<typeof ContributionScaffoldResultSchema>;

export const ContributionBundleArtifactSchema = ArtifactRefSchema.extend({
  type: z.literal("contrib_bundle"),
  metadata: z.record(z.string(), z.unknown())
});
export type ContributionBundleArtifact = z.infer<typeof ContributionBundleArtifactSchema>;

export const ContributionPackageArtifactSchema = ArtifactRefSchema.extend({
  type: z.literal("contrib_package"),
  metadata: z.record(z.string(), z.unknown())
});
export type ContributionPackageArtifact = z.infer<typeof ContributionPackageArtifactSchema>;

export const ContributionInstallPlanArtifactSchema = ArtifactRefSchema.extend({
  type: z.literal("contrib_install_plan"),
  metadata: z.record(z.string(), z.unknown())
});
export type ContributionInstallPlanArtifact = z.infer<typeof ContributionInstallPlanArtifactSchema>;

export const ContributionUpdatePlanArtifactSchema = ArtifactRefSchema.extend({
  type: z.literal("contrib_update_plan"),
  metadata: z.record(z.string(), z.unknown())
});
export type ContributionUpdatePlanArtifact = z.infer<typeof ContributionUpdatePlanArtifactSchema>;

export const ContributionInstallDiffPlanArtifactSchema = ArtifactRefSchema.extend({
  type: z.literal("contrib_install_diff_plan"),
  metadata: z.record(z.string(), z.unknown())
});
export type ContributionInstallDiffPlanArtifact = z.infer<typeof ContributionInstallDiffPlanArtifactSchema>;

export const ContributionUpdateDiffPlanArtifactSchema = ArtifactRefSchema.extend({
  type: z.literal("contrib_update_diff_plan"),
  metadata: z.record(z.string(), z.unknown())
});
export type ContributionUpdateDiffPlanArtifact = z.infer<typeof ContributionUpdateDiffPlanArtifactSchema>;

export const ContributionInstallApplyResultArtifactSchema = ArtifactRefSchema.extend({
  type: z.literal("contrib_install_apply_result"),
  metadata: z.record(z.string(), z.unknown())
});
export type ContributionInstallApplyResultArtifact = z.infer<typeof ContributionInstallApplyResultArtifactSchema>;

const contributionBundleInputShape = {
  bundleArtifactId: z.string().min(1).optional(),
  bundleArtifact: ContributionBundleArtifactSchema.optional(),
  result: ContributionScaffoldResultSchema.optional()
} as const;

function validateContributionBundleInput(
  value: {
    bundleArtifactId?: string;
    bundleArtifact?: ContributionBundleArtifact;
    result?: ContributionScaffoldResult;
  },
  ctx: z.RefinementCtx
) {
  if (!value.bundleArtifactId && !value.bundleArtifact && !value.result) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide bundleArtifactId, bundleArtifact, or result.",
      path: ["bundleArtifactId"]
    });
  }
}

export const ContributionValidateRequestSchema = z.object(contributionBundleInputShape).superRefine(validateContributionBundleInput);
export type ContributionValidateRequest = z.infer<typeof ContributionValidateRequestSchema>;

export const ContributionEvidenceSourceSchema = z.enum(["inline_result", "bundle_artifact"]);
export type ContributionEvidenceSource = z.infer<typeof ContributionEvidenceSourceSchema>;

export const ContributionValidateResultSchema = z.object({
  bundle: ContributionScaffoldBundleSchema,
  validation: ValidationReportSchema,
  build: ContribProofStepSchema,
  test: ContribProofStepSchema,
  source: ContributionEvidenceSourceSchema,
  sourceArtifactId: z.string().optional()
});
export type ContributionValidateResult = z.infer<typeof ContributionValidateResultSchema>;

export const ContributionValidateResponseSchema = z.object({
  result: ContributionValidateResultSchema
});
export type ContributionValidateResponse = z.infer<typeof ContributionValidateResponseSchema>;

export const ContributionPackageFormatSchema = z.enum(["zip"]);
export type ContributionPackageFormat = z.infer<typeof ContributionPackageFormatSchema>;

export const ContributionPackageArchiveSchema = z.object({
  format: ContributionPackageFormatSchema.default("zip"),
  fileName: z.string(),
  path: z.string(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().min(1),
  base64: z.string().min(1)
});
export type ContributionPackageArchive = z.infer<typeof ContributionPackageArchiveSchema>;

export const ContributionPackageRequestSchema = z.object({
  ...contributionBundleInputShape,
  format: ContributionPackageFormatSchema.default("zip")
}).superRefine(validateContributionBundleInput);
export type ContributionPackageRequest = z.infer<typeof ContributionPackageRequestSchema>;

export const ContributionPackageResultSchema = ContributionValidateResultSchema.extend({
  package: ContributionPackageArchiveSchema
});
export type ContributionPackageResult = z.infer<typeof ContributionPackageResultSchema>;

export const ContributionPackageResponseSchema = z.object({
  result: ContributionPackageResultSchema
});
export type ContributionPackageResponse = z.infer<typeof ContributionPackageResponseSchema>;

export const ContributionInstallSourceSchema = z.enum([
  "inline_result",
  "bundle_artifact",
  "inline_package",
  "package_artifact"
]);
export type ContributionInstallSource = z.infer<typeof ContributionInstallSourceSchema>;

export const ContributionInstallReadinessSchema = z.enum(["high", "medium", "low"]);
export type ContributionInstallReadiness = z.infer<typeof ContributionInstallReadinessSchema>;

export const ContributionInstallSurfaceSchema = z.enum(["activityRef", "actionRef", "triggerRef"]);
export type ContributionInstallSurface = z.infer<typeof ContributionInstallSurfaceSchema>;

export const ContributionInstallImportActionSchema = z.enum([
  "existing",
  "predicted",
  "add",
  "reuse_existing",
  "keep_existing",
  "replace_existing",
  "update_existing",
  "conflict"
]);
export type ContributionInstallImportAction = z.infer<typeof ContributionInstallImportActionSchema>;

export const ContributionInstallRefEntrySchema = z.object({
  surface: ContributionInstallSurfaceSchema,
  value: z.string(),
  note: z.string().optional()
});
export type ContributionInstallRefEntry = z.infer<typeof ContributionInstallRefEntrySchema>;

export const ContributionInstallImportEntrySchema = z.object({
  alias: z.string(),
  ref: z.string(),
  version: z.string().optional(),
  action: ContributionInstallImportActionSchema,
  existingAlias: z.string().optional(),
  existingRef: z.string().optional(),
  note: z.string().optional()
});
export type ContributionInstallImportEntry = z.infer<typeof ContributionInstallImportEntrySchema>;

export const ContributionInstallConflictKindSchema = z.enum([
  "alias_conflict",
  "ref_already_imported",
  "version_conflict",
  "type_conflict",
  "insufficient_metadata",
  "unsupported_source",
  "ambiguous_match",
  "no_installed_match",
  "alias_change_requires_rewire"
]);
export type ContributionInstallConflictKind = z.infer<typeof ContributionInstallConflictKindSchema>;

export const ContributionInstallConflictSchema = z.object({
  kind: ContributionInstallConflictKindSchema,
  severity: DiagnosticSeveritySchema.default("warning"),
  message: z.string(),
  existingAlias: z.string().optional(),
  existingRef: z.string().optional(),
  proposedAlias: z.string().optional(),
  proposedRef: z.string().optional()
});
export type ContributionInstallConflict = z.infer<typeof ContributionInstallConflictSchema>;

export const ContributionInstallTargetSchema = z.object({
  projectId: z.string().optional(),
  appId: z.string().optional(),
  appPath: z.string().optional(),
  appName: z.string().optional()
});
export type ContributionInstallTarget = z.infer<typeof ContributionInstallTargetSchema>;

export const ContributionInstallPredictedChangesSchema = z.object({
  importsToAdd: z.array(ContributionInstallImportEntrySchema).default([]),
  importsToUpdate: z.array(ContributionInstallImportEntrySchema).default([]),
  reusableRefs: z.array(ContributionInstallRefEntrySchema).default([]),
  summaryLines: z.array(z.string()).default([]),
  noMutation: z.literal(true).default(true)
});
export type ContributionInstallPredictedChanges = z.infer<typeof ContributionInstallPredictedChangesSchema>;

const contributionInstallInputShape = {
  bundleArtifactId: z.string().min(1).optional(),
  bundleArtifact: ContributionBundleArtifactSchema.optional(),
  packageArtifactId: z.string().min(1).optional(),
  packageArtifact: ContributionPackageArtifactSchema.optional(),
  result: ContributionScaffoldResultSchema.optional(),
  packageResult: ContributionPackageResultSchema.optional(),
  targetApp: ContributionInstallTargetSchema.default({}),
  preferredAlias: z.string().min(1).optional(),
  replaceExisting: z.boolean().default(false)
} as const;

function validateContributionInstallInput(
  value: {
    bundleArtifactId?: string;
    bundleArtifact?: ContributionBundleArtifact;
    packageArtifactId?: string;
    packageArtifact?: ContributionPackageArtifact;
    result?: ContributionScaffoldResult;
    packageResult?: ContributionPackageResult;
  },
  ctx: z.RefinementCtx
) {
  const bundleSupplied = Boolean(value.bundleArtifactId || value.bundleArtifact || value.result);
  const packageSupplied = Boolean(value.packageArtifactId || value.packageArtifact || value.packageResult);
  if (!bundleSupplied && !packageSupplied) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide one contribution source via bundleArtifactId, bundleArtifact, result, packageArtifactId, packageArtifact, or packageResult.",
      path: ["bundleArtifactId"]
    });
  }
  if (bundleSupplied && packageSupplied) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either one bundle source or one package source, not both.",
      path: ["bundleArtifactId"]
    });
  }
}

export const ContributionInstallPlanRequestSchema = z.object(contributionInstallInputShape).superRefine(validateContributionInstallInput);
export type ContributionInstallPlanRequest = z.infer<typeof ContributionInstallPlanRequestSchema>;

export const ContributionInstallPlanResultSchema = z.object({
  contributionKind: ContributionKindSchema,
  source: ContributionInstallSourceSchema,
  sourceArtifactId: z.string().optional(),
  targetApp: ContributionInstallTargetSchema,
  bundle: ContributionScaffoldBundleSchema,
  package: ContributionPackageArchiveSchema.optional(),
  modulePath: z.string(),
  packageName: z.string().optional(),
  packagePath: z.string().optional(),
  descriptorRef: z.string().optional(),
  appFingerprint: z.string().optional(),
  planFingerprint: z.string().optional(),
  selectedAlias: z.string(),
  installReady: z.boolean(),
  readiness: ContributionInstallReadinessSchema,
  proposedImports: z.array(ContributionInstallImportEntrySchema).default([]),
  proposedRefs: z.array(ContributionInstallRefEntrySchema).default([]),
  predictedChanges: ContributionInstallPredictedChangesSchema.default({
    importsToAdd: [],
    importsToUpdate: [],
    reusableRefs: [],
    summaryLines: [],
    noMutation: true
  }),
  warnings: z.array(z.string()).default([]),
  conflicts: z.array(ContributionInstallConflictSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([]),
  recommendedNextAction: z.string(),
  limitations: z.array(z.string()).default([])
});
export type ContributionInstallPlanResult = z.infer<typeof ContributionInstallPlanResultSchema>;

export const ContributionInstallPlanResponseSchema = z.object({
  result: ContributionInstallPlanResultSchema
});
export type ContributionInstallPlanResponse = z.infer<typeof ContributionInstallPlanResponseSchema>;

export const ContributionUpdateMatchQualitySchema = z.enum(["exact", "likely", "ambiguous", "none"]);
export type ContributionUpdateMatchQuality = z.infer<typeof ContributionUpdateMatchQualitySchema>;

export const ContributionUpdateCompatibilitySchema = z.enum(["compatible", "incompatible", "ambiguous", "not_installed"]);
export type ContributionUpdateCompatibility = z.infer<typeof ContributionUpdateCompatibilitySchema>;

export const ContributionUpdateInstalledContributionSchema = z.object({
  alias: z.string().optional(),
  ref: z.string().optional(),
  version: z.string().optional(),
  type: z.string().optional(),
  modulePath: z.string().optional(),
  packagePath: z.string().optional(),
  packageName: z.string().optional(),
  matchedBy: z.array(z.string()).default([]),
  confidence: z.enum(["high", "medium", "low"]).default("low")
});
export type ContributionUpdateInstalledContribution = z.infer<typeof ContributionUpdateInstalledContributionSchema>;

export const ContributionUpdatePredictedChangesSchema = z.object({
  importsToReplace: z.array(ContributionInstallImportEntrySchema).default([]),
  importsToKeep: z.array(ContributionInstallImportEntrySchema).default([]),
  importsToAdd: z.array(ContributionInstallImportEntrySchema).default([]),
  importsToRemove: z.array(ContributionInstallImportEntrySchema).default([]),
  refsToReplace: z.array(ContributionInstallRefEntrySchema).default([]),
  refsToKeep: z.array(ContributionInstallRefEntrySchema).default([]),
  refsToAdd: z.array(ContributionInstallRefEntrySchema).default([]),
  refsToRemove: z.array(ContributionInstallRefEntrySchema).default([]),
  changedPaths: z.array(z.string()).default([]),
  summaryLines: z.array(z.string()).default([]),
  noMutation: z.literal(true).default(true)
});
export type ContributionUpdatePredictedChanges = z.infer<typeof ContributionUpdatePredictedChangesSchema>;

export const ContributionUpdatePlanRequestSchema = z.object(contributionInstallInputShape).superRefine(validateContributionInstallInput);
export type ContributionUpdatePlanRequest = z.infer<typeof ContributionUpdatePlanRequestSchema>;

export const ContributionUpdatePlanResultSchema = z.object({
  contributionKind: ContributionKindSchema,
  source: ContributionInstallSourceSchema,
  sourceArtifactId: z.string().optional(),
  targetApp: ContributionInstallTargetSchema,
  bundle: ContributionScaffoldBundleSchema,
  package: ContributionPackageArchiveSchema.optional(),
  modulePath: z.string(),
  packageName: z.string().optional(),
  packagePath: z.string().optional(),
  descriptorRef: z.string().optional(),
  appFingerprint: z.string().optional(),
  planFingerprint: z.string().optional(),
  selectedAlias: z.string(),
  detectedInstalledContribution: ContributionUpdateInstalledContributionSchema.optional(),
  matchQuality: ContributionUpdateMatchQualitySchema,
  compatibility: ContributionUpdateCompatibilitySchema,
  updateReady: z.boolean(),
  readiness: ContributionInstallReadinessSchema,
  predictedChanges: ContributionUpdatePredictedChangesSchema.default({
    importsToReplace: [],
    importsToKeep: [],
    importsToAdd: [],
    importsToRemove: [],
    refsToReplace: [],
    refsToKeep: [],
    refsToAdd: [],
    refsToRemove: [],
    changedPaths: [],
    summaryLines: [],
    noMutation: true
  }),
  warnings: z.array(z.string()).default([]),
  conflicts: z.array(ContributionInstallConflictSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([]),
  recommendedNextAction: z.string(),
  limitations: z.array(z.string()).default([])
});
export type ContributionUpdatePlanResult = z.infer<typeof ContributionUpdatePlanResultSchema>;

export const ContributionUpdatePlanResponseSchema = z.object({
  result: ContributionUpdatePlanResultSchema
});
export type ContributionUpdatePlanResponse = z.infer<typeof ContributionUpdatePlanResponseSchema>;

const contributionInstallDiffPlanInputShape = {
  installPlanArtifactId: z.string().min(1).optional(),
  installPlanArtifact: ContributionInstallPlanArtifactSchema.optional(),
  installPlanResult: ContributionInstallPlanResultSchema.optional(),
  targetApp: ContributionInstallTargetSchema.default({})
} as const;

function validateContributionInstallDiffPlanInput(
  value: {
    installPlanArtifactId?: string;
    installPlanArtifact?: ContributionInstallPlanArtifact;
    installPlanResult?: ContributionInstallPlanResult;
  },
  ctx: z.RefinementCtx
) {
  const sourceCount = [
    value.installPlanArtifactId,
    value.installPlanArtifact,
    value.installPlanResult
  ].filter(Boolean).length;

  if (sourceCount === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide installPlanArtifactId, installPlanArtifact, or installPlanResult.",
      path: ["installPlanArtifactId"]
    });
  }
}

export const ContributionInstallDiffChangeSchema = z.object({
  path: z.string(),
  changeType: z.enum(["add", "update", "reuse", "none"]),
  summary: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional()
});
export type ContributionInstallDiffChange = z.infer<typeof ContributionInstallDiffChangeSchema>;

export const ContributionInstallDiffSourceSchema = z.object({
  kind: ContributionKindSchema,
  modulePath: z.string(),
  packageName: z.string().optional(),
  packagePath: z.string().optional(),
  descriptorRef: z.string().optional(),
  selectedAlias: z.string(),
  source: ContributionInstallSourceSchema,
  sourceArtifactId: z.string().optional()
});
export type ContributionInstallDiffSource = z.infer<typeof ContributionInstallDiffSourceSchema>;

export const ContributionInstallDiffPlanBasisSchema = z.object({
  sourceArtifactId: z.string().optional(),
  appFingerprint: z.string().optional(),
  planFingerprint: z.string().optional(),
  targetApp: ContributionInstallTargetSchema.optional()
});
export type ContributionInstallDiffPlanBasis = z.infer<typeof ContributionInstallDiffPlanBasisSchema>;

export const ContributionInstallDiffPredictedChangesSchema = z.object({
  importsBefore: z.array(ContributionInstallImportEntrySchema).default([]),
  importsAfter: z.array(ContributionInstallImportEntrySchema).default([]),
  importsToAdd: z.array(ContributionInstallImportEntrySchema).default([]),
  importsToUpdate: z.array(ContributionInstallImportEntrySchema).default([]),
  aliasesToAdd: z.array(z.string()).default([]),
  refsToAdd: z.array(ContributionInstallRefEntrySchema).default([]),
  refsToReuse: z.array(ContributionInstallRefEntrySchema).default([]),
  structuralChanges: z.array(z.string()).default([]),
  changedPaths: z.array(z.string()).default([]),
  diffEntries: z.array(ContributionInstallDiffChangeSchema).default([]),
  noMutation: z.literal(true).default(true)
});
export type ContributionInstallDiffPredictedChanges = z.infer<typeof ContributionInstallDiffPredictedChangesSchema>;

export const ContributionInstallDiffPlanRequestSchema = z.object(contributionInstallDiffPlanInputShape).superRefine(validateContributionInstallDiffPlanInput);
export type ContributionInstallDiffPlanRequest = z.infer<typeof ContributionInstallDiffPlanRequestSchema>;

export const ContributionInstallDiffPlanResultSchema = z.object({
  contributionKind: ContributionKindSchema,
  sourceContribution: ContributionInstallDiffSourceSchema,
  targetApp: ContributionInstallTargetSchema,
  basedOnInstallPlan: ContributionInstallDiffPlanBasisSchema,
  appFingerprintBefore: z.string(),
  appFingerprintAfter: z.string().optional(),
  installPlanFingerprint: z.string().optional(),
  isStale: z.boolean(),
  staleReason: z.string().optional(),
  previewAvailable: z.boolean(),
  installReady: z.boolean(),
  readiness: ContributionInstallReadinessSchema,
  warnings: z.array(z.string()).default([]),
  conflicts: z.array(ContributionInstallConflictSchema).default([]),
  limitations: z.array(z.string()).default([]),
  predictedChanges: ContributionInstallDiffPredictedChangesSchema.default({
    importsBefore: [],
    importsAfter: [],
    importsToAdd: [],
    importsToUpdate: [],
    aliasesToAdd: [],
    refsToAdd: [],
    refsToReuse: [],
    structuralChanges: [],
    changedPaths: [],
    diffEntries: [],
    noMutation: true
  }),
  diffSummary: z.array(z.string()).default([]),
  canonicalBeforeJson: z.string(),
  canonicalAfterJson: z.string().optional(),
  recommendedNextAction: z.string()
});
export type ContributionInstallDiffPlanResult = z.infer<typeof ContributionInstallDiffPlanResultSchema>;

export const ContributionInstallDiffPlanResponseSchema = z.object({
  result: ContributionInstallDiffPlanResultSchema
});
export type ContributionInstallDiffPlanResponse = z.infer<typeof ContributionInstallDiffPlanResponseSchema>;

const contributionUpdateDiffPlanInputShape = {
  updatePlanArtifactId: z.string().min(1).optional(),
  updatePlanArtifact: ContributionUpdatePlanArtifactSchema.optional(),
  updatePlanResult: ContributionUpdatePlanResultSchema.optional(),
  targetApp: ContributionInstallTargetSchema.default({})
} as const;

function validateContributionUpdateDiffPlanInput(
  value: {
    updatePlanArtifactId?: string;
    updatePlanArtifact?: ContributionUpdatePlanArtifact;
    updatePlanResult?: ContributionUpdatePlanResult;
  },
  ctx: z.RefinementCtx
) {
  const sourceCount = [
    value.updatePlanArtifactId,
    value.updatePlanArtifact,
    value.updatePlanResult
  ].filter(Boolean).length;

  if (sourceCount === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide updatePlanArtifactId, updatePlanArtifact, or updatePlanResult.",
      path: ["updatePlanArtifactId"]
    });
  }
}

export const ContributionUpdateDiffPlanBasisSchema = z.object({
  sourceArtifactId: z.string().optional(),
  appFingerprint: z.string().optional(),
  planFingerprint: z.string().optional(),
  targetApp: ContributionInstallTargetSchema.optional()
});
export type ContributionUpdateDiffPlanBasis = z.infer<typeof ContributionUpdateDiffPlanBasisSchema>;

export const ContributionUpdateDiffPredictedChangesSchema = z.object({
  importsBefore: z.array(ContributionInstallImportEntrySchema).default([]),
  importsAfter: z.array(ContributionInstallImportEntrySchema).default([]),
  importsToReplace: z.array(ContributionInstallImportEntrySchema).default([]),
  importsToKeep: z.array(ContributionInstallImportEntrySchema).default([]),
  importsToAdd: z.array(ContributionInstallImportEntrySchema).default([]),
  importsToRemove: z.array(ContributionInstallImportEntrySchema).default([]),
  refsToReplace: z.array(ContributionInstallRefEntrySchema).default([]),
  refsToKeep: z.array(ContributionInstallRefEntrySchema).default([]),
  refsToAdd: z.array(ContributionInstallRefEntrySchema).default([]),
  refsToRemove: z.array(ContributionInstallRefEntrySchema).default([]),
  structuralChanges: z.array(z.string()).default([]),
  changedPaths: z.array(z.string()).default([]),
  diffEntries: z.array(ContributionInstallDiffChangeSchema).default([]),
  noMutation: z.literal(true).default(true)
});
export type ContributionUpdateDiffPredictedChanges = z.infer<typeof ContributionUpdateDiffPredictedChangesSchema>;

export const ContributionUpdateDiffPlanRequestSchema = z.object(contributionUpdateDiffPlanInputShape).superRefine(validateContributionUpdateDiffPlanInput);
export type ContributionUpdateDiffPlanRequest = z.infer<typeof ContributionUpdateDiffPlanRequestSchema>;

export const ContributionUpdateDiffPlanResultSchema = z.object({
  contributionKind: ContributionKindSchema,
  sourceContribution: ContributionInstallDiffSourceSchema,
  detectedInstalledContribution: ContributionUpdateInstalledContributionSchema.optional(),
  targetApp: ContributionInstallTargetSchema,
  basedOnUpdatePlan: ContributionUpdateDiffPlanBasisSchema,
  appFingerprintBefore: z.string(),
  appFingerprintAfter: z.string().optional(),
  updatePlanFingerprint: z.string().optional(),
  isStale: z.boolean(),
  staleReason: z.string().optional(),
  previewAvailable: z.boolean(),
  updateReady: z.boolean(),
  readiness: ContributionInstallReadinessSchema,
  warnings: z.array(z.string()).default([]),
  conflicts: z.array(ContributionInstallConflictSchema).default([]),
  limitations: z.array(z.string()).default([]),
  predictedChanges: ContributionUpdateDiffPredictedChangesSchema.default({
    importsBefore: [],
    importsAfter: [],
    importsToReplace: [],
    importsToKeep: [],
    importsToAdd: [],
    importsToRemove: [],
    refsToReplace: [],
    refsToKeep: [],
    refsToAdd: [],
    refsToRemove: [],
    structuralChanges: [],
    changedPaths: [],
    diffEntries: [],
    noMutation: true
  }),
  diffSummary: z.array(z.string()).default([]),
  canonicalBeforeJson: z.string(),
  canonicalAfterJson: z.string().optional(),
  recommendedNextAction: z.string()
});
export type ContributionUpdateDiffPlanResult = z.infer<typeof ContributionUpdateDiffPlanResultSchema>;

export const ContributionUpdateDiffPlanResponseSchema = z.object({
  result: ContributionUpdateDiffPlanResultSchema
});
export type ContributionUpdateDiffPlanResponse = z.infer<typeof ContributionUpdateDiffPlanResponseSchema>;

const contributionInstallApplyInputShape = {
  installDiffArtifactId: z.string().min(1).optional(),
  installDiffArtifact: ContributionInstallDiffPlanArtifactSchema.optional(),
  installDiffResult: ContributionInstallDiffPlanResultSchema.optional(),
  targetApp: ContributionInstallTargetSchema.default({})
} as const;

function validateContributionInstallApplyInput(
  value: {
    installDiffArtifactId?: string;
    installDiffArtifact?: ContributionInstallDiffPlanArtifact;
    installDiffResult?: ContributionInstallDiffPlanResult;
  },
  ctx: z.RefinementCtx
) {
  const sourceCount = [
    value.installDiffArtifactId,
    value.installDiffArtifact,
    value.installDiffResult
  ].filter(Boolean).length;

  if (sourceCount === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide installDiffArtifactId, installDiffArtifact, or installDiffResult.",
      path: ["installDiffArtifactId"]
    });
  }
}

export const ContributionInstallApplyRequestSchema = z
  .object(contributionInstallApplyInputShape)
  .superRefine(validateContributionInstallApplyInput);
export type ContributionInstallApplyRequest = z.infer<typeof ContributionInstallApplyRequestSchema>;

export const ContributionInstallApplyBasisSchema = z.object({
  sourceArtifactId: z.string().optional(),
  installPlanArtifactId: z.string().optional(),
  diffFingerprint: z.string().optional(),
  appFingerprintBefore: z.string().optional(),
  appFingerprintPreview: z.string().optional(),
  targetApp: ContributionInstallTargetSchema.optional()
});
export type ContributionInstallApplyBasis = z.infer<typeof ContributionInstallApplyBasisSchema>;

export const ContributionInstallApplyResultSchema = z.object({
  contributionKind: ContributionKindSchema,
  sourceContribution: ContributionInstallDiffSourceSchema,
  targetApp: ContributionInstallTargetSchema,
  basedOnInstallDiffPlan: ContributionInstallApplyBasisSchema,
  appFingerprintBefore: z.string(),
  appFingerprintAfter: z.string().optional(),
  isStale: z.boolean(),
  staleReason: z.string().optional(),
  applied: z.boolean(),
  applyReady: z.boolean(),
  readiness: ContributionInstallReadinessSchema,
  warnings: z.array(z.string()).default([]),
  conflicts: z.array(ContributionInstallConflictSchema).default([]),
  limitations: z.array(z.string()).default([]),
  changedPaths: z.array(z.string()).default([]),
  appliedImports: z.array(ContributionInstallImportEntrySchema).default([]),
  appliedRefs: z.array(ContributionInstallRefEntrySchema).default([]),
  applySummary: z.array(z.string()).default([]),
  canonicalBeforeJson: z.string(),
  canonicalAfterJson: z.string().optional(),
  canonicalApp: z.record(z.string(), z.unknown()).optional(),
  recommendedNextAction: z.string(),
  approvalRequired: z.boolean().default(true),
  mutationApplied: z.boolean().optional()
});
export type ContributionInstallApplyResult = z.infer<typeof ContributionInstallApplyResultSchema>;

export const ContributionInstallApplyResponseSchema = z.object({
  result: ContributionInstallApplyResultSchema
});
export type ContributionInstallApplyResponse = z.infer<typeof ContributionInstallApplyResponseSchema>;

export const MappingKindSchema = z.enum(["literal", "expression", "object", "array"]);
export type MappingKind = z.infer<typeof MappingKindSchema>;

export const MappingPreviewContextSchema = z.object({
  flow: z.record(z.string(), z.unknown()).default({}),
  activity: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  env: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  property: z.record(z.string(), z.unknown()).default({}),
  trigger: z.record(z.string(), z.unknown()).default({})
});
export type MappingPreviewContext = z.infer<typeof MappingPreviewContextSchema>;

export const MappingPreviewFieldSchema = z.object({
  path: z.string(),
  kind: MappingKindSchema,
  expression: z.string().optional(),
  references: z.array(z.string()).default([]),
  resolved: z.unknown().optional(),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type MappingPreviewField = z.infer<typeof MappingPreviewFieldSchema>;

export const MappingPathSchema = z.object({
  nodeId: z.string(),
  mappingKey: z.string(),
  sourceExpression: z.string().optional(),
  targetPath: z.string()
});
export type MappingPath = z.infer<typeof MappingPathSchema>;

export const MappingPreviewRequestSchema = z.object({
  nodeId: z.string(),
  sampleInput: MappingPreviewContextSchema.default({})
});
export type MappingPreviewRequest = z.infer<typeof MappingPreviewRequestSchema>;

export const MappingPreviewResultSchema = z.object({
  nodeId: z.string(),
  flowId: z.string().optional(),
  fields: z.array(MappingPreviewFieldSchema).default([]),
  paths: z.array(MappingPathSchema).default([]),
  resolvedValues: z.record(z.string(), z.unknown()).default({}),
  scopeDiagnostics: z.array(DiagnosticSchema).default([]),
  coercionDiagnostics: z.array(DiagnosticSchema).default([]),
  suggestedCoercions: z.array(DiagnosticSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type MappingPreviewResult = z.infer<typeof MappingPreviewResultSchema>;

export const PropertyPlanRecommendationSchema = z.object({
  source: z.enum(["property", "env"]),
  name: z.string(),
  rationale: z.string()
});
export type PropertyPlanRecommendation = z.infer<typeof PropertyPlanRecommendationSchema>;

export const PropertyDefinitionRecommendationSchema = z.object({
  name: z.string(),
  rationale: z.string(),
  inferredType: z.string().optional()
});
export type PropertyDefinitionRecommendation = z.infer<typeof PropertyDefinitionRecommendationSchema>;

export const EnvRecommendationSchema = z.object({
  name: z.string(),
  rationale: z.string()
});
export type EnvRecommendation = z.infer<typeof EnvRecommendationSchema>;

export const DeploymentProfileSchema = z.enum([
  "rest_service",
  "timer_job",
  "cli_tool",
  "channel_worker",
  "serverless",
  "edge_binary"
]);
export type DeploymentProfile = z.infer<typeof DeploymentProfileSchema>;

export const PropertyPlanSchema = z.object({
  declaredProperties: z.array(z.string()).default([]),
  propertyRefs: z.array(z.string()).default([]),
  envRefs: z.array(z.string()).default([]),
  undefinedPropertyRefs: z.array(z.string()).default([]),
  unusedProperties: z.array(z.string()).default([]),
  deploymentProfile: DeploymentProfileSchema.default("rest_service"),
  recommendations: z.array(PropertyPlanRecommendationSchema).default([]),
  recommendedProperties: z.array(PropertyDefinitionRecommendationSchema).default([]),
  recommendedEnv: z.array(EnvRecommendationSchema).default([]),
  recommendedSecretEnv: z.array(EnvRecommendationSchema).default([]),
  recommendedPlainEnv: z.array(EnvRecommendationSchema).default([]),
  deploymentNotes: z.array(z.string()).default([]),
  profileSpecificNotes: z.array(z.string()).default([]),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type PropertyPlan = z.infer<typeof PropertyPlanSchema>;

export const MappingPreviewResponseSchema = z.object({
  preview: MappingPreviewResultSchema,
  propertyPlan: PropertyPlanSchema.optional(),
  artifact: ArtifactRefSchema.optional()
});
export type MappingPreviewResponse = z.infer<typeof MappingPreviewResponseSchema>;

export const PropertyPlanResponseSchema = z.object({
  propertyPlan: PropertyPlanSchema,
  artifact: ArtifactRefSchema.optional()
});
export type PropertyPlanResponse = z.infer<typeof PropertyPlanResponseSchema>;

export const FlowParamSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "object", "array", "any", "unknown"]).default("unknown"),
  required: z.boolean().default(false),
  source: z.enum(["metadata", "mapping_inferred", "activity_inferred", "unknown"]).default("unknown"),
  description: z.string().optional()
});
export type FlowParam = z.infer<typeof FlowParamSchema>;

export const FlowUsageSchema = z.object({
  flowId: z.string(),
  handlerRefs: z.array(z.string()).default([]),
  triggerRefs: z.array(z.string()).default([]),
  actionRefs: z.array(z.string()).default([]),
  usedByCount: z.number().int().nonnegative().default(0)
});
export type FlowUsage = z.infer<typeof FlowUsageSchema>;

export const FlowContractSchema = z.object({
  flowId: z.string(),
  name: z.string(),
  resourceRef: z.string(),
  inputs: z.array(FlowParamSchema).default([]),
  outputs: z.array(FlowParamSchema).default([]),
  reusable: z.boolean().default(false),
  usage: FlowUsageSchema,
  diagnostics: z.array(DiagnosticSchema).default([]),
  evidenceLevel: z.enum(["metadata_only", "metadata_plus_usage", "metadata_plus_mapping"]).default("metadata_only")
});
export type FlowContract = z.infer<typeof FlowContractSchema>;

export const FlowContractsSchema = z.object({
  appName: z.string(),
  contracts: z.array(FlowContractSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type FlowContracts = z.infer<typeof FlowContractsSchema>;

export const FlowContractsResponseSchema = z.object({
  contracts: FlowContractsSchema,
  artifact: ArtifactRefSchema.optional()
});
export type FlowContractsResponse = z.infer<typeof FlowContractsResponseSchema>;

export const RunTraceCaptureOptionsSchema = z.object({
  includeFlowState: z.boolean().default(true),
  includeActivityOutputs: z.boolean().default(true),
  includeTaskInputs: z.boolean().default(true),
  includeTaskOutputs: z.boolean().default(true)
});
export type RunTraceCaptureOptions = z.infer<typeof RunTraceCaptureOptionsSchema>;

export const RunTraceRequestSchema = z.object({
  flowId: z.string(),
  sampleInput: z.record(z.string(), z.unknown()).default({}),
  capture: RunTraceCaptureOptionsSchema.default({}),
  validateOnly: z.boolean().default(false)
});
export type RunTraceRequest = z.infer<typeof RunTraceRequestSchema>;

export const RunTraceTaskStepSchema = z.object({
  taskId: z.string(),
  taskName: z.string().optional(),
  activityRef: z.string().optional(),
  type: z.string().optional(),
  status: z.enum(["completed", "failed", "skipped"]),
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.record(z.string(), z.unknown()).optional(),
  flowState: z.record(z.string(), z.unknown()).optional(),
  activityState: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type RunTraceTaskStep = z.infer<typeof RunTraceTaskStepSchema>;

export const RunTraceSummarySchema = z.object({
  flowId: z.string(),
  status: z.enum(["completed", "failed"]),
  input: z.record(z.string(), z.unknown()).default({}),
  output: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  stepCount: z.number().int().nonnegative(),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type RunTraceSummary = z.infer<typeof RunTraceSummarySchema>;

export const RunTraceEvidenceKindSchema = z.enum(["runtime_backed", "simulated_fallback"]);
export type RunTraceEvidenceKind = z.infer<typeof RunTraceEvidenceKindSchema>;

export const RunComparisonBasisSchema = z.enum([
  "normalized_runtime_evidence",
  "channel_runtime_boundary",
  "rest_runtime_envelope",
  "timer_runtime_startup",
  "recorder_backed",
  "recorder_preferred",
  "runtime_backed",
  "simulated_fallback"
]);
export type RunComparisonBasis = z.infer<typeof RunComparisonBasisSchema>;

export const RuntimeEvidenceStepStatusSchema = z.enum([
  "scheduled",
  "started",
  "completed",
  "failed",
  "cancelled",
  "skipped",
  "unknown"
]);
export type RuntimeEvidenceStepStatus = z.infer<typeof RuntimeEvidenceStepStatusSchema>;

export const RuntimeEvidenceStepSourceSchema = z.enum([
  "trace_step",
  "runtime_evidence_step",
  "task_event",
  "merged"
]);
export type RuntimeEvidenceStepSource = z.infer<typeof RuntimeEvidenceStepSourceSchema>;

export const RestTriggerRuntimeRequestEvidenceSchema = z
  .object({
    method: z.string().optional(),
    path: z.string().optional(),
    headers: z.record(z.string(), z.unknown()).optional(),
    queryParams: z.record(z.string(), z.unknown()).optional(),
    pathParams: z.record(z.string(), z.unknown()).optional(),
    body: z.unknown().optional(),
    content: z.unknown().optional()
  })
  .passthrough();
export type RestTriggerRuntimeRequestEvidence = z.infer<typeof RestTriggerRuntimeRequestEvidenceSchema>;

export const RestTriggerRuntimeReplyEvidenceSchema = z
  .object({
    status: z.number().int().optional(),
    headers: z.record(z.string(), z.unknown()).optional(),
    body: z.unknown().optional(),
    data: z.unknown().optional(),
    cookies: z.record(z.string(), z.unknown()).optional()
  })
  .passthrough();
export type RestTriggerRuntimeReplyEvidence = z.infer<typeof RestTriggerRuntimeReplyEvidenceSchema>;

export const RestTriggerRuntimeMappingEvidenceSchema = z
  .object({
    requestMappingMode: z.enum(["auto", "explicit"]).optional(),
    replyMappingMode: z.enum(["auto", "explicit"]).optional(),
    mappedFlowInput: z.record(z.string(), z.unknown()).optional(),
    mappedFlowOutput: z.record(z.string(), z.unknown()).optional(),
    requestMappings: z.record(z.string(), z.unknown()).optional(),
    replyMappings: z.record(z.string(), z.unknown()).optional(),
    unavailableFields: z.array(z.string()).default([]),
    diagnostics: z.array(DiagnosticSchema).default([])
  })
  .passthrough();
export type RestTriggerRuntimeMappingEvidence = z.infer<typeof RestTriggerRuntimeMappingEvidenceSchema>;

export const RestTriggerRuntimeEvidenceSchema = z
  .object({
    kind: z.literal("rest"),
    request: RestTriggerRuntimeRequestEvidenceSchema.optional(),
    flowInput: z.record(z.string(), z.unknown()).optional(),
    flowOutput: z.record(z.string(), z.unknown()).optional(),
    reply: RestTriggerRuntimeReplyEvidenceSchema.optional(),
    mapping: RestTriggerRuntimeMappingEvidenceSchema.optional(),
    unavailableFields: z.array(z.string()).default([]),
    diagnostics: z.array(DiagnosticSchema).default([])
  })
  .passthrough();
export type RestTriggerRuntimeEvidence = z.infer<typeof RestTriggerRuntimeEvidenceSchema>;

export const TimerTriggerRuntimeSettingsEvidenceSchema = z
  .object({
    runMode: z.enum(["once_immediate", "once_delay", "repeat", "repeat_delay"]).optional(),
    startDelay: z.string().optional(),
    repeatInterval: z.string().optional()
  })
  .passthrough();
export type TimerTriggerRuntimeSettingsEvidence = z.infer<typeof TimerTriggerRuntimeSettingsEvidenceSchema>;

export const TimerTriggerRuntimeTickEvidenceSchema = z
  .object({
    startedAt: z.string().optional(),
    firedAt: z.string().optional(),
    tickCount: z.number().int().nonnegative().optional()
  })
  .passthrough();
export type TimerTriggerRuntimeTickEvidence = z.infer<typeof TimerTriggerRuntimeTickEvidenceSchema>;

export const TimerTriggerRuntimeEvidenceSchema = z
  .object({
    kind: z.literal("timer"),
    settings: TimerTriggerRuntimeSettingsEvidenceSchema.optional(),
    flowInput: z.record(z.string(), z.unknown()).optional(),
    flowOutput: z.record(z.string(), z.unknown()).optional(),
    tick: TimerTriggerRuntimeTickEvidenceSchema.optional(),
    unavailableFields: z.array(z.string()).default([]),
    diagnostics: z.array(DiagnosticSchema).default([])
  })
  .passthrough();
export type TimerTriggerRuntimeEvidence = z.infer<typeof TimerTriggerRuntimeEvidenceSchema>;

export const CLITriggerRuntimeSettingsEvidenceSchema = z
  .object({
    singleCmd: z.boolean().optional(),
    usage: z.string().optional(),
    long: z.string().optional()
  })
  .passthrough();
export type CLITriggerRuntimeSettingsEvidence = z.infer<typeof CLITriggerRuntimeSettingsEvidenceSchema>;

export const CLITriggerRuntimeHandlerEvidenceSchema = z
  .object({
    command: z.string().optional(),
    usage: z.string().optional(),
    short: z.string().optional(),
    long: z.string().optional(),
    flags: z.array(z.string()).default([])
  })
  .passthrough();
export type CLITriggerRuntimeHandlerEvidence = z.infer<typeof CLITriggerRuntimeHandlerEvidenceSchema>;

export const CLITriggerRuntimeReplyEvidenceSchema = z
  .object({
    data: z.unknown().optional(),
    stdout: z.string().optional()
  })
  .passthrough();
export type CLITriggerRuntimeReplyEvidence = z.infer<typeof CLITriggerRuntimeReplyEvidenceSchema>;

export const CLITriggerRuntimeEvidenceSchema = z
  .object({
    kind: z.literal("cli"),
    settings: CLITriggerRuntimeSettingsEvidenceSchema.optional(),
    handler: CLITriggerRuntimeHandlerEvidenceSchema.optional(),
    args: z.array(z.string()).default([]),
    flags: z.record(z.string(), z.unknown()).optional(),
    flowInput: z.record(z.string(), z.unknown()).optional(),
    flowOutput: z.record(z.string(), z.unknown()).optional(),
    reply: CLITriggerRuntimeReplyEvidenceSchema.optional(),
    unavailableFields: z.array(z.string()).default([]),
    diagnostics: z.array(DiagnosticSchema).default([])
  })
  .passthrough();
export type CLITriggerRuntimeEvidence = z.infer<typeof CLITriggerRuntimeEvidenceSchema>;

export const ChannelTriggerRuntimeSettingsEvidenceSchema = z
  .object({
    channels: z.array(z.string()).default([])
  })
  .passthrough();
export type ChannelTriggerRuntimeSettingsEvidence = z.infer<typeof ChannelTriggerRuntimeSettingsEvidenceSchema>;

export const ChannelTriggerRuntimeHandlerEvidenceSchema = z
  .object({
    name: z.string().optional(),
    channel: z.string().optional(),
    bufferSize: z.number().int().optional()
  })
  .passthrough();
export type ChannelTriggerRuntimeHandlerEvidence = z.infer<typeof ChannelTriggerRuntimeHandlerEvidenceSchema>;

export const ChannelTriggerRuntimeEvidenceSchema = z
  .object({
    kind: z.literal("channel"),
    settings: ChannelTriggerRuntimeSettingsEvidenceSchema.optional(),
    handler: ChannelTriggerRuntimeHandlerEvidenceSchema.optional(),
    data: z.unknown().optional(),
    flowInput: z.record(z.string(), z.unknown()).optional(),
    flowOutput: z.record(z.string(), z.unknown()).optional(),
    unavailableFields: z.array(z.string()).default([]),
    diagnostics: z.array(DiagnosticSchema).default([])
  })
  .passthrough();
export type ChannelTriggerRuntimeEvidence = z.infer<typeof ChannelTriggerRuntimeEvidenceSchema>;

export const NormalizedRuntimeStepEvidenceSchema = z
  .object({
    taskId: z.string(),
    taskName: z.string().optional(),
    activityRef: z.string().optional(),
    type: z.string().optional(),
    status: z.enum(["completed", "failed", "skipped"]),
    error: z.string().optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
    declaredInputMappings: z.record(z.string(), z.unknown()).optional(),
    declaredOutputMappings: z.record(z.string(), z.unknown()).optional(),
    resolvedInputs: z.record(z.string(), z.unknown()).optional(),
    producedOutputs: z.record(z.string(), z.unknown()).optional(),
    flowStateBefore: z.record(z.string(), z.unknown()).optional(),
    flowStateAfter: z.record(z.string(), z.unknown()).optional(),
    stateDelta: z.record(z.string(), z.unknown()).optional(),
    evidenceSource: z.record(z.string(), z.array(z.string())).optional(),
    unavailableFields: z.array(z.string()).default([]),
    diagnostics: z.array(DiagnosticSchema).default([]),
  })
  .passthrough();
export type NormalizedRuntimeStepEvidence = z.infer<typeof NormalizedRuntimeStepEvidenceSchema>;

export const RuntimeEvidenceSchema = z.object({
  kind: RunTraceEvidenceKindSchema,
  recorderBacked: z.boolean().optional(),
  recorderKind: z.string().optional(),
  recorderMode: z.string().optional(),
  runtimeMode: z.string().optional(),
  fallbackReason: z.string().optional(),
  flowStart: z.record(z.string(), z.unknown()).optional(),
  flowDone: z.record(z.string(), z.unknown()).optional(),
  snapshots: z.array(z.record(z.string(), z.unknown())).optional(),
  steps: z.array(z.record(z.string(), z.unknown())).optional(),
  taskEvents: z.array(z.record(z.string(), z.unknown())).optional(),
  normalizedSteps: z.array(NormalizedRuntimeStepEvidenceSchema).optional(),
  restTriggerRuntime: RestTriggerRuntimeEvidenceSchema.optional(),
  cliTriggerRuntime: CLITriggerRuntimeEvidenceSchema.optional(),
  timerTriggerRuntime: TimerTriggerRuntimeEvidenceSchema.optional(),
  channelTriggerRuntime: ChannelTriggerRuntimeEvidenceSchema.optional()
});
export type RuntimeEvidence = z.infer<typeof RuntimeEvidenceSchema>;

export const RestReplayEvidenceSchema = z
  .object({
    comparisonBasis: z.literal("rest_runtime_envelope").optional(),
    runtimeMode: z.string().optional(),
    requestEnvelopeObserved: z.boolean().default(false),
    mappedFlowInputObserved: z.boolean().default(false),
    mappedFlowOutputObserved: z.boolean().default(false),
    replyEnvelopeObserved: z.boolean().default(false),
    unsupportedFields: z.array(z.string()).default([]),
    diagnostics: z.array(DiagnosticSchema).default([])
  })
  .passthrough();
export type RestReplayEvidence = z.infer<typeof RestReplayEvidenceSchema>;

export const RunTraceSchema = z.object({
  appName: z.string(),
  flowId: z.string(),
  evidenceKind: RunTraceEvidenceKindSchema.optional(),
  comparisonBasisPreference: RunComparisonBasisSchema.optional(),
  runtimeEvidence: RuntimeEvidenceSchema.optional(),
  summary: RunTraceSummarySchema,
  steps: z.array(RunTraceTaskStepSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type RunTrace = z.infer<typeof RunTraceSchema>;

export const RunTraceResponseSchema = z.object({
  trace: RunTraceSchema.optional(),
  artifact: ArtifactRefSchema.optional(),
  validation: ValidationReportSchema.optional()
});
export type RunTraceResponse = z.infer<typeof RunTraceResponseSchema>;

export const ReplayRequestSchema = z
  .object({
    flowId: z.string(),
    traceArtifactId: z.string().optional(),
    baseInput: z.record(z.string(), z.unknown()).optional(),
    overrides: z.record(z.string(), z.unknown()).default({}),
    capture: RunTraceCaptureOptionsSchema.default({}),
    validateOnly: z.boolean().default(false)
  })
  .superRefine((value, ctx) => {
    if (value.traceArtifactId && value.baseInput) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either traceArtifactId or baseInput, not both",
        path: ["traceArtifactId"]
      });
    }

    if (!value.traceArtifactId && !value.baseInput) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Replay requests require either traceArtifactId or baseInput",
        path: ["baseInput"]
      });
    }
  });
export type ReplayRequest = z.infer<typeof ReplayRequestSchema>;

export const ReplaySummarySchema = z.object({
  flowId: z.string(),
  status: z.enum(["completed", "failed"]),
  inputSource: z.enum(["trace_artifact", "explicit_input"]),
  baseInput: z.record(z.string(), z.unknown()).default({}),
  effectiveInput: z.record(z.string(), z.unknown()).default({}),
  overridesApplied: z.boolean(),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type ReplaySummary = z.infer<typeof ReplaySummarySchema>;

export const ReplayResultSchema = z.object({
  summary: ReplaySummarySchema,
  trace: RunTraceSchema.optional(),
  comparisonBasisPreference: RunComparisonBasisSchema.optional(),
  runtimeEvidence: RuntimeEvidenceSchema.optional(),
  restReplay: RestReplayEvidenceSchema.optional(),
  validation: ValidationReportSchema.optional()
});
export type ReplayResult = z.infer<typeof ReplayResultSchema>;

export const ReplayResponseSchema = z.object({
  result: ReplayResultSchema,
  artifact: ArtifactRefSchema.optional()
});
export type ReplayResponse = z.infer<typeof ReplayResponseSchema>;

export const RunComparisonOptionsSchema = z.object({
  includeStepInputs: z.boolean().default(true),
  includeStepOutputs: z.boolean().default(true),
  includeFlowState: z.boolean().default(true),
  includeActivityState: z.boolean().default(true),
  includeDiagnostics: z.boolean().default(true)
});
export type RunComparisonOptions = z.infer<typeof RunComparisonOptionsSchema>;

export const ComparableRunArtifactKindSchema = z.enum(["run_trace", "replay_report"]);
export type ComparableRunArtifactKind = z.infer<typeof ComparableRunArtifactKindSchema>;

export const RunComparisonRequestSchema = z.object({
  leftArtifactId: z.string(),
  rightArtifactId: z.string(),
  compare: RunComparisonOptionsSchema.default({}),
  validateOnly: z.boolean().default(false)
});
export type RunComparisonRequest = z.infer<typeof RunComparisonRequestSchema>;

export const RunComparisonArtifactRefSchema = z.object({
  artifactId: z.string(),
  kind: ComparableRunArtifactKindSchema,
  summaryStatus: z.enum(["completed", "failed"]),
  flowId: z.string(),
  evidenceKind: RunTraceEvidenceKindSchema.optional(),
  normalizedStepEvidence: z.boolean().optional(),
  restTriggerRuntimeEvidence: z.boolean().optional(),
  restTriggerRuntimeKind: z.string().optional(),
  cliTriggerRuntimeEvidence: z.boolean().optional(),
  cliTriggerRuntimeKind: z.string().optional(),
  timerTriggerRuntimeEvidence: z.boolean().optional(),
  timerTriggerRuntimeKind: z.string().optional(),
  channelTriggerRuntimeEvidence: z.boolean().optional(),
  channelTriggerRuntimeKind: z.string().optional(),
  channelTriggerRuntimeChannel: z.string().optional(),
  comparisonBasisPreference: RunComparisonBasisSchema.optional()
});
export type RunComparisonArtifactRef = z.infer<typeof RunComparisonArtifactRefSchema>;

export const RunComparisonValueDiffSchema = z.object({
  kind: z.enum(["same", "changed", "added", "removed"]),
  left: z.unknown().optional(),
  right: z.unknown().optional()
});
export type RunComparisonValueDiff = z.infer<typeof RunComparisonValueDiffSchema>;

export const TimerRuntimeComparisonSchema = z
  .object({
    comparisonBasis: z.literal("timer_runtime_startup"),
    runtimeMode: z.string().optional(),
    settingsCompared: z.boolean(),
    flowInputCompared: z.boolean(),
    flowOutputCompared: z.boolean(),
    tickCompared: z.boolean(),
    settingsDiff: RunComparisonValueDiffSchema.optional(),
    flowInputDiff: RunComparisonValueDiffSchema.optional(),
    flowOutputDiff: RunComparisonValueDiffSchema.optional(),
    tickDiff: RunComparisonValueDiffSchema.optional(),
    unsupportedFields: z.array(z.string()).default([]),
    diagnostics: z.array(DiagnosticSchema).default([])
  })
  .passthrough();
export type TimerRuntimeComparison = z.infer<typeof TimerRuntimeComparisonSchema>;

export const ChannelRuntimeComparisonSchema = z
  .object({
    comparisonBasis: z.literal("channel_runtime_boundary"),
    runtimeMode: z.string().optional(),
    channelCompared: z.boolean(),
    dataCompared: z.boolean(),
    flowInputCompared: z.boolean(),
    flowOutputCompared: z.boolean(),
    channelDiff: RunComparisonValueDiffSchema.optional(),
    dataDiff: RunComparisonValueDiffSchema.optional(),
    flowInputDiff: RunComparisonValueDiffSchema.optional(),
    flowOutputDiff: RunComparisonValueDiffSchema.optional(),
    unsupportedFields: z.array(z.string()).default([]),
    diagnostics: z.array(DiagnosticSchema).default([])
  })
  .passthrough();
export type ChannelRuntimeComparison = z.infer<typeof ChannelRuntimeComparisonSchema>;

export const RestEnvelopeComparisonSchema = z
  .object({
    comparisonBasis: z.literal("rest_runtime_envelope"),
    requestEnvelopeCompared: z.boolean(),
    mappedFlowInputCompared: z.boolean(),
    replyEnvelopeCompared: z.boolean(),
    normalizedStepEvidenceCompared: z.boolean(),
    requestEnvelopeDiff: RunComparisonValueDiffSchema.optional(),
    mappedFlowInputDiff: RunComparisonValueDiffSchema.optional(),
    replyEnvelopeDiff: RunComparisonValueDiffSchema.optional(),
    normalizedStepCountDiff: RunComparisonValueDiffSchema.optional(),
    unsupportedFields: z.array(z.string()).default([]),
    diagnostics: z.array(DiagnosticSchema).default([])
  })
  .passthrough();
export type RestEnvelopeComparison = z.infer<typeof RestEnvelopeComparisonSchema>;

export const RunComparisonStepDiffSchema = z.object({
  taskId: z.string(),
  leftStatus: z.enum(["completed", "failed", "skipped"]).optional(),
  rightStatus: z.enum(["completed", "failed", "skipped"]).optional(),
  inputDiff: RunComparisonValueDiffSchema.optional(),
  outputDiff: RunComparisonValueDiffSchema.optional(),
  flowStateDiff: RunComparisonValueDiffSchema.optional(),
  activityStateDiff: RunComparisonValueDiffSchema.optional(),
  diagnosticDiffs: z.array(DiagnosticSchema).default([]),
  changeKind: z.enum(["same", "changed", "added", "removed"])
});
export type RunComparisonStepDiff = z.infer<typeof RunComparisonStepDiffSchema>;

export const RunComparisonSummaryDiffSchema = z.object({
  statusChanged: z.boolean(),
  inputDiff: RunComparisonValueDiffSchema,
  outputDiff: RunComparisonValueDiffSchema,
  errorDiff: RunComparisonValueDiffSchema,
  stepCountDiff: RunComparisonValueDiffSchema,
  diagnosticDiffs: z.array(DiagnosticSchema).default([])
});
export type RunComparisonSummaryDiff = z.infer<typeof RunComparisonSummaryDiffSchema>;

export const RunComparisonResultSchema = z.object({
  left: RunComparisonArtifactRefSchema,
  right: RunComparisonArtifactRefSchema,
  comparisonBasis: RunComparisonBasisSchema.optional(),
  restComparison: RestEnvelopeComparisonSchema.optional(),
  channelComparison: ChannelRuntimeComparisonSchema.optional(),
  timerComparison: TimerRuntimeComparisonSchema.optional(),
  summary: RunComparisonSummaryDiffSchema,
  steps: z.array(RunComparisonStepDiffSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type RunComparisonResult = z.infer<typeof RunComparisonResultSchema>;

export const RunComparisonResponseSchema = z.object({
  result: RunComparisonResultSchema.optional(),
  artifact: ArtifactRefSchema.optional(),
  validation: ValidationReportSchema.optional()
});
export type RunComparisonResponse = z.infer<typeof RunComparisonResponseSchema>;

export const DiagnosisTriggerFamilySchema = z.enum(["direct_flow", "rest", "timer", "cli", "channel", "unknown"]);
export type DiagnosisTriggerFamily = z.infer<typeof DiagnosisTriggerFamilySchema>;

export const DiagnosisSymptomSchema = z.enum([
  "wrong_response",
  "scheduled_flow_issue",
  "cli_argument_issue",
  "internal_event_issue",
  "mapping_mismatch",
  "flow_contract_issue",
  "step_failure",
  "replay_mismatch",
  "unexpected_output",
  "unsupported_shape",
  "validation_failure"
]);
export type DiagnosisSymptom = z.infer<typeof DiagnosisSymptomSchema>;

export const DiagnosisOperationSchema = z.enum([
  "static_validation",
  "mapping_preview",
  "mapping_test",
  "flow_contract_analysis",
  "trigger_binding_analysis",
  "run_trace",
  "replay",
  "compare_runs"
]);
export type DiagnosisOperation = z.infer<typeof DiagnosisOperationSchema>;

export const DiagnosisProblemCategorySchema = z.enum([
  "model",
  "reference",
  "mapping",
  "trigger",
  "activity",
  "runtime",
  "behavioral"
]);
export type DiagnosisProblemCategory = z.infer<typeof DiagnosisProblemCategorySchema>;

export const DiagnosisSubtypeSchema = z.enum([
  "contract_validation_failure",
  "parse_or_resolution_failure",
  "input_resolution_mismatch",
  "reply_mapping_mismatch",
  "rest_envelope_mismatch",
  "timer_startup_mismatch",
  "cli_boundary_mismatch",
  "channel_boundary_mismatch",
  "step_failure",
  "behavioral_regression",
  "fallback_to_simulation",
  "unsupported_shape",
  "insufficient_evidence"
]);
export type DiagnosisSubtype = z.infer<typeof DiagnosisSubtypeSchema>;

export const DiagnosisEvidenceQualitySchema = z.enum([
  "runtime_backed",
  "simulated_fallback",
  "artifact_backed",
  "mixed"
]);
export type DiagnosisEvidenceQuality = z.infer<typeof DiagnosisEvidenceQualitySchema>;

export const DiagnosisConfidenceLevelSchema = z.enum(["certain", "high", "medium", "low"]);
export type DiagnosisConfidenceLevel = z.infer<typeof DiagnosisConfidenceLevelSchema>;

export const DiagnosisConfidenceBasisSchema = z.enum([
  "direct_observation",
  "boundary_envelope",
  "normalized_step",
  "recorder_backed",
  "comparison",
  "validation",
  "contract_inference",
  "mixed_evidence",
  "fallback_reason",
  "summary_only"
]);
export type DiagnosisConfidenceBasis = z.infer<typeof DiagnosisConfidenceBasisSchema>;

export const DiagnosisEvidenceRefSchema = z.object({
  artifactId: z.string().optional(),
  artifactType: ArtifactTypeSchema.optional(),
  fieldPath: z.string(),
  source: z.enum(["trace", "replay", "comparison", "validation", "mapping", "flow_contract", "trigger_binding", "inference"]),
  direct: z.boolean().default(false),
  observedValue: z.unknown().optional(),
  expectedValue: z.unknown().optional(),
  diff: z.unknown().optional()
});
export type DiagnosisEvidenceRef = z.infer<typeof DiagnosisEvidenceRefSchema>;

export const DiagnosisConfidenceSchema = z.object({
  level: DiagnosisConfidenceLevelSchema,
  score: z.number().min(0).max(1),
  bases: z.array(DiagnosisConfidenceBasisSchema).default([]),
  supportingSignals: z.array(z.string()).default([]),
  missingSignals: z.array(z.string()).default([]),
  conflictingSignals: z.array(z.string()).default([])
});
export type DiagnosisConfidence = z.infer<typeof DiagnosisConfidenceSchema>;

export const DiagnosisPlanSchema = z.object({
  symptom: DiagnosisSymptomSchema,
  triggerFamily: DiagnosisTriggerFamilySchema.default("unknown"),
  selectedOperations: z.array(DiagnosisOperationSchema).default([]),
  rationale: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([])
});
export type DiagnosisPlan = z.infer<typeof DiagnosisPlanSchema>;

export const DiagnosisAffectedScopeSchema = z.object({
  triggerFamily: DiagnosisTriggerFamilySchema.optional(),
  triggerId: z.string().optional(),
  handlerName: z.string().optional(),
  flowId: z.string().optional(),
  taskId: z.string().optional(),
  mappingPath: z.string().optional(),
  nodeId: z.string().optional()
});
export type DiagnosisAffectedScope = z.infer<typeof DiagnosisAffectedScopeSchema>;

export const DiagnosisPatchRecommendationSchema = z.object({
  problem: z.string(),
  evidence: z.array(z.string()).default([]),
  proposedPatch: z.string(),
  expectedImpact: z.string(),
  confidence: DiagnosisConfidenceSchema,
  caveats: z.array(z.string()).default([])
});
export type DiagnosisPatchRecommendation = z.infer<typeof DiagnosisPatchRecommendationSchema>;

export const DiagnosisReportSchema = z.object({
  plan: DiagnosisPlanSchema,
  problemCategory: DiagnosisProblemCategorySchema,
  subtype: DiagnosisSubtypeSchema,
  likelyRootCause: z.string(),
  supportingEvidence: z.array(DiagnosisEvidenceRefSchema).default([]),
  affected: DiagnosisAffectedScopeSchema.default({}),
  recommendedNextAction: z.string(),
  recommendedPatch: DiagnosisPatchRecommendationSchema,
  confidence: DiagnosisConfidenceSchema,
  evidenceQuality: DiagnosisEvidenceQualitySchema,
  fallbackDetected: z.boolean().default(false),
  limitations: z.array(z.string()).default([]),
  diagnostics: z.array(DiagnosticSchema).default([]),
  relatedArtifactIds: z.array(z.string()).default([])
});
export type DiagnosisReport = z.infer<typeof DiagnosisReportSchema>;

export const DiagnosisResponseSchema = z.object({
  report: DiagnosisReportSchema,
  artifact: ArtifactRefSchema.optional()
});
export type DiagnosisResponse = z.infer<typeof DiagnosisResponseSchema>;

export const DiagnosisRequestSchema = z.object({
  symptom: DiagnosisSymptomSchema,
  triggerFamily: DiagnosisTriggerFamilySchema.default("unknown"),
  flowId: z.string().optional(),
  sampleInput: z.record(z.string(), z.unknown()).default({}),
  mappingContext: MappingPreviewContextSchema.optional(),
  traceArtifactId: z.string().optional(),
  baseInput: z.record(z.string(), z.unknown()).optional(),
  overrides: z.record(z.string(), z.unknown()).default({}),
  leftArtifactId: z.string().optional(),
  rightArtifactId: z.string().optional(),
  leftArtifact: z.record(z.string(), z.unknown()).optional(),
  rightArtifact: z.record(z.string(), z.unknown()).optional(),
  targetNodeId: z.string().optional(),
  expectedOutput: z.record(z.string(), z.unknown()).optional(),
  profile: z.lazy(() => TriggerProfileSchema).optional(),
  expectedBehavior: z.string().optional(),
  capture: RunTraceCaptureOptionsSchema.default({}),
  compare: RunComparisonOptionsSchema.default({})
});
export type DiagnosisRequest = z.infer<typeof DiagnosisRequestSchema>;

export const TriggerProfileKindSchema = z.enum(["rest", "timer", "cli", "channel"]);
export type TriggerProfileKind = z.infer<typeof TriggerProfileKindSchema>;

export const RestTriggerProfileSchema = z.object({
  kind: z.literal("rest"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string(),
  port: z.number().int().positive(),
  replyMode: z.enum(["json", "raw", "status_only"]).default("json"),
  // Deprecated compatibility fields. The current binder ignores them.
  requestMappingMode: z.enum(["auto", "explicit"]).default("auto"),
  // Deprecated compatibility fields. The current binder ignores them.
  replyMappingMode: z.enum(["auto", "explicit"]).default("auto")
});
export type RestTriggerProfile = z.infer<typeof RestTriggerProfileSchema>;

export const TimerTriggerProfileSchema = z.object({
  kind: z.literal("timer"),
  // Deprecated compatibility field. The current binder ignores it.
  runMode: z.enum(["once_immediate", "once_delay", "repeat", "repeat_delay"]),
  startDelay: z.string().optional(),
  repeatInterval: z.string().optional()
});
export type TimerTriggerProfile = z.infer<typeof TimerTriggerProfileSchema>;

export const CliTriggerProfileSchema = z.object({
  kind: z.literal("cli"),
  singleCmd: z.boolean().default(true),
  commandName: z.string(),
  usage: z.string().optional(),
  short: z.string().optional(),
  long: z.string().optional(),
  flags: z.array(z.string()).default([])
});
export type CliTriggerProfile = z.infer<typeof CliTriggerProfileSchema>;

export const ChannelTriggerProfileSchema = z.object({
  kind: z.literal("channel"),
  channel: z.string()
});
export type ChannelTriggerProfile = z.infer<typeof ChannelTriggerProfileSchema>;

export const TriggerProfileSchema = z.discriminatedUnion("kind", [
  RestTriggerProfileSchema,
  TimerTriggerProfileSchema,
  CliTriggerProfileSchema,
  ChannelTriggerProfileSchema
]);
export type TriggerProfile = z.infer<typeof TriggerProfileSchema>;

export const TriggerBindingMappingsSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
  output: z.record(z.string(), z.unknown()).default({})
});
export type TriggerBindingMappings = z.infer<typeof TriggerBindingMappingsSchema>;

export const TriggerBindingRequestSchema = z.object({
  flowId: z.string(),
  profile: TriggerProfileSchema,
  validateOnly: z.boolean().default(false),
  replaceExisting: z.boolean().default(false),
  handlerName: z.string().optional(),
  triggerId: z.string().optional(),
  // Deprecated compatibility field. The current binder ignores it.
  triggerName: z.string().optional()
});
export type TriggerBindingRequest = z.infer<typeof TriggerBindingRequestSchema>;

export const TriggerBindingPlanSchema = z.object({
  flowId: z.string(),
  profile: TriggerProfileSchema,
  triggerRef: z.string(),
  triggerId: z.string(),
  handlerName: z.string(),
  generatedMappings: TriggerBindingMappingsSchema,
  trigger: FlogoTriggerSchema,
  diagnostics: z.array(DiagnosticSchema).default([]),
  warnings: z.array(DiagnosticSchema).default([])
});
export type TriggerBindingPlan = z.infer<typeof TriggerBindingPlanSchema>;

export const TriggerBindingResultSchema = z.object({
  applied: z.boolean(),
  plan: TriggerBindingPlanSchema,
  patchSummary: z.string(),
  validation: ValidationReportSchema.optional(),
  app: FlogoAppSchema.optional(),
  artifact: ArtifactRefSchema.optional()
});
export type TriggerBindingResult = z.infer<typeof TriggerBindingResultSchema>;

export const TriggerBindingResponseSchema = z.object({
  result: TriggerBindingResultSchema
});
export type TriggerBindingResponse = z.infer<typeof TriggerBindingResponseSchema>;

export const SubflowSelectionSchema = z.object({
  flowId: z.string(),
  taskIds: z.array(z.string()).min(1),
  contiguous: z.boolean().default(true),
  selectionMode: z.literal("explicit").default("explicit")
});
export type SubflowSelection = z.infer<typeof SubflowSelectionSchema>;

export const SubflowInvocationSchema = z.object({
  parentFlowId: z.string(),
  taskId: z.string(),
  activityRef: z.string(),
  input: z.record(z.string(), z.unknown()).default({}),
  output: z.record(z.string(), z.unknown()).default({}),
  settings: z.record(z.string(), z.unknown()).default({})
});
export type SubflowInvocation = z.infer<typeof SubflowInvocationSchema>;

export const SubflowExtractionRequestSchema = z.object({
  flowId: z.string(),
  taskIds: z.array(z.string()).min(1),
  newFlowId: z.string().optional(),
  newFlowName: z.string().optional(),
  validateOnly: z.boolean().default(false),
  replaceExisting: z.boolean().default(false)
});
export type SubflowExtractionRequest = z.infer<typeof SubflowExtractionRequestSchema>;

export const SubflowExtractionPlanSchema = z.object({
  parentFlowId: z.string(),
  newFlowId: z.string(),
  newFlowName: z.string(),
  selectedTaskIds: z.array(z.string()).min(1),
  newFlowContract: FlowContractSchema,
  invocation: SubflowInvocationSchema,
  diagnostics: z.array(DiagnosticSchema).default([]),
  warnings: z.array(DiagnosticSchema).default([])
});
export type SubflowExtractionPlan = z.infer<typeof SubflowExtractionPlanSchema>;

export const SubflowExtractionResultSchema = z.object({
  applied: z.boolean(),
  plan: SubflowExtractionPlanSchema,
  patchSummary: z.string(),
  validation: ValidationReportSchema.optional(),
  app: FlogoAppSchema.optional(),
  artifact: ArtifactRefSchema.optional()
});
export type SubflowExtractionResult = z.infer<typeof SubflowExtractionResultSchema>;

export const SubflowExtractionResponseSchema = z.object({
  result: SubflowExtractionResultSchema
});
export type SubflowExtractionResponse = z.infer<typeof SubflowExtractionResponseSchema>;

export const SubflowInliningRequestSchema = z.object({
  parentFlowId: z.string(),
  invocationTaskId: z.string(),
  validateOnly: z.boolean().default(false),
  removeExtractedFlowIfUnused: z.boolean().default(false)
});
export type SubflowInliningRequest = z.infer<typeof SubflowInliningRequestSchema>;

export const SubflowInliningPlanSchema = z.object({
  parentFlowId: z.string(),
  invocationTaskId: z.string(),
  inlinedFlowId: z.string(),
  generatedTaskIds: z.array(z.string()).default([]),
  diagnostics: z.array(DiagnosticSchema).default([]),
  warnings: z.array(DiagnosticSchema).default([])
});
export type SubflowInliningPlan = z.infer<typeof SubflowInliningPlanSchema>;

export const SubflowInliningResultSchema = z.object({
  applied: z.boolean(),
  plan: SubflowInliningPlanSchema,
  patchSummary: z.string(),
  validation: ValidationReportSchema.optional(),
  app: FlogoAppSchema.optional(),
  artifact: ArtifactRefSchema.optional()
});
export type SubflowInliningResult = z.infer<typeof SubflowInliningResultSchema>;

export const SubflowInliningResponseSchema = z.object({
  result: SubflowInliningResultSchema
});
export type SubflowInliningResponse = z.infer<typeof SubflowInliningResponseSchema>;

export const IteratorSynthesisRequestSchema = z.object({
  flowId: z.string(),
  taskId: z.string(),
  iterateExpr: z.string().min(1),
  accumulate: z.boolean().optional(),
  validateOnly: z.boolean().default(false),
  replaceExisting: z.boolean().default(false)
});
export type IteratorSynthesisRequest = z.infer<typeof IteratorSynthesisRequestSchema>;

export const IteratorSynthesisPlanSchema = z.object({
  flowId: z.string(),
  taskId: z.string(),
  nextTaskType: z.literal("iterator"),
  updatedSettings: z.record(z.string(), z.unknown()).default({}),
  diagnostics: z.array(DiagnosticSchema).default([]),
  warnings: z.array(DiagnosticSchema).default([])
});
export type IteratorSynthesisPlan = z.infer<typeof IteratorSynthesisPlanSchema>;

export const IteratorSynthesisResultSchema = z.object({
  applied: z.boolean(),
  plan: IteratorSynthesisPlanSchema,
  patchSummary: z.string(),
  validation: ValidationReportSchema.optional(),
  app: FlogoAppSchema.optional(),
  artifact: ArtifactRefSchema.optional()
});
export type IteratorSynthesisResult = z.infer<typeof IteratorSynthesisResultSchema>;

export const IteratorSynthesisResponseSchema = z.object({
  result: IteratorSynthesisResultSchema
});
export type IteratorSynthesisResponse = z.infer<typeof IteratorSynthesisResponseSchema>;

export const RetryPolicyRequestSchema = z.object({
  flowId: z.string(),
  taskId: z.string(),
  count: z.number().int().positive(),
  intervalMs: z.number().int().nonnegative(),
  validateOnly: z.boolean().default(false),
  replaceExisting: z.boolean().default(false)
});
export type RetryPolicyRequest = z.infer<typeof RetryPolicyRequestSchema>;

export const RetryPolicyPlanSchema = z.object({
  flowId: z.string(),
  taskId: z.string(),
  retryOnError: z.object({
    count: z.number().int().positive(),
    interval: z.number().int().nonnegative()
  }),
  diagnostics: z.array(DiagnosticSchema).default([]),
  warnings: z.array(DiagnosticSchema).default([])
});
export type RetryPolicyPlan = z.infer<typeof RetryPolicyPlanSchema>;

export const RetryPolicyResultSchema = z.object({
  applied: z.boolean(),
  plan: RetryPolicyPlanSchema,
  patchSummary: z.string(),
  validation: ValidationReportSchema.optional(),
  app: FlogoAppSchema.optional(),
  artifact: ArtifactRefSchema.optional()
});
export type RetryPolicyResult = z.infer<typeof RetryPolicyResultSchema>;

export const RetryPolicyResponseSchema = z.object({
  result: RetryPolicyResultSchema
});
export type RetryPolicyResponse = z.infer<typeof RetryPolicyResponseSchema>;

export const DoWhileSynthesisRequestSchema = z.object({
  flowId: z.string(),
  taskId: z.string(),
  condition: z.string().min(1),
  delayMs: z.number().int().nonnegative().optional(),
  accumulate: z.boolean().optional(),
  validateOnly: z.boolean().default(false),
  replaceExisting: z.boolean().default(false)
});
export type DoWhileSynthesisRequest = z.infer<typeof DoWhileSynthesisRequestSchema>;

export const DoWhileSynthesisPlanSchema = z.object({
  flowId: z.string(),
  taskId: z.string(),
  nextTaskType: z.literal("doWhile"),
  updatedSettings: z.record(z.string(), z.unknown()).default({}),
  diagnostics: z.array(DiagnosticSchema).default([]),
  warnings: z.array(DiagnosticSchema).default([])
});
export type DoWhileSynthesisPlan = z.infer<typeof DoWhileSynthesisPlanSchema>;

export const DoWhileSynthesisResultSchema = z.object({
  applied: z.boolean(),
  plan: DoWhileSynthesisPlanSchema,
  patchSummary: z.string(),
  validation: ValidationReportSchema.optional(),
  app: FlogoAppSchema.optional(),
  artifact: ArtifactRefSchema.optional()
});
export type DoWhileSynthesisResult = z.infer<typeof DoWhileSynthesisResultSchema>;

export const DoWhileSynthesisResponseSchema = z.object({
  result: DoWhileSynthesisResultSchema
});
export type DoWhileSynthesisResponse = z.infer<typeof DoWhileSynthesisResponseSchema>;

export const ErrorPathTemplateKindSchema = z.enum(["log_and_continue", "log_and_stop"]);
export type ErrorPathTemplateKind = z.infer<typeof ErrorPathTemplateKindSchema>;

export const ErrorPathTemplateRequestSchema = z.object({
  flowId: z.string(),
  taskId: z.string(),
  template: ErrorPathTemplateKindSchema,
  validateOnly: z.boolean().default(false),
  replaceExisting: z.boolean().default(false),
  logMessage: z.string().optional(),
  generatedTaskPrefix: z.string().optional()
});
export type ErrorPathTemplateRequest = z.infer<typeof ErrorPathTemplateRequestSchema>;

export const ErrorPathTemplatePlanSchema = z.object({
  flowId: z.string(),
  taskId: z.string(),
  template: ErrorPathTemplateKindSchema,
  generatedTaskId: z.string(),
  addedImport: z.boolean().default(false),
  generatedLinks: z.array(FlogoLinkSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([]),
  warnings: z.array(DiagnosticSchema).default([])
});
export type ErrorPathTemplatePlan = z.infer<typeof ErrorPathTemplatePlanSchema>;

export const ErrorPathTemplateResultSchema = z.object({
  applied: z.boolean(),
  plan: ErrorPathTemplatePlanSchema,
  patchSummary: z.string(),
  validation: ValidationReportSchema.optional(),
  app: FlogoAppSchema.optional(),
  artifact: ArtifactRefSchema.optional()
});
export type ErrorPathTemplateResult = z.infer<typeof ErrorPathTemplateResultSchema>;

export const ErrorPathTemplateResponseSchema = z.object({
  result: ErrorPathTemplateResultSchema
});
export type ErrorPathTemplateResponse = z.infer<typeof ErrorPathTemplateResponseSchema>;

export const MappingTestSpecSchema = z.object({
  nodeId: z.string(),
  sampleInput: MappingPreviewContextSchema.default({}),
  expectedOutput: z.record(z.string(), z.unknown()).default({}),
  strict: z.boolean().default(true)
});
export type MappingTestSpec = z.infer<typeof MappingTestSpecSchema>;

export const MappingDifferenceSchema = z.object({
  path: z.string(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  message: z.string()
});
export type MappingDifference = z.infer<typeof MappingDifferenceSchema>;

export const MappingTestResultSchema = z.object({
  pass: z.boolean(),
  nodeId: z.string(),
  actualOutput: z.record(z.string(), z.unknown()).default({}),
  differences: z.array(MappingDifferenceSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([]),
  artifact: ArtifactRefSchema.optional()
});
export type MappingTestResult = z.infer<typeof MappingTestResultSchema>;

export const MappingTestResponseSchema = z.object({
  result: MappingTestResultSchema,
  propertyPlan: PropertyPlanSchema.optional()
});
export type MappingTestResponse = z.infer<typeof MappingTestResponseSchema>;

export const AliasIssueKindSchema = z.enum([
  "duplicate_alias",
  "missing_import",
  "implicit_alias_use",
  "alias_ref_mismatch"
]);
export type AliasIssueKind = z.infer<typeof AliasIssueKindSchema>;

export const AliasIssueSchema = z.object({
  kind: AliasIssueKindSchema,
  alias: z.string(),
  ref: z.string().optional(),
  path: z.string(),
  message: z.string(),
  severity: DiagnosticSeveritySchema.default("warning")
});
export type AliasIssue = z.infer<typeof AliasIssueSchema>;

export const OrphanedRefKindSchema = z.enum(["trigger", "activity", "action", "flow"]);
export type OrphanedRefKind = z.infer<typeof OrphanedRefKindSchema>;

export const OrphanedRefSchema = z.object({
  ref: z.string(),
  kind: OrphanedRefKindSchema,
  path: z.string(),
  reason: z.string(),
  severity: DiagnosticSeveritySchema.default("error")
});
export type OrphanedRef = z.infer<typeof OrphanedRefSchema>;

export const VersionFindingStatusSchema = z.enum(["missing", "conflict", "duplicate_alias", "ok"]);
export type VersionFindingStatus = z.infer<typeof VersionFindingStatusSchema>;

export const VersionFindingSchema = z.object({
  alias: z.string(),
  ref: z.string(),
  declaredVersion: z.string().optional(),
  status: VersionFindingStatusSchema,
  message: z.string(),
  severity: DiagnosticSeveritySchema.default("info")
});
export type VersionFinding = z.infer<typeof VersionFindingSchema>;

export const GovernanceReportSchema = z.object({
  appName: z.string(),
  ok: z.boolean(),
  aliasIssues: z.array(AliasIssueSchema).default([]),
  orphanedRefs: z.array(OrphanedRefSchema).default([]),
  versionFindings: z.array(VersionFindingSchema).default([]),
  unusedImports: z.array(z.string()).default([]),
  missingImports: z.array(z.string()).default([]),
  aliasRefMismatches: z.array(z.string()).default([]),
  inventorySummary: z
    .object({
      entryCount: z.number().int().nonnegative(),
      packageBackedCount: z.number().int().nonnegative(),
      fallbackCount: z.number().int().nonnegative()
    })
    .optional(),
  unresolvedPackages: z.array(z.string()).default([]),
  fallbackContribs: z.array(z.string()).default([]),
  weakEvidenceContribs: z.array(z.string()).default([]),
  weakSignatureContribs: z.array(z.string()).default([]),
  packageBackedContribs: z.array(z.string()).default([]),
  descriptorOnlyContribs: z.array(z.string()).default([]),
  duplicateAliases: z.array(z.string()).default([]),
  conflictingVersions: z.array(z.string()).default([]),
  diagnostics: z.array(DiagnosticSchema).default([])
});
export type GovernanceReport = z.infer<typeof GovernanceReportSchema>;

export const GovernanceResponseSchema = z.object({
  report: GovernanceReportSchema,
  artifact: ArtifactRefSchema.optional()
});
export type GovernanceResponse = z.infer<typeof GovernanceResponseSchema>;

export const CompositionCompareRequestSchema = z.object({
  mode: z.enum(["analyze"]).default("analyze"),
  target: z.enum(["app", "resource"]).default("app"),
  resourceId: z.string().optional()
});
export type CompositionCompareRequest = z.infer<typeof CompositionCompareRequestSchema>;

export const CompositionDifferenceSchema = z.object({
  path: z.string(),
  kind: z.string(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  severity: DiagnosticSeveritySchema.default("warning")
});
export type CompositionDifference = z.infer<typeof CompositionDifferenceSchema>;

export const CompositionCompareResultSchema = z.object({
  appName: z.string(),
  ok: z.boolean(),
  canonicalHash: z.string(),
  programmaticHash: z.string(),
  comparisonBasis: z.enum(["normalized_only", "inventory_backed"]).default("normalized_only"),
  signatureEvidenceLevel: z.enum(["fallback_only", "descriptor_backed", "package_backed"]).default("fallback_only"),
  signatureCoverage: z.enum(["full", "partial", "fallback_only"]).default("fallback_only"),
  comparisonLimitations: z.array(z.string()).default([]),
  inventoryRefsUsed: z.array(z.string()).default([]),
  differences: z.array(CompositionDifferenceSchema).default([]),
  diagnostics: z.array(DiagnosticSchema).default([]),
  artifact: ArtifactRefSchema.optional()
});
export type CompositionCompareResult = z.infer<typeof CompositionCompareResultSchema>;

export const CompositionCompareResponseSchema = z.object({
  comparison: CompositionCompareResultSchema
});
export type CompositionCompareResponse = z.infer<typeof CompositionCompareResponseSchema>;

export const RunnerStepTypeSchema = z.enum([
  "build",
  "run",
  "collect_logs",
  "generate_smoke",
  "run_smoke",
  "infer_flow_contracts",
  "bind_trigger",
  "extract_subflow",
  "inline_subflow",
  "add_iterator",
  "add_retry_policy",
  "add_dowhile",
  "add_error_path",
  "capture_run_trace",
  "replay_flow",
  "compare_runs",
  "inventory_contribs",
  "catalog_contribs",
  "inspect_descriptor",
  "inspect_contrib_evidence",
  "preview_mapping",
  "test_mapping",
  "plan_properties",
  "validate_governance",
  "compare_composition",
  "scaffold_activity",
  "scaffold_action",
  "scaffold_trigger",
  "validate_contrib",
  "package_contrib",
  "install_contrib_plan",
  "update_contrib_plan",
  "update_contrib_diff_plan",
  "install_contrib_diff_plan",
  "install_contrib_apply",
  "diagnose_app"
]);
export type RunnerStepType = z.infer<typeof RunnerStepTypeSchema>;

export const RunnerJobKindSchema = z.enum([
  "build",
  "smoke_test",
  "custom_contrib",
  "eval",
  "flow_contracts",
  "trigger_binding",
  "subflow_extraction",
  "subflow_inlining",
  "iterator_synthesis",
  "retry_policy_synthesis",
  "dowhile_synthesis",
  "error_path_synthesis",
  "run_trace_capture",
  "flow_replay",
  "run_comparison",
  "inventory",
  "catalog",
  "contrib_evidence",
  "mapping_preview",
  "mapping_test",
  "property_plan",
  "governance",
  "composition_compare",
  "activity_scaffold",
  "action_scaffold",
  "trigger_scaffold",
  "contrib_validation",
  "contrib_package",
  "contrib_install_plan",
  "contrib_update_plan",
  "contrib_update_diff_plan",
  "contrib_install_diff_plan",
  "contrib_install_apply",
  "diagnosis"
]);
export type RunnerJobKind = z.infer<typeof RunnerJobKindSchema>;

export const AnalysisKindSchema = z.enum([
  "flow_contracts",
  "trigger_binding_plan",
  "subflow_extraction_plan",
  "subflow_inlining_plan",
  "iterator_plan",
  "retry_policy_plan",
  "dowhile_plan",
  "error_path_plan",
  "run_trace_plan",
  "replay_plan",
  "replay",
  "run_comparison_plan",
  "run_comparison",
  "inventory",
  "catalog",
  "descriptor",
  "contrib_evidence",
  "mapping_preview",
  "mapping_test",
  "property_plan",
  "governance",
  "composition_compare",
  "activity_scaffold",
  "action_scaffold",
  "trigger_scaffold",
  "validate_contrib",
  "package_contrib",
  "install_contrib_plan",
  "update_contrib_plan",
  "update_contrib_diff_plan",
  "install_contrib_diff_plan",
  "install_contrib_apply",
  "diagnosis"
]);
export type AnalysisKind = z.infer<typeof AnalysisKindSchema>;

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
  analysisKind: AnalysisKindSchema.optional(),
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
  analysisPayload: z.record(z.string(), z.unknown()).optional(),
  targetNodeId: z.string().optional(),
  targetRef: z.string().optional(),
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
  expectedSignals: z.array(z.string()).default([]),
  suite: z.string().optional(),
  runtimeEvidence: z
    .object({
      family: z.enum(["direct_flow", "rest", "timer", "cli", "channel"]),
      scenario: z.enum(["supported", "fallback"]),
      operations: z.array(z.enum(["trace", "replay", "compare"])).default([]),
      artifacts: z.array(z.enum(["run_trace", "replay_report", "run_comparison"])).default([]),
      trace: z.object({
        evidenceKind: RunTraceEvidenceKindSchema,
        runtimeMode: z.string().optional(),
        normalizedStepsExpected: z.boolean().default(false),
        triggerEvidenceField: z
          .enum(["restTriggerRuntime", "timerTriggerRuntime", "cliTriggerRuntime", "channelTriggerRuntime"])
          .optional(),
        fallbackReasonExpected: z.boolean().default(false),
        fallbackDiagnosticCode: z.string().optional()
      }),
      replay: z
        .object({
          implemented: z.boolean().default(false),
          evidenceKind: RunTraceEvidenceKindSchema.optional(),
          runtimeMode: z.string().optional(),
          normalizedStepsExpected: z.boolean().default(false),
          triggerEvidenceField: z
            .enum(["restTriggerRuntime", "timerTriggerRuntime", "cliTriggerRuntime", "channelTriggerRuntime"])
            .optional(),
          fallbackReasonExpected: z.boolean().default(false),
          fallbackDiagnosticCode: z.string().optional()
        })
        .optional(),
      comparison: z
        .object({
          basis: RunComparisonBasisSchema,
          runtimePreferred: z.boolean().default(true)
        })
        .optional(),
      mirrors: z.array(z.string()).default([])
    })
    .optional()
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export function parseWithSchema<T>(schema: z.ZodSchema<T>, value: unknown): T {
  return schema.parse(value);
}
