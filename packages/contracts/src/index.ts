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
  "run_trace",
  "replay_report",
  "contrib_bundle"
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
  properties: z.array(FlogoPropertySchema).default([]),
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
  inputs: z.array(ContribFieldSchema).default([]),
  outputs: z.array(ContribFieldSchema).default([]),
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
  "inventory_contribs",
  "catalog_contribs",
  "inspect_descriptor",
  "inspect_contrib_evidence",
  "preview_mapping",
  "test_mapping",
  "plan_properties",
  "validate_governance",
  "compare_composition"
]);
export type RunnerStepType = z.infer<typeof RunnerStepTypeSchema>;

export const RunnerJobKindSchema = z.enum([
  "build",
  "smoke_test",
  "custom_contrib",
  "eval",
  "inventory",
  "catalog",
  "contrib_evidence",
  "mapping_preview",
  "mapping_test",
  "property_plan",
  "governance",
  "composition_compare"
]);
export type RunnerJobKind = z.infer<typeof RunnerJobKindSchema>;

export const AnalysisKindSchema = z.enum([
  "inventory",
  "catalog",
  "descriptor",
  "contrib_evidence",
  "mapping_preview",
  "mapping_test",
  "property_plan",
  "governance",
  "composition_compare"
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
  expectedSignals: z.array(z.string()).default([])
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export function parseWithSchema<T>(schema: z.ZodSchema<T>, value: unknown): T {
  return schema.parse(value);
}
