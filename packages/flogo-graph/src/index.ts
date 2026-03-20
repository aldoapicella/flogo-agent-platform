import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  CompositionCompareRequestSchema,
  type CompositionCompareRequest,
  CompositionCompareResultSchema,
  type CompositionCompareResult,
  ContribEvidenceDetailSchema,
  type ContribEvidenceDetail,
  ContributionInventoryEntrySchema,
  type ContributionInventoryEntry,
  ContributionInventorySchema,
  type ContributionInventory,
  ContribCatalogSchema,
  type ContribCatalog,
  ContribDescriptorSchema,
  type ContribDescriptor,
  ContribDescriptorResponseSchema,
  type ContribDescriptorResponse,
  ContribResolutionEvidenceSchema,
  type ContribResolutionEvidence,
  DiagnosisConfidenceSchema,
  DiagnosisPlanSchema,
  DiagnosisReportSchema,
  DiagnosisRequestSchema,
  type DiagnosisConfidence,
  type DiagnosisEvidenceQuality,
  type DiagnosisEvidenceRef,
  type DiagnosisOperation,
  type DiagnosisPlan,
  type DiagnosisProblemCategory,
  type DiagnosisReport,
  type DiagnosisRequest,
  type DiagnosisSubtype,
  type DiagnosisTriggerFamily,
  type Diagnostic,
  DeploymentProfileSchema,
  type DeploymentProfile,
  FlogoAppGraphSchema,
  FlogoAppSchema,
  FlogoFlowSchema,
  FlogoLinkSchema,
  FlogoTaskSchema,
  FlogoTriggerSchema,
  type FlogoApp,
  type FlogoAppGraph,
  type FlogoFlow,
  type FlogoLink,
  type FlogoTask,
  FlowContractSchema,
  FlowContractsSchema,
  RunTraceRequestSchema,
  RunTraceResponseSchema,
  ReplayRequestSchema,
  ReplayResponseSchema,
  RunComparisonArtifactRefSchema,
  ChannelRuntimeComparisonSchema,
  RunComparisonRequestSchema,
  RunComparisonResponseSchema,
  RunComparisonResultSchema,
  type ComparableRunArtifactKind,
  type RunComparisonArtifactRef,
  type ChannelRuntimeComparison,
  type RunComparisonBasis,
  type RunComparisonRequest,
  type RunComparisonResponse,
  type RunComparisonResult,
  type NormalizedRuntimeStepEvidence,
  type RestEnvelopeComparison,
  type RestReplayEvidence,
  type RuntimeEvidence,
  TimerRuntimeComparisonSchema,
  type TimerRuntimeComparison,
  type FlowContract,
  type FlowContracts,
  type ReplayRequest,
  type ReplayResult,
  type ReplayResponse,
  type RunTrace,
  type RunTraceRequest,
  type RunTraceResponse,
  IteratorSynthesisPlanSchema,
  IteratorSynthesisRequestSchema,
  IteratorSynthesisResponseSchema,
  type IteratorSynthesisPlan,
  type IteratorSynthesisRequest,
  type IteratorSynthesisResponse,
  RetryPolicyPlanSchema,
  RetryPolicyRequestSchema,
  RetryPolicyResponseSchema,
  type RetryPolicyPlan,
  type RetryPolicyRequest,
  type RetryPolicyResponse,
  DoWhileSynthesisPlanSchema,
  DoWhileSynthesisRequestSchema,
  DoWhileSynthesisResponseSchema,
  type DoWhileSynthesisPlan,
  type DoWhileSynthesisRequest,
  type DoWhileSynthesisResponse,
  ErrorPathTemplatePlanSchema,
  ErrorPathTemplateRequestSchema,
  ErrorPathTemplateResponseSchema,
  type ErrorPathTemplatePlan,
  type ErrorPathTemplateRequest,
  type ErrorPathTemplateResponse,
  SubflowExtractionPlanSchema,
  SubflowExtractionRequestSchema,
  SubflowExtractionResponseSchema,
  type SubflowExtractionPlan,
  type SubflowExtractionRequest,
  type SubflowExtractionResponse,
  SubflowInliningPlanSchema,
  SubflowInliningRequestSchema,
  SubflowInliningResponseSchema,
  type SubflowInliningPlan,
  type SubflowInliningRequest,
  type SubflowInliningResponse,
  TriggerBindingPlanSchema,
  TriggerBindingRequestSchema,
  TriggerBindingResponseSchema,
  type TriggerBindingPlan,
  type TriggerBindingRequest,
  type TriggerBindingResponse,
  GovernanceReportSchema,
  type GovernanceReport,
  MappingKindSchema,
  type MappingPreviewResult,
  MappingTestResultSchema,
  type MappingDifference,
  type MappingPath,
  MappingPreviewResultSchema,
  type MappingPreviewContext,
  type MappingPreviewField,
  type MappingTestResult,
  PropertyPlanSchema,
  type PropertyPlan,
  type ValidationReport,
  ValidationReportSchema,
  type ValidationStage,
  type ValidationStageResult
} from "@flogo-agent/contracts";

function createDiagnostic(
  code: string,
  message: string,
  severity: Diagnostic["severity"],
  path?: string,
  details?: Record<string, unknown>
): Diagnostic {
  return { code, message, severity, path, details };
}

function stageResult(stage: ValidationStage, diagnostics: Diagnostic[]): ValidationStageResult {
  return {
    stage,
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    diagnostics
  };
}

type LocatedTask = {
  flowId: string;
  flow: FlogoFlow;
  task: FlogoFlow["data"]["tasks"][number];
};

export interface ContribLookupOptions {
  appPath?: string;
  searchRoots?: string[];
}

type ResolvedDescriptor = {
  descriptor: ContribDescriptor;
  diagnostics: Diagnostic[];
};

type ResolvedInventoryEntry = {
  entry: ContributionInventoryEntry;
  diagnostics: Diagnostic[];
};

type DescriptorCandidate = {
  descriptorPath: string;
  packageRoot?: string;
  modulePath?: string;
  goPackagePath?: string;
  packageVersion?: string;
  source: "app_descriptor" | "workspace_descriptor" | "package_descriptor";
};

type PackageCandidate = {
  packageRoot: string;
  modulePath?: string;
  goPackagePath?: string;
  packageVersion?: string;
  source: "package_source";
};

type GoModuleInfo = {
  root: string;
  modulePath: string;
};

type TriggerBindingOperation = {
  app: FlogoApp;
  nextApp: FlogoApp;
  plan: TriggerBindingPlan;
  validation: ValidationReport;
  patchSummary: string;
};

type SubflowOperation = {
  app: FlogoApp;
  nextApp: FlogoApp;
  validation: ValidationReport;
  patchSummary: string;
};

type SubflowExtractionOperation = SubflowOperation & {
  plan: SubflowExtractionPlan;
};

type SubflowInliningOperation = SubflowOperation & {
  plan: SubflowInliningPlan;
};

type ControlFlowOperation = SubflowOperation;

type IteratorSynthesisOperation = ControlFlowOperation & {
  plan: IteratorSynthesisPlan;
};

type RetryPolicyOperation = ControlFlowOperation & {
  plan: RetryPolicyPlan;
};

type DoWhileSynthesisOperation = ControlFlowOperation & {
  plan: DoWhileSynthesisPlan;
};

type ErrorPathTemplateOperation = ControlFlowOperation & {
  plan: ErrorPathTemplatePlan;
};

export class TriggerBindingError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422,
    readonly diagnostics: Diagnostic[] = []
  ) {
    super(message);
    this.name = "TriggerBindingError";
  }
}

export class SubflowOperationError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422,
    readonly diagnostics: Diagnostic[] = []
  ) {
    super(message);
    this.name = "SubflowOperationError";
  }
}

export class ControlFlowSynthesisError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422,
    readonly diagnostics: Diagnostic[] = []
  ) {
    super(message);
    this.name = "ControlFlowSynthesisError";
  }
}

export class ErrorPathTemplateError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422,
    readonly diagnostics: Diagnostic[] = []
  ) {
    super(message);
    this.name = "ErrorPathTemplateError";
  }
}

export class RunTraceError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 422,
    readonly diagnostics: Diagnostic[] = []
  ) {
    super(message);
    this.name = "RunTraceError";
  }
}

export class ReplayError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 422,
    readonly diagnostics: Diagnostic[] = []
  ) {
    super(message);
    this.name = "ReplayError";
  }
}

export class RunComparisonError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 422,
    readonly diagnostics: Diagnostic[] = []
  ) {
    super(message);
    this.name = "RunComparisonError";
  }
}

type ComparableRunStep = {
  taskId: string;
  status: "completed" | "failed" | "skipped";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  flowState?: Record<string, unknown>;
  activityState?: Record<string, unknown>;
  diagnostics: Diagnostic[];
};

type ComparableRun = {
  artifactId: string;
  kind: ComparableRunArtifactKind;
  flowId: string;
  summaryStatus: "completed" | "failed";
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  stepCount: number;
  evidenceKind?: "runtime_backed" | "simulated_fallback";
  comparisonBasis: RunComparisonBasis;
  diagnostics: Diagnostic[];
  steps: ComparableRunStep[];
  runtimeEvidence?: RuntimeEvidence;
  restReplay?: RestReplayEvidence;
  replayMetadata?: {
    inputSource: "trace_artifact" | "explicit_input";
    baseInput: Record<string, unknown>;
    effectiveInput: Record<string, unknown>;
    overridesApplied: boolean;
  };
};

const triggerImportRegistry = {
  rest: {
    alias: "rest",
    ref: "github.com/project-flogo/contrib/trigger/rest"
  },
  timer: {
    alias: "timer",
    ref: "github.com/project-flogo/contrib/trigger/timer"
  },
  cli: {
    alias: "cli",
    ref: "github.com/project-flogo/contrib/trigger/cli"
  },
  channel: {
    alias: "channel",
    ref: "github.com/project-flogo/contrib/trigger/channel"
  }
} as const;

const knownDescriptorRegistry = new Map<string, Omit<ContribDescriptor, "ref" | "alias" | "evidence">>([
  [
    "rest",
    {
      type: "trigger",
      name: "rest",
      title: "REST Trigger",
      settings: [{ name: "port", type: "integer", required: true }],
      inputs: [
        { name: "pathParams", type: "object", required: false },
        { name: "queryParams", type: "object", required: false },
        { name: "headers", type: "object", required: false },
        { name: "content", type: "object", required: false }
      ],
      outputs: [
        { name: "code", type: "integer", required: false },
        { name: "data", type: "object", required: false },
        { name: "headers", type: "object", required: false },
        { name: "cookies", type: "object", required: false }
      ],
      examples: ["Bind a reusable flow to GET /resource/{id}"],
      compatibilityNotes: ["Works as a trigger adapter for HTTP-facing flows"],
      source: "registry"
    }
  ],
  [
    "log",
    {
      type: "activity",
      name: "log",
      title: "Log Activity",
      settings: [],
      inputs: [{ name: "message", type: "string", required: true }],
      outputs: [],
      examples: ["Log trigger input before calling downstream activity"],
      compatibilityNotes: ["Useful for trace and debugging instrumentation"],
      source: "registry"
    }
  ],
  [
    "timer",
    {
      type: "trigger",
      name: "timer",
      title: "Timer Trigger",
      settings: [{ name: "interval", type: "string", required: true }],
      inputs: [],
      outputs: [{ name: "tick", type: "string", required: false }],
      examples: ["Run a flow on a fixed interval"],
      compatibilityNotes: ["Use for batch and scheduled flows"],
      source: "registry"
    }
  ],
  [
    "cli",
    {
      type: "trigger",
      name: "cli",
      title: "CLI Trigger",
      settings: [],
      inputs: [{ name: "args", type: "array", required: false }],
      outputs: [{ name: "stdout", type: "string", required: false }],
      examples: ["Run a flow as a one-shot CLI command"],
      compatibilityNotes: ["Useful for command and batch profiles"],
      source: "registry"
    }
  ],
  [
    "channel",
    {
      type: "trigger",
      name: "channel",
      title: "Channel Trigger",
      settings: [{ name: "name", type: "string", required: true }],
      inputs: [{ name: "message", type: "object", required: false }],
      outputs: [{ name: "reply", type: "object", required: false }],
      examples: ["Run a flow from an internal engine channel"],
      compatibilityNotes: ["Useful for internal worker topologies"],
      source: "registry"
    }
  ]
]);

const resolverPattern = /\$(activity\[([^\]]+)\]|flow(?:\.([A-Za-z0-9_.-]+))?|env(?:\.([A-Za-z0-9_.-]+))?|property(?:\.([A-Za-z0-9_.-]+))?|trigger(?:\.([A-Za-z0-9_.-]+))?)/g;

function createEmptyMappingContext(): MappingPreviewContext {
  return {
    flow: {},
    activity: {},
    env: {},
    property: {},
    trigger: {}
  };
}

export function parseFlogoAppDocument(document: string | FlogoApp | unknown): FlogoApp {
  const parsed = typeof document === "string" ? JSON.parse(document) : document;
  const normalized = normalizeAppShape(parsed);
  return FlogoAppSchema.parse(normalized);
}

export function buildAppGraph(document: string | FlogoApp | unknown): FlogoAppGraph {
  const app = parseFlogoAppDocument(document);
  const importsByAlias = Object.fromEntries(app.imports.map((entry) => [entry.alias, entry.ref]));
  const resourceIds = app.resources.map((resource) => resource.id);
  const taskIds = app.resources.flatMap((resource) => resource.data.tasks.map((task) => task.id));

  return FlogoAppGraphSchema.parse({
    app,
    importsByAlias,
    resourceIds,
    taskIds,
    diagnostics: []
  });
}

export function validateStructural(document: string | FlogoApp | unknown): ValidationStageResult {
  const diagnostics: Diagnostic[] = [];

  try {
    const parsed = typeof document === "string" ? JSON.parse(document) : document;
    const normalized = normalizeAppShape(parsed);
    FlogoAppSchema.parse(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown structural validation failure";
    diagnostics.push(createDiagnostic("flogo.structural.invalid", message, "error"));
  }

  return stageResult("structural", diagnostics);
}

export function validateAliases(document: string | FlogoApp | unknown): Diagnostic[] {
  const app = parseFlogoAppDocument(document);
  const diagnostics: Diagnostic[] = [];
  const seenAliases = new Set<string>();

  for (const entry of app.imports) {
    if (seenAliases.has(entry.alias)) {
      diagnostics.push(
        createDiagnostic(
          "flogo.alias.duplicate",
          `Import alias "${entry.alias}" is defined more than once`,
          "error",
          `imports.${entry.alias}`
        )
      );
    }
    seenAliases.add(entry.alias);

    if (entry.alias.trim().length === 0) {
      diagnostics.push(createDiagnostic("flogo.alias.blank", "Import alias cannot be blank", "error", "imports"));
    }
  }

  return diagnostics;
}

export function validateSemantic(document: string | FlogoApp | unknown): ValidationStageResult {
  const graph = buildAppGraph(document);
  const diagnostics: Diagnostic[] = [...validateAliases(document)];
  const resourceIds = new Set(graph.resourceIds);
  const importAliases = new Set(Object.keys(graph.importsByAlias));

  for (const trigger of graph.app.triggers) {
    const inferredAlias = inferAliasFromRef(trigger.ref);
    if (trigger.ref.startsWith("#") && inferredAlias && !importAliases.has(inferredAlias) && inferredAlias !== "flow") {
      diagnostics.push(
        createDiagnostic(
          "flogo.semantic.inferred_trigger_alias",
          `Trigger "${trigger.id}" uses alias "${inferredAlias}" without an explicit import`,
          "warning",
          `triggers.${trigger.id}.ref`
        )
      );
    }

    for (const handler of trigger.handlers) {
      const ref = handler.action.ref;
      if (ref.startsWith("#flow:")) {
        const flowId = ref.replace("#flow:", "");
        if (!resourceIds.has(flowId)) {
          diagnostics.push(
            createDiagnostic(
              "flogo.semantic.missing_flow",
              `Handler action ref "${ref}" does not match a known flow resource`,
              "error",
              `triggers.${trigger.id}.handlers`
            )
          );
        }
      }
    }
  }

  for (const resource of graph.app.resources) {
    for (const task of resource.data.tasks) {
      if (!task.activityRef) {
        diagnostics.push(
          createDiagnostic(
            "flogo.semantic.missing_activity_ref",
            `Task "${task.id}" is missing an activity ref`,
            "warning",
            `resources.${resource.id}.tasks.${task.id}`
          )
        );
        continue;
      }

      if (task.activityRef.startsWith("#")) {
        const alias = inferAliasFromRef(task.activityRef);
        if (alias && !importAliases.has(alias) && alias !== "flow" && alias !== "rest") {
          diagnostics.push(
            createDiagnostic(
              "flogo.semantic.missing_import",
              `Task "${task.id}" references missing import alias "#${alias}"`,
              "error",
              `resources.${resource.id}.tasks.${task.id}.activityRef`
            )
          );
        }
      }
    }
  }

  return stageResult("semantic", diagnostics);
}

function collectActivityReferences(value: unknown, references: Set<string>): void {
  if (typeof value === "string") {
    const regex = /\$activity\[([^\]]+)\]/g;
    let match: RegExpExecArray | null = regex.exec(value);
    while (match) {
      references.add(match[1]);
      match = regex.exec(value);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectActivityReferences(entry, references);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      collectActivityReferences(nestedValue, references);
    }
  }
}

export function validateMappings(document: string | FlogoApp | unknown): ValidationStageResult {
  const graph = buildAppGraph(document);
  const diagnostics: Diagnostic[] = [];

  for (const resource of graph.app.resources) {
    const seenTasks = new Set<string>();

    for (const task of resource.data.tasks) {
      const preExecutionReferences = new Set<string>();
      collectActivityReferences(task.input, preExecutionReferences);
      collectActivityReferences(task.settings, preExecutionReferences);

      for (const reference of preExecutionReferences) {
        if (!seenTasks.has(reference)) {
          diagnostics.push(
            createDiagnostic(
              "flogo.mapping.invalid_activity_scope",
              `Task "${task.id}" references activity "${reference}" before it exists in flow order`,
              "error",
              `resources.${resource.id}.tasks.${task.id}`
            )
          );
        }
      }

      const outputReferences = new Set<string>();
      collectActivityReferences(task.output, outputReferences);
      for (const reference of outputReferences) {
        if (!seenTasks.has(reference) && reference !== task.id) {
          diagnostics.push(
            createDiagnostic(
              "flogo.mapping.invalid_activity_scope",
              `Task "${task.id}" references activity "${reference}" before it exists in flow order`,
              "error",
              `resources.${resource.id}.tasks.${task.id}`
            )
          );
        }
      }

      seenTasks.add(task.id);
    }
  }

  return stageResult("semantic", diagnostics);
}

export function validateDependencies(document: string | FlogoApp | unknown): ValidationStageResult {
  const app = parseFlogoAppDocument(document);
  const diagnostics: Diagnostic[] = [];

  for (const entry of app.imports) {
    if (!entry.ref.includes("/") && !entry.ref.startsWith("#")) {
      diagnostics.push(
        createDiagnostic(
          "flogo.dependency.invalid_ref",
          `Import "${entry.alias}" has a non-package ref "${entry.ref}"`,
          "warning",
          `imports.${entry.alias}`
        )
      );
    }
  }

  return stageResult("dependency", diagnostics);
}

export function validateFlogoApp(document: string | FlogoApp | unknown): ValidationReport {
  const stages = [
    validateStructural(document),
    validateSemantic(document),
    validateMappings(document),
    validateDependencies(document)
  ];

  const ok = stages.every((stage) => stage.ok);
  const summary = ok
    ? "Flogo application passed structural, semantic, mapping, and dependency validation."
    : "Flogo application has validation errors that must be resolved before build or runtime checks.";

  return ValidationReportSchema.parse({
    ok,
    stages,
    summary,
    artifacts: []
  });
}

export function buildContributionInventory(
  document: string | FlogoApp | unknown,
  options?: ContribLookupOptions
): ContributionInventory {
  const app = parseFlogoAppDocument(document);
  const diagnostics: Diagnostic[] = [];
  const entries = new Map<string, ContributionInventoryEntry>();

  const upsert = (entry: ContributionInventoryEntry, entryDiagnostics: Diagnostic[]) => {
    const key = `${entry.type}:${entry.alias ?? entry.ref}`;
    const existing = entries.get(key);
    if (!existing || compareEvidenceStrength(entry.source, existing.source) >= 0) {
      entries.set(key, ContributionInventoryEntrySchema.parse(entry));
    }
    diagnostics.push(...entryDiagnostics);
  };

  for (const entry of app.imports) {
    const resolved = resolveInventoryEntry(app, entry.ref, entry.alias, entry.version, undefined, options);
    upsert(resolved.entry, resolved.diagnostics);
  }

  for (const trigger of app.triggers) {
    const alias = inferAliasFromRef(trigger.ref);
    if (alias === "flow") {
      continue;
    }
    const resolved = resolveInventoryEntry(app, trigger.ref, alias, undefined, "trigger", options);
    upsert(resolved.entry, resolved.diagnostics);
  }

  for (const resource of app.resources) {
    upsert(buildFlowInventoryEntry(resource), []);
    for (const task of resource.data.tasks) {
      if (!task.activityRef) {
        continue;
      }
      const alias = inferAliasFromRef(task.activityRef);
      if (alias === "flow") {
        continue;
      }
      const resolved = resolveInventoryEntry(app, task.activityRef, alias, undefined, undefined, options);
      upsert(resolved.entry, resolved.diagnostics);
    }
  }

  return ContributionInventorySchema.parse({
    appName: app.name,
    entries: Array.from(entries.values()).sort((left, right) => left.name.localeCompare(right.name)),
    diagnostics: dedupeDiagnostics(diagnostics)
  });
}

export function buildContribCatalog(document: string | FlogoApp | unknown, options?: ContribLookupOptions): ContribCatalog {
  const app = parseFlogoAppDocument(document);
  const inventory = buildContributionInventory(app, options);
  const entries = new Map<string, ContribDescriptor>();

  const upsert = (entry: ContribDescriptor) => {
    const key = `${entry.type}:${entry.alias ?? entry.ref}`;
    entries.set(key, ContribDescriptorSchema.parse(entry));
  };

  for (const entry of inventory.entries) {
    upsert(inventoryEntryToDescriptor(entry));
  }

  for (const trigger of app.triggers) {
    const resolved = resolveInventoryEntry(app, trigger.ref, inferAliasFromRef(trigger.ref), undefined, "trigger", options);
    upsert(withCatalogRef(inventoryEntryToDescriptor(resolved.entry), trigger.ref));
  }

  for (const resource of app.resources) {
    upsert(inventoryEntryToDescriptor(buildFlowInventoryEntry(resource)));

    for (const task of resource.data.tasks) {
      if (!task.activityRef) {
        continue;
      }
      const resolved = resolveInventoryEntry(app, task.activityRef, inferAliasFromRef(task.activityRef), undefined, undefined, options);
      upsert(withCatalogRef(inventoryEntryToDescriptor(resolved.entry), task.activityRef));
    }
  }

  return ContribCatalogSchema.parse({
    appName: app.name,
    entries: Array.from(entries.values()).sort((left, right) => left.name.localeCompare(right.name)),
    diagnostics: inventory.diagnostics
  });
}

export function inspectContribDescriptor(
  document: string | FlogoApp | unknown,
  refOrAlias: string,
  options?: ContribLookupOptions
): ContribDescriptorResponse | undefined {
  const app = parseFlogoAppDocument(document);
  const inventory = buildContributionInventory(app, options);
  const entry = findInventoryEntry(app, inventory, refOrAlias);
  if (!entry) {
    return undefined;
  }

  return ContribDescriptorResponseSchema.parse({
    descriptor: inventoryEntryToDescriptor(entry),
    diagnostics: dedupeDiagnostics(entry.diagnostics)
  });
}

export function inspectContribEvidence(
  document: string | FlogoApp | unknown,
  refOrAlias: string,
  options?: ContribLookupOptions
): ContribEvidenceDetail | undefined {
  const app = parseFlogoAppDocument(document);
  const inventory = buildContributionInventory(app, options);
  const entry = findInventoryEntry(app, inventory, refOrAlias);
  if (!entry) {
    return undefined;
  }

  return ContribEvidenceDetailSchema.parse(entry);
}

export function introspectContrib(
  document: string | FlogoApp | unknown,
  refOrAlias: string,
  options?: ContribLookupOptions
): ContribDescriptor | undefined {
  return inspectContribDescriptor(document, refOrAlias, options)?.descriptor;
}

export function inferFlowContracts(document: string | FlogoApp | unknown): FlowContracts {
  const app = parseFlogoAppDocument(document);
  const diagnostics: Diagnostic[] = [];
  const contracts = app.resources
    .map((flow) => inferFlowContractForApp(app, flow, diagnostics))
    .sort((left, right) => left.flowId.localeCompare(right.flowId));

  return FlowContractsSchema.parse({
    appName: app.name,
    contracts,
    diagnostics: dedupeDiagnostics(diagnostics)
  });
}

export function inferFlowContract(document: string | FlogoApp | unknown, flowId: string): FlowContract | undefined {
  const app = parseFlogoAppDocument(document);
  const flow = app.resources.find((entry) => entry.id === flowId);
  if (!flow) {
    return undefined;
  }

  return inferFlowContractForApp(app, flow, []);
}

export function planRunTrace(
  document: string | FlogoApp | unknown,
  requestInput: RunTraceRequest | unknown
): RunTraceResponse {
  const app = parseFlogoAppDocument(document);
  const request = RunTraceRequestSchema.parse(requestInput);
  const flow = app.resources.find((resource) => resource.id === request.flowId);
  if (!flow) {
    throw new RunTraceError(`Unknown flow ${request.flowId}`, 404, [
      createDiagnostic("flogo.run_trace.unknown_flow", `Unable to locate flow "${request.flowId}"`, "error", request.flowId)
    ]);
  }

  const contract = inferFlowContractForApp(app, flow, []);
  const diagnostics: Diagnostic[] = [];
  const requiredInputs = contract.inputs.filter((input) => input.required).map((input) => input.name);
  for (const input of requiredInputs) {
    if (!(input in request.sampleInput)) {
      diagnostics.push(
        createDiagnostic(
          "flogo.run_trace.missing_required_input",
          `Flow "${request.flowId}" requires input "${input}" for trace execution`,
          "error",
          `sampleInput.${input}`
        )
      );
    }
  }

  const validation = ValidationReportSchema.parse({
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    stages: [
      stageResult("runtime", diagnostics.length > 0 ? diagnostics : [
        createDiagnostic(
          "flogo.run_trace.ready",
          `Flow "${request.flowId}" can be traced with the provided sample input`,
          "info",
          request.flowId
        )
      ])
    ],
    summary:
      diagnostics.length === 0
        ? `Run trace plan is valid for flow ${request.flowId}.`
        : `Run trace plan is invalid for flow ${request.flowId}.`,
    artifacts: []
  });

  if (!validation.ok) {
    throw new RunTraceError(`Run trace request is invalid for flow ${request.flowId}`, 422, diagnostics);
  }

  return RunTraceResponseSchema.parse({
    validation
  });
}

function deepMergeReplayInput(base: unknown, overrides: unknown): unknown {
  if (Array.isArray(overrides)) {
    return overrides.map((item) => deepMergeReplayInput(undefined, item));
  }

  if (overrides !== null && typeof overrides === "object") {
    const baseRecord =
      base !== null && typeof base === "object" && !Array.isArray(base) ? (base as Record<string, unknown>) : {};
    const result: Record<string, unknown> = { ...baseRecord };
    for (const [key, value] of Object.entries(overrides as Record<string, unknown>)) {
      result[key] = deepMergeReplayInput(baseRecord[key], value);
    }
    return result;
  }

  return overrides === undefined ? base : overrides;
}

export function mergeReplayInput(
  baseInput: Record<string, unknown>,
  overrides: Record<string, unknown> | undefined
): Record<string, unknown> {
  return deepMergeReplayInput(baseInput, overrides ?? {}) as Record<string, unknown>;
}

export function planReplay(
  document: string | FlogoApp | unknown,
  requestInput: ReplayRequest | unknown
): ReplayResponse {
  const app = parseFlogoAppDocument(document);
  const request = ReplayRequestSchema.parse(requestInput);
  const flow = app.resources.find((resource) => resource.id === request.flowId);
  if (!flow) {
    throw new ReplayError(`Unknown flow ${request.flowId}`, 404, [
      createDiagnostic("flogo.replay.unknown_flow", `Unable to locate flow "${request.flowId}"`, "error", request.flowId)
    ]);
  }

  const baseInput = request.baseInput ?? {};
  const effectiveInput = mergeReplayInput(baseInput, request.overrides);
  const contract = inferFlowContractForApp(app, flow, []);
  const diagnostics: Diagnostic[] = [];
  const requiredInputs = contract.inputs.filter((input) => input.required).map((input) => input.name);
  for (const input of requiredInputs) {
    if (!(input in effectiveInput)) {
      diagnostics.push(
        createDiagnostic(
          "flogo.replay.missing_required_input",
          `Flow "${request.flowId}" requires input "${input}" for replay execution`,
          "error",
          `effectiveInput.${input}`
        )
      );
    }
  }

  const validation = ValidationReportSchema.parse({
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    stages: [
      stageResult("runtime", diagnostics.length > 0
        ? diagnostics
        : [
            createDiagnostic(
              "flogo.replay.ready",
              `Flow "${request.flowId}" can be replayed with the effective input`,
              "info",
              request.flowId
            )
          ])
    ],
    summary:
      diagnostics.length === 0
        ? `Replay plan is valid for flow ${request.flowId}.`
        : `Replay plan is invalid for flow ${request.flowId}.`,
    artifacts: []
  });

  if (!validation.ok) {
    throw new ReplayError(`Replay request is invalid for flow ${request.flowId}`, 422, diagnostics);
  }

  return ReplayResponseSchema.parse({
    result: {
      summary: {
        flowId: request.flowId,
        status: "completed",
        inputSource: request.traceArtifactId ? "trace_artifact" : "explicit_input",
        baseInput,
        effectiveInput,
        overridesApplied: Object.keys(request.overrides ?? {}).length > 0,
        diagnostics
      },
      validation
    }
  });
}

function normalizeRuntimeEvidenceSteps(
  _traceSteps: RunTrace["steps"],
  runtimeEvidence?: RuntimeEvidence
): NormalizedRuntimeStepEvidence[] {
  return runtimeEvidence?.normalizedSteps ?? [];
}

function runtimeEvidenceHasRestTriggerRuntime(runtimeEvidence?: RuntimeEvidence) {
  return Boolean(runtimeEvidence?.restTriggerRuntime);
}

function runtimeEvidenceHasChannelTriggerRuntime(runtimeEvidence?: RuntimeEvidence) {
  return Boolean(runtimeEvidence?.channelTriggerRuntime);
}

function runtimeEvidenceHasTimerTriggerRuntime(runtimeEvidence?: RuntimeEvidence) {
  return Boolean(runtimeEvidence?.timerTriggerRuntime);
}

function runtimeEvidenceHasCLITriggerRuntime(runtimeEvidence?: RuntimeEvidence) {
  return Boolean(runtimeEvidence?.cliTriggerRuntime);
}

function runtimeEvidenceHasRestEnvelope(runtimeEvidence?: RuntimeEvidence) {
  return Boolean(runtimeEvidence?.restTriggerRuntime);
}

function buildTimerRuntimeComparison(left: ComparableRun, right: ComparableRun): TimerRuntimeComparison | undefined {
  const leftTimerRuntime = left.runtimeEvidence?.timerTriggerRuntime;
  const rightTimerRuntime = right.runtimeEvidence?.timerTriggerRuntime;
  if (!leftTimerRuntime || !rightTimerRuntime) {
    return undefined;
  }

  return TimerRuntimeComparisonSchema.parse({
    comparisonBasis: "timer_runtime_startup",
    runtimeMode: left.runtimeEvidence?.runtimeMode ?? right.runtimeEvidence?.runtimeMode,
    settingsCompared: true,
    flowInputCompared: true,
    flowOutputCompared: true,
    tickCompared: true,
    settingsDiff: createValueDiff(leftTimerRuntime.settings, rightTimerRuntime.settings),
    flowInputDiff: createValueDiff(leftTimerRuntime.flowInput, rightTimerRuntime.flowInput),
    flowOutputDiff: createValueDiff(leftTimerRuntime.flowOutput, rightTimerRuntime.flowOutput),
    tickDiff: createValueDiff(leftTimerRuntime.tick, rightTimerRuntime.tick),
    unsupportedFields: dedupeStrings([
      ...(leftTimerRuntime.unavailableFields ?? []),
      ...(rightTimerRuntime.unavailableFields ?? [])
    ]),
    diagnostics: dedupeDiagnostics([
      ...cloneDiagnostics(leftTimerRuntime.diagnostics),
      ...cloneDiagnostics(rightTimerRuntime.diagnostics)
    ])
  });
}

function buildChannelRuntimeComparison(
  left: ComparableRun,
  right: ComparableRun
): ChannelRuntimeComparison | undefined {
  const leftChannelRuntime = left.runtimeEvidence?.channelTriggerRuntime;
  const rightChannelRuntime = right.runtimeEvidence?.channelTriggerRuntime;
  if (!leftChannelRuntime || !rightChannelRuntime) {
    return undefined;
  }

  return ChannelRuntimeComparisonSchema.parse({
    comparisonBasis: "channel_runtime_boundary",
    runtimeMode: left.runtimeEvidence?.runtimeMode ?? right.runtimeEvidence?.runtimeMode,
    channelCompared: true,
    dataCompared: true,
    flowInputCompared: true,
    flowOutputCompared: true,
    channelDiff: createValueDiff(leftChannelRuntime.handler?.channel, rightChannelRuntime.handler?.channel),
    dataDiff: createValueDiff(leftChannelRuntime.data, rightChannelRuntime.data),
    flowInputDiff: createValueDiff(leftChannelRuntime.flowInput ?? {}, rightChannelRuntime.flowInput ?? {}),
    flowOutputDiff: createValueDiff(leftChannelRuntime.flowOutput ?? {}, rightChannelRuntime.flowOutput ?? {}),
    unsupportedFields: dedupeStrings([
      ...(leftChannelRuntime.unavailableFields ?? []),
      ...(rightChannelRuntime.unavailableFields ?? [])
    ]),
    diagnostics: dedupeDiagnostics([
      ...cloneDiagnostics(leftChannelRuntime.diagnostics),
      ...cloneDiagnostics(rightChannelRuntime.diagnostics)
    ])
  });
}

function comparableRunSteps(
  traceSteps: RunTrace["steps"],
  runtimeEvidence?: RuntimeEvidence
): ComparableRunStep[] {
  const normalizedSteps = normalizeRuntimeEvidenceSteps(traceSteps, runtimeEvidence);
  if (normalizedSteps.length === 0) {
    return traceSteps.map((step) => ({
      taskId: step.taskId,
      status: step.status,
      input: step.input,
      output: step.output,
      flowState: step.flowState,
      activityState: step.activityState,
      diagnostics: step.diagnostics
    }));
  }

  return normalizedSteps.map((step) => ({
    taskId: step.taskId,
    status: step.status,
    input: step.resolvedInputs,
    output: step.producedOutputs,
    flowState: Object.keys({
      ...(step.flowStateBefore ? { before: step.flowStateBefore } : {}),
      ...(step.flowStateAfter ? { after: step.flowStateAfter } : {}),
      ...(step.stateDelta ? { delta: step.stateDelta } : {})
    }).length
      ? {
          ...(step.flowStateBefore ? { before: step.flowStateBefore } : {}),
          ...(step.flowStateAfter ? { after: step.flowStateAfter } : {}),
          ...(step.stateDelta ? { delta: step.stateDelta } : {})
        }
      : undefined,
    activityState: Object.keys({
      ...(step.declaredInputMappings ? { declaredInputMappings: step.declaredInputMappings } : {}),
      ...(step.declaredOutputMappings ? { declaredOutputMappings: step.declaredOutputMappings } : {}),
      ...(step.evidenceSource ? { evidenceSource: step.evidenceSource } : {}),
      ...((step.unavailableFields?.length ?? 0) > 0 ? { unavailableFields: step.unavailableFields } : {})
    }).length
      ? {
          ...(step.declaredInputMappings ? { declaredInputMappings: step.declaredInputMappings } : {}),
          ...(step.declaredOutputMappings ? { declaredOutputMappings: step.declaredOutputMappings } : {}),
          ...(step.evidenceSource ? { evidenceSource: step.evidenceSource } : {}),
          ...((step.unavailableFields?.length ?? 0) > 0 ? { unavailableFields: step.unavailableFields } : {})
        }
      : undefined,
    diagnostics: step.diagnostics
  }));
}

function comparisonBasisPreference(
  runtimeEvidence?: RuntimeEvidence,
  evidenceKind?: "runtime_backed" | "simulated_fallback"
): RunComparisonBasis {
  if (runtimeEvidenceHasChannelTriggerRuntime(runtimeEvidence)) {
    return "channel_runtime_boundary";
  }
  if (runtimeEvidenceHasRestEnvelope(runtimeEvidence)) {
    return "rest_runtime_envelope";
  }
  if (runtimeEvidenceHasTimerTriggerRuntime(runtimeEvidence)) {
    return "timer_runtime_startup";
  }
  if ((runtimeEvidence?.normalizedSteps?.length ?? 0) > 0) {
    return "normalized_runtime_evidence";
  }
  if (runtimeEvidence?.recorderBacked) {
    return "recorder_backed";
  }
  if (evidenceKind === "runtime_backed" || runtimeEvidence?.kind === "runtime_backed") {
    return "runtime_backed";
  }
  return "simulated_fallback";
}

function parseComparableRunPayload(
  artifactId: string,
  kind: ComparableRunArtifactKind,
  payload: unknown
): ComparableRun {
  if (kind !== "run_trace" && kind !== "replay_report") {
    throw new RunComparisonError(`Artifact ${artifactId} is not a comparable runtime artifact`, 422, [
      createDiagnostic(
        "flogo.run_comparison.invalid_artifact_kind",
        `Artifact "${artifactId}" has kind "${String(kind)}" and is not a comparable runtime trace or replay artifact.`,
        "error",
        artifactId
      )
    ]);
  }

  if (kind === "run_trace") {
    const parsed = RunTraceResponseSchema.parse(payload);
    if (!parsed.trace) {
      throw new RunComparisonError(`Artifact ${artifactId} does not contain a runtime trace`, 422, [
        createDiagnostic(
          "flogo.run_comparison.artifact_payload_invalid",
          `Artifact "${artifactId}" does not contain a trace payload.`,
          "error",
          artifactId
        )
      ]);
    }

    const runtimeEvidence = parsed.trace.runtimeEvidence;
    const evidenceKind = parsed.trace.evidenceKind ?? runtimeEvidence?.kind;
    const artifactComparisonBasis =
      parsed.trace.comparisonBasisPreference ??
      comparisonBasisPreference(runtimeEvidence, evidenceKind);
    return {
      artifactId,
      kind,
      flowId: parsed.trace.flowId,
      summaryStatus: parsed.trace.summary.status,
      input: preferRecordedFlowInputs(parsed.trace.summary.input, runtimeEvidence),
      output: preferRecordedFlowOutputs(parsed.trace.summary.output, runtimeEvidence),
      error: parsed.trace.summary.error,
      stepCount: preferRecordedStepCount(parsed.trace.summary.stepCount, runtimeEvidence),
      evidenceKind,
      comparisonBasis: artifactComparisonBasis,
      diagnostics: dedupeDiagnostics([
        ...parsed.trace.summary.diagnostics,
        ...parsed.trace.diagnostics
      ]),
      steps: comparableRunSteps(parsed.trace.steps, runtimeEvidence),
      runtimeEvidence
    };
  }

  const parsed = ReplayResponseSchema.parse(payload);
  const nestedTrace = parsed.result.trace;
  const runtimeEvidence = parsed.result.runtimeEvidence ?? nestedTrace?.runtimeEvidence;
  const flowId = nestedTrace?.flowId ?? parsed.result.summary.flowId;
  const summaryStatus = nestedTrace?.summary.status ?? parsed.result.summary.status;
  const input = nestedTrace
    ? preferRecordedFlowInputs(nestedTrace.summary.input, runtimeEvidence)
    : preferRecordedFlowInputs(parsed.result.summary.effectiveInput, runtimeEvidence);
  const output = nestedTrace
    ? preferRecordedFlowOutputs(nestedTrace.summary.output, runtimeEvidence)
    : recorderFlowOutputs(runtimeEvidence);
  const error = nestedTrace?.summary.error;
  const stepCount = preferRecordedStepCount(nestedTrace?.summary.stepCount ?? 0, runtimeEvidence);
  const diagnostics = dedupeDiagnostics([
    ...parsed.result.summary.diagnostics,
    ...(nestedTrace?.summary.diagnostics ?? []),
    ...(nestedTrace?.diagnostics ?? [])
  ]);
  const evidenceKind = runtimeEvidence?.kind ?? nestedTrace?.evidenceKind;
  const artifactComparisonBasis =
    parsed.result.comparisonBasisPreference ??
    nestedTrace?.comparisonBasisPreference ??
    comparisonBasisPreference(runtimeEvidence, evidenceKind);
  const steps = comparableRunSteps(nestedTrace?.steps ?? [], runtimeEvidence);
  const restReplay = parsed.result.restReplay ?? buildRestReplayEvidence(runtimeEvidence);

  return {
    artifactId,
    kind,
    flowId,
    summaryStatus,
    input,
    output,
    error,
    stepCount,
    evidenceKind,
    comparisonBasis: artifactComparisonBasis,
    diagnostics,
    steps,
    runtimeEvidence,
    restReplay,
    replayMetadata: {
      inputSource: parsed.result.summary.inputSource,
      baseInput: parsed.result.summary.baseInput,
      effectiveInput: parsed.result.summary.effectiveInput,
      overridesApplied: parsed.result.summary.overridesApplied
    }
  };
}

function recorderFlowInputs(runtimeEvidence?: RuntimeEvidence) {
  if (!runtimeEvidence?.flowStart || typeof runtimeEvidence.flowStart !== "object") {
    return undefined;
  }
  const inputs = runtimeEvidence.flowStart["flow_inputs"];
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
    return undefined;
  }
  return inputs as Record<string, unknown>;
}

function recorderFlowOutputs(runtimeEvidence?: RuntimeEvidence) {
  const candidate = runtimeEvidence?.flowDone ?? runtimeEvidence?.flowStart;
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }
  const outputs = candidate["flow_outputs"];
  if (!outputs || typeof outputs !== "object" || Array.isArray(outputs)) {
    return undefined;
  }
  return outputs as Record<string, unknown>;
}

function preferRecordedFlowInputs(
  summaryInput: Record<string, unknown>,
  runtimeEvidence?: RuntimeEvidence
) {
  return recorderFlowInputs(runtimeEvidence) ?? summaryInput;
}

function preferRecordedFlowOutputs(
  summaryOutput: Record<string, unknown> | undefined,
  runtimeEvidence?: RuntimeEvidence
) {
  return recorderFlowOutputs(runtimeEvidence) ?? summaryOutput;
}

function preferRecordedStepCount(summaryStepCount: number, runtimeEvidence?: RuntimeEvidence) {
  const recorderStepCount = runtimeEvidence?.steps?.length ?? 0;
  const snapshotCount = runtimeEvidence?.snapshots?.length ?? 0;
  const normalizedStepCount = runtimeEvidence?.normalizedSteps?.length ?? 0;
  return Math.max(summaryStepCount, recorderStepCount, snapshotCount, normalizedStepCount);
}

function buildRestReplayEvidence(runtimeEvidence?: RuntimeEvidence): RestReplayEvidence | undefined {
  const restRuntime = runtimeEvidence?.restTriggerRuntime;
  if (!restRuntime) {
    return undefined;
  }

  return {
    comparisonBasis: "rest_runtime_envelope",
    runtimeMode: runtimeEvidence?.runtimeMode,
    requestEnvelopeObserved: Boolean(restRuntime.request),
    mappedFlowInputObserved: Boolean(restRuntime.flowInput && Object.keys(restRuntime.flowInput).length > 0),
    mappedFlowOutputObserved: Boolean(restRuntime.flowOutput && Object.keys(restRuntime.flowOutput).length > 0),
    replyEnvelopeObserved: Boolean(restRuntime.reply),
    unsupportedFields: dedupeStrings([...(restRuntime.unavailableFields ?? []), ...(restRuntime.mapping?.unavailableFields ?? [])]),
    diagnostics: cloneDiagnostics(restRuntime.diagnostics)
  };
}

function buildRestEnvelopeComparison(left: ComparableRun, right: ComparableRun): RestEnvelopeComparison | undefined {
  const leftRestRuntime = left.runtimeEvidence?.restTriggerRuntime;
  const rightRestRuntime = right.runtimeEvidence?.restTriggerRuntime;
  if (!leftRestRuntime || !rightRestRuntime) {
    return undefined;
  }

  const normalizedStepEvidenceCompared =
    (left.runtimeEvidence?.normalizedSteps?.length ?? 0) > 0 ||
    (right.runtimeEvidence?.normalizedSteps?.length ?? 0) > 0;

  return {
    comparisonBasis: "rest_runtime_envelope",
    requestEnvelopeCompared: true,
    mappedFlowInputCompared: true,
    replyEnvelopeCompared: true,
    normalizedStepEvidenceCompared,
    requestEnvelopeDiff: createValueDiff(leftRestRuntime.request, rightRestRuntime.request),
    mappedFlowInputDiff: createValueDiff(
      leftRestRuntime.mapping?.mappedFlowInput ?? leftRestRuntime.flowInput,
      rightRestRuntime.mapping?.mappedFlowInput ?? rightRestRuntime.flowInput
    ),
    replyEnvelopeDiff: createValueDiff(leftRestRuntime.reply, rightRestRuntime.reply),
    normalizedStepCountDiff: createValueDiff(
      left.runtimeEvidence?.normalizedSteps?.length ?? 0,
      right.runtimeEvidence?.normalizedSteps?.length ?? 0
    ),
    unsupportedFields: dedupeStrings([
      ...(leftRestRuntime.unavailableFields ?? []),
      ...(leftRestRuntime.mapping?.unavailableFields ?? []),
      ...(rightRestRuntime.unavailableFields ?? []),
      ...(rightRestRuntime.mapping?.unavailableFields ?? [])
    ]),
    diagnostics: []
  };
}

function chooseRunComparisonBasis(left: ComparableRun, right: ComparableRun) {
  if (
    left.comparisonBasis === "channel_runtime_boundary" &&
    right.comparisonBasis === "channel_runtime_boundary"
  ) {
    return "channel_runtime_boundary" as const;
  }
  if (
    left.comparisonBasis === "rest_runtime_envelope" &&
    right.comparisonBasis === "rest_runtime_envelope"
  ) {
    return "rest_runtime_envelope" as const;
  }
  if (
    left.comparisonBasis === "timer_runtime_startup" &&
    right.comparisonBasis === "timer_runtime_startup"
  ) {
    return "timer_runtime_startup" as const;
  }
  if (
    left.comparisonBasis === "normalized_runtime_evidence" &&
    right.comparisonBasis === "normalized_runtime_evidence"
  ) {
    return "normalized_runtime_evidence" as const;
  }
  if (usesRecorderComparisonBasis(left.comparisonBasis) && usesRecorderComparisonBasis(right.comparisonBasis)) {
    return "recorder_backed" as const;
  }
  if (usesRecorderComparisonBasis(left.comparisonBasis) || usesRecorderComparisonBasis(right.comparisonBasis)) {
    return "recorder_preferred" as const;
  }
  if (left.comparisonBasis === "runtime_backed" || right.comparisonBasis === "runtime_backed") {
    return "runtime_backed" as const;
  }
  return "simulated_fallback" as const;
}

function usesRecorderComparisonBasis(basis: RunComparisonBasis) {
  return (
    basis === "normalized_runtime_evidence" ||
    basis === "recorder_backed" ||
    basis === "channel_runtime_boundary" ||
    basis === "rest_runtime_envelope" ||
    basis === "timer_runtime_startup"
  );
}

function normalizeRunComparisonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeRunComparisonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, normalizeRunComparisonValue(entryValue)])
    );
  }

  return value;
}

function areRunComparisonValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(normalizeRunComparisonValue(left)) === JSON.stringify(normalizeRunComparisonValue(right));
}

function createValueDiff(left: unknown, right: unknown) {
  if (left === undefined && right === undefined) {
    return { kind: "same" as const };
  }
  if (left === undefined) {
    return { kind: "added" as const, right };
  }
  if (right === undefined) {
    return { kind: "removed" as const, left };
  }
  if (areRunComparisonValuesEqual(left, right)) {
    return { kind: "same" as const, left, right };
  }
  return { kind: "changed" as const, left, right };
}

function createDiagnosticDiff(
  code: string,
  message: string,
  left: unknown,
  right: unknown,
  severity: Diagnostic["severity"] = "info"
) {
  return createDiagnostic(code, message, severity, undefined, { left, right });
}

function buildSummaryDiagnosticDiffs(left: ComparableRun, right: ComparableRun, includeDiagnostics: boolean) {
  const diagnostics: Diagnostic[] = [];
  if (!includeDiagnostics) {
    return diagnostics;
  }

  if (
    left.comparisonBasis === "channel_runtime_boundary" &&
    right.comparisonBasis === "channel_runtime_boundary"
  ) {
    diagnostics.push(
      createDiagnostic(
        "flogo.run_comparison.channel_runtime_boundary_preferred",
        "Compared Channel trigger boundary evidence, sent data, mapped flow input, and flow output using the helper-supported Channel slice.",
        "info",
        undefined,
        {
          leftChannelObserved: Boolean(left.runtimeEvidence?.channelTriggerRuntime),
          rightChannelObserved: Boolean(right.runtimeEvidence?.channelTriggerRuntime),
          leftDataObserved: Boolean(left.runtimeEvidence?.channelTriggerRuntime?.data),
          rightDataObserved: Boolean(right.runtimeEvidence?.channelTriggerRuntime?.data)
        }
      )
    );
  }
  if (
    left.comparisonBasis === "rest_runtime_envelope" &&
    right.comparisonBasis === "rest_runtime_envelope"
  ) {
    diagnostics.push(
      createDiagnostic(
        "flogo.run_comparison.rest_runtime_envelope_preferred",
        "Compared REST runtime-backed request, mapping, and reply envelopes using the helper-supported REST slice.",
        "info",
        undefined,
        {
          leftRequestObserved: left.restReplay?.requestEnvelopeObserved ?? false,
          rightRequestObserved: right.restReplay?.requestEnvelopeObserved ?? false,
          leftReplyObserved: left.restReplay?.replyEnvelopeObserved ?? false,
          rightReplyObserved: right.restReplay?.replyEnvelopeObserved ?? false,
          leftNormalizedSteps: left.runtimeEvidence?.normalizedSteps?.length ?? 0,
          rightNormalizedSteps: right.runtimeEvidence?.normalizedSteps?.length ?? 0
        }
      )
    );
  }

  if (
    left.comparisonBasis === "timer_runtime_startup" &&
    right.comparisonBasis === "timer_runtime_startup"
  ) {
    diagnostics.push(
      createDiagnostic(
        "flogo.run_comparison.timer_runtime_startup_preferred",
        "Compared timer trigger startup evidence, schedule settings, and runtime start/output capture using the helper-supported timer slice.",
        "info",
        undefined,
        {
          leftSettingsObserved: Boolean(left.runtimeEvidence?.timerTriggerRuntime?.settings),
          rightSettingsObserved: Boolean(right.runtimeEvidence?.timerTriggerRuntime?.settings),
          leftTickObserved: Boolean(left.runtimeEvidence?.timerTriggerRuntime?.tick),
          rightTickObserved: Boolean(right.runtimeEvidence?.timerTriggerRuntime?.tick)
        }
      )
    );
  }

  if (
    left.comparisonBasis === "normalized_runtime_evidence" &&
    right.comparisonBasis === "normalized_runtime_evidence"
  ) {
    diagnostics.push(
      createDiagnostic(
        "flogo.run_comparison.normalized_runtime_evidence_preferred",
        "Compared normalized runtime-backed step evidence derived from task events, Flow recorder state, and app metadata.",
        "info",
        undefined,
        {
          leftNormalizedSteps: left.runtimeEvidence?.normalizedSteps?.length ?? 0,
          rightNormalizedSteps: right.runtimeEvidence?.normalizedSteps?.length ?? 0
        }
      )
    );
  }

  if (left.comparisonBasis === "recorder_backed" && right.comparisonBasis === "recorder_backed") {
    diagnostics.push(
      createDiagnostic(
        "flogo.run_comparison.recorder_evidence_preferred",
        "Compared recorder-backed runtime artifacts using Flow recorder state where available.",
        "info",
        undefined,
        {
          leftSnapshots: left.runtimeEvidence?.snapshots?.length ?? 0,
          rightSnapshots: right.runtimeEvidence?.snapshots?.length ?? 0,
          leftRecordedSteps: left.runtimeEvidence?.steps?.length ?? 0,
          rightRecordedSteps: right.runtimeEvidence?.steps?.length ?? 0
        }
      )
    );
  }

  if (!areRunComparisonValuesEqual(left.diagnostics, right.diagnostics)) {
    diagnostics.push(
      createDiagnosticDiff(
        "flogo.run_comparison.summary_diagnostics_changed",
        "Runtime diagnostics differ between the compared runs.",
        left.diagnostics,
        right.diagnostics
      )
    );
  }

  if (
    left.replayMetadata &&
    right.replayMetadata &&
    left.replayMetadata.inputSource !== right.replayMetadata.inputSource
  ) {
    diagnostics.push(
      createDiagnosticDiff(
        "flogo.run_comparison.replay_input_source_changed",
        "Replay input sources differ between the compared runs.",
        left.replayMetadata.inputSource,
        right.replayMetadata.inputSource
      )
    );
  }

  if (
    left.replayMetadata &&
    right.replayMetadata &&
    left.replayMetadata.overridesApplied !== right.replayMetadata.overridesApplied
  ) {
    diagnostics.push(
      createDiagnosticDiff(
        "flogo.run_comparison.replay_overrides_changed",
        "Replay override usage differs between the compared runs.",
        left.replayMetadata.overridesApplied,
        right.replayMetadata.overridesApplied
      )
    );
  }

  if (
    left.runtimeEvidence?.recorderBacked &&
    right.runtimeEvidence?.recorderBacked &&
    (left.runtimeEvidence.snapshots?.length ?? 0) !== (right.runtimeEvidence.snapshots?.length ?? 0)
  ) {
    diagnostics.push(
      createDiagnosticDiff(
        "flogo.run_comparison.recorder_snapshot_count_changed",
        "Recorder snapshot counts differ between the compared runs.",
        left.runtimeEvidence.snapshots?.length ?? 0,
        right.runtimeEvidence.snapshots?.length ?? 0
      )
    );
  }

  if (
    left.runtimeEvidence?.recorderBacked &&
    right.runtimeEvidence?.recorderBacked &&
    (left.runtimeEvidence.steps?.length ?? 0) !== (right.runtimeEvidence.steps?.length ?? 0)
  ) {
    diagnostics.push(
      createDiagnosticDiff(
        "flogo.run_comparison.recorder_step_count_changed",
        "Recorder step counts differ between the compared runs.",
        left.runtimeEvidence.steps?.length ?? 0,
        right.runtimeEvidence.steps?.length ?? 0
      )
    );
  }

  return diagnostics;
}

function compareRunSteps(
  left: ComparableRun,
  right: ComparableRun,
  options: RunComparisonRequest["compare"]
) {
  const leftSteps = new Map(left.steps.map((step) => [step.taskId, step] as const));
  const rightSteps = new Map(right.steps.map((step) => [step.taskId, step] as const));
  const taskIds = Array.from(new Set([...leftSteps.keys(), ...rightSteps.keys()])).sort((a, b) => a.localeCompare(b));

  return taskIds.map((taskId) => {
    const leftStep = leftSteps.get(taskId);
    const rightStep = rightSteps.get(taskId);
    const changeKind = !leftStep
      ? "added"
      : !rightStep
        ? "removed"
        : areRunComparisonValuesEqual(leftStep, rightStep)
          ? "same"
          : "changed";
    const diagnosticDiffs: Diagnostic[] = [];

    if (options.includeDiagnostics && leftStep && rightStep && !areRunComparisonValuesEqual(leftStep.diagnostics, rightStep.diagnostics)) {
      diagnosticDiffs.push(
        createDiagnosticDiff(
          "flogo.run_comparison.step_diagnostics_changed",
          `Diagnostics differ for task "${taskId}".`,
          leftStep.diagnostics,
          rightStep.diagnostics
        )
      );
    }

    return {
      taskId,
      leftStatus: leftStep?.status,
      rightStatus: rightStep?.status,
      inputDiff: options.includeStepInputs ? createValueDiff(leftStep?.input, rightStep?.input) : undefined,
      outputDiff: options.includeStepOutputs ? createValueDiff(leftStep?.output, rightStep?.output) : undefined,
      flowStateDiff: options.includeFlowState ? createValueDiff(leftStep?.flowState, rightStep?.flowState) : undefined,
      activityStateDiff: options.includeActivityState ? createValueDiff(leftStep?.activityState, rightStep?.activityState) : undefined,
      diagnosticDiffs,
      changeKind
    };
  });
}

export function planRunComparison(
  requestInput: RunComparisonRequest | unknown,
  leftArtifact: { artifactId: string; kind: ComparableRunArtifactKind; payload: unknown },
  rightArtifact: { artifactId: string; kind: ComparableRunArtifactKind; payload: unknown }
): RunComparisonResponse {
  RunComparisonRequestSchema.parse(requestInput);
  const left = parseComparableRunPayload(leftArtifact.artifactId, leftArtifact.kind, leftArtifact.payload);
  const right = parseComparableRunPayload(rightArtifact.artifactId, rightArtifact.kind, rightArtifact.payload);
  const diagnostics: Diagnostic[] = [];

  if (left.flowId !== right.flowId) {
    diagnostics.push(
      createDiagnostic(
        "flogo.run_comparison.flow_mismatch",
        `Comparing runs from different flows ("${left.flowId}" vs "${right.flowId}").`,
        "warning"
      )
    );
  }

  diagnostics.push(
    createDiagnostic("flogo.run_comparison.ready", "Run comparison inputs are valid and ready to compare.", "info")
  );

  const validation = ValidationReportSchema.parse({
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    stages: [stageResult("runtime", diagnostics)],
    summary: "Run comparison inputs are valid.",
    artifacts: []
  });

  return RunComparisonResponseSchema.parse({ validation });
}

export function compareRuns(
  requestInput: RunComparisonRequest | unknown,
  leftArtifact: { artifactId: string; kind: ComparableRunArtifactKind; payload: unknown },
  rightArtifact: { artifactId: string; kind: ComparableRunArtifactKind; payload: unknown }
): RunComparisonResponse {
  const request = RunComparisonRequestSchema.parse(requestInput);
  const left = parseComparableRunPayload(leftArtifact.artifactId, leftArtifact.kind, leftArtifact.payload);
  const right = parseComparableRunPayload(rightArtifact.artifactId, rightArtifact.kind, rightArtifact.payload);

  const diagnostics: Diagnostic[] = [];
  if (left.flowId !== right.flowId) {
    diagnostics.push(
      createDiagnostic(
        "flogo.run_comparison.flow_mismatch",
        `Comparing runs from different flows ("${left.flowId}" vs "${right.flowId}").`,
        "warning"
      )
    );
  }

  const summaryDiagnostics = buildSummaryDiagnosticDiffs(left, right, request.compare.includeDiagnostics);
  const comparisonBasis = chooseRunComparisonBasis(left, right);
  const restComparison = buildRestEnvelopeComparison(left, right);
  const channelComparison = buildChannelRuntimeComparison(left, right);
  const timerComparison = buildTimerRuntimeComparison(left, right);
  const result = RunComparisonResultSchema.parse({
    left: RunComparisonArtifactRefSchema.parse({
      artifactId: left.artifactId,
      kind: left.kind,
      summaryStatus: left.summaryStatus,
      flowId: left.flowId,
      evidenceKind: left.evidenceKind,
      normalizedStepEvidence: (left.runtimeEvidence?.normalizedSteps?.length ?? 0) > 0,
      restTriggerRuntimeEvidence: runtimeEvidenceHasRestTriggerRuntime(left.runtimeEvidence),
      restTriggerRuntimeKind: left.runtimeEvidence?.restTriggerRuntime?.kind,
      cliTriggerRuntimeEvidence: runtimeEvidenceHasCLITriggerRuntime(left.runtimeEvidence),
      cliTriggerRuntimeKind: left.runtimeEvidence?.cliTriggerRuntime?.kind,
      timerTriggerRuntimeEvidence: runtimeEvidenceHasTimerTriggerRuntime(left.runtimeEvidence),
      timerTriggerRuntimeKind: left.runtimeEvidence?.timerTriggerRuntime?.kind,
      channelTriggerRuntimeEvidence: runtimeEvidenceHasChannelTriggerRuntime(left.runtimeEvidence),
      channelTriggerRuntimeKind: left.runtimeEvidence?.channelTriggerRuntime?.kind,
      channelTriggerRuntimeChannel: left.runtimeEvidence?.channelTriggerRuntime?.handler?.channel,
      comparisonBasisPreference: left.comparisonBasis
    } satisfies RunComparisonArtifactRef),
    right: RunComparisonArtifactRefSchema.parse({
      artifactId: right.artifactId,
      kind: right.kind,
      summaryStatus: right.summaryStatus,
      flowId: right.flowId,
      evidenceKind: right.evidenceKind,
      normalizedStepEvidence: (right.runtimeEvidence?.normalizedSteps?.length ?? 0) > 0,
      restTriggerRuntimeEvidence: runtimeEvidenceHasRestTriggerRuntime(right.runtimeEvidence),
      restTriggerRuntimeKind: right.runtimeEvidence?.restTriggerRuntime?.kind,
      cliTriggerRuntimeEvidence: runtimeEvidenceHasCLITriggerRuntime(right.runtimeEvidence),
      cliTriggerRuntimeKind: right.runtimeEvidence?.cliTriggerRuntime?.kind,
      timerTriggerRuntimeEvidence: runtimeEvidenceHasTimerTriggerRuntime(right.runtimeEvidence),
      timerTriggerRuntimeKind: right.runtimeEvidence?.timerTriggerRuntime?.kind,
      channelTriggerRuntimeEvidence: runtimeEvidenceHasChannelTriggerRuntime(right.runtimeEvidence),
      channelTriggerRuntimeKind: right.runtimeEvidence?.channelTriggerRuntime?.kind,
      channelTriggerRuntimeChannel: right.runtimeEvidence?.channelTriggerRuntime?.handler?.channel,
      comparisonBasisPreference: right.comparisonBasis
    } satisfies RunComparisonArtifactRef),
    comparisonBasis,
    restComparison,
    channelComparison,
    timerComparison,
    summary: {
      statusChanged: left.summaryStatus !== right.summaryStatus,
      inputDiff: createValueDiff(left.input, right.input),
      outputDiff: createValueDiff(left.output, right.output),
      errorDiff: createValueDiff(left.error, right.error),
      stepCountDiff: createValueDiff(left.stepCount, right.stepCount),
      diagnosticDiffs: summaryDiagnostics
    },
    steps: compareRunSteps(left, right, request.compare),
    diagnostics
  });

  return RunComparisonResponseSchema.parse({ result });
}

type DiagnosisEvidenceInputs = {
  validation?: ValidationReport;
  flowContracts?: FlowContracts;
  mappingPreview?: MappingPreviewResult;
  mappingTest?: MappingTestResult;
  triggerBindingPlan?: TriggerBindingPlan;
  trace?: RunTrace;
  replay?: ReplayResult;
  comparison?: RunComparisonResult;
  relatedArtifactIds?: string[];
};

function pushDiagnosisOperation(
  operations: DiagnosisOperation[],
  operation: DiagnosisOperation,
  enabled: boolean
) {
  if (enabled && !operations.includes(operation)) {
    operations.push(operation);
  }
}

function hasRecordEntries(value?: Record<string, unknown>) {
  return value ? Object.keys(value).length > 0 : false;
}

function findFirstValidationError(report?: ValidationReport) {
  if (!report) {
    return undefined;
  }

  for (let stageIndex = 0; stageIndex < report.stages.length; stageIndex += 1) {
    const stage = report.stages[stageIndex];
    const diagnosticIndex = stage.diagnostics.findIndex((diagnostic) => diagnostic.severity === "error");
    if (diagnosticIndex >= 0) {
      return {
        stageIndex,
        diagnosticIndex,
        diagnostic: stage.diagnostics[diagnosticIndex]
      };
    }
  }

  return undefined;
}

function findFailedRuntimeStep(trace?: RunTrace, replay?: ReplayResult) {
  const normalizedSteps =
    replay?.runtimeEvidence?.normalizedSteps ??
    replay?.trace?.runtimeEvidence?.normalizedSteps ??
    trace?.runtimeEvidence?.normalizedSteps ??
    [];
  const failedNormalizedStep = normalizedSteps.find((step) => step.status === "failed");
  if (failedNormalizedStep) {
    return {
      source: replay ? "replay" as const : "trace" as const,
      taskId: failedNormalizedStep.taskId,
      taskName: failedNormalizedStep.taskName,
      error: failedNormalizedStep.error,
      path: `${replay ? "replay" : "trace"}.runtimeEvidence.normalizedSteps.${failedNormalizedStep.taskId}`,
      observedValue: failedNormalizedStep
    };
  }

  const steps = replay?.trace?.steps ?? trace?.steps ?? [];
  const failedStep = steps.find((step) => step.status === "failed");
  if (failedStep) {
    return {
      source: replay ? "replay" as const : "trace" as const,
      taskId: failedStep.taskId,
      taskName: failedStep.taskName,
      error: failedStep.error,
      path: `${replay ? "replay" : "trace"}.steps.${failedStep.taskId}`,
      observedValue: failedStep
    };
  }

  return undefined;
}

function detectFallbackReason(trace?: RunTrace, replay?: ReplayResult) {
  return replay?.runtimeEvidence?.fallbackReason ??
    replay?.trace?.runtimeEvidence?.fallbackReason ??
    trace?.runtimeEvidence?.fallbackReason;
}

function diagnosisFallbackDetected(inputs: DiagnosisEvidenceInputs, evidenceQuality: DiagnosisEvidenceQuality) {
  return detectFallbackReason(inputs.trace, inputs.replay) !== undefined || evidenceQuality === "simulated_fallback";
}

function diagnosisLimitations(
  request: DiagnosisRequest,
  inputs: DiagnosisEvidenceInputs,
  evidenceQuality: DiagnosisEvidenceQuality
) {
  const limitations = [...planDiagnosis(request).limitations];
  const fallbackReason = detectFallbackReason(inputs.trace, inputs.replay);

  if (evidenceQuality === "mixed") {
    limitations.push("Diagnosis combined runtime-backed and fallback or artifact-backed evidence.");
  }
  if (evidenceQuality === "artifact_backed") {
    limitations.push("Diagnosis relied on static or persisted artifact evidence without full runtime corroboration.");
  }
  if (evidenceQuality === "simulated_fallback") {
    limitations.push("Diagnosis relied on simulated fallback evidence rather than a fully runtime-backed slice.");
  }
  if (fallbackReason) {
    limitations.push(fallbackReason);
  }

  return dedupeStrings(limitations);
}

function determineEvidenceQuality(inputs: DiagnosisEvidenceInputs): DiagnosisEvidenceQuality {
  const evidenceKinds = [
    inputs.trace?.evidenceKind ?? inputs.trace?.runtimeEvidence?.kind,
    inputs.replay?.trace?.evidenceKind ?? inputs.replay?.runtimeEvidence?.kind
  ].filter((value): value is "runtime_backed" | "simulated_fallback" => value === "runtime_backed" || value === "simulated_fallback");

  if (evidenceKinds.length === 0) {
    return "artifact_backed";
  }
  if (evidenceKinds.every((value) => value === "runtime_backed")) {
    return "runtime_backed";
  }
  if (evidenceKinds.every((value) => value === "simulated_fallback")) {
    return "simulated_fallback";
  }
  return "mixed";
}

function buildDiagnosisConfidence(args: {
  evidenceQuality: DiagnosisEvidenceQuality;
  validationError?: boolean;
  directEvidence?: boolean;
  comparisonEvidence?: boolean;
  normalizedStepEvidence?: boolean;
  recorderBacked?: boolean;
  contractInference?: boolean;
  fallbackDetected?: boolean;
  unsupportedDetected?: boolean;
  missingSignals?: string[];
  conflictingSignals?: string[];
}): DiagnosisConfidence {
  const bases = new Set<DiagnosisConfidence["bases"][number]>();
  const supportingSignals: string[] = [];
  const missingSignals = args.missingSignals ?? [];
  const conflictingSignals = args.conflictingSignals ?? [];
  let score = 0.25;

  if (args.validationError) {
    score += 0.2;
    bases.add("validation");
    supportingSignals.push("Static validation produced direct diagnostics.");
  }

  if (args.directEvidence) {
    score += 0.3;
    bases.add("direct_observation");
    supportingSignals.push("The diagnosis is backed by directly observed runtime or artifact evidence.");
  }

  if (args.comparisonEvidence) {
    score += 0.15;
    bases.add("comparison");
    supportingSignals.push("A comparison artifact corroborated the observed difference.");
  }

  if (args.normalizedStepEvidence) {
    score += 0.1;
    bases.add("normalized_step");
    supportingSignals.push("Normalized per-step runtime evidence was available.");
  }

  if (args.recorderBacked) {
    score += 0.05;
    bases.add("recorder_backed");
    supportingSignals.push("Recorder-backed runtime evidence was available.");
  }

  if (args.contractInference) {
    score += 0.05;
    bases.add("contract_inference");
    supportingSignals.push("Reusable flow-contract evidence was available.");
  }

  if (args.evidenceQuality === "mixed") {
    score -= 0.1;
    bases.add("mixed_evidence");
    conflictingSignals.push("Diagnosis combined runtime-backed and fallback or artifact-backed evidence.");
  }

  if (args.evidenceQuality === "simulated_fallback") {
    score -= 0.2;
    conflictingSignals.push("Diagnosis relied on simulated fallback evidence rather than a fully runtime-backed slice.");
  }

  if (args.evidenceQuality === "artifact_backed") {
    score -= 0.1;
    bases.add("summary_only");
    missingSignals.push("Runtime corroboration was not captured.");
  }

  if (args.fallbackDetected) {
    score -= 0.25;
    bases.add("fallback_reason");
    conflictingSignals.push("Diagnosis used simulated fallback evidence for at least part of the proof path.");
  }

  if (args.unsupportedDetected) {
    score -= 0.15;
    conflictingSignals.push("Unsupported-shape handling reduced the available runtime evidence.");
  }

  score -= Math.min(0.15, missingSignals.length * 0.05);
  score -= Math.min(0.1, conflictingSignals.length * 0.05);
  let boundedScore = Math.max(0, Math.min(1, Number(score.toFixed(2))));

  if (args.evidenceQuality === "artifact_backed" || args.evidenceQuality === "mixed") {
    boundedScore = Math.min(boundedScore, 0.69);
  }
  if (args.evidenceQuality === "simulated_fallback") {
    boundedScore = Math.min(boundedScore, args.unsupportedDetected || args.fallbackDetected ? 0.44 : 0.69);
  }

  const level =
    boundedScore >= 0.9
      ? "certain"
      : boundedScore >= 0.7
        ? "high"
        : boundedScore >= 0.45
          ? "medium"
          : "low";

  return DiagnosisConfidenceSchema.parse({
    level,
    score: boundedScore,
    bases: Array.from(bases),
    supportingSignals,
    missingSignals: dedupeStrings(missingSignals),
    conflictingSignals: dedupeStrings(conflictingSignals)
  });
}

function defaultPatchRecommendation(
  problem: string,
  proposedPatch: string,
  expectedImpact: string,
  confidence: DiagnosisConfidence,
  evidence: string[],
  caveats: string[] = []
) {
  return {
    problem,
    evidence,
    proposedPatch,
    expectedImpact,
    confidence,
    caveats
  } as const;
}

function diagnosisFromValidation(
  request: DiagnosisRequest,
  inputs: DiagnosisEvidenceInputs,
  evidenceQuality: DiagnosisEvidenceQuality
): DiagnosisReport | undefined {
  const error = findFirstValidationError(inputs.validation);
  if (!error) {
    return undefined;
  }

  const diagnostic = error.diagnostic;
  let problemCategory: DiagnosisProblemCategory = "model";
  let subtype: DiagnosisSubtype = "contract_validation_failure";
  let proposedPatch = "Correct the invalid flow contract, import alias, or mapping reference before rerunning runtime analysis.";
  let expectedImpact = "The app should pass validation and unblock runtime-backed trace or replay.";
  let mappingPath = diagnostic.path;

  if (diagnostic.code.startsWith("flogo.mapping.")) {
    problemCategory = "mapping";
    subtype = "input_resolution_mismatch";
    proposedPatch = "Update the referenced mapping expression or reorder the task so referenced activity output exists before use.";
    expectedImpact = "Mapped inputs should resolve deterministically at runtime and during mapping tests.";
  } else if (
    diagnostic.code.startsWith("flogo.semantic.missing_flow") ||
    diagnostic.code.startsWith("flogo.semantic.missing_import") ||
    diagnostic.code.startsWith("flogo.alias.")
  ) {
    problemCategory = "reference";
    subtype = "parse_or_resolution_failure";
    proposedPatch = "Restore the missing flow or import alias, then rerun validation and trace on the same trigger boundary.";
    expectedImpact = "References should resolve cleanly and downstream runtime evidence should be trustworthy.";
  }

  const confidence = buildDiagnosisConfidence({
    evidenceQuality,
    validationError: true,
    directEvidence: true,
    fallbackDetected: diagnosisFallbackDetected(inputs, evidenceQuality)
  });
  const limitations = diagnosisLimitations(request, inputs, evidenceQuality);

  return DiagnosisReportSchema.parse({
    plan: planDiagnosis(request),
    problemCategory,
    subtype,
    likelyRootCause: diagnostic.message,
    supportingEvidence: [
      {
        fieldPath: `validation.stages.${error.stageIndex}.diagnostics.${error.diagnosticIndex}`,
        source: "validation",
        direct: true,
        observedValue: diagnostic
      }
    ],
    affected: {
      triggerFamily: request.triggerFamily,
      flowId: request.flowId,
      mappingPath
    },
    recommendedNextAction: "Resolve the reported validation error, then rerun diagnosis to confirm the runtime path is no longer blocked.",
    recommendedPatch: defaultPatchRecommendation(
      diagnostic.message,
      proposedPatch,
      expectedImpact,
      confidence,
      [diagnostic.code]
    ),
    confidence,
    evidenceQuality,
    fallbackDetected: diagnosisFallbackDetected(inputs, evidenceQuality),
    limitations,
    diagnostics: inputs.validation?.stages.flatMap((stage) => stage.diagnostics) ?? [],
    relatedArtifactIds: inputs.relatedArtifactIds ?? []
  });
}

function diagnosisFromFallback(
  request: DiagnosisRequest,
  inputs: DiagnosisEvidenceInputs,
  evidenceQuality: DiagnosisEvidenceQuality
): DiagnosisReport | undefined {
  const fallbackReason = detectFallbackReason(inputs.trace, inputs.replay);
  if (!fallbackReason) {
    return undefined;
  }

  const unsupportedDetected = /unsupported/i.test(fallbackReason) || request.symptom === "unsupported_shape";
  const confidence = buildDiagnosisConfidence({
    evidenceQuality,
    directEvidence: true,
    fallbackDetected: true,
    unsupportedDetected,
    missingSignals: ["Runtime-backed evidence was incomplete."],
    conflictingSignals: unsupportedDetected ? ["The requested runtime shape is outside the currently supported slice."] : []
  });
  const limitations = diagnosisLimitations(request, inputs, evidenceQuality);

  return DiagnosisReportSchema.parse({
    plan: planDiagnosis(request),
    problemCategory: "runtime",
    subtype: unsupportedDetected ? "unsupported_shape" : "fallback_to_simulation",
    likelyRootCause: fallbackReason,
    supportingEvidence: [
      {
        artifactId: inputs.trace ? "trace" : inputs.replay ? "replay" : undefined,
        fieldPath: inputs.replay?.runtimeEvidence?.fallbackReason ? "replay.runtimeEvidence.fallbackReason" : "trace.runtimeEvidence.fallbackReason",
        source: inputs.replay ? "replay" : "trace",
        direct: true,
        observedValue: fallbackReason
      }
    ],
    affected: {
      triggerFamily: request.triggerFamily,
      flowId: request.flowId
    },
    recommendedNextAction: unsupportedDetected
      ? "Stay on the supported direct-flow, REST, Timer, CLI, or Channel diagnosis slice, or switch to static validation and mapping analysis for this issue."
      : "Capture a runtime-backed trace on the supported slice before treating this diagnosis as authoritative.",
    recommendedPatch: defaultPatchRecommendation(
      fallbackReason,
      unsupportedDetected
        ? "Reshape the investigation to a supported runtime slice or use static mapping and validation tools for this flow."
        : "Avoid applying a code fix until you have runtime-backed evidence or a deterministic mapping test confirming the failure.",
      unsupportedDetected
        ? "The diagnosis loop will stop overstating unsupported runtime behavior."
        : "Subsequent diagnoses should be based on stronger runtime evidence.",
      confidence,
      ["runtime fallback", request.triggerFamily]
    ),
    confidence,
    evidenceQuality,
    fallbackDetected: true,
    limitations,
    diagnostics: [],
    relatedArtifactIds: inputs.relatedArtifactIds ?? []
  });
}

function diagnosisFromMapping(
  request: DiagnosisRequest,
  inputs: DiagnosisEvidenceInputs,
  evidenceQuality: DiagnosisEvidenceQuality
): DiagnosisReport | undefined {
  const firstDifference = inputs.mappingTest?.differences[0];
  const firstDiagnostic =
    inputs.mappingPreview?.diagnostics.find((diagnostic) => diagnostic.severity === "error") ??
    inputs.mappingTest?.diagnostics.find((diagnostic) => diagnostic.severity === "error");

  if (!firstDifference && !firstDiagnostic) {
    return undefined;
  }

  const problem = firstDifference?.message ?? firstDiagnostic?.message ?? "Mapping output diverged from the expected flow input or output.";
  const mappingPath = firstDifference?.path ?? firstDiagnostic?.path;
  const confidence = buildDiagnosisConfidence({
    evidenceQuality,
    directEvidence: true,
    validationError: Boolean(firstDiagnostic),
    fallbackDetected: diagnosisFallbackDetected(inputs, evidenceQuality)
  });
  const limitations = diagnosisLimitations(request, inputs, evidenceQuality);

  return DiagnosisReportSchema.parse({
    plan: planDiagnosis(request),
    problemCategory: "mapping",
    subtype: firstDiagnostic?.code === "flogo.mapping.reply_mapping_missing" ? "reply_mapping_mismatch" : "input_resolution_mismatch",
    likelyRootCause: problem,
    supportingEvidence: [
      firstDifference
        ? {
            fieldPath: `mappingTest.differences.${firstDifference.path}`,
            source: "mapping",
            direct: true,
            observedValue: firstDifference.actual,
            expectedValue: firstDifference.expected,
            diff: firstDifference
          }
        : {
            fieldPath: `mappingPreview.diagnostics.${mappingPath ?? "unknown"}`,
            source: "mapping",
            direct: true,
            observedValue: firstDiagnostic
          }
    ],
    affected: {
      triggerFamily: request.triggerFamily,
      flowId: request.flowId,
      mappingPath,
      nodeId: request.targetNodeId
    },
    recommendedNextAction: "Align the mapping expression with the expected trigger, flow, or activity scope and rerun the deterministic mapping test.",
    recommendedPatch: defaultPatchRecommendation(
      problem,
      "Update the affected mapping expression so it references the correct scope or field name, then lock it in with a mapping test.",
      "Mapped values should resolve to the expected payload without relying on simulated fallback.",
      confidence,
      [mappingPath ?? request.targetNodeId ?? "mapping"]
    ),
    confidence,
    evidenceQuality,
    fallbackDetected: diagnosisFallbackDetected(inputs, evidenceQuality),
    limitations,
    diagnostics: dedupeDiagnostics([
      ...(inputs.mappingPreview?.diagnostics ?? []),
      ...(inputs.mappingTest?.diagnostics ?? [])
    ]),
    relatedArtifactIds: inputs.relatedArtifactIds ?? []
  });
}

function diagnosisFromComparison(
  request: DiagnosisRequest,
  inputs: DiagnosisEvidenceInputs,
  evidenceQuality: DiagnosisEvidenceQuality
): DiagnosisReport | undefined {
  const comparison = inputs.comparison;
  if (!comparison) {
    return undefined;
  }

  let problemCategory: DiagnosisProblemCategory = "behavioral";
  let subtype: DiagnosisSubtype = "behavioral_regression";
  let likelyRootCause = "Compared runs diverged in a behaviorally meaningful way.";
  let supportingEvidence: DiagnosisEvidenceRef[] = [];
  let proposedPatch = "Align the trigger boundary mappings or task logic that changed between the compared runs.";
  let expectedImpact = "The compared runs should converge on the same trigger input, flow behavior, and output.";
  let affected: {
    triggerFamily: DiagnosisTriggerFamily;
    flowId: string;
    taskId?: string;
  } = {
    triggerFamily: request.triggerFamily,
    flowId: comparison.left.flowId
  };

  if (
    comparison.comparisonBasis === "rest_runtime_envelope" &&
    (comparison.restComparison?.requestEnvelopeDiff?.kind === "changed" ||
      comparison.restComparison?.mappedFlowInputDiff?.kind === "changed" ||
      comparison.restComparison?.replyEnvelopeDiff?.kind === "changed")
  ) {
    problemCategory = "trigger";
    subtype = "rest_envelope_mismatch";
    likelyRootCause = "REST request, mapped flow input, or reply envelope drifted between the compared runs.";
    proposedPatch = "Update the REST request or reply mappings so the trigger boundary matches the expected flow contract.";
    expectedImpact = "REST-triggered runs should produce stable mapped flow input and reply envelopes.";
    supportingEvidence = [
      {
        fieldPath: "comparison.restComparison.requestEnvelopeDiff",
        source: "comparison",
        direct: true,
        diff: comparison.restComparison?.requestEnvelopeDiff
      },
      {
        fieldPath: "comparison.restComparison.replyEnvelopeDiff",
        source: "comparison",
        direct: true,
        diff: comparison.restComparison?.replyEnvelopeDiff
      }
    ];
  } else if (
    comparison.comparisonBasis === "timer_runtime_startup" &&
    (comparison.timerComparison?.settingsDiff?.kind === "changed" || comparison.timerComparison?.tickDiff?.kind === "changed")
  ) {
    problemCategory = "trigger";
    subtype = "timer_startup_mismatch";
    likelyRootCause = "Timer startup settings or observed tick behavior drifted between the compared runs.";
    proposedPatch = "Align the timer handler settings with the intended startDelay, repeatInterval, and mapped flow input expectations.";
    expectedImpact = "Timer-triggered runs should start consistently and deliver the same flow boundary input.";
    supportingEvidence = [
      {
        fieldPath: "comparison.timerComparison.settingsDiff",
        source: "comparison",
        direct: true,
        diff: comparison.timerComparison?.settingsDiff
      },
      {
        fieldPath: "comparison.timerComparison.tickDiff",
        source: "comparison",
        direct: true,
        diff: comparison.timerComparison?.tickDiff
      }
    ];
  } else if (
    comparison.comparisonBasis === "channel_runtime_boundary" &&
    (comparison.channelComparison?.channelDiff?.kind === "changed" || comparison.channelComparison?.dataDiff?.kind === "changed")
  ) {
    problemCategory = "trigger";
    subtype = "channel_boundary_mismatch";
    likelyRootCause = "Channel identity or sent event data drifted across the compared runs.";
    proposedPatch = "Align the Channel trigger wiring and mapped input payload with the intended engine channel contract.";
    expectedImpact = "Channel-triggered runs should consume the same channel and event data before flow execution.";
    supportingEvidence = [
      {
        fieldPath: "comparison.channelComparison.channelDiff",
        source: "comparison",
        direct: true,
        diff: comparison.channelComparison?.channelDiff
      },
      {
        fieldPath: "comparison.channelComparison.dataDiff",
        source: "comparison",
        direct: true,
        diff: comparison.channelComparison?.dataDiff
      }
    ];
  } else if (comparison.steps.some((step) => step.changeKind === "changed" || step.changeKind === "removed" || step.changeKind === "added")) {
    const changedStep = comparison.steps.find((step) => step.changeKind !== "same");
    likelyRootCause = `Runtime behavior changed at task "${changedStep?.taskId ?? "unknown"}".`;
    proposedPatch = "Inspect the first changed task and reconcile its input, output, or flow-state diff with the expected baseline.";
    supportingEvidence = changedStep
      ? [
          {
            fieldPath: `comparison.steps.${changedStep.taskId}`,
            source: "comparison",
            direct: true,
            diff: changedStep
          }
        ]
      : [];
    affected = {
      ...affected,
      taskId: changedStep?.taskId
    };
  } else {
    return undefined;
  }

  const confidence = buildDiagnosisConfidence({
    evidenceQuality,
    directEvidence: true,
    comparisonEvidence: true,
    fallbackDetected: diagnosisFallbackDetected(inputs, evidenceQuality),
    normalizedStepEvidence:
      comparison.left.normalizedStepEvidence === true || comparison.right.normalizedStepEvidence === true
  });
  const limitations = diagnosisLimitations(request, inputs, evidenceQuality);

  return DiagnosisReportSchema.parse({
    plan: planDiagnosis(request),
    problemCategory,
    subtype,
    likelyRootCause,
    supportingEvidence,
    affected,
    recommendedNextAction: "Use the reported comparison basis to correct the earliest differing boundary or task, then rerun trace and compare on the same slice.",
    recommendedPatch: defaultPatchRecommendation(
      likelyRootCause,
      proposedPatch,
      expectedImpact,
      confidence,
      [comparison.comparisonBasis ?? "comparison"]
    ),
    confidence,
    evidenceQuality,
    fallbackDetected: diagnosisFallbackDetected(inputs, evidenceQuality),
    limitations,
    diagnostics: dedupeDiagnostics([
      ...(comparison.summary.diagnosticDiffs ?? []),
      ...(comparison.diagnostics ?? [])
    ]),
    relatedArtifactIds: inputs.relatedArtifactIds ?? []
  });
}

function diagnosisFromRuntimeStep(
  request: DiagnosisRequest,
  inputs: DiagnosisEvidenceInputs,
  evidenceQuality: DiagnosisEvidenceQuality
): DiagnosisReport | undefined {
  const failedStep = findFailedRuntimeStep(inputs.trace, inputs.replay);
  if (!failedStep) {
    return undefined;
  }

  const runtimeEvidence = inputs.replay?.runtimeEvidence ?? inputs.trace?.runtimeEvidence;
  const confidence = buildDiagnosisConfidence({
    evidenceQuality,
    directEvidence: true,
    fallbackDetected: diagnosisFallbackDetected(inputs, evidenceQuality),
    normalizedStepEvidence: Boolean(runtimeEvidence?.normalizedSteps?.length),
    recorderBacked: runtimeEvidence?.recorderBacked === true
  });
  const limitations = diagnosisLimitations(request, inputs, evidenceQuality);

  return DiagnosisReportSchema.parse({
    plan: planDiagnosis(request),
    problemCategory: "activity",
    subtype: "step_failure",
    likelyRootCause: failedStep.error
      ? `Task "${failedStep.taskId}" failed with runtime error: ${failedStep.error}`
      : `Task "${failedStep.taskId}" failed during execution.`,
    supportingEvidence: [
      {
        fieldPath: failedStep.path,
        source: failedStep.source,
        direct: true,
        observedValue: failedStep.observedValue
      }
    ],
    affected: {
      triggerFamily: request.triggerFamily,
      flowId: request.flowId ?? inputs.trace?.flowId ?? inputs.replay?.trace?.flowId ?? inputs.replay?.summary.flowId,
      taskId: failedStep.taskId
    },
    recommendedNextAction: "Inspect the failing task configuration and the immediately preceding mapped input before applying a code change.",
    recommendedPatch: defaultPatchRecommendation(
      `Task "${failedStep.taskId}" failed.`,
      "Adjust the failing activity settings or the mapped input feeding that task, then rerun a runtime-backed trace on the same trigger boundary.",
      "The failing task should complete, which will unblock downstream flow output.",
      confidence,
      [failedStep.taskId]
    ),
    confidence,
    evidenceQuality,
    fallbackDetected: diagnosisFallbackDetected(inputs, evidenceQuality),
    limitations,
    diagnostics: dedupeDiagnostics([
      ...(inputs.trace?.diagnostics ?? []),
      ...(inputs.replay?.trace?.diagnostics ?? [])
    ]),
    relatedArtifactIds: inputs.relatedArtifactIds ?? []
  });
}

function diagnosisFromTriggerBoundary(
  request: DiagnosisRequest,
  inputs: DiagnosisEvidenceInputs,
  evidenceQuality: DiagnosisEvidenceQuality
): DiagnosisReport | undefined {
  const runtimeEvidence = inputs.replay?.runtimeEvidence ?? inputs.trace?.runtimeEvidence;
  if (!runtimeEvidence) {
    return undefined;
  }

  if (request.triggerFamily === "cli" && runtimeEvidence.cliTriggerRuntime) {
    const confidence = buildDiagnosisConfidence({
      evidenceQuality,
      directEvidence: true,
      fallbackDetected: diagnosisFallbackDetected(inputs, evidenceQuality),
      normalizedStepEvidence: Boolean(runtimeEvidence.normalizedSteps?.length),
      recorderBacked: runtimeEvidence.recorderBacked === true
    });
    const limitations = diagnosisLimitations(request, inputs, evidenceQuality);
    return DiagnosisReportSchema.parse({
      plan: planDiagnosis(request),
      problemCategory: "trigger",
      subtype: "cli_boundary_mismatch",
      likelyRootCause: "CLI command identity, args, flags, or reply evidence indicate the issue is at the CLI trigger boundary.",
      supportingEvidence: [
        {
          fieldPath: "trace.runtimeEvidence.cliTriggerRuntime",
          source: inputs.replay ? "replay" : "trace",
          direct: true,
          observedValue: runtimeEvidence.cliTriggerRuntime
        }
      ],
      affected: {
        triggerFamily: "cli",
        flowId: request.flowId ?? inputs.trace?.flowId ?? inputs.replay?.summary.flowId,
        handlerName: runtimeEvidence.cliTriggerRuntime.handler?.command
      },
      recommendedNextAction: "Verify the command, args, flags, and flow input mappings against the intended CLI contract.",
      recommendedPatch: defaultPatchRecommendation(
        "CLI trigger boundary mismatch",
        "Align the CLI handler command, args, flags, or reply mapping with the expected flow inputs and outputs.",
        "CLI invocations should map input consistently and produce the expected reply or stdout.",
        confidence,
        [runtimeEvidence.cliTriggerRuntime.handler?.command ?? "cli"]
      ),
      confidence,
      evidenceQuality,
      fallbackDetected: diagnosisFallbackDetected(inputs, evidenceQuality),
      limitations,
      diagnostics: runtimeEvidence.cliTriggerRuntime.diagnostics ?? [],
      relatedArtifactIds: inputs.relatedArtifactIds ?? []
    });
  }

  return undefined;
}

function diagnosisFromFlowContract(
  request: DiagnosisRequest,
  inputs: DiagnosisEvidenceInputs,
  evidenceQuality: DiagnosisEvidenceQuality
): DiagnosisReport | undefined {
  const contract = inputs.flowContracts?.contracts.find((entry) => entry.flowId === request.flowId);
  if (!contract) {
    return undefined;
  }

  const providedInput = request.baseInput ?? (hasRecordEntries(request.sampleInput) ? request.sampleInput : undefined);
  const missingRequiredInput = contract.inputs.find((input) => input.required && !(providedInput && Object.prototype.hasOwnProperty.call(providedInput, input.name)));
  if (!missingRequiredInput) {
    return undefined;
  }

  const confidence = buildDiagnosisConfidence({
    evidenceQuality,
    directEvidence: true,
    contractInference: true,
    fallbackDetected: diagnosisFallbackDetected(inputs, evidenceQuality)
  });
  const limitations = diagnosisLimitations(request, inputs, evidenceQuality);

  return DiagnosisReportSchema.parse({
    plan: planDiagnosis(request),
    problemCategory: "model",
    subtype: "contract_validation_failure",
    likelyRootCause: `Flow "${contract.flowId}" requires input "${missingRequiredInput.name}" but the diagnosis request did not provide it.`,
    supportingEvidence: [
      {
        fieldPath: `flowContracts.${contract.flowId}.inputs.${missingRequiredInput.name}`,
        source: "flow_contract",
        direct: true,
        observedValue: missingRequiredInput
      }
    ],
    affected: {
      triggerFamily: request.triggerFamily,
      flowId: contract.flowId
    },
    recommendedNextAction: "Supply the missing required flow input before relying on runtime trace or replay output.",
    recommendedPatch: defaultPatchRecommendation(
      "Required flow input is missing.",
      `Update the trigger mapping or replay input so "${missingRequiredInput.name}" is provided to flow "${contract.flowId}".`,
      "The flow should execute against a valid contract and any downstream diagnosis will be higher confidence.",
      confidence,
      [missingRequiredInput.name]
    ),
    confidence,
    evidenceQuality,
    fallbackDetected: diagnosisFallbackDetected(inputs, evidenceQuality),
    limitations,
    diagnostics: contract.diagnostics,
    relatedArtifactIds: inputs.relatedArtifactIds ?? []
  });
}

function insufficientEvidenceDiagnosis(
  request: DiagnosisRequest,
  inputs: DiagnosisEvidenceInputs,
  evidenceQuality: DiagnosisEvidenceQuality
): DiagnosisReport {
  const missingSignals: string[] = [];
  if (!request.flowId) {
    missingSignals.push("flowId");
  }
  if (!hasRecordEntries(request.sampleInput) && !request.baseInput && !request.traceArtifactId) {
    missingSignals.push("runtime input or trace artifact");
  }
  if (!request.targetNodeId && request.symptom === "mapping_mismatch") {
    missingSignals.push("targetNodeId");
  }

  const confidence = buildDiagnosisConfidence({
    evidenceQuality,
    missingSignals,
    fallbackDetected: detectFallbackReason(inputs.trace, inputs.replay) !== undefined
  });
  const limitations = dedupeStrings([
    ...diagnosisLimitations(request, inputs, evidenceQuality),
    ...missingSignals.map((signal) => `Missing ${signal}`)
  ]);

  return DiagnosisReportSchema.parse({
    plan: planDiagnosis(request),
    problemCategory: "runtime",
    subtype: "insufficient_evidence",
    likelyRootCause: "The available runtime and static evidence is not specific enough to support a confident root-cause diagnosis.",
    supportingEvidence: [],
    affected: {
      triggerFamily: request.triggerFamily,
      flowId: request.flowId,
      nodeId: request.targetNodeId
    },
    recommendedNextAction: "Capture the narrowest supported runtime trace or deterministic mapping test for the failing boundary, then rerun diagnosis.",
    recommendedPatch: defaultPatchRecommendation(
      "Insufficient evidence",
      "Do not apply a code patch yet. First gather runtime-backed evidence or a deterministic mapping assertion on the failing slice.",
      "The next diagnosis will be grounded in stronger evidence and a safer patch recommendation.",
      confidence,
      missingSignals,
      ["Diagnosis Loop v1 does not auto-fix without grounded evidence."]
    ),
    confidence,
    evidenceQuality,
    fallbackDetected: detectFallbackReason(inputs.trace, inputs.replay) !== undefined,
    limitations,
    diagnostics: [],
    relatedArtifactIds: inputs.relatedArtifactIds ?? []
  });
}

export function planDiagnosis(requestInput: DiagnosisRequest | unknown): DiagnosisPlan {
  const request = DiagnosisRequestSchema.parse(requestInput);
  const operations: DiagnosisOperation[] = [];
  const rationale: string[] = [];
  const limitations: string[] = [];
  const hasRuntimeInput = hasRecordEntries(request.sampleInput) || Boolean(request.baseInput) || Boolean(request.traceArtifactId);
  const canReplay = Boolean(request.traceArtifactId || request.baseInput || hasRecordEntries(request.overrides));
  const canCompare = Boolean(request.leftArtifactId && request.rightArtifactId) || canReplay;

  pushDiagnosisOperation(operations, "static_validation", true);

  switch (request.symptom) {
    case "validation_failure":
      rationale.push("Start with structural, semantic, mapping, and dependency validation.");
      break;
    case "mapping_mismatch":
      pushDiagnosisOperation(operations, "mapping_preview", Boolean(request.targetNodeId));
      pushDiagnosisOperation(operations, "mapping_test", Boolean(request.targetNodeId && request.expectedOutput));
      pushDiagnosisOperation(operations, "flow_contract_analysis", Boolean(request.flowId));
      pushDiagnosisOperation(operations, "run_trace", Boolean(request.flowId && hasRuntimeInput));
      rationale.push("Mapping issues should be checked deterministically before escalating to runtime comparison.");
      if (!request.targetNodeId) {
        limitations.push("Mapping diagnosis is weaker without targetNodeId.");
      }
      break;
    case "flow_contract_issue":
      pushDiagnosisOperation(operations, "flow_contract_analysis", Boolean(request.flowId));
      rationale.push("Flow-contract issues should be grounded in reusable flow I/O evidence.");
      if (!request.flowId) {
        limitations.push("Flow-contract diagnosis requires flowId.");
      }
      break;
    case "wrong_response":
      pushDiagnosisOperation(operations, "trigger_binding_analysis", Boolean(request.profile && request.flowId && request.triggerFamily !== "direct_flow"));
      pushDiagnosisOperation(operations, "run_trace", Boolean(request.flowId && hasRuntimeInput));
      pushDiagnosisOperation(operations, "replay", Boolean(request.flowId && canReplay));
      pushDiagnosisOperation(operations, "compare_runs", Boolean(canCompare));
      rationale.push("Wrong response symptoms should prioritize trigger-boundary trace and replay before comparing outputs.");
      break;
    case "scheduled_flow_issue":
      pushDiagnosisOperation(operations, "trigger_binding_analysis", Boolean(request.profile && request.flowId));
      pushDiagnosisOperation(operations, "run_trace", Boolean(request.flowId && hasRuntimeInput));
      pushDiagnosisOperation(operations, "replay", Boolean(request.flowId && canReplay));
      rationale.push("Scheduled-flow issues should check timer startup semantics and then runtime execution.");
      break;
    case "cli_argument_issue":
      pushDiagnosisOperation(operations, "trigger_binding_analysis", Boolean(request.profile && request.flowId));
      pushDiagnosisOperation(operations, "run_trace", Boolean(request.flowId && hasRuntimeInput));
      pushDiagnosisOperation(operations, "replay", Boolean(request.flowId && canReplay));
      rationale.push("CLI argument issues should validate CLI trigger boundary evidence before deeper runtime comparison.");
      break;
    case "internal_event_issue":
      pushDiagnosisOperation(operations, "trigger_binding_analysis", Boolean(request.profile && request.flowId));
      pushDiagnosisOperation(operations, "run_trace", Boolean(request.flowId && hasRuntimeInput));
      pushDiagnosisOperation(operations, "replay", Boolean(request.flowId && canReplay));
      rationale.push("Channel issues should inspect the channel boundary and then runtime evidence.");
      break;
    case "step_failure":
      pushDiagnosisOperation(operations, "run_trace", Boolean(request.flowId && hasRuntimeInput));
      pushDiagnosisOperation(operations, "replay", Boolean(request.flowId && canReplay));
      rationale.push("A failing step needs runtime-backed trace before recommending a patch.");
      break;
    case "replay_mismatch":
      pushDiagnosisOperation(operations, "run_trace", Boolean(request.flowId && hasRuntimeInput));
      pushDiagnosisOperation(operations, "replay", Boolean(request.flowId && canReplay));
      pushDiagnosisOperation(operations, "compare_runs", Boolean(canCompare));
      rationale.push("Replay mismatch diagnosis should compare a baseline run against the replayed run.");
      break;
    case "unexpected_output":
      pushDiagnosisOperation(operations, "flow_contract_analysis", Boolean(request.flowId));
      pushDiagnosisOperation(operations, "run_trace", Boolean(request.flowId && hasRuntimeInput));
      pushDiagnosisOperation(operations, "replay", Boolean(request.flowId && canReplay));
      rationale.push("Unexpected output should be diagnosed at the flow boundary and then at runtime.");
      break;
    case "unsupported_shape":
      pushDiagnosisOperation(operations, "run_trace", Boolean(request.flowId && hasRuntimeInput));
      rationale.push("Unsupported-shape requests should still attempt the narrowest supported runtime slice before downgrading confidence.");
      break;
    default:
      break;
  }

  if (!request.flowId && operations.some((operation) => operation === "run_trace" || operation === "replay" || operation === "flow_contract_analysis")) {
    limitations.push("Runtime trace, replay, and flow-contract analysis require flowId.");
  }

  return DiagnosisPlanSchema.parse({
    symptom: request.symptom,
    triggerFamily: request.triggerFamily,
    selectedOperations: operations,
    rationale,
    limitations
  });
}

export function buildAgentDiagnosisReport(
  requestInput: DiagnosisRequest | unknown,
  inputs: DiagnosisEvidenceInputs
): DiagnosisReport {
  const request = DiagnosisRequestSchema.parse(requestInput);
  const evidenceQuality = determineEvidenceQuality(inputs);

  return (
    diagnosisFromValidation(request, inputs, evidenceQuality) ??
    diagnosisFromMapping(request, inputs, evidenceQuality) ??
    diagnosisFromComparison(request, inputs, evidenceQuality) ??
    diagnosisFromRuntimeStep(request, inputs, evidenceQuality) ??
    diagnosisFromTriggerBoundary(request, inputs, evidenceQuality) ??
    diagnosisFromFlowContract(request, inputs, evidenceQuality) ??
    diagnosisFromFallback(request, inputs, evidenceQuality) ??
    insufficientEvidenceDiagnosis(request, inputs, evidenceQuality)
  );
}

export function planTriggerBinding(
  document: string | FlogoApp | unknown,
  requestInput: TriggerBindingRequest | unknown
): TriggerBindingResponse {
  const operation = buildTriggerBindingOperation(document, requestInput);
  return TriggerBindingResponseSchema.parse({
    result: {
      applied: false,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function applyTriggerBinding(
  document: string | FlogoApp | unknown,
  requestInput: TriggerBindingRequest | unknown
): TriggerBindingResponse {
  const operation = buildTriggerBindingOperation(document, requestInput);
  return TriggerBindingResponseSchema.parse({
    result: {
      applied: true,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function planSubflowExtraction(
  document: string | FlogoApp | unknown,
  requestInput: SubflowExtractionRequest | unknown
): SubflowExtractionResponse {
  const operation = buildSubflowExtractionOperation(document, requestInput);
  return SubflowExtractionResponseSchema.parse({
    result: {
      applied: false,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function applySubflowExtraction(
  document: string | FlogoApp | unknown,
  requestInput: SubflowExtractionRequest | unknown
): SubflowExtractionResponse {
  const operation = buildSubflowExtractionOperation(document, requestInput);
  return SubflowExtractionResponseSchema.parse({
    result: {
      applied: true,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function planSubflowInlining(
  document: string | FlogoApp | unknown,
  requestInput: SubflowInliningRequest | unknown
): SubflowInliningResponse {
  const operation = buildSubflowInliningOperation(document, requestInput);
  return SubflowInliningResponseSchema.parse({
    result: {
      applied: false,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function applySubflowInlining(
  document: string | FlogoApp | unknown,
  requestInput: SubflowInliningRequest | unknown
): SubflowInliningResponse {
  const operation = buildSubflowInliningOperation(document, requestInput);
  return SubflowInliningResponseSchema.parse({
    result: {
      applied: true,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function planIteratorSynthesis(
  document: string | FlogoApp | unknown,
  requestInput: IteratorSynthesisRequest | unknown
): IteratorSynthesisResponse {
  const operation = buildIteratorSynthesisOperation(document, requestInput);
  return IteratorSynthesisResponseSchema.parse({
    result: {
      applied: false,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function applyIteratorSynthesis(
  document: string | FlogoApp | unknown,
  requestInput: IteratorSynthesisRequest | unknown
): IteratorSynthesisResponse {
  const operation = buildIteratorSynthesisOperation(document, requestInput);
  return IteratorSynthesisResponseSchema.parse({
    result: {
      applied: true,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function planRetryPolicy(
  document: string | FlogoApp | unknown,
  requestInput: RetryPolicyRequest | unknown
): RetryPolicyResponse {
  const operation = buildRetryPolicyOperation(document, requestInput);
  return RetryPolicyResponseSchema.parse({
    result: {
      applied: false,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function applyRetryPolicy(
  document: string | FlogoApp | unknown,
  requestInput: RetryPolicyRequest | unknown
): RetryPolicyResponse {
  const operation = buildRetryPolicyOperation(document, requestInput);
  return RetryPolicyResponseSchema.parse({
    result: {
      applied: true,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function planDoWhileSynthesis(
  document: string | FlogoApp | unknown,
  requestInput: DoWhileSynthesisRequest | unknown
): DoWhileSynthesisResponse {
  const operation = buildDoWhileSynthesisOperation(document, requestInput);
  return DoWhileSynthesisResponseSchema.parse({
    result: {
      applied: false,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function applyDoWhileSynthesis(
  document: string | FlogoApp | unknown,
  requestInput: DoWhileSynthesisRequest | unknown
): DoWhileSynthesisResponse {
  const operation = buildDoWhileSynthesisOperation(document, requestInput);
  return DoWhileSynthesisResponseSchema.parse({
    result: {
      applied: true,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function planErrorPathTemplate(
  document: string | FlogoApp | unknown,
  requestInput: ErrorPathTemplateRequest | unknown
): ErrorPathTemplateResponse {
  const operation = buildErrorPathTemplateOperation(document, requestInput);
  return ErrorPathTemplateResponseSchema.parse({
    result: {
      applied: false,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function applyErrorPathTemplate(
  document: string | FlogoApp | unknown,
  requestInput: ErrorPathTemplateRequest | unknown
): ErrorPathTemplateResponse {
  const operation = buildErrorPathTemplateOperation(document, requestInput);
  return ErrorPathTemplateResponseSchema.parse({
    result: {
      applied: true,
      plan: operation.plan,
      patchSummary: operation.patchSummary,
      validation: operation.validation,
      app: operation.nextApp
    }
  });
}

export function serializeFlogoAppDocument(
  document: string | FlogoApp | unknown,
  originalDocument?: string | unknown
): string {
  const app = parseFlogoAppDocument(document);
  const original =
    typeof originalDocument === "string"
      ? JSON.parse(originalDocument) as Record<string, unknown>
      : originalDocument && typeof originalDocument === "object" && !Array.isArray(originalDocument)
        ? (originalDocument as Record<string, unknown>)
        : undefined;

  const resourcesAsObject = original?.resources && typeof original.resources === "object" && !Array.isArray(original.resources);
  const serialized: Record<string, unknown> = {
    ...app,
    resources: resourcesAsObject
      ? Object.fromEntries(
          app.resources.map((resource) => [
            resource.id,
            {
              type: resource.type ?? "flow",
              data: resource.data
            }
          ])
        )
      : app.resources.map((resource) => ({
          id: resource.id,
          type: resource.type ?? "flow",
          data: resource.data
        }))
  };

  if (!app.channels.length) {
    delete serialized.channels;
  }

  return `${JSON.stringify(serialized, null, 2)}\n`;
}

export function classifyMappingValue(value: unknown) {
  if (Array.isArray(value)) {
    return MappingKindSchema.parse("array");
  }
  if (value !== null && typeof value === "object") {
    return MappingKindSchema.parse("object");
  }
  if (typeof value === "string" && value.includes("$")) {
    return MappingKindSchema.parse("expression");
  }
  return MappingKindSchema.parse("literal");
}

export function previewMapping(
  document: string | FlogoApp | unknown,
  nodeId: string,
  sampleInput: MappingPreviewContext = createEmptyMappingContext()
): ReturnType<typeof MappingPreviewResultSchema.parse> {
  const app = parseFlogoAppDocument(document);
  const located = locateTask(app, nodeId);
  if (!located) {
    return MappingPreviewResultSchema.parse({
      nodeId,
      fields: [],
      paths: [],
      resolvedValues: {},
      scopeDiagnostics: [],
      coercionDiagnostics: [],
      suggestedCoercions: [],
      diagnostics: [createDiagnostic("flogo.mapping.node_not_found", `Unable to locate node "${nodeId}"`, "error", nodeId)]
    });
  }

  const fieldEntries: MappingPreviewField[] = [
    ...collectMappingFields("input", located.task.input, sampleInput),
    ...collectMappingFields("settings", located.task.settings, sampleInput),
    ...collectMappingFields("output", located.task.output, sampleInput)
  ];
  const scopeDiagnostics = evaluateScopeDiagnostics(located.flow, located.task, fieldEntries);
  const coercionDiagnostics = suggestTaskCoercions(app, located.task, sampleInput);
  const diagnostics = dedupeDiagnostics([...fieldEntries.flatMap((field) => field.diagnostics), ...scopeDiagnostics, ...coercionDiagnostics]);

  return MappingPreviewResultSchema.parse({
    nodeId,
    flowId: located.flowId,
    fields: fieldEntries,
    paths: collectMappingPaths(nodeId, fieldEntries),
    resolvedValues: buildResolvedValueMap(fieldEntries),
    scopeDiagnostics,
    coercionDiagnostics,
    suggestedCoercions: coercionDiagnostics,
    diagnostics
  });
}

export function suggestCoercions(
  document: string | FlogoApp | unknown,
  sampleInput: MappingPreviewContext = createEmptyMappingContext()
): Diagnostic[] {
  const app = parseFlogoAppDocument(document);
  const diagnostics: Diagnostic[] = [];

  for (const resource of app.resources) {
    for (const task of resource.data.tasks) {
      diagnostics.push(...suggestTaskCoercions(app, task, sampleInput));
    }
  }

  return dedupeDiagnostics(diagnostics);
}

export function analyzePropertyUsage(
  document: string | FlogoApp | unknown,
  deploymentProfile: DeploymentProfile = "rest_service"
): PropertyPlan {
  const app = parseFlogoAppDocument(document);
  const propertyRefs = new Set<string>();
  const envRefs = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const undefinedPropertyRefs = new Set<string>();

  for (const resource of app.resources) {
    for (const task of resource.data.tasks) {
      const sections = [task.input, task.settings, task.output];
      for (const section of sections) {
        collectResolverKinds(section, propertyRefs, envRefs);
      }
    }
  }

  const declaredProperties = new Set(app.properties.map((property) => property.name));
  for (const propertyRef of propertyRefs) {
    if (!declaredProperties.has(propertyRef)) {
      undefinedPropertyRefs.add(propertyRef);
      diagnostics.push(
        createDiagnostic(
          "flogo.property.undefined",
          `Property "${propertyRef}" is referenced but not declared on the app`,
          "warning",
          `properties.${propertyRef}`
        )
      );
    }
  }

  const unusedProperties = Array.from(declaredProperties)
    .filter((property) => !propertyRefs.has(property))
    .sort();
  for (const property of app.properties) {
    if (!propertyRefs.has(property.name)) {
      diagnostics.push(
        createDiagnostic(
          "flogo.property.unused",
          `Property "${property.name}" is declared but not referenced`,
          "info",
          `properties.${property.name}`
        )
      );
    }
  }

  const recommendedEnv = Array.from(envRefs)
    .sort()
    .map((name) => ({
      name,
      rationale: "This environment variable is referenced through $env and should be supplied per deployment environment."
    }));
  const recommendedSecretEnv = recommendedEnv.filter((entry) => looksSensitiveConfig(entry.name)).map((entry) => ({
    ...entry,
    rationale: `${entry.rationale} Treat it as secret configuration.`
  }));
  const recommendedPlainEnv = recommendedEnv.filter((entry) => !looksSensitiveConfig(entry.name));

  return PropertyPlanSchema.parse({
    declaredProperties: Array.from(declaredProperties).sort(),
    propertyRefs: Array.from(propertyRefs).sort(),
    envRefs: Array.from(envRefs).sort(),
    undefinedPropertyRefs: Array.from(undefinedPropertyRefs).sort(),
    unusedProperties,
    deploymentProfile,
    recommendations: [
      ...Array.from(propertyRefs)
        .sort()
        .map((name) => ({
          source: "property",
          name,
          rationale: "Referenced through $property and suitable for reusable app-level configuration"
        })),
      ...Array.from(envRefs)
        .sort()
        .map((name) => ({
          source: "env",
          name,
          rationale: "Referenced through $env and suitable for deployment-specific configuration"
        }))
    ],
    recommendedProperties: Array.from(undefinedPropertyRefs)
      .sort()
      .map((name) => ({
        name,
        rationale: "This property is referenced in mappings but is not declared on the app.",
        inferredType: inferPropertyType(app, name)
      })),
    recommendedEnv,
    recommendedSecretEnv,
    recommendedPlainEnv,
    deploymentNotes: buildDeploymentNotes(propertyRefs, envRefs, undefinedPropertyRefs, unusedProperties),
    profileSpecificNotes: buildProfileSpecificNotes(deploymentProfile, propertyRefs, envRefs),
    diagnostics
  });
}

function buildTriggerBindingOperation(
  document: string | FlogoApp | unknown,
  requestInput: TriggerBindingRequest | unknown
): TriggerBindingOperation {
  const request = TriggerBindingRequestSchema.parse(requestInput);
  const app = parseFlogoAppDocument(document);
  const flowContract = inferFlowContract(app, request.flowId);
  if (!flowContract) {
    throw new TriggerBindingError(
      `Flow "${request.flowId}" was not found`,
      404,
      [createDiagnostic("flogo.trigger_binding.unknown_flow", `Flow "${request.flowId}" was not found`, "error", request.flowId)]
    );
  }

  const { triggerAlias, triggerImportRef } = resolveTriggerImport(app, request.profile.kind);
  const triggerRef = `#${triggerAlias}`;
  const flowRef = `#flow:${request.flowId}`;
  const triggerId = request.triggerId?.trim() || buildTriggerId(request.flowId, request.profile);
  const handlerName = request.handlerName?.trim() || buildHandlerName(request.flowId, request.profile);
  const existingBinding = findExistingBinding(app, flowRef, request.profile, triggerImportRef);
  if (existingBinding && !request.replaceExisting) {
    throw new TriggerBindingError(
      `A ${request.profile.kind} binding for flow "${request.flowId}" already exists`,
      409,
      [
        createDiagnostic(
          "flogo.trigger_binding.duplicate",
          `A ${request.profile.kind} trigger binding for flow "${request.flowId}" already exists`,
          "error",
          `triggers.${existingBinding.trigger.id}`
        )
      ]
    );
  }

  const generatedMappings = generateTriggerMappings(flowContract, request.profile);
  const errors = generatedMappings.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length > 0) {
    throw new TriggerBindingError(
      errors[0]?.message ?? `Unable to bind ${request.profile.kind} trigger`,
      422,
      errors
    );
  }

  const warnings = generatedMappings.diagnostics.filter((diagnostic) => diagnostic.severity !== "error");
  const trigger = createTriggerDefinition(triggerId, triggerRef, handlerName, request.flowId, request.profile, generatedMappings);
  const plan = TriggerBindingPlanSchema.parse({
    flowId: request.flowId,
    profile: request.profile,
    triggerRef,
    triggerId,
    handlerName,
    generatedMappings: {
      input: generatedMappings.input,
      output: generatedMappings.output
    },
    trigger,
    diagnostics: [],
    warnings
  });

  const nextApp = applyTriggerBindingPlan(app, triggerAlias, triggerImportRef, trigger, existingBinding);
  const validation = validateFlogoApp(nextApp);
  if (!validation.ok) {
    throw new TriggerBindingError(
      `Generated ${request.profile.kind} trigger binding is not valid`,
      422,
      validation.stages.flatMap((stage) => stage.diagnostics)
    );
  }

  return {
    app,
    nextApp,
    plan,
    validation,
    patchSummary: summarizeAppDiff(app, nextApp)
  };
}

function buildSubflowExtractionOperation(
  document: string | FlogoApp | unknown,
  requestInput: SubflowExtractionRequest | unknown
): SubflowExtractionOperation {
  const request = SubflowExtractionRequestSchema.parse(requestInput);
  const app = parseFlogoAppDocument(document);
  const parentFlow = app.resources.find((resource) => resource.id === request.flowId);
  if (!parentFlow) {
    throw new SubflowOperationError(
      `Flow "${request.flowId}" was not found`,
      404,
      [createDiagnostic("flogo.subflow.unknown_flow", `Flow "${request.flowId}" was not found`, "error", request.flowId)]
    );
  }

  if ((parentFlow.data.links ?? []).length > 0) {
    throw new SubflowOperationError(
      `Flow "${request.flowId}" uses links/branching that this slice cannot rewrite`,
      422,
      [
        createDiagnostic(
          "flogo.subflow.branching_not_supported",
          `Flow "${request.flowId}" uses links or branching that subflow extraction does not yet support`,
          "error",
          `resources.${request.flowId}.links`
        )
      ]
    );
  }

  const selection = resolveSelectedTaskRegion(parentFlow, request.taskIds);
  const newFlowId = request.newFlowId?.trim() || buildExtractedFlowId(parentFlow.id, selection.selectedTaskIds);
  if (newFlowId === parentFlow.id) {
    throw new SubflowOperationError(
      `Extracted subflow id "${newFlowId}" conflicts with the parent flow`,
      422,
      [
        createDiagnostic(
          "flogo.subflow.duplicate_target_flow",
          `Extracted subflow id "${newFlowId}" conflicts with the parent flow id`,
          "error",
          `resources.${parentFlow.id}`
        )
      ]
    );
  }

  const existingTargetFlow = app.resources.find((resource) => resource.id === newFlowId);
  if (existingTargetFlow && !request.replaceExisting) {
    throw new SubflowOperationError(
      `Flow "${newFlowId}" already exists`,
      409,
      [
        createDiagnostic(
          "flogo.subflow.duplicate_target_flow",
          `Flow "${newFlowId}" already exists and replaceExisting is false`,
          "error",
          `resources.${newFlowId}`
        )
      ]
    );
  }

  const parentContract = inferFlowContract(app, parentFlow.id);
  const inputNames = inferSubflowInputs(parentFlow, selection.startIndex, selection.endIndex);
  const outputNames = inferSubflowOutputs(app, parentFlow, selection.startIndex, selection.endIndex);
  const diagnostics: Diagnostic[] = [];
  if (inputNames.length === 0 && outputNames.length === 0) {
    diagnostics.push(
      createDiagnostic(
        "flogo.subflow.no_external_contract",
        `Selected tasks do not expose clear external inputs or outputs; extraction will create a self-contained subflow`,
        "warning",
        `resources.${parentFlow.id}`
      )
    );
  }

  const newFlowName = request.newFlowName?.trim() || buildExtractedFlowName(parentFlow, selection.selectedTasks);
  const invocationTaskId = createUniqueTaskId(
    parentFlow,
    `subflow_${slugify(newFlowId).replace(/-/g, "_")}`,
    selection.selectedTaskIds
  );
  const invocation = FlogoTaskSchema.parse({
    id: invocationTaskId,
    name: newFlowName,
    activityRef: "#flow",
    settings: {
      flowURI: `res://flow:${newFlowId}`
    },
    input: Object.fromEntries(inputNames.map((name) => [name, `$flow.${name}`])),
    output: Object.fromEntries(outputNames.map((name) => [name, `$activity[${invocationTaskId}].${name}`]))
  });

  const extractedFlow = FlogoFlowSchema.parse({
    id: newFlowId,
    type: "flow",
    data: {
      name: newFlowName,
      metadata: {
        input: inputNames.map((name) => buildFlowMetadataField(parentContract?.inputs, name)),
        output: outputNames.map((name) => buildFlowMetadataField(parentContract?.outputs, name))
      },
      tasks: selection.selectedTasks,
      links: []
    }
  });

  const nextApp = applySubflowExtractionPlan(app, parentFlow.id, extractedFlow, invocation, selection, Boolean(existingTargetFlow));
  const newFlowContract = inferFlowContract(nextApp, newFlowId);
  if (!newFlowContract) {
    throw new SubflowOperationError(
      `Unable to infer the extracted subflow contract for "${newFlowId}"`,
      422,
      [
        createDiagnostic(
          "flogo.subflow.contract_inference_failed",
          `Unable to infer the extracted subflow contract for "${newFlowId}"`,
          "error",
          `resources.${newFlowId}`
        )
      ]
    );
  }

  const plan = SubflowExtractionPlanSchema.parse({
    parentFlowId: parentFlow.id,
    newFlowId,
    newFlowName,
    selectedTaskIds: selection.selectedTaskIds,
    newFlowContract,
    invocation: {
      parentFlowId: parentFlow.id,
      taskId: invocation.id,
      activityRef: invocation.activityRef,
      input: invocation.input ?? {},
      output: invocation.output ?? {},
      settings: invocation.settings ?? {}
    },
    diagnostics: [],
    warnings: diagnostics
  });

  const validation = validateFlogoApp(nextApp);
  if (!validation.ok) {
    throw new SubflowOperationError(
      `Generated subflow extraction for flow "${parentFlow.id}" is not valid`,
      422,
      validation.stages.flatMap((stage) => stage.diagnostics)
    );
  }

  return {
    app,
    nextApp,
    plan,
    validation,
    patchSummary: summarizeAppDiff(app, nextApp)
  };
}

function buildSubflowInliningOperation(
  document: string | FlogoApp | unknown,
  requestInput: SubflowInliningRequest | unknown
): SubflowInliningOperation {
  const request = SubflowInliningRequestSchema.parse(requestInput);
  const app = parseFlogoAppDocument(document);
  const parentFlow = app.resources.find((resource) => resource.id === request.parentFlowId);
  if (!parentFlow) {
    throw new SubflowOperationError(
      `Flow "${request.parentFlowId}" was not found`,
      404,
      [createDiagnostic("flogo.subflow.unknown_flow", `Flow "${request.parentFlowId}" was not found`, "error", request.parentFlowId)]
    );
  }

  if ((parentFlow.data.links ?? []).length > 0) {
    throw new SubflowOperationError(
      `Flow "${request.parentFlowId}" uses links/branching that this slice cannot rewrite`,
      422,
      [
        createDiagnostic(
          "flogo.subflow.inline_not_supported",
          `Flow "${request.parentFlowId}" uses links or branching that subflow inlining does not yet support`,
          "error",
          `resources.${request.parentFlowId}.links`
        )
      ]
    );
  }

  const invocationIndex = parentFlow.data.tasks.findIndex((task) => task.id === request.invocationTaskId);
  if (invocationIndex === -1) {
    throw new SubflowOperationError(
      `Invocation task "${request.invocationTaskId}" was not found`,
      404,
      [
        createDiagnostic(
          "flogo.subflow.unknown_invocation",
          `Invocation task "${request.invocationTaskId}" was not found`,
          "error",
          `resources.${parentFlow.id}.tasks.${request.invocationTaskId}`
        )
      ]
    );
  }

  const invocationTask = parentFlow.data.tasks[invocationIndex];
  const targetFlowRef = normalizeFlowActionRef(invocationTask.activityRef, invocationTask.settings.flowURI);
  if (!targetFlowRef?.startsWith("#flow:")) {
    throw new SubflowOperationError(
      `Task "${request.invocationTaskId}" is not a flow invocation`,
      422,
      [
        createDiagnostic(
          "flogo.subflow.inline_not_supported",
          `Task "${request.invocationTaskId}" does not point to a subflow resource`,
          "error",
          `resources.${parentFlow.id}.tasks.${request.invocationTaskId}`
        )
      ]
    );
  }

  const inlinedFlowId = targetFlowRef.replace("#flow:", "");
  const inlinedFlow = app.resources.find((resource) => resource.id === inlinedFlowId);
  if (!inlinedFlow) {
    throw new SubflowOperationError(
      `Subflow "${inlinedFlowId}" was not found`,
      404,
      [
        createDiagnostic(
          "flogo.subflow.unknown_flow",
          `Subflow "${inlinedFlowId}" was not found`,
          "error",
          `resources.${inlinedFlowId}`
        )
      ]
    );
  }

  if ((inlinedFlow.data.links ?? []).length > 0) {
    throw new SubflowOperationError(
      `Subflow "${inlinedFlowId}" uses links/branching that this slice cannot inline`,
      422,
      [
        createDiagnostic(
          "flogo.subflow.inline_not_supported",
          `Subflow "${inlinedFlowId}" uses links or branching that subflow inlining does not yet support`,
          "error",
          `resources.${inlinedFlowId}.links`
        )
      ]
    );
  }

  const generatedTasks = inlinedFlow.data.tasks.map((task) =>
    FlogoTaskSchema.parse({
      ...task,
      id: createUniqueTaskId(parentFlow, `${request.invocationTaskId}__${task.id}`, [request.invocationTaskId, ...inlinedFlow.data.tasks.map((entry) => entry.id)])
    })
  );
  const nextApp = applySubflowInliningPlan(app, parentFlow.id, invocationIndex, generatedTasks, inlinedFlowId, request.removeExtractedFlowIfUnused);
  const warnings: Diagnostic[] = [];
  if (request.removeExtractedFlowIfUnused && app.resources.some((resource) => resource.id === inlinedFlowId) && nextApp.resources.some((resource) => resource.id === inlinedFlowId)) {
    warnings.push(
      createDiagnostic(
        "flogo.subflow.unused_extracted_flow",
        `Flow "${inlinedFlowId}" is still referenced elsewhere and was not removed`,
        "warning",
        `resources.${inlinedFlowId}`
      )
    );
  }

  const plan = SubflowInliningPlanSchema.parse({
    parentFlowId: parentFlow.id,
    invocationTaskId: request.invocationTaskId,
    inlinedFlowId,
    generatedTaskIds: generatedTasks.map((task) => task.id),
    diagnostics: [],
    warnings
  });
  const validation = validateFlogoApp(nextApp);
  if (!validation.ok) {
    throw new SubflowOperationError(
      `Generated subflow inlining for flow "${parentFlow.id}" is not valid`,
      422,
      validation.stages.flatMap((stage) => stage.diagnostics)
    );
  }

  return {
    app,
    nextApp,
    plan,
    validation,
    patchSummary: summarizeAppDiff(app, nextApp)
  };
}

function buildIteratorSynthesisOperation(
  document: string | FlogoApp | unknown,
  requestInput: IteratorSynthesisRequest | unknown
): IteratorSynthesisOperation {
  const request = IteratorSynthesisRequestSchema.parse(requestInput);
  const app = parseFlogoAppDocument(document);
  const target = resolveControlFlowTarget(app, request.flowId, request.taskId, "iterator");
  const iterateExpr = request.iterateExpr.trim();
  if (!iterateExpr) {
    throw new ControlFlowSynthesisError(
      "Iterator synthesis requires a non-empty iterate expression",
      422,
      [
        createDiagnostic(
          "flogo.iterator.invalid_iterate_expr",
          "Iterator synthesis requires a non-empty iterate expression",
          "error",
          `resources.${request.flowId}.tasks.${request.taskId}.settings.iterate`
        )
      ]
    );
  }

  const taskType = normalizeTaskType(target.task.type);
  if (!target.task.activityRef?.trim()) {
    throw new ControlFlowSynthesisError(
      `Task "${request.taskId}" cannot be converted to an iterator because it has no activityRef`,
      422,
      [
        createDiagnostic(
          "flogo.iterator.missing_activity_ref",
          `Task "${request.taskId}" cannot be converted to an iterator because it has no activityRef`,
          "error",
          `resources.${request.flowId}.tasks.${request.taskId}.activityRef`
        )
      ]
    );
  }
  if (taskType === "doWhile") {
    throw new ControlFlowSynthesisError(
      `Task "${request.taskId}" is already a doWhile task and cannot also be an iterator in this slice`,
      422,
      [
        createDiagnostic(
          "flogo.iterator.incompatible_task_type",
          `Task "${request.taskId}" is already a doWhile task and cannot also be an iterator in this slice`,
          "error",
          `resources.${request.flowId}.tasks.${request.taskId}.type`
        )
      ]
    );
  }
  if (taskType === "iterator" && !request.replaceExisting) {
    throw new ControlFlowSynthesisError(
      `Task "${request.taskId}" already has iterator settings`,
      409,
      [
        createDiagnostic(
          "flogo.iterator.already_exists",
          `Task "${request.taskId}" already has iterator settings`,
          "error",
          `resources.${request.flowId}.tasks.${request.taskId}.type`
        )
      ]
    );
  }

  const updatedSettings: Record<string, unknown> = {
    ...(target.task.settings ?? {}),
    iterate: iterateExpr
  };
  if (request.accumulate !== undefined) {
    updatedSettings.accumulate = request.accumulate;
  }

  const nextTask = FlogoTaskSchema.parse({
    ...target.task,
    type: "iterator",
    settings: updatedSettings
  });
  const nextApp = replaceTaskInFlow(app, request.flowId, target.taskIndex, nextTask);
  const validation = validateFlogoApp(nextApp);
  if (!validation.ok) {
    throw new ControlFlowSynthesisError(
      `Generated iterator task for "${request.taskId}" is not valid`,
      422,
      validation.stages.flatMap((stage) => stage.diagnostics)
    );
  }

  const plan = IteratorSynthesisPlanSchema.parse({
    flowId: request.flowId,
    taskId: request.taskId,
    nextTaskType: "iterator",
    updatedSettings,
    diagnostics: [],
    warnings: []
  });

  return {
    app,
    nextApp,
    plan,
    validation,
    patchSummary: `Converted task "${request.taskId}" in flow "${request.flowId}" to iterator`
  };
}

function buildRetryPolicyOperation(
  document: string | FlogoApp | unknown,
  requestInput: RetryPolicyRequest | unknown
): RetryPolicyOperation {
  const request = RetryPolicyRequestSchema.parse(requestInput);
  const app = parseFlogoAppDocument(document);
  const target = resolveControlFlowTarget(app, request.flowId, request.taskId, "retry");

  if (!target.task.activityRef?.trim()) {
    throw new ControlFlowSynthesisError(
      `Task "${request.taskId}" cannot accept retryOnError because it has no activityRef`,
      422,
      [
        createDiagnostic(
          "flogo.retry.missing_activity_ref",
          `Task "${request.taskId}" cannot accept retryOnError because it has no activityRef`,
          "error",
          `resources.${request.flowId}.tasks.${request.taskId}.activityRef`
        )
      ]
    );
  }

  if (target.task.settings?.retryOnError && !request.replaceExisting) {
    throw new ControlFlowSynthesisError(
      `Task "${request.taskId}" already has retryOnError settings`,
      409,
      [
        createDiagnostic(
          "flogo.retry.already_exists",
          `Task "${request.taskId}" already has retryOnError settings`,
          "error",
          `resources.${request.flowId}.tasks.${request.taskId}.settings.retryOnError`
        )
      ]
    );
  }

  const retryOnError = {
    count: request.count,
    interval: request.intervalMs
  };
  const updatedSettings: Record<string, unknown> = {
    ...(target.task.settings ?? {}),
    retryOnError
  };

  const nextTask = FlogoTaskSchema.parse({
    ...target.task,
    settings: updatedSettings
  });
  const nextApp = replaceTaskInFlow(app, request.flowId, target.taskIndex, nextTask);
  const validation = validateFlogoApp(nextApp);
  if (!validation.ok) {
    throw new ControlFlowSynthesisError(
      `Generated retryOnError settings for "${request.taskId}" are not valid`,
      422,
      validation.stages.flatMap((stage) => stage.diagnostics)
    );
  }

  const plan = RetryPolicyPlanSchema.parse({
    flowId: request.flowId,
    taskId: request.taskId,
    retryOnError,
    diagnostics: [],
    warnings: []
  });

  return {
    app,
    nextApp,
    plan,
    validation,
    patchSummary: `Added retryOnError to task "${request.taskId}" in flow "${request.flowId}"`
  };
}

function buildDoWhileSynthesisOperation(
  document: string | FlogoApp | unknown,
  requestInput: DoWhileSynthesisRequest | unknown
): DoWhileSynthesisOperation {
  const request = DoWhileSynthesisRequestSchema.parse(requestInput);
  const app = parseFlogoAppDocument(document);
  const target = resolveControlFlowTarget(app, request.flowId, request.taskId, "doWhile");
  const condition = request.condition.trim();
  if (!condition) {
    throw new ControlFlowSynthesisError(
      "DoWhile synthesis requires a non-empty condition",
      422,
      [
        createDiagnostic(
          "flogo.dowhile.invalid_condition",
          "DoWhile synthesis requires a non-empty condition",
          "error",
          `resources.${request.flowId}.tasks.${request.taskId}.settings.condition`
        )
      ]
    );
  }

  const taskType = normalizeTaskType(target.task.type);
  if (!target.task.activityRef?.trim()) {
    throw new ControlFlowSynthesisError(
      `Task "${request.taskId}" cannot be converted to doWhile because it has no activityRef`,
      422,
      [
        createDiagnostic(
          "flogo.dowhile.missing_activity_ref",
          `Task "${request.taskId}" cannot be converted to doWhile because it has no activityRef`,
          "error",
          `resources.${request.flowId}.tasks.${request.taskId}.activityRef`
        )
      ]
    );
  }
  if (taskType === "iterator") {
    throw new ControlFlowSynthesisError(
      `Task "${request.taskId}" is already an iterator task and cannot also be a doWhile task in this slice`,
      422,
      [
        createDiagnostic(
          "flogo.dowhile.incompatible_task_type",
          `Task "${request.taskId}" is already an iterator task and cannot also be a doWhile task in this slice`,
          "error",
          `resources.${request.flowId}.tasks.${request.taskId}.type`
        )
      ]
    );
  }
  if (taskType === "doWhile" && !request.replaceExisting) {
    throw new ControlFlowSynthesisError(
      `Task "${request.taskId}" already has doWhile settings`,
      409,
      [
        createDiagnostic(
          "flogo.dowhile.already_exists",
          `Task "${request.taskId}" already has doWhile settings`,
          "error",
          `resources.${request.flowId}.tasks.${request.taskId}.type`
        )
      ]
    );
  }

  const updatedSettings: Record<string, unknown> = {
    ...(target.task.settings ?? {}),
    condition
  };
  if (request.delayMs !== undefined) {
    updatedSettings.delay = request.delayMs;
  }
  if (request.accumulate !== undefined) {
    updatedSettings.accumulate = request.accumulate;
  }

  const nextTask = FlogoTaskSchema.parse({
    ...target.task,
    type: "doWhile",
    settings: updatedSettings
  });
  const nextApp = replaceTaskInFlow(app, request.flowId, target.taskIndex, nextTask);
  const validation = validateFlogoApp(nextApp);
  if (!validation.ok) {
    throw new ControlFlowSynthesisError(
      `Generated doWhile task for "${request.taskId}" is not valid`,
      422,
      validation.stages.flatMap((stage) => stage.diagnostics)
    );
  }

  const plan = DoWhileSynthesisPlanSchema.parse({
    flowId: request.flowId,
    taskId: request.taskId,
    nextTaskType: "doWhile",
    updatedSettings,
    diagnostics: [],
    warnings: []
  });

  return {
    app,
    nextApp,
    plan,
    validation,
    patchSummary: `Converted task "${request.taskId}" in flow "${request.flowId}" to doWhile`
  };
}

function buildErrorPathTemplateOperation(
  document: string | FlogoApp | unknown,
  requestInput: ErrorPathTemplateRequest | unknown
): ErrorPathTemplateOperation {
  const request = ErrorPathTemplateRequestSchema.parse(requestInput);
  const app = parseFlogoAppDocument(document);
  const target = resolveErrorPathTarget(app, request.flowId, request.taskId);

  if (!target.task.activityRef?.trim()) {
    throw new ErrorPathTemplateError(
      `Task "${request.taskId}" cannot receive an error path because it has no activityRef`,
      422,
      [
        createDiagnostic(
          "flogo.error_path.missing_activity_ref",
          `Task "${request.taskId}" cannot receive an error path because it has no activityRef`,
          "error",
          `resources.${request.flowId}.tasks.${request.taskId}.activityRef`
        )
      ]
    );
  }

  const typedFlow = materializeFlowLinks(target.flow);
  if (!isSupportedErrorPathLinkShape(typedFlow)) {
    throw new ErrorPathTemplateError(
      `Flow "${request.flowId}" uses branching links that this slice cannot rewrite`,
      422,
      [
        createDiagnostic(
          "flogo.error_path.branching_not_supported",
          `Flow "${request.flowId}" uses branching links that this slice cannot rewrite`,
          "error",
          `resources.${request.flowId}.links`
        )
      ]
    );
  }

  const existingGeneratedPath = findGeneratedErrorPath(typedFlow, request.taskId);
  if (existingGeneratedPath && !request.replaceExisting) {
    throw new ErrorPathTemplateError(
      `Task "${request.taskId}" already has a generated error path`,
      409,
      [
        createDiagnostic(
          "flogo.error_path.already_exists",
          `Task "${request.taskId}" already has a generated error path`,
          "error",
          `resources.${request.flowId}.tasks.${request.taskId}`
        )
      ]
    );
  }

  const baseFlow = existingGeneratedPath ? removeExistingGeneratedErrorPath(typedFlow, existingGeneratedPath) : typedFlow;
  const successorTaskId = findSuccessorTaskId(baseFlow, request.taskId);
  if (request.template === "log_and_continue" && !successorTaskId) {
    throw new ErrorPathTemplateError(
      `Template "${request.template}" requires the task to have a successor`,
      422,
      [
        createDiagnostic(
          "flogo.error_path.missing_successor",
          `Template "${request.template}" requires task "${request.taskId}" to have a successor`,
          "error",
          `resources.${request.flowId}.tasks.${request.taskId}`
        )
      ]
    );
  }

  const logImport = resolveLogImport(app);
  const generatedTaskId = createGeneratedErrorTaskId(baseFlow, request.taskId, request.generatedTaskPrefix);
  const generatedTask = createErrorLogTask(generatedTaskId, request.taskId, request.logMessage);
  const nextFlow = insertGeneratedErrorPath(baseFlow, request.taskId, request.template, generatedTask, successorTaskId);
  const nextApp = applyErrorPathTemplatePlan(app, request.flowId, nextFlow, logImport);
  const validation = validateFlogoApp(nextApp);
  if (!validation.ok) {
    throw new ErrorPathTemplateError(
      `Generated error path for task "${request.taskId}" is not valid`,
      422,
      validation.stages.flatMap((stage) => stage.diagnostics)
    );
  }

  const generatedLinks = nextFlow.data.links.filter(
    (link) => link.from === request.taskId || link.from === generatedTaskId || link.to === generatedTaskId
  );
  const warnings: Diagnostic[] = [];
  if (existingGeneratedPath && request.replaceExisting) {
    warnings.push(
      createDiagnostic(
        "flogo.error_path.replaced_existing",
        `Replaced an existing generated error path for task "${request.taskId}"`,
        "warning",
        `resources.${request.flowId}.tasks.${request.taskId}`
      )
    );
  }

  const plan = ErrorPathTemplatePlanSchema.parse({
    flowId: request.flowId,
    taskId: request.taskId,
    template: request.template,
    generatedTaskId,
    addedImport: logImport.addedImport,
    generatedLinks,
    diagnostics: [],
    warnings
  });

  return {
    app,
    nextApp,
    plan,
    validation,
    patchSummary: `Added ${request.template} error path to task "${request.taskId}" in flow "${request.flowId}"`
  };
}

function resolveSelectedTaskRegion(flow: FlogoFlow, requestedTaskIds: string[]) {
  if (!requestedTaskIds.length) {
    throw new SubflowOperationError(
      "At least one task must be selected for extraction",
      422,
      [createDiagnostic("flogo.subflow.unknown_task", "At least one task must be selected for extraction", "error", `resources.${flow.id}`)]
    );
  }

  const uniqueRequested = Array.from(new Set(requestedTaskIds));
  const indexMap = new Map(flow.data.tasks.map((task, index) => [task.id, index]));
  const indexes = uniqueRequested.map((taskId) => {
    const index = indexMap.get(taskId);
    if (index === undefined) {
      throw new SubflowOperationError(
        `Task "${taskId}" was not found in flow "${flow.id}"`,
        422,
        [createDiagnostic("flogo.subflow.unknown_task", `Task "${taskId}" was not found in flow "${flow.id}"`, "error", `resources.${flow.id}.tasks.${taskId}`)]
      );
    }
    return index;
  });
  const sortedIndexes = [...indexes].sort((left, right) => left - right);
  const startIndex = sortedIndexes[0];
  const endIndex = sortedIndexes[sortedIndexes.length - 1];
  if (endIndex - startIndex + 1 !== uniqueRequested.length) {
    throw new SubflowOperationError(
      `Subflow extraction requires a contiguous task selection`,
      422,
      [
        createDiagnostic(
          "flogo.subflow.non_contiguous_selection",
          `Subflow extraction requires a contiguous task selection`,
          "error",
          `resources.${flow.id}.tasks`
        )
      ]
    );
  }

  const selectedTasks = flow.data.tasks.slice(startIndex, endIndex + 1).map((task) => FlogoTaskSchema.parse(task));
  return {
    startIndex,
    endIndex,
    selectedTasks,
    selectedTaskIds: selectedTasks.map((task) => task.id)
  };
}

function buildExtractedFlowId(parentFlowId: string, taskIds: string[]) {
  const suffix = taskIds.length === 1 ? slugify(taskIds[0]) : `${slugify(taskIds[0])}-${slugify(taskIds[taskIds.length - 1])}`;
  return `${slugify(parentFlowId)}-subflow-${suffix}`;
}

function buildExtractedFlowName(parentFlow: FlogoFlow, tasks: FlogoFlow["data"]["tasks"]) {
  const base = parentFlow.data.name ?? parentFlow.id;
  const suffix = tasks.length === 1 ? tasks[0].name ?? tasks[0].id : `${tasks[0].name ?? tasks[0].id} to ${tasks[tasks.length - 1].name ?? tasks[tasks.length - 1].id}`;
  return `${base} subflow (${suffix})`;
}

function inferSubflowInputs(flow: FlogoFlow, startIndex: number, endIndex: number) {
  const inputNames = new Set<string>();
  const producedNames = new Set<string>();
  for (let index = startIndex; index <= endIndex; index += 1) {
    const task = flow.data.tasks[index];
    for (const name of collectFlowResolverNames(task.input)) {
      if (!producedNames.has(name)) {
        inputNames.add(name);
      }
    }
    for (const name of collectFlowResolverNames(task.settings)) {
      if (!producedNames.has(name)) {
        inputNames.add(name);
      }
    }
    for (const name of collectFlowResolverNames(task.output)) {
      if (!producedNames.has(name)) {
        inputNames.add(name);
      }
    }
    for (const producedName of Object.keys(task.output ?? {})) {
      producedNames.add(producedName);
    }
  }
  return Array.from(inputNames).sort();
}

function inferSubflowOutputs(app: FlogoApp, flow: FlogoFlow, startIndex: number, endIndex: number) {
  const producedNames = new Set<string>();
  for (let index = startIndex; index <= endIndex; index += 1) {
    for (const producedName of Object.keys(flow.data.tasks[index]?.output ?? {})) {
      producedNames.add(producedName);
    }
  }

  const outputNames = new Set<string>();
  for (let index = endIndex + 1; index < flow.data.tasks.length; index += 1) {
    const task = flow.data.tasks[index];
    for (const name of [...collectFlowResolverNames(task.input), ...collectFlowResolverNames(task.settings), ...collectFlowResolverNames(task.output)]) {
      if (producedNames.has(name)) {
        outputNames.add(name);
      }
    }
  }

  const flowContract = inferFlowContract(app, flow.id);
  for (const outputParam of flowContract?.outputs ?? []) {
    if (producedNames.has(outputParam.name)) {
      outputNames.add(outputParam.name);
    }
  }

  return Array.from(outputNames).sort();
}

function buildFlowMetadataField(
  existingParams: FlowContract["inputs"] | FlowContract["outputs"] | undefined,
  name: string
) {
  const existing = existingParams?.find((param) => param.name === name);
  return {
    name,
    type: existing?.type,
    required: existing?.required,
    description: existing?.description
  };
}

function createUniqueTaskId(flow: FlogoFlow, baseId: string, reservedIds: string[] = []) {
  const used = new Set(flow.data.tasks.map((task) => task.id));
  reservedIds.forEach((id) => used.add(id));
  let candidate = baseId;
  let counter = 1;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${baseId}_${counter}`;
  }
  return candidate;
}

function normalizeTaskType(taskType: unknown) {
  return typeof taskType === "string" && taskType.trim().length > 0 ? taskType.trim() : undefined;
}

function resolveControlFlowTarget(
  app: FlogoApp,
  flowId: string,
  taskId: string,
  pattern: "iterator" | "retry" | "doWhile"
) {
  const flow = app.resources.find((resource) => resource.id === flowId);
  const flowCode = pattern === "retry" ? "flogo.retry.unknown_flow" : `flogo.${pattern}.unknown_flow`;
  const taskCode = pattern === "retry" ? "flogo.retry.unknown_task" : `flogo.${pattern}.unknown_task`;
  if (!flow) {
    throw new ControlFlowSynthesisError(
      `Flow "${flowId}" was not found`,
      404,
      [createDiagnostic(flowCode, `Flow "${flowId}" was not found`, "error", flowId)]
    );
  }

  const taskIndex = flow.data.tasks.findIndex((task) => task.id === taskId);
  if (taskIndex === -1) {
    throw new ControlFlowSynthesisError(
      `Task "${taskId}" was not found in flow "${flowId}"`,
      404,
      [createDiagnostic(taskCode, `Task "${taskId}" was not found in flow "${flowId}"`, "error", `resources.${flowId}.tasks.${taskId}`)]
    );
  }

  return {
    flow,
    taskIndex,
    task: flow.data.tasks[taskIndex]
  };
}

function resolveErrorPathTarget(app: FlogoApp, flowId: string, taskId: string) {
  const flow = app.resources.find((resource) => resource.id === flowId);
  if (!flow) {
    throw new ErrorPathTemplateError(
      `Flow "${flowId}" was not found`,
      404,
      [createDiagnostic("flogo.error_path.unknown_flow", `Flow "${flowId}" was not found`, "error", flowId)]
    );
  }

  const taskIndex = flow.data.tasks.findIndex((task) => task.id === taskId);
  if (taskIndex === -1) {
    throw new ErrorPathTemplateError(
      `Task "${taskId}" was not found in flow "${flowId}"`,
      404,
      [createDiagnostic("flogo.error_path.unknown_task", `Task "${taskId}" was not found in flow "${flowId}"`, "error", `resources.${flowId}.tasks.${taskId}`)]
    );
  }

  return {
    flow,
    taskIndex,
    task: flow.data.tasks[taskIndex]
  };
}

function materializeFlowLinks(flow: FlogoFlow): FlogoFlow {
  const existingLinks = (flow.data.links ?? []).map((link) => FlogoLinkSchema.parse(link));
  const links = existingLinks.length > 0 ? existingLinks : buildLinearDependencyLinks(flow);

  return FlogoFlowSchema.parse({
    ...flow,
    data: {
      ...flow.data,
      links
    }
  });
}

function buildLinearDependencyLinks(flow: FlogoFlow): FlogoLink[] {
  const links: FlogoLink[] = [];
  for (let index = 0; index < flow.data.tasks.length - 1; index += 1) {
    links.push(
      FlogoLinkSchema.parse({
        from: flow.data.tasks[index]?.id,
        to: flow.data.tasks[index + 1]?.id,
        type: "dependency"
      })
    );
  }
  return links;
}

function canonicalSuccessExpression(taskId: string) {
  return `=$activity[${taskId}].error == nil`;
}

function canonicalErrorExpression(taskId: string) {
  return `=$activity[${taskId}].error != nil`;
}

function isSuccessExpression(link: FlogoLink, taskId: string) {
  return link.type === "expression" && link.value === canonicalSuccessExpression(taskId);
}

function isErrorExpression(link: FlogoLink, taskId: string) {
  return link.type === "expression" && link.value === canonicalErrorExpression(taskId);
}

function isSupportedErrorPathLinkShape(flow: FlogoFlow) {
  if ((flow.data.links ?? []).length === 0) {
    return true;
  }

  const links = (flow.data.links ?? []).map((link) => FlogoLinkSchema.parse(link));
  for (const task of flow.data.tasks) {
    const outgoing = links.filter((link) => link.from === task.id);
    if (outgoing.length === 0 || outgoing.length === 1) {
      const [link] = outgoing;
      if (!link) {
        continue;
      }
      if (link.type === "dependency") {
        continue;
      }
      if (!isErrorExpression(link, task.id)) {
        return false;
      }
      const errorTask = flow.data.tasks.find((candidate) => candidate.id === link.to);
      if (!errorTask || errorTask.activityRef !== "#log") {
        return false;
      }
      continue;
    }

    if (outgoing.length > 2) {
      return false;
    }

    const successLink = outgoing.find((link) => isSuccessExpression(link, task.id));
    const errorLink = outgoing.find((link) => isErrorExpression(link, task.id));
    if (!successLink || !errorLink) {
      return false;
    }

    const errorTask = flow.data.tasks.find((candidate) => candidate.id === errorLink.to);
    if (!errorTask || errorTask.activityRef !== "#log") {
      return false;
    }

    const errorOutgoing = links.filter((link) => link.from === errorTask.id);
    if (errorOutgoing.length > 1) {
      return false;
    }
    if (errorOutgoing.length === 1 && errorOutgoing[0]?.type !== "dependency") {
      return false;
    }
  }

  return true;
}

function findSuccessorTaskId(flow: FlogoFlow, taskId: string) {
  const links = (flow.data.links ?? []).map((link) => FlogoLinkSchema.parse(link));
  const outgoing = links.filter((link) => link.from === taskId);
  const successLink =
    outgoing.find((link) => link.type === "dependency") ??
    outgoing.find((link) => isSuccessExpression(link, taskId));
  return successLink?.to;
}

type ExistingGeneratedErrorPath = {
  taskId: string;
  generatedTaskId: string;
};

function findGeneratedErrorPath(flow: FlogoFlow, taskId: string): ExistingGeneratedErrorPath | undefined {
  const links = (flow.data.links ?? []).map((link) => FlogoLinkSchema.parse(link));
  const outgoing = links.filter((link) => link.from === taskId);
  const errorLink = outgoing.find((link) => isErrorExpression(link, taskId));
  if (!errorLink) {
    return undefined;
  }

  const generatedTask = flow.data.tasks.find((task) => task.id === errorLink.to);
  if (!generatedTask || generatedTask.activityRef !== "#log") {
    return undefined;
  }

  return {
    taskId,
    generatedTaskId: generatedTask.id
  };
}

function removeExistingGeneratedErrorPath(flow: FlogoFlow, existing: ExistingGeneratedErrorPath) {
  const nextTasks = flow.data.tasks.filter((task) => task.id !== existing.generatedTaskId);
  const nextLinks = (flow.data.links ?? [])
    .map((link) => FlogoLinkSchema.parse(link))
    .filter(
      (link) =>
        link.from !== existing.generatedTaskId &&
        link.to !== existing.generatedTaskId &&
        !(
          link.from === existing.taskId &&
          (isSuccessExpression(link, existing.taskId) || isErrorExpression(link, existing.taskId))
        )
    );

  return FlogoFlowSchema.parse({
    ...flow,
    data: {
      ...flow.data,
      tasks: nextTasks,
      links: nextLinks
    }
  });
}

function resolveLogImport(app: FlogoApp) {
  const existing = app.imports.find(
    (entry) => normalizeAlias(entry.alias) === "log" || entry.ref === "github.com/project-flogo/contrib/activity/log"
  );
  return {
    alias: existing?.alias ?? "log",
    ref: existing?.ref ?? "github.com/project-flogo/contrib/activity/log",
    addedImport: !existing
  };
}

function createGeneratedErrorTaskId(flow: FlogoFlow, taskId: string, prefix?: string) {
  const normalizedPrefix = prefix?.trim() ? slugify(prefix).replace(/-/g, "_") : "error";
  return createUniqueTaskId(flow, `${normalizedPrefix}_log_${taskId}`);
}

function createErrorLogTask(generatedTaskId: string, taskId: string, message?: string) {
  return FlogoTaskSchema.parse({
    id: generatedTaskId,
    name: `error-log-${taskId}`,
    activityRef: "#log",
    input: {
      message: message?.trim() || `Task ${taskId} failed`
    },
    output: {},
    settings: {}
  });
}

function insertGeneratedErrorPath(
  flow: FlogoFlow,
  taskId: string,
  template: ErrorPathTemplateRequest["template"],
  generatedTask: FlogoTask,
  successorTaskId?: string
) {
  const targetIndex = flow.data.tasks.findIndex((task) => task.id === taskId);
  const nextTasks = [...flow.data.tasks];
  nextTasks.splice(targetIndex + 1, 0, generatedTask);

  const existingLinks = (flow.data.links ?? []).map((link) => FlogoLinkSchema.parse(link));
  const nextLinks = existingLinks.filter((link) => !(link.from === taskId && link.type === "dependency"));

  if (successorTaskId) {
    nextLinks.push(
      FlogoLinkSchema.parse({
        from: taskId,
        to: successorTaskId,
        type: "expression",
        value: canonicalSuccessExpression(taskId)
      })
    );
  }

  nextLinks.push(
    FlogoLinkSchema.parse({
      from: taskId,
      to: generatedTask.id,
      type: "expression",
      value: canonicalErrorExpression(taskId)
    })
  );

  if (template === "log_and_continue" && successorTaskId) {
    nextLinks.push(
      FlogoLinkSchema.parse({
        from: generatedTask.id,
        to: successorTaskId,
        type: "dependency"
      })
    );
  }

  return FlogoFlowSchema.parse({
    ...flow,
    data: {
      ...flow.data,
      tasks: nextTasks,
      links: nextLinks
    }
  });
}

function replaceTaskInFlow(app: FlogoApp, flowId: string, taskIndex: number, nextTask: FlogoTask) {
  const resources = [...app.resources];
  const flowIndex = resources.findIndex((resource) => resource.id === flowId);
  const flow = resources[flowIndex];
  const tasks = [...flow.data.tasks];
  tasks[taskIndex] = nextTask;
  resources[flowIndex] = FlogoFlowSchema.parse({
    ...flow,
    data: {
      ...flow.data,
      tasks
    }
  });

  return FlogoAppSchema.parse({
    ...app,
    resources
  });
}

function applyErrorPathTemplatePlan(
  app: FlogoApp,
  flowId: string,
  nextFlow: FlogoFlow,
  logImport: { alias: string; ref: string; addedImport: boolean }
) {
  const imports = app.imports.some((entry) => entry.alias === logImport.alias || entry.ref === logImport.ref)
    ? app.imports
    : [...app.imports, { alias: logImport.alias, ref: logImport.ref }];

  const resources = [...app.resources];
  const flowIndex = resources.findIndex((resource) => resource.id === flowId);
  resources[flowIndex] = nextFlow;

  return FlogoAppSchema.parse({
    ...app,
    imports,
    resources
  });
}

function applySubflowExtractionPlan(
  app: FlogoApp,
  parentFlowId: string,
  extractedFlow: FlogoFlow,
  invocation: FlogoTask,
  selection: { startIndex: number; endIndex: number; selectedTaskIds: string[] },
  replacingExistingFlow: boolean
) {
  const resources = [...app.resources];
  const parentFlowIndex = resources.findIndex((resource) => resource.id === parentFlowId);
  const parentFlow = resources[parentFlowIndex];
  const nextParentTasks = [
    ...parentFlow.data.tasks.slice(0, selection.startIndex),
    invocation,
    ...parentFlow.data.tasks.slice(selection.endIndex + 1)
  ];
  resources[parentFlowIndex] = FlogoFlowSchema.parse({
    ...parentFlow,
    data: {
      ...parentFlow.data,
      tasks: nextParentTasks
    }
  });

  const existingTargetIndex = resources.findIndex((resource) => resource.id === extractedFlow.id);
  if (existingTargetIndex >= 0) {
    if (replacingExistingFlow) {
      resources[existingTargetIndex] = extractedFlow;
    }
  } else {
    resources.push(extractedFlow);
  }

  return FlogoAppSchema.parse({
    ...app,
    resources
  });
}

function applySubflowInliningPlan(
  app: FlogoApp,
  parentFlowId: string,
  invocationIndex: number,
  inlinedTasks: FlogoTask[],
  inlinedFlowId: string,
  removeExtractedFlowIfUnused: boolean
) {
  const resources = [...app.resources];
  const parentFlowIndex = resources.findIndex((resource) => resource.id === parentFlowId);
  const parentFlow = resources[parentFlowIndex];
  const nextParentTasks = [
    ...parentFlow.data.tasks.slice(0, invocationIndex),
    ...inlinedTasks,
    ...parentFlow.data.tasks.slice(invocationIndex + 1)
  ];
  resources[parentFlowIndex] = FlogoFlowSchema.parse({
    ...parentFlow,
    data: {
      ...parentFlow.data,
      tasks: nextParentTasks
    }
  });

  let nextApp = FlogoAppSchema.parse({
    ...app,
    resources
  });

  if (removeExtractedFlowIfUnused && countFlowReferences(nextApp, inlinedFlowId) === 0) {
    nextApp = FlogoAppSchema.parse({
      ...nextApp,
      resources: nextApp.resources.filter((resource) => resource.id !== inlinedFlowId)
    });
  }

  return nextApp;
}

function countFlowReferences(app: FlogoApp, flowId: string) {
  const flowRef = `#flow:${flowId}`;
  let references = 0;
  for (const trigger of app.triggers) {
    for (const handler of trigger.handlers) {
      if (resolveHandlerFlowRef(handler) === flowRef) {
        references += 1;
      }
    }
  }
  for (const resource of app.resources) {
    for (const task of resource.data.tasks) {
      if (normalizeFlowActionRef(task.activityRef, task.settings.flowURI) === flowRef) {
        references += 1;
      }
    }
  }
  return references;
}

function resolveTriggerImport(app: FlogoApp, kind: TriggerBindingRequest["profile"]["kind"]) {
  const registryEntry = triggerImportRegistry[kind];
  const importMatch = app.imports.find((entry) => entry.ref === registryEntry.ref || normalizeAlias(entry.alias) === registryEntry.alias);
  return {
    triggerAlias: importMatch?.alias ?? registryEntry.alias,
    triggerImportRef: importMatch?.ref ?? registryEntry.ref
  };
}

function buildTriggerId(flowId: string, profile: TriggerBindingRequest["profile"]) {
  return `flogo-${profile.kind}-${slugify(flowId)}`;
}

function buildHandlerName(flowId: string, profile: TriggerBindingRequest["profile"]) {
  const slug = slugify(flowId);
  switch (profile.kind) {
    case "rest":
      return `${profile.method.toLowerCase()}_${slug}`;
    case "timer":
      return `run_${slug}`;
    case "cli":
      return profile.commandName ? slugify(profile.commandName) : slug;
    case "channel":
      return `channel_${slug}`;
  }
}

function createTriggerDefinition(
  triggerId: string,
  triggerRef: string,
  handlerName: string,
  flowId: string,
  profile: TriggerBindingRequest["profile"],
  mappings: { input: Record<string, unknown>; output: Record<string, unknown> }
): FlogoApp["triggers"][number] {
  const baseHandler = {
    id: handlerName,
    settings: createHandlerSettings(profile),
    action: toFlowAction(flowId),
    input: mappings.input,
    output: mappings.output
  };

  return FlogoTriggerSchema.parse({
    id: triggerId,
    ref: triggerRef,
    settings: createTriggerSettings(profile),
    handlers: [baseHandler]
  });
}

function createTriggerSettings(profile: TriggerBindingRequest["profile"]) {
  switch (profile.kind) {
    case "rest":
      return { port: profile.port };
    case "cli":
      return { singleCmd: profile.singleCmd };
    default:
      return {};
  }
}

function createHandlerSettings(profile: TriggerBindingRequest["profile"]) {
  switch (profile.kind) {
    case "rest":
      return {
        method: profile.method,
        path: profile.path
      };
    case "timer": {
      const settings: Record<string, unknown> = {};
      if (profile.startDelay) {
        settings.startDelay = profile.startDelay;
      }
      if (profile.repeatInterval) {
        settings.repeatInterval = profile.repeatInterval;
      }
      return settings;
    }
    case "cli":
      return {
        command: profile.commandName,
        usage: profile.usage,
        short: profile.short,
        long: profile.long,
        flags: profile.flags
      };
    case "channel":
      return {
        channel: profile.channel
      };
  }
}

function generateTriggerMappings(flowContract: FlowContract, profile: TriggerBindingRequest["profile"]) {
  const input: Record<string, unknown> = {};
  const output: Record<string, unknown> = {};
  const diagnostics: Diagnostic[] = [];

  switch (profile.kind) {
    case "rest": {
      for (const param of flowContract.inputs) {
        const expression = inferRestInputMapping(param.name, flowContract.inputs.length);
        if (expression) {
          input[param.name] = expression;
        } else if (param.required) {
          diagnostics.push(
            createDiagnostic(
              "flogo.trigger_binding.unmapped_required_input",
              `REST auto-mapping cannot satisfy required flow input "${param.name}"`,
              "error",
              `flows.${flowContract.flowId}.inputs.${param.name}`
            )
          );
        } else {
          diagnostics.push(
            createDiagnostic(
              "flogo.trigger_binding.unmapped_optional_input",
              `REST auto-mapping left optional flow input "${param.name}" unmapped`,
              "warning",
              `flows.${flowContract.flowId}.inputs.${param.name}`
            )
          );
        }
      }

      const codeParam = findFlowParam(flowContract.outputs, ["code", "status"]);
      const dataParam = findFlowParam(flowContract.outputs, ["data", "body", "content"]);
      const headersParam = findFlowParam(flowContract.outputs, ["headers"]);
      const cookiesParam = findFlowParam(flowContract.outputs, ["cookies"]);
      if (codeParam) {
        output.code = `$flow.${codeParam.name}`;
      } else if (profile.replyMode === "status_only") {
        output.code = 200;
      }

      const outputFallback = flowContract.outputs.length === 1 ? flowContract.outputs[0] : undefined;
      if (dataParam) {
        output.data = `$flow.${dataParam.name}`;
      } else if (outputFallback) {
        output.data = `$flow.${outputFallback.name}`;
      } else if (profile.replyMode !== "status_only") {
        diagnostics.push(
          createDiagnostic(
            "flogo.trigger_binding.missing_reply_data",
            `REST reply data could not be inferred for flow "${flowContract.flowId}"`,
            "warning",
            `flows.${flowContract.flowId}.outputs`
          )
        );
      }
      if (headersParam) {
        output.headers = `$flow.${headersParam.name}`;
      }
      if (cookiesParam) {
        output.cookies = `$flow.${cookiesParam.name}`;
      }
      break;
    }
    case "timer": {
      const requiredInputs = flowContract.inputs.filter((param) => param.required);
      if (requiredInputs.length > 0) {
        diagnostics.push(
          createDiagnostic(
            "flogo.trigger_binding.timer_requires_zero_inputs",
            `Timer triggers can only bind flows with zero required inputs in this slice`,
            "error",
            `flows.${flowContract.flowId}.inputs`
          )
        );
      }
      break;
    }
    case "cli": {
      for (const param of flowContract.inputs) {
        const normalized = param.name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
        if (normalized === "args") {
          input[param.name] = "$trigger.args";
        } else if (normalized === "flags") {
          input[param.name] = "$trigger.flags";
        } else if (flowContract.inputs.length === 1) {
          input[param.name] = "$trigger.args";
        } else if (param.required) {
          diagnostics.push(
            createDiagnostic(
              "flogo.trigger_binding.unmapped_required_input",
              `CLI auto-mapping cannot satisfy required flow input "${param.name}"`,
              "error",
              `flows.${flowContract.flowId}.inputs.${param.name}`
            )
          );
        }
      }

      const dataParam = findFlowParam(flowContract.outputs, ["data"]) ?? (flowContract.outputs.length > 0 ? flowContract.outputs[0] : undefined);
      if (dataParam) {
        output.data = `$flow.${dataParam.name}`;
      }
      break;
    }
    case "channel": {
      for (const param of flowContract.inputs) {
        const normalized = param.name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
        if (normalized === "data" || normalized === "payload" || normalized === "content" || flowContract.inputs.length === 1) {
          input[param.name] = "$trigger.data";
        } else if (param.required) {
          diagnostics.push(
            createDiagnostic(
              "flogo.trigger_binding.unmapped_required_input",
              `Channel auto-mapping cannot satisfy required flow input "${param.name}"`,
              "error",
              `flows.${flowContract.flowId}.inputs.${param.name}`
            )
          );
        }
      }
      break;
    }
  }

  return {
    input,
    output,
    diagnostics: dedupeDiagnostics(diagnostics)
  };
}

function inferRestInputMapping(name: string, inputCount: number) {
  const normalized = name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (normalized === "content" || normalized === "body" || normalized === "payload" || normalized === "request") {
    return "$trigger.content";
  }
  if (normalized === "headers") {
    return "$trigger.headers";
  }
  if (normalized === "method") {
    return "$trigger.method";
  }
  if (normalized === "queryparams" || normalized === "query" || normalized === "queryparams") {
    return "$trigger.queryParams";
  }
  if (normalized === "pathparams" || normalized === "path" || normalized === "pathparams") {
    return "$trigger.pathParams";
  }
  if (inputCount === 1) {
    return "$trigger.content";
  }
  return undefined;
}

function findFlowParam(params: FlowContract["outputs"], candidates: string[]) {
  const normalizedCandidates = new Set(candidates.map((candidate) => candidate.toLowerCase()));
  return params.find((param) => normalizedCandidates.has(param.name.toLowerCase()));
}

function applyTriggerBindingPlan(
  app: FlogoApp,
  triggerAlias: string,
  triggerImportRef: string,
  trigger: FlogoApp["triggers"][number],
  existingBinding?: { trigger: FlogoApp["triggers"][number]; triggerIndex: number; handlerIndex: number }
): FlogoApp {
  const imports = app.imports.some((entry) => entry.alias === triggerAlias || entry.ref === triggerImportRef)
    ? app.imports
    : [...app.imports, { alias: triggerAlias, ref: triggerImportRef }];

  const triggers = [...app.triggers];
  if (existingBinding) {
    const currentTrigger = triggers[existingBinding.triggerIndex];
    if (currentTrigger.handlers.length <= 1) {
      triggers[existingBinding.triggerIndex] = trigger;
    } else {
      const nextHandlers = [...currentTrigger.handlers];
      nextHandlers[existingBinding.handlerIndex] = trigger.handlers[0];
      triggers[existingBinding.triggerIndex] = {
        ...currentTrigger,
        ref: trigger.ref,
        settings: trigger.settings,
        handlers: nextHandlers
      };
    }
  } else {
    triggers.push(trigger);
  }

  return FlogoAppSchema.parse({
    ...app,
    imports,
    triggers
  });
}

function findExistingBinding(
  app: FlogoApp,
  flowRef: string,
  profile: TriggerBindingRequest["profile"],
  triggerImportRef: string
) {
  for (const [triggerIndex, trigger] of app.triggers.entries()) {
    if (!matchesTriggerKind(app, trigger, triggerImportRef)) {
      continue;
    }
    for (const [handlerIndex, handler] of trigger.handlers.entries()) {
      if (resolveHandlerFlowRef(handler) !== flowRef) {
        continue;
      }
      if (matchesTriggerProfile(trigger, handler, profile)) {
        return {
          trigger,
          triggerIndex,
          handlerIndex
        };
      }
    }
  }

  return undefined;
}

function matchesTriggerKind(app: FlogoApp, trigger: FlogoApp["triggers"][number], triggerImportRef: string) {
  const resolvedRef = trigger.ref.startsWith("#")
    ? app.imports.find((entry) => entry.alias === normalizeAlias(trigger.ref))?.ref ?? trigger.ref
    : trigger.ref;
  return resolvedRef === triggerImportRef || trigger.ref === `#${inferAliasFromRef(triggerImportRef)}`;
}

function matchesTriggerProfile(
  trigger: FlogoApp["triggers"][number],
  handler: FlogoApp["triggers"][number]["handlers"][number],
  profile: TriggerBindingRequest["profile"]
) {
  switch (profile.kind) {
    case "rest":
      return (
        Number(trigger.settings.port) === profile.port &&
        String(handler.settings.method ?? "").toUpperCase() === profile.method &&
        String(handler.settings.path ?? "") === profile.path
      );
    case "timer":
      return (
        String(handler.settings.startDelay ?? "") === String(profile.startDelay ?? "") &&
        String(handler.settings.repeatInterval ?? "") === String(profile.repeatInterval ?? "")
      );
    case "cli":
      return String(handler.settings.command ?? "") === profile.commandName;
    case "channel":
      return String(handler.settings.channel ?? "") === profile.channel;
  }
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "flow";
}

export function runMappingTest(
  document: string | FlogoApp | unknown,
  nodeId: string,
  sampleInput: MappingPreviewContext = createEmptyMappingContext(),
  expectedOutput: Record<string, unknown> = {},
  strict = true
): MappingTestResult {
  const preview = previewMapping(document, nodeId, sampleInput);
  const actualOutput = preview.resolvedValues;
  const differences = diffResolvedValues(expectedOutput, actualOutput);
  const diagnostics = [...preview.diagnostics];

  if (strict) {
    for (const pathKey of Object.keys(actualOutput)) {
      if (!(pathKey in expectedOutput)) {
        differences.push({
          path: pathKey,
          expected: undefined,
          actual: actualOutput[pathKey],
          message: `Resolved value for "${pathKey}" was not expected`
        });
      }
    }
  }

  const pass =
    differences.length === 0 &&
    diagnostics.every((diagnostic) => diagnostic.severity !== "error");

  return MappingTestResultSchema.parse({
    pass,
    nodeId,
    actualOutput,
    differences,
    diagnostics
  });
}

export function defineProperties(
  document: string | FlogoApp | unknown,
  properties: FlogoApp["properties"]
): FlogoApp {
  const app = parseFlogoAppDocument(document);
  const merged = new Map(app.properties.map((property) => [property.name, property]));
  for (const property of properties) {
    merged.set(property.name, property);
  }

  return FlogoAppSchema.parse({
    ...app,
    properties: Array.from(merged.values())
  });
}

export function summarizeAppDiff(beforeDocument: string | FlogoApp | unknown, afterDocument: string | FlogoApp | unknown): string {
  const beforeGraph = buildAppGraph(beforeDocument);
  const afterGraph = buildAppGraph(afterDocument);
  const importDelta = afterGraph.app.imports.length - beforeGraph.app.imports.length;
  const triggerDelta = afterGraph.app.triggers.length - beforeGraph.app.triggers.length;
  const resourceDelta = afterGraph.app.resources.length - beforeGraph.app.resources.length;
  const propertyDelta = afterGraph.app.properties.length - beforeGraph.app.properties.length;

  return [
    `imports ${importDelta >= 0 ? "+" : ""}${importDelta}`,
    `triggers ${triggerDelta >= 0 ? "+" : ""}${triggerDelta}`,
    `resources ${resourceDelta >= 0 ? "+" : ""}${resourceDelta}`,
    `properties ${propertyDelta >= 0 ? "+" : ""}${propertyDelta}`
  ].join(", ");
}

export function validateGovernance(document: string | FlogoApp | unknown, options?: ContribLookupOptions): GovernanceReport {
  const app = parseFlogoAppDocument(document);
  const inventory = buildContributionInventory(app, options);
  const aliasIssues: Array<{
    kind: "duplicate_alias" | "missing_import" | "implicit_alias_use" | "alias_ref_mismatch";
    alias: string;
    ref?: string;
    path: string;
    message: string;
    severity: Diagnostic["severity"];
  }> = [];
  const orphanedRefs: Array<{
    ref: string;
    kind: "trigger" | "activity" | "action" | "flow";
    path: string;
    reason: string;
    severity: Diagnostic["severity"];
  }> = [];
  const versionFindings: Array<{
    alias: string;
    ref: string;
    declaredVersion?: string;
    status: "missing" | "conflict" | "duplicate_alias" | "ok";
    message: string;
    severity: Diagnostic["severity"];
  }> = [];

  const importsByAlias = new Map<string, FlogoApp["imports"]>();
  const refToAliases = new Map<string, Set<string>>();
  const usedImportAliases = new Set<string>();
  const resourceIds = new Set(app.resources.map((resource) => resource.id));
  const inventoryByAlias = new Map(
    inventory.entries
      .filter((entry) => entry.alias)
      .map((entry) => [entry.alias as string, entry] as const)
  );
  const unresolvedPackages = inventory.entries
    .filter((entry) => entry.source === "inferred")
    .map((entry) => entry.ref)
    .sort();
  const fallbackContribs = inventory.entries
    .filter((entry) => entry.source === "registry" || entry.source === "inferred")
    .map((entry) => entry.ref)
    .sort();
  const weakEvidenceContribs = inventory.entries
    .filter((entry) => entry.confidence === "low" || entry.source === "registry")
    .map((entry) => entry.ref)
    .sort();
  const packageBackedContribs = inventory.entries
    .filter((entry) => entry.source === "package_descriptor" || entry.source === "package_source")
    .map((entry) => entry.ref)
    .sort();
  const descriptorOnlyContribs = inventory.entries
    .filter((entry) => entry.source === "app_descriptor" || entry.source === "workspace_descriptor")
    .map((entry) => entry.ref)
    .sort();
  const weakSignatureContribs = inventory.entries
    .filter((entry) => entry.signatureCompleteness !== "complete")
    .map((entry) => entry.ref)
    .sort();
  const duplicateAliases = Array.from(importsByAlias.entries())
    .filter(([, entries]) => entries.length > 1)
    .map(([alias]) => alias)
    .sort();
  const conflictingVersions: string[] = [];

  for (const entry of app.imports) {
    const current = importsByAlias.get(entry.alias) ?? [];
    current.push(entry);
    importsByAlias.set(entry.alias, current);
    const aliases = refToAliases.get(entry.ref) ?? new Set<string>();
    aliases.add(entry.alias);
    refToAliases.set(entry.ref, aliases);

    if (!entry.version) {
      versionFindings.push({
        alias: entry.alias,
        ref: entry.ref,
        declaredVersion: entry.version,
        status: "missing",
        message: `Import alias "${entry.alias}" does not declare a version`,
        severity: "info"
      });
    }

    const inventoryEntry = inventoryByAlias.get(entry.alias);
    const inventoryVersion = inventoryEntry?.version ?? inventoryEntry?.descriptor?.version;
    if (inventoryEntry?.source === "inferred") {
      orphanedRefs.push({
        ref: entry.ref,
        kind: inferContribType(entry.ref),
        path: `imports.${entry.alias}`,
        reason: `Import alias "${entry.alias}" could not be resolved from workspace or package metadata`,
        severity: "error"
      });
    }
    if (inventoryEntry?.source === "registry") {
      versionFindings.push({
        alias: entry.alias,
        ref: entry.ref,
        declaredVersion: entry.version,
        status: "ok",
        message: `Import alias "${entry.alias}" is using registry fallback metadata`,
        severity: "warning"
      });
    }
    if (entry.version && inventoryVersion && entry.version !== inventoryVersion) {
      versionFindings.push({
        alias: entry.alias,
        ref: entry.ref,
        declaredVersion: entry.version,
        status: "conflict",
        message: `Import alias "${entry.alias}" declares version "${entry.version}" but resolved metadata reports "${inventoryVersion}"`,
        severity: "warning"
      });
    }
  }

  for (const [alias, entries] of importsByAlias) {
    if (entries.length > 1) {
      aliasIssues.push({
        kind: "duplicate_alias",
        alias,
        ref: entries[0]?.ref,
        path: `imports.${alias}`,
        message: `Import alias "${alias}" is defined ${entries.length} times`,
        severity: "error"
      });
      versionFindings.push({
        alias,
        ref: entries[0]?.ref ?? "",
        declaredVersion: entries[0]?.version,
        status: "duplicate_alias",
        message: `Import alias "${alias}" is defined multiple times`,
        severity: "warning"
      });
    }

    const uniqueRefs = new Set(entries.map((entry) => entry.ref));
    if (uniqueRefs.size > 1) {
      aliasIssues.push({
        kind: "alias_ref_mismatch",
        alias,
        ref: entries.map((entry) => entry.ref).join(", "),
        path: `imports.${alias}`,
        message: `Import alias "${alias}" points to multiple refs`,
        severity: "warning"
      });
      versionFindings.push({
        alias,
        ref: entries[0]?.ref ?? "",
        declaredVersion: entries[0]?.version,
        status: "conflict",
        message: `Import alias "${alias}" is associated with multiple refs`,
        severity: "warning"
      });
    }

    const uniqueVersions = new Set(entries.map((entry) => entry.version).filter((value): value is string => Boolean(value)));
    if (uniqueVersions.size > 1) {
      conflictingVersions.push(alias);
      versionFindings.push({
        alias,
        ref: entries[0]?.ref ?? "",
        declaredVersion: entries[0]?.version,
        status: "conflict",
        message: `Import alias "${alias}" declares conflicting versions`,
        severity: "warning"
      });
    }
  }

  for (const [ref, aliases] of refToAliases) {
    if (aliases.size > 1) {
      versionFindings.push({
        alias: Array.from(aliases).sort().join(", "),
        ref,
        status: "conflict",
        message: `Contrib ref "${ref}" is imported under multiple aliases`,
        severity: "warning"
      });
    }
  }

  const trackRefUsage = (
    ref: string,
    path: string,
    kind: "trigger" | "activity" | "action" | "flow",
    implicitOnMissing = false
  ) => {
    if (ref.startsWith("#flow:")) {
      const flowId = ref.replace("#flow:", "");
      if (!resourceIds.has(flowId)) {
        orphanedRefs.push({
          ref,
          kind: "flow",
          path,
          reason: `Flow resource "${flowId}" does not exist`,
          severity: "error"
        });
      }
      return;
    }

    if (ref.startsWith("#")) {
      const alias = inferAliasFromRef(ref);
      if (!alias || alias === "flow") {
        return;
      }

      if (importsByAlias.has(alias)) {
        usedImportAliases.add(alias);
        return;
      }

      aliasIssues.push({
        kind: implicitOnMissing ? "implicit_alias_use" : "missing_import",
        alias,
        ref,
        path,
        message: implicitOnMissing
          ? `Reference "${ref}" uses alias "${alias}" without a declared import`
          : `Reference "${ref}" cannot be resolved because alias "${alias}" is not imported`,
        severity: implicitOnMissing ? "warning" : "error"
      });
      orphanedRefs.push({
        ref,
        kind,
        path,
        reason: `Alias "${alias}" is not imported`,
        severity: implicitOnMissing ? "warning" : "error"
      });
      return;
    }

    if (ref.includes("/")) {
      const importMatch = app.imports.find((entry) => entry.ref === ref);
      if (importMatch) {
        usedImportAliases.add(importMatch.alias);
      }
    }
  };

  for (const trigger of app.triggers) {
    trackRefUsage(trigger.ref, `triggers.${trigger.id}.ref`, "trigger", true);
    for (const [index, handler] of trigger.handlers.entries()) {
      const resolvedFlowRef = resolveHandlerFlowRef(handler);
      if (resolvedFlowRef && resolvedFlowRef.startsWith("#flow:")) {
        trackRefUsage(resolvedFlowRef, `triggers.${trigger.id}.handlers.${index}.action`, "flow");
      } else {
        trackRefUsage(handler.action.ref, `triggers.${trigger.id}.handlers.${index}.action`, "action");
      }
    }
  }

  for (const resource of app.resources) {
    for (const task of resource.data.tasks) {
      if (task.activityRef) {
        trackRefUsage(task.activityRef, `resources.${resource.id}.tasks.${task.id}.activityRef`, "activity");
      } else {
        orphanedRefs.push({
          ref: task.id,
          kind: "activity",
          path: `resources.${resource.id}.tasks.${task.id}`,
          reason: "Task is missing an activity ref",
          severity: "warning"
        });
      }
    }
  }

  for (const entry of app.imports) {
    if (!usedImportAliases.has(entry.alias)) {
      orphanedRefs.push({
        ref: entry.ref,
        kind: inferContribType(entry.ref),
        path: `imports.${entry.alias}`,
        reason: `Import alias "${entry.alias}" is declared but not used by triggers or tasks`,
        severity: "info"
      });
    }
  }

  const diagnostics = dedupeDiagnostics([
    ...aliasIssues.map((issue) =>
      createDiagnostic(`flogo.governance.${issue.kind}`, issue.message, issue.severity, issue.path, {
        alias: issue.alias,
        ref: issue.ref
      })
    ),
    ...orphanedRefs.map((entry) =>
      createDiagnostic("flogo.governance.orphaned_ref", entry.reason, entry.severity, entry.path, {
        ref: entry.ref,
        kind: entry.kind
      })
    ),
    ...versionFindings.map((finding) =>
      createDiagnostic(`flogo.governance.version.${finding.status}`, finding.message, finding.severity, `imports.${finding.alias}`, {
        ref: finding.ref,
        declaredVersion: finding.declaredVersion
      })
    ),
    ...inventory.diagnostics
  ]);

  return GovernanceReportSchema.parse({
    appName: app.name,
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    aliasIssues,
    orphanedRefs,
    versionFindings,
    unusedImports: app.imports.filter((entry) => !usedImportAliases.has(entry.alias)).map((entry) => entry.alias).sort(),
    missingImports: aliasIssues.filter((issue) => issue.kind === "missing_import").map((issue) => issue.alias).sort(),
    aliasRefMismatches: aliasIssues.filter((issue) => issue.kind === "alias_ref_mismatch").map((issue) => issue.alias).sort(),
    inventorySummary: {
      entryCount: inventory.entries.length,
      packageBackedCount: inventory.entries.filter((entry) => isPackageBackedSource(entry.source)).length,
      fallbackCount: inventory.entries.filter((entry) => entry.source === "registry" || entry.source === "inferred").length
    },
    unresolvedPackages,
    fallbackContribs,
    weakEvidenceContribs,
    weakSignatureContribs,
    packageBackedContribs,
    descriptorOnlyContribs,
    duplicateAliases,
    conflictingVersions: conflictingVersions.sort(),
    diagnostics
  });
}

export function compareJsonVsProgrammatic(
  document: string | FlogoApp | unknown,
  requestInput?: CompositionCompareRequest | unknown
): CompositionCompareResult {
  const app = parseFlogoAppDocument(document);
  const request = CompositionCompareRequestSchema.parse(requestInput ?? {});
  const inventory = buildContributionInventory(app);
  const diagnostics: Diagnostic[] = [];

  const canonicalProjection = buildCanonicalProjection(app, request);
  const programmaticProjection = buildProgrammaticProjection(app, request, diagnostics, inventory);
  const differences = diffComposition("app", canonicalProjection, programmaticProjection);
  const canonicalHash = createHash("sha256").update(stableStringify(canonicalProjection)).digest("hex");
  const programmaticHash = createHash("sha256").update(stableStringify(programmaticProjection)).digest("hex");
  const inventoryRefsUsed = inventory.entries
    .filter((entry) => entry.type !== "action" || entry.source !== "flow_resource")
    .map((entry) => entry.descriptor?.evidence?.resolvedRef ?? entry.ref)
    .sort();
  const comparisonBasis =
    inventory.entries.some((entry) => isPackageBackedSource(entry.source)) || inventory.entries.some((entry) => entry.source === "registry")
      ? "inventory_backed"
      : "normalized_only";

  return CompositionCompareResultSchema.parse({
    appName: app.name,
    ok:
      diagnostics.every((diagnostic) => diagnostic.severity !== "error") &&
      differences.every((difference) => difference.severity !== "error"),
    canonicalHash,
    programmaticHash,
    comparisonBasis,
    signatureEvidenceLevel: summarizeSignatureEvidenceLevel(inventory.entries),
    signatureCoverage: summarizeSignatureCoverage(inventory.entries),
    comparisonLimitations: buildCompositionLimitations(inventory.entries, diagnostics, request),
    inventoryRefsUsed,
    differences,
    diagnostics
  });
}

function inferFlowContractForApp(app: FlogoApp, flow: FlogoFlow, sharedDiagnostics: Diagnostic[]): FlowContract {
  const diagnostics: Diagnostic[] = [];
  const inputParams = new Map<string, FlowContract["inputs"][number]>();
  const outputParams = new Map<string, FlowContract["outputs"][number]>();
  const metadataInputs = normalizeFlowMetadataParams(flow.data.metadata?.input ?? [], "metadata");
  const metadataOutputs = normalizeFlowMetadataParams(flow.data.metadata?.output ?? [], "metadata");

  for (const param of metadataInputs) {
    inputParams.set(param.name, param);
  }
  for (const param of metadataOutputs) {
    outputParams.set(param.name, param);
  }

  if (metadataInputs.length === 0 && metadataOutputs.length === 0) {
    diagnostics.push(
      createDiagnostic(
        "flogo.flow_contract.missing_metadata",
        `Flow "${flow.id}" does not declare explicit input/output metadata.`,
        "warning",
        `resources.${flow.id}.data.metadata`
      )
    );
  }

  const usage = buildFlowUsage(app, flow);
  diagnostics.push(...usage.diagnostics);
  sharedDiagnostics.push(...usage.diagnostics);

  for (const param of usage.inferredInputs) {
    mergeFlowParam(inputParams, param);
  }
  for (const param of usage.inferredOutputs) {
    mergeFlowParam(outputParams, param);
  }

  const inputs = Array.from(inputParams.values()).sort((left, right) => left.name.localeCompare(right.name));
  const outputs = Array.from(outputParams.values()).sort((left, right) => left.name.localeCompare(right.name));
  const evidenceLevel: FlowContract["evidenceLevel"] = usage.usesMappings
    ? "metadata_plus_mapping"
    : usage.usedByCount > 0
      ? "metadata_plus_usage"
      : "metadata_only";
  const reusable = usage.usedByCount > 1 || inputs.length > 0 || outputs.length > 0;

  return FlowContractSchema.parse({
    flowId: flow.id,
    name: flow.data.name ?? flow.id,
    resourceRef: `#flow:${flow.id}`,
    inputs,
    outputs,
    reusable,
    usage: {
      flowId: flow.id,
      handlerRefs: usage.handlerRefs,
      triggerRefs: usage.triggerRefs,
      actionRefs: usage.actionRefs,
      usedByCount: usage.usedByCount
    },
    diagnostics: dedupeDiagnostics(diagnostics),
    evidenceLevel
  });
}

function buildFlowUsage(app: FlogoApp, flow: FlogoFlow) {
  const flowRef = `#flow:${flow.id}`;
  const handlerRefs: string[] = [];
  const triggerRefs = new Set<string>();
  const actionRefs = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const inferredInputs = new Map<string, FlowContract["inputs"][number]>();
  const inferredOutputs = new Map<string, FlowContract["outputs"][number]>();
  let flowTaskUseCount = 0;
  let usesMappings = false;

  for (const trigger of app.triggers) {
    trigger.handlers.forEach((handler, index) => {
      if (resolveHandlerFlowRef(handler) !== flowRef) {
        return;
      }

      const handlerPath = `triggers.${trigger.id}.handlers.${index}`;
      handlerRefs.push(handlerPath);
      triggerRefs.add(trigger.id);
      actionRefs.add(handler.action.ref);

      for (const [key, value] of Object.entries(handler.input ?? {})) {
        if (!inferredInputs.has(key)) {
          inferredInputs.set(key, createFlowParam(key, inferFlowParamType(value), "mapping_inferred"));
          diagnostics.push(
            createDiagnostic(
              "flogo.flow_contract.inferred_input",
              `Inferred flow input "${key}" for "${flow.id}" from handler input mappings.`,
              "info",
              `${handlerPath}.input.${key}`
            )
          );
        }
      }

      const outputRefs = collectFlowResolverNames(handler.output ?? {});
      for (const name of outputRefs) {
        usesMappings = true;
        if (!inferredOutputs.has(name)) {
          inferredOutputs.set(name, createFlowParam(name, "unknown", "mapping_inferred"));
          diagnostics.push(
            createDiagnostic(
              "flogo.flow_contract.inferred_output",
              `Inferred flow output "${name}" for "${flow.id}" from handler output mappings.`,
              "info",
              `${handlerPath}.output`
            )
          );
        }
      }
    });
  }

  for (const resource of app.resources) {
    for (const task of resource.data.tasks) {
      if (normalizeFlowActionRef(task.activityRef) === flowRef) {
        actionRefs.add(task.activityRef ?? flowRef);
        flowTaskUseCount += 1;
      }

      const flowRefs = collectFlowResolverNames(task.input);
      flowRefs.push(...collectFlowResolverNames(task.settings));
      flowRefs.push(...collectFlowResolverNames(task.output));
      for (const name of flowRefs) {
        if (!name) {
          continue;
        }
        usesMappings = true;
        if (!inferredInputs.has(name)) {
          inferredInputs.set(name, createFlowParam(name, "unknown", "mapping_inferred"));
          diagnostics.push(
            createDiagnostic(
              "flogo.flow_contract.inferred_input",
              `Inferred flow input "${name}" for "${flow.id}" from task mapping usage.`,
              "info",
              `resources.${resource.id}.tasks.${task.id}`
            )
          );
        }
      }
    }
  }

  const usedByCount = handlerRefs.length + flowTaskUseCount;
  if (usedByCount === 0) {
    diagnostics.push(
      createDiagnostic(
        "flogo.flow_contract.no_usage",
        `Flow "${flow.id}" has no trigger or flow-call usage in the current app graph.`,
        "info",
        `resources.${flow.id}`
      )
    );
  }

  return {
    handlerRefs: handlerRefs.sort(),
    triggerRefs: Array.from(triggerRefs).sort(),
    actionRefs: Array.from(actionRefs).sort(),
    inferredInputs: Array.from(inferredInputs.values()),
    inferredOutputs: Array.from(inferredOutputs.values()),
    usedByCount,
    usesMappings,
    diagnostics
  };
}

function normalizeFlowMetadataParams(
  fields: Array<Record<string, unknown>>,
  source: FlowContract["inputs"][number]["source"]
) {
  return fields
    .map((field, index) => {
      const name = typeof field.name === "string" ? field.name : `${source}_${index}`;
      return createFlowParam(name, normalizeFlowParamType(field.type), source, {
        required: Boolean(field.required),
        description: typeof field.description === "string" ? field.description : undefined
      });
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function createFlowParam(
  name: string,
  type: FlowContract["inputs"][number]["type"],
  source: FlowContract["inputs"][number]["source"],
  options?: {
    required?: boolean;
    description?: string;
  }
) {
  return {
    name,
    type,
    required: options?.required ?? false,
    source,
    description: options?.description
  };
}

function normalizeFlowParamType(value: unknown): FlowContract["inputs"][number]["type"] {
  if (typeof value !== "string") {
    return "unknown";
  }

  switch (value.toLowerCase()) {
    case "string":
      return "string";
    case "integer":
    case "int":
    case "long":
    case "float":
    case "double":
    case "number":
      return "number";
    case "bool":
    case "boolean":
      return "boolean";
    case "array":
      return "array";
    case "object":
    case "json":
    case "map":
      return "object";
    case "any":
      return "any";
    default:
      return "unknown";
  }
}

function inferFlowParamType(value: unknown): FlowContract["inputs"][number]["type"] {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value !== null && typeof value === "object") {
    return "object";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "string") {
    return classifyMappingValue(value) === "literal" ? "string" : "unknown";
  }
  return "unknown";
}

function mergeFlowParam(
  target: Map<string, FlowContract["inputs"][number]>,
  incoming: FlowContract["inputs"][number]
) {
  const existing = target.get(incoming.name);
  if (!existing) {
    target.set(incoming.name, incoming);
    return;
  }

  target.set(incoming.name, {
    ...existing,
    type: selectPreferredFlowParamType(existing.type, incoming.type),
    required: existing.required || incoming.required,
    source: selectPreferredFlowParamSource(existing.source, incoming.source),
    description: existing.description ?? incoming.description
  });
}

function selectPreferredFlowParamType(
  left: FlowContract["inputs"][number]["type"],
  right: FlowContract["inputs"][number]["type"]
) {
  const rank: Record<FlowContract["inputs"][number]["type"], number> = {
    unknown: 0,
    any: 1,
    string: 2,
    number: 2,
    boolean: 2,
    object: 2,
    array: 2
  };
  return rank[right] > rank[left] ? right : left;
}

function selectPreferredFlowParamSource(
  left: FlowContract["inputs"][number]["source"],
  right: FlowContract["inputs"][number]["source"]
) {
  const rank: Record<FlowContract["inputs"][number]["source"], number> = {
    unknown: 0,
    activity_inferred: 1,
    mapping_inferred: 2,
    metadata: 3
  };
  return rank[right] > rank[left] ? right : left;
}

function collectFlowResolverNames(value: unknown) {
  const names = new Set<string>();
  collectResolverReferencesFromValue(value, names);
  return Array.from(names).sort();
}

function collectResolverReferencesFromValue(value: unknown, names: Set<string>) {
  if (typeof value === "string") {
    for (const reference of collectResolverReferences(value)) {
      if (reference === "$flow") {
        continue;
      }
      if (reference.startsWith("$flow.")) {
        names.add(reference.replace("$flow.", ""));
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry) => collectResolverReferencesFromValue(entry, names));
    return;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((entry) => collectResolverReferencesFromValue(entry, names));
  }
}

function normalizeFlowActionRef(ref?: string, flowUri?: unknown) {
  if (typeof flowUri === "string" && /^res:\/\/flow:/.test(flowUri)) {
    return `#flow:${flowUri.replace(/^res:\/\/flow:/, "")}`;
  }
  if (!ref) {
    return undefined;
  }
  if (ref === "#flow" || ref.endsWith("/flow")) {
    return typeof flowUri === "string" && /^res:\/\/flow:/.test(flowUri)
      ? `#flow:${flowUri.replace(/^res:\/\/flow:/, "")}`
      : "#flow";
  }
  return ref.startsWith("flow:") ? `#${ref}` : ref;
}

function resolveHandlerFlowRef(handler: FlogoApp["triggers"][number]["handlers"][number]) {
  const actionSettings = handler.action.settings as Record<string, unknown> | undefined;
  return normalizeFlowActionRef(handler.action.ref, actionSettings?.flowURI);
}

function toFlowAction(flowId: string) {
  return {
    ref: "#flow",
    settings: {
      flowURI: `res://flow:${flowId}`
    }
  };
}

function buildDescriptorFromRef(ref: string, alias?: string, version?: string, forcedType?: ContribDescriptor["type"]): ContribDescriptor {
  const normalizedAlias = alias ?? inferAliasFromRef(ref);
  const registryKey = normalizedAlias ? normalizeAlias(normalizedAlias) : undefined;
  const registryMatch = registryKey ? knownDescriptorRegistry.get(registryKey) : undefined;
  const inferredType = forcedType ?? inferContribType(ref);
  const name = normalizedAlias ?? inferNameFromRef(ref);

  return ContribDescriptorSchema.parse({
    ref,
    alias: normalizedAlias,
    type: registryMatch?.type ?? inferredType,
    name,
    version,
    title: registryMatch?.title ?? name,
    settings: registryMatch?.settings ?? [],
    inputs: registryMatch?.inputs ?? [],
    outputs: registryMatch?.outputs ?? [],
    examples: registryMatch?.examples ?? [],
    compatibilityNotes: registryMatch?.compatibilityNotes ?? [],
    source: registryMatch?.source ?? "inferred",
    evidence: createDescriptorEvidence(
      registryMatch ? "registry" : "inferred",
      ref,
      normalizedAlias,
      version,
      undefined,
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      Boolean(registryMatch),
      Boolean(registryMatch),
      version ? "import" : "unknown",
      inferSignatureCompleteness(registryMatch?.settings ?? [], registryMatch?.inputs ?? [], registryMatch?.outputs ?? [])
    )
  });
}

function buildFlowInventoryEntry(resource: FlogoFlow): ContributionInventoryEntry {
  const descriptor = ContribDescriptorSchema.parse({
    ref: `#flow:${resource.id}`,
    alias: "flow",
    type: "action",
    name: resource.data.name ?? resource.id,
    title: resource.data.name ?? resource.id,
    settings: [],
    inputs: (resource.data.metadata?.input ?? []).map((item, index) => ({
      name: typeof item.name === "string" ? item.name : `input_${index}`,
      type: typeof item.type === "string" ? item.type : undefined,
      required: Boolean(item.required)
    })),
    outputs: (resource.data.metadata?.output ?? []).map((item, index) => ({
      name: typeof item.name === "string" ? item.name : `output_${index}`,
      type: typeof item.type === "string" ? item.type : undefined,
      required: Boolean(item.required)
    })),
    examples: [`Invoke reusable flow ${resource.id}`],
    compatibilityNotes: ["Flow resources behave like reusable actions"],
    source: "flow-resource",
    evidence: createDescriptorEvidence(
      "flow_resource",
      `#flow:${resource.id}`,
      "flow",
      undefined,
      undefined,
      [],
      undefined,
      undefined,
      undefined,
      "high",
      false,
      true,
      "unknown",
      inferSignatureCompleteness(
        [],
        (resource.data.metadata?.input ?? []).map((item, index) => ({
          name: typeof item.name === "string" ? item.name : `input_${index}`,
          type: typeof item.type === "string" ? item.type : undefined,
          required: Boolean(item.required)
        })),
        (resource.data.metadata?.output ?? []).map((item, index) => ({
          name: typeof item.name === "string" ? item.name : `output_${index}`,
          type: typeof item.type === "string" ? item.type : undefined,
          required: Boolean(item.required)
        }))
      )
    )
  });

  return ContributionInventoryEntrySchema.parse({
    ref: descriptor.ref,
    alias: descriptor.alias,
    type: descriptor.type,
    name: descriptor.name,
    version: descriptor.version,
    title: descriptor.title,
    source: "flow_resource",
    confidence: "high",
    discoveryReason: describeDiscoveryReason("flow_resource", descriptor.ref),
    packageDescriptorFound: false,
    packageMetadataFound: true,
    versionSource: "unknown",
    signatureCompleteness: inferSignatureCompleteness(descriptor.settings, descriptor.inputs, descriptor.outputs),
    settings: descriptor.settings,
    inputs: descriptor.inputs,
    outputs: descriptor.outputs,
    diagnostics: [],
    descriptor
  });
}

function inventoryEntryToDescriptor(entry: ContributionInventoryEntry): ContribDescriptor {
  if (entry.descriptor) {
    return ContribDescriptorSchema.parse(entry.descriptor);
  }

  return ContribDescriptorSchema.parse({
    ref: entry.ref,
    alias: entry.alias,
    type: entry.type,
    name: entry.name,
    version: entry.version,
    title: entry.title,
    settings: entry.settings,
    inputs: entry.inputs,
    outputs: entry.outputs,
    source: entry.source,
    evidence: createDescriptorEvidence(
      entry.source,
      entry.ref,
      entry.alias,
      entry.version,
      entry.descriptorPath,
      entry.diagnostics,
      entry.packageRoot,
      entry.modulePath,
      entry.goPackagePath,
      entry.confidence,
      entry.packageDescriptorFound,
      entry.packageMetadataFound,
      entry.versionSource,
      entry.signatureCompleteness
    )
  });
}

function compareEvidenceStrength(
  left: ContributionInventoryEntry["source"] | ContribResolutionEvidence["source"],
  right: ContributionInventoryEntry["source"] | ContribResolutionEvidence["source"]
) {
  const rank: Record<ContributionInventoryEntry["source"], number> = {
    flow_resource: 100,
    app_descriptor: 90,
    workspace_descriptor: 80,
    package_descriptor: 70,
    package_source: 60,
    descriptor: 50,
    registry: 40,
    inferred: 30
  };
  return rank[left] - rank[right];
}

function isPackageBackedSource(source: ContributionInventoryEntry["source"] | ContribResolutionEvidence["source"]) {
  return source === "app_descriptor" || source === "workspace_descriptor" || source === "package_descriptor" || source === "package_source" || source === "descriptor";
}

function deriveEvidenceConfidence(
  source: ContributionInventoryEntry["source"] | ContribResolutionEvidence["source"]
): ContribResolutionEvidence["confidence"] {
  if (source === "registry") {
    return "medium";
  }

  if (source === "inferred") {
    return "low";
  }

  return "high";
}

function describeDiscoveryReason(
  source: ContributionInventoryEntry["source"] | ContribResolutionEvidence["source"],
  resolvedRef: string,
  descriptorPath?: string,
  packageRoot?: string
) {
  switch (source) {
    case "app_descriptor":
      return `Resolved ${resolvedRef} from an app-local descriptor${descriptorPath ? ` at ${descriptorPath}` : ""}.`;
    case "workspace_descriptor":
      return `Resolved ${resolvedRef} from a workspace descriptor${descriptorPath ? ` at ${descriptorPath}` : ""}.`;
    case "package_descriptor":
      return `Resolved ${resolvedRef} from a package descriptor${descriptorPath ? ` at ${descriptorPath}` : ""}.`;
    case "package_source":
      return `Resolved ${resolvedRef} from discovered Go package files${packageRoot ? ` under ${packageRoot}` : ""}.`;
    case "registry":
      return `Resolved ${resolvedRef} from built-in registry metadata because stronger package evidence was not found.`;
    case "inferred":
      return `Resolved ${resolvedRef} from inferred metadata because no descriptor or package evidence was found.`;
    case "flow_resource":
      return `Resolved ${resolvedRef} from a local flow resource definition.`;
    case "descriptor":
      return `Resolved ${resolvedRef} from descriptor metadata.`;
    default:
      return `Resolved ${resolvedRef} using ${source} evidence.`;
  }
}

function summarizeSignatureEvidenceLevel(
  entries: ContributionInventory["entries"]
): CompositionCompareResult["signatureEvidenceLevel"] {
  if (entries.some((entry) => entry.source === "package_descriptor" || entry.source === "package_source")) {
    return "package_backed";
  }

  if (entries.some((entry) => entry.source === "app_descriptor" || entry.source === "workspace_descriptor")) {
    return "descriptor_backed";
  }

  return "fallback_only";
}

function resolveInventoryEntry(
  app: FlogoApp,
  ref: string,
  alias?: string,
  version?: string,
  forcedType?: ContribDescriptor["type"],
  options?: ContribLookupOptions
): ResolvedInventoryEntry {
  const resolved = resolveDescriptor(app, ref, alias, version, forcedType, options);
  const descriptor = resolved.descriptor;
  return {
    entry: ContributionInventoryEntrySchema.parse({
      ref: descriptor.evidence?.resolvedRef ?? descriptor.ref,
      alias: descriptor.alias,
      type: descriptor.type,
      name: descriptor.name,
      version: descriptor.version,
      title: descriptor.title,
      source: descriptor.evidence?.source ?? (descriptor.source as ContributionInventoryEntry["source"] | undefined) ?? "inferred",
      descriptorPath: descriptor.evidence?.descriptorPath,
      packageRoot: descriptor.evidence?.packageRoot,
      modulePath: descriptor.evidence?.modulePath,
      goPackagePath: descriptor.evidence?.goPackagePath,
      confidence: descriptor.evidence?.confidence ?? deriveEvidenceConfidence(descriptor.evidence?.source ?? "inferred"),
      discoveryReason: describeDiscoveryReason(
        descriptor.evidence?.source ?? "inferred",
        descriptor.evidence?.resolvedRef ?? descriptor.ref,
        descriptor.evidence?.descriptorPath,
        descriptor.evidence?.packageRoot
      ),
      packageDescriptorFound: descriptor.evidence?.packageDescriptorFound ?? false,
      packageMetadataFound: descriptor.evidence?.packageMetadataFound ?? false,
      versionSource: descriptor.evidence?.versionSource,
      signatureCompleteness: descriptor.evidence?.signatureCompleteness ?? inferSignatureCompleteness(
        descriptor.settings,
        descriptor.inputs,
        descriptor.outputs
      ),
      settings: descriptor.settings,
      inputs: descriptor.inputs,
      outputs: descriptor.outputs,
      diagnostics: dedupeDiagnostics([...(descriptor.evidence?.diagnostics ?? []), ...resolved.diagnostics]),
      descriptor
    }),
    diagnostics: resolved.diagnostics
  };
}

function resolveDescriptor(
  app: FlogoApp,
  ref: string,
  alias?: string,
  version?: string,
  forcedType?: ContribDescriptor["type"],
  options?: ContribLookupOptions
): ResolvedDescriptor {
  const resolvedRef = resolveImportRef(app, ref, alias);
  const normalizedAlias = alias ?? inferAliasFromRef(ref) ?? inferAliasFromRef(resolvedRef);
  const descriptorLocation = findDescriptorLocation(resolvedRef, options);

  if (descriptorLocation && "descriptorPath" in descriptorLocation) {
    const descriptorModuleInfo =
      descriptorLocation.packageRoot && !descriptorLocation.modulePath
        ? findNearestGoModule(descriptorLocation.packageRoot)
        : undefined;
    return {
      descriptor: parseDescriptorFile(
        descriptorLocation.descriptorPath,
        resolvedRef,
        normalizedAlias,
        version,
        forcedType,
        descriptorLocation.source,
        descriptorLocation.packageRoot,
        descriptorLocation.modulePath ?? descriptorModuleInfo?.modulePath,
        descriptorLocation.goPackagePath ?? deriveGoPackagePath(descriptorLocation.packageRoot ?? "", descriptorModuleInfo),
        descriptorLocation.packageVersion
      ),
      diagnostics: []
    };
  }

  if (descriptorLocation?.packageRoot) {
    const discoveredVersion = version ?? descriptorLocation.packageVersion;
    const descriptor = buildDescriptorFromRef(resolvedRef, normalizedAlias, discoveredVersion, forcedType);
    const source = "package_source";
    return {
      descriptor: ContribDescriptorSchema.parse({
        ...descriptor,
        source,
        evidence: createDescriptorEvidence(
          source,
          resolvedRef,
          normalizedAlias,
          discoveredVersion,
          undefined,
          [],
          descriptorLocation.packageRoot,
          descriptorLocation.modulePath,
          descriptorLocation.goPackagePath,
          undefined,
          false,
          true,
          discoveredVersion ? (version ? "import" : "package") : "unknown",
          inferSignatureCompleteness(descriptor.settings, descriptor.inputs, descriptor.outputs)
        )
      }),
      diagnostics: [
        createDiagnostic(
          "flogo.contrib.descriptor_not_found",
          `Descriptor metadata for "${resolvedRef}" was not found on disk`,
          "info",
          normalizedAlias ? `imports.${normalizedAlias}` : resolvedRef
        ),
        createDiagnostic(
          "flogo.contrib.package_source_fallback",
          `Descriptor metadata for "${resolvedRef}" was not found on disk; using package source fallback metadata`,
          "info",
          normalizedAlias ? `imports.${normalizedAlias}` : resolvedRef,
          {
            packageRoot: descriptorLocation.packageRoot,
            modulePath: descriptorLocation.modulePath,
            goPackagePath: descriptorLocation.goPackagePath,
            packageVersion: descriptorLocation.packageVersion
          }
        )
      ]
    };
  }

  const registryDescriptor = buildDescriptorFromRef(resolvedRef, normalizedAlias, version, forcedType);
  const sourceCode = knownDescriptorRegistry.has(normalizeAlias(normalizedAlias ?? "")) ? "flogo.contrib.registry_fallback" : "flogo.contrib.inferred_metadata";
  const sourceMessage =
    sourceCode === "flogo.contrib.registry_fallback"
      ? `Descriptor metadata for "${resolvedRef}" was not found on disk; using registry fallback metadata`
      : `Descriptor metadata for "${resolvedRef}" was not found on disk; using inferred metadata`;

  return {
    descriptor: registryDescriptor,
    diagnostics: [
      createDiagnostic(
        "flogo.contrib.descriptor_not_found",
        `Descriptor metadata for "${resolvedRef}" was not found on disk`,
        "info",
        normalizedAlias ? `imports.${normalizedAlias}` : resolvedRef
      ),
      createDiagnostic(
        sourceCode,
        sourceMessage,
        sourceCode === "flogo.contrib.inferred_metadata" ? "warning" : "info",
        normalizedAlias ? `imports.${normalizedAlias}` : resolvedRef
      )
    ]
  };
}

function resolveFlowDescriptor(app: FlogoApp, refOrAlias: string): ContribDescriptor | undefined {
  const normalized = normalizeAlias(refOrAlias);
  const flowId = refOrAlias.startsWith("#flow:")
    ? refOrAlias.replace("#flow:", "")
    : normalized === "flow"
      ? undefined
      : normalized;

  if (normalized === "flow") {
    return undefined;
  }

  const resource = app.resources.find((entry) => entry.id === flowId);
  if (!resource) {
    return undefined;
  }

  return inventoryEntryToDescriptor(buildFlowInventoryEntry(resource));
}

function resolveAppRef(
  app: FlogoApp,
  refOrAlias: string
): { ref: string; alias?: string; version?: string; forcedType?: ContribDescriptor["type"] } | undefined {
  if (refOrAlias.startsWith("#flow:")) {
    const flowDescriptor = resolveFlowDescriptor(app, refOrAlias);
    if (flowDescriptor) {
      return {
        ref: flowDescriptor.ref,
        alias: flowDescriptor.alias,
        forcedType: flowDescriptor.type
      };
    }
  }

  const normalized = normalizeAlias(refOrAlias);
  const importMatch = app.imports.find((entry) => entry.alias === normalized || entry.ref === refOrAlias || entry.ref === normalized);
  if (importMatch) {
    return {
      ref: importMatch.ref,
      alias: importMatch.alias,
      version: importMatch.version
    };
  }

  const triggerMatch = app.triggers.find((entry) => entry.ref === refOrAlias || normalizeAlias(entry.ref) === normalized);
  if (triggerMatch) {
    return {
      ref: resolveImportRef(app, triggerMatch.ref, inferAliasFromRef(triggerMatch.ref)),
      alias: inferAliasFromRef(triggerMatch.ref),
      forcedType: "trigger"
    };
  }

  for (const resource of app.resources) {
    const taskMatch = resource.data.tasks.find(
      (task) => task.activityRef && (task.activityRef === refOrAlias || normalizeAlias(task.activityRef) === normalized)
    );
    if (taskMatch?.activityRef) {
      return {
        ref: resolveImportRef(app, taskMatch.activityRef, inferAliasFromRef(taskMatch.activityRef)),
        alias: inferAliasFromRef(taskMatch.activityRef)
      };
    }
  }

  if (refOrAlias.startsWith("#")) {
    return {
      ref: resolveImportRef(app, refOrAlias, normalized),
      alias: normalized
    };
  }

  if (refOrAlias.length > 0) {
    return {
      ref: refOrAlias,
      alias: inferAliasFromRef(refOrAlias)
    };
  }

  return undefined;
}

function findInventoryEntry(
  app: FlogoApp,
  inventory: ContributionInventory,
  refOrAlias: string
): ContributionInventoryEntry | undefined {
  const flowDescriptor = resolveFlowDescriptor(app, refOrAlias);
  if (flowDescriptor) {
    return inventory.entries.find((entry) => entry.ref === flowDescriptor.ref);
  }

  const normalized = normalizeAlias(refOrAlias);
  const appRef = resolveAppRef(app, refOrAlias);
  const resolvedRef = appRef?.ref ? resolveImportRef(app, appRef.ref, appRef.alias) : undefined;

  return inventory.entries.find((entry) => {
    const evidenceRef = entry.descriptor?.evidence?.resolvedRef ?? entry.ref;
    return (
      entry.ref === refOrAlias ||
      evidenceRef === refOrAlias ||
      normalizeAlias(entry.ref) === normalized ||
      normalizeAlias(evidenceRef) === normalized ||
      (entry.alias ? normalizeAlias(entry.alias) === normalized : false) ||
      (resolvedRef ? entry.ref === resolvedRef || evidenceRef === resolvedRef : false)
    );
  });
}

function resolveImportRef(app: FlogoApp, ref: string, alias?: string) {
  if (!ref.startsWith("#")) {
    return ref;
  }

  const normalizedAlias = normalizeAlias(alias ?? ref);
  const match = app.imports.find((entry) => entry.alias === normalizedAlias);
  return match?.ref ?? ref;
}

function findDescriptorFile(ref: string, options?: ContribLookupOptions) {
  const location = findDescriptorLocation(ref, options);
  return location && "descriptorPath" in location ? location.descriptorPath : undefined;
}

function findDescriptorLocation(ref: string, options?: ContribLookupOptions): DescriptorCandidate | PackageCandidate | undefined {
  for (const candidate of buildDescriptorCandidates(ref, options)) {
    if (existsSync(candidate.descriptorPath)) {
      return candidate;
    }
  }

  const packageCandidate = findPackageRoot(ref, options);
  if (packageCandidate) {
    return packageCandidate;
  }

  return undefined;
}

function buildSearchRoots(options?: ContribLookupOptions) {
  const roots = new Set<string>();
  roots.add(process.cwd());

  if (options?.appPath) {
    const appDir = path.dirname(path.resolve(options.appPath));
    roots.add(appDir);
    roots.add(path.dirname(appDir));
  }

  for (const root of options?.searchRoots ?? []) {
    roots.add(path.resolve(root));
  }

  const envSearchRoots = process.env.FLOGO_DESCRIPTOR_SEARCH_PATHS
    ?.split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const root of envSearchRoots ?? []) {
    roots.add(path.resolve(root));
  }

  return Array.from(roots);
}

function findPackageRoot(ref: string, options?: ContribLookupOptions) {
  const normalizedRef = ref.replace(/^#/, "").replace(/\\/g, "/");
  const refBasename = normalizedRef.split("/").filter(Boolean).at(-1);
  const seen = new Set<string>();
  const candidates: Array<PackageCandidate> = [];

  for (const moduleInfo of collectGoModules(options)) {
    const relativePath = resolveModuleRelativePath(moduleInfo, normalizedRef);
    if (relativePath) {
      candidates.push({
        packageRoot: path.join(moduleInfo.root, relativePath),
        modulePath: moduleInfo.modulePath,
        goPackagePath: normalizedRef,
        source: "package_source"
      });
    }
  }

  candidates.push(...buildModuleCacheCandidates(normalizedRef));

  for (const root of buildSearchRoots(options)) {
    candidates.push({
      packageRoot: path.join(root, "vendor", normalizedRef),
      goPackagePath: normalizedRef,
      source: "package_source"
    });
    candidates.push({
      packageRoot: path.join(root, normalizedRef),
      goPackagePath: normalizedRef,
      source: "package_source"
    });
    if (refBasename) {
      candidates.push({
        packageRoot: path.join(root, refBasename),
        source: "package_source"
      });
    }
  }

  for (const candidate of candidates) {
    if (seen.has(candidate.packageRoot)) {
      continue;
    }
    seen.add(candidate.packageRoot);
    if (directoryLooksLikePackageRoot(candidate.packageRoot)) {
      const moduleInfo = candidate.modulePath ? undefined : findNearestGoModule(candidate.packageRoot);
      return {
        ...candidate,
        modulePath: candidate.modulePath ?? moduleInfo?.modulePath,
        goPackagePath: candidate.goPackagePath ?? deriveGoPackagePath(candidate.packageRoot, moduleInfo)
      };
    }
  }

  return undefined;
}

function parseDescriptorFile(
  descriptorPath: string,
  ref: string,
  alias?: string,
  version?: string,
  forcedType?: ContribDescriptor["type"],
  source: ContribResolutionEvidence["source"] = "descriptor",
  packageRoot?: string,
  modulePath?: string,
  goPackagePath?: string,
  packageVersion?: string
): ContribDescriptor {
  const raw = JSON.parse(readFileSync(descriptorPath, "utf8")) as Record<string, unknown>;
  const fieldSet = (value: unknown) => normalizeDescriptorFields(value);
  const descriptorType = normalizeDescriptorType(raw.type) ?? forcedType ?? inferContribType(ref);
  const resolvedVersion = typeof raw.version === "string" ? raw.version : version ?? packageVersion;

  return ContribDescriptorSchema.parse({
    ref,
    alias,
    type: descriptorType,
    name: typeof raw.name === "string" ? raw.name : alias ?? inferNameFromRef(ref),
    version: resolvedVersion,
    title: typeof raw.title === "string" ? raw.title : undefined,
    settings: fieldSet(raw.settings),
    inputs: fieldSet(raw.input ?? raw.inputs),
    outputs: fieldSet(raw.output ?? raw.outputs),
    examples: normalizeStringArray(raw.examples),
    compatibilityNotes: normalizeStringArray(raw.compatibilityNotes),
    source,
    evidence: createDescriptorEvidence(
      source,
      ref,
      alias,
      resolvedVersion,
      descriptorPath,
      [],
      packageRoot,
      modulePath,
      goPackagePath,
      undefined,
      true,
      true,
      typeof raw.version === "string" ? "descriptor" : version ? "import" : packageVersion ? "package" : "unknown",
      inferSignatureCompleteness(fieldSet(raw.settings), fieldSet(raw.input ?? raw.inputs), fieldSet(raw.output ?? raw.outputs))
    )
  });
}

function normalizeDescriptorType(value: unknown): ContribDescriptor["type"] | undefined {
  return value === "trigger" || value === "activity" || value === "action" ? value : undefined;
}

function normalizeDescriptorFields(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((field, index) => {
    if (typeof field === "string") {
      return {
        name: field,
        required: false
      };
    }

    const record = (field ?? {}) as Record<string, unknown>;
    return {
      name: typeof record.name === "string" ? record.name : `field_${index}`,
      type: typeof record.type === "string" ? record.type : undefined,
      required: Boolean(record.required),
      description: typeof record.description === "string" ? record.description : undefined
    };
  });
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function createDescriptorEvidence(
  source: ContribResolutionEvidence["source"],
  resolvedRef: string,
  importAlias?: string,
  version?: string,
  descriptorPath?: string,
  diagnostics: Diagnostic[] = [],
  packageRoot?: string,
  modulePath?: string,
  goPackagePath?: string,
  confidence?: ContribResolutionEvidence["confidence"],
  packageDescriptorFound = false,
  packageMetadataFound = false,
  versionSource: ContribResolutionEvidence["versionSource"] = "unknown",
  signatureCompleteness: ContribResolutionEvidence["signatureCompleteness"] = "minimal"
): ContribResolutionEvidence {
  return ContribResolutionEvidenceSchema.parse({
    source,
    resolvedRef,
    descriptorPath,
    packageRoot,
    modulePath,
    goPackagePath,
    importAlias,
    version,
    confidence: confidence ?? deriveEvidenceConfidence(source),
    packageDescriptorFound,
    packageMetadataFound,
    versionSource,
    signatureCompleteness,
    diagnostics
  });
}

function buildDescriptorCandidates(ref: string, options?: ContribLookupOptions): DescriptorCandidate[] {
  const normalizedRef = ref.replace(/^#/, "").replace(/\\/g, "/");
  const refBasename = normalizedRef.split("/").filter(Boolean).at(-1);
  const candidates: DescriptorCandidate[] = [];
  const seen = new Set<string>();
  const appDir = options?.appPath ? path.dirname(path.resolve(options.appPath)) : undefined;

  const pushCandidate = (candidate: DescriptorCandidate | undefined) => {
    if (!candidate || seen.has(candidate.descriptorPath)) {
      return;
    }
    seen.add(candidate.descriptorPath);
    candidates.push(candidate);
  };

  if (appDir) {
    pushCandidate({
      descriptorPath: path.join(appDir, normalizedRef, "descriptor.json"),
      packageRoot: path.join(appDir, normalizedRef),
      source: "app_descriptor"
    });
    pushCandidate({
      descriptorPath: path.join(appDir, "descriptors", normalizedRef, "descriptor.json"),
      packageRoot: path.join(appDir, "descriptors", normalizedRef),
      source: "app_descriptor"
    });
    if (refBasename) {
      pushCandidate({
        descriptorPath: path.join(appDir, refBasename, "descriptor.json"),
        packageRoot: path.join(appDir, refBasename),
        source: "app_descriptor"
      });
      pushCandidate({
        descriptorPath: path.join(appDir, "descriptors", refBasename, "descriptor.json"),
        packageRoot: path.join(appDir, "descriptors", refBasename),
        source: "app_descriptor"
      });
    }
  }

  for (const moduleInfo of collectGoModules(options)) {
    const relativePath = resolveModuleRelativePath(moduleInfo, normalizedRef);
    if (!relativePath) {
      continue;
    }
    pushCandidate({
      descriptorPath: path.join(moduleInfo.root, relativePath, "descriptor.json"),
      packageRoot: path.join(moduleInfo.root, relativePath),
      modulePath: moduleInfo.modulePath,
      goPackagePath: normalizedRef,
      source: "package_descriptor"
    });
  }

  for (const candidate of buildModuleCacheCandidates(normalizedRef)) {
    pushCandidate({
      descriptorPath: path.join(candidate.packageRoot, "descriptor.json"),
      packageRoot: candidate.packageRoot,
      modulePath: candidate.modulePath,
      goPackagePath: candidate.goPackagePath,
      packageVersion: candidate.packageVersion,
      source: "package_descriptor"
    });
  }

  for (const root of buildSearchRoots(options)) {
    pushCandidate({
      descriptorPath: path.join(root, "vendor", normalizedRef, "descriptor.json"),
      packageRoot: path.join(root, "vendor", normalizedRef),
      goPackagePath: normalizedRef,
      source: "package_descriptor"
    });
    pushCandidate({
      descriptorPath: path.join(root, ".flogo", "descriptors", normalizedRef, "descriptor.json"),
      packageRoot: path.join(root, ".flogo", "descriptors", normalizedRef),
      source: "workspace_descriptor"
    });
    pushCandidate({
      descriptorPath: path.join(root, "descriptors", normalizedRef, "descriptor.json"),
      packageRoot: path.join(root, "descriptors", normalizedRef),
      source: "workspace_descriptor"
    });
    pushCandidate({
      descriptorPath: path.join(root, normalizedRef, "descriptor.json"),
      packageRoot: path.join(root, normalizedRef),
      source: "workspace_descriptor"
    });
    if (refBasename) {
      pushCandidate({
        descriptorPath: path.join(root, refBasename, "descriptor.json"),
        packageRoot: path.join(root, refBasename),
        source: "workspace_descriptor"
      });
      pushCandidate({
        descriptorPath: path.join(root, "descriptors", refBasename, "descriptor.json"),
        packageRoot: path.join(root, "descriptors", refBasename),
        source: "workspace_descriptor"
      });
    }
  }

  return candidates;
}

function collectGoModules(options?: ContribLookupOptions): GoModuleInfo[] {
  const modules = new Map<string, GoModuleInfo>();
  for (const root of buildSearchRoots(options)) {
    const moduleInfo = findNearestGoModule(root);
    if (moduleInfo) {
      modules.set(moduleInfo.root, moduleInfo);
    }
  }
  return Array.from(modules.values());
}

function collectGoModuleCacheRoots() {
  const roots = new Set<string>();
  const addRoot = (root?: string) => {
    if (!root) {
      return;
    }
    const resolved = path.resolve(root);
    if (existsSync(resolved)) {
      roots.add(resolved);
    }
  };

  addRoot(process.env.GOMODCACHE);

  for (const root of process.env.GOPATH?.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean) ?? []) {
    addRoot(path.join(root, "pkg", "mod"));
  }

  if (process.env.USERPROFILE) {
    addRoot(path.join(process.env.USERPROFILE, "go", "pkg", "mod"));
  }
  if (process.env.HOME) {
    addRoot(path.join(process.env.HOME, "go", "pkg", "mod"));
  }

  return Array.from(roots);
}

function escapeModuleCacheSegment(segment: string) {
  return segment.replace(/[A-Z]/g, (value) => `!${value.toLowerCase()}`);
}

function buildModuleCacheCandidates(normalizedRef: string): PackageCandidate[] {
  const segments = normalizedRef.split("/").filter(Boolean);
  if (segments.length < 2) {
    return [];
  }

  const candidates: PackageCandidate[] = [];
  const seen = new Set<string>();

  for (const moduleCacheRoot of collectGoModuleCacheRoots()) {
    for (let index = segments.length; index >= 2; index -= 1) {
      const moduleSegments = segments.slice(0, index);
      const relativeSegments = segments.slice(index);
      const modulePath = moduleSegments.join("/");
      const parentDir = path.join(moduleCacheRoot, ...moduleSegments.slice(0, -1).map(escapeModuleCacheSegment));
      const moduleLeaf = escapeModuleCacheSegment(moduleSegments.at(-1) ?? "");
      if (!moduleLeaf || !existsSync(parentDir)) {
        continue;
      }

      let entries: Array<{ isDirectory(): boolean; name: string }> = [];
      try {
        entries = readdirSync(parentDir, { withFileTypes: true }).map((entry) => ({
          isDirectory: () => entry.isDirectory(),
          name: String(entry.name)
        }));
      } catch {
        continue;
      }

      const matchingEntries = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${moduleLeaf}@`))
        .sort((left, right) => right.name.localeCompare(left.name));

      for (const entry of matchingEntries) {
        const packageVersion = entry.name.slice(moduleLeaf.length + 1);
        const packageRoot = path.join(parentDir, entry.name, ...relativeSegments.map(escapeModuleCacheSegment));
        const descriptorPath = path.join(packageRoot, "descriptor.json");
        if (!existsSync(descriptorPath) && !directoryLooksLikePackageRoot(packageRoot)) {
          continue;
        }
        if (seen.has(packageRoot)) {
          continue;
        }
        seen.add(packageRoot);
        candidates.push({
          packageRoot,
          modulePath,
          goPackagePath: normalizedRef,
          packageVersion,
          source: "package_source"
        });
      }
    }
  }

  return candidates;
}

function findNearestGoModule(startDir: string): GoModuleInfo | undefined {
  let current = path.resolve(startDir);
  while (true) {
    const goModPath = path.join(current, "go.mod");
    if (existsSync(goModPath)) {
      const modulePath = parseGoModuleModulePath(goModPath);
      if (modulePath) {
        return {
          root: current,
          modulePath
        };
      }
      return undefined;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function parseGoModuleModulePath(goModPath: string) {
  const contents = readFileSync(goModPath, "utf8");
  const match = contents.match(/^\s*module\s+([^\s]+)\s*$/m);
  return match?.[1];
}

function resolveModuleRelativePath(moduleInfo: GoModuleInfo, normalizedRef: string) {
  if (!normalizedRef.startsWith(moduleInfo.modulePath)) {
    return undefined;
  }
  const relativePath = normalizedRef.slice(moduleInfo.modulePath.length).replace(/^\/+/, "");
  return relativePath.length > 0 ? relativePath : undefined;
}

function deriveGoPackagePath(packageRoot: string, moduleInfo?: GoModuleInfo) {
  if (!moduleInfo) {
    return undefined;
  }

  const relativePath = path.relative(moduleInfo.root, packageRoot).replace(/\\/g, "/");
  return relativePath.length > 0 && relativePath !== "."
    ? `${moduleInfo.modulePath}/${relativePath}`
    : moduleInfo.modulePath;
}

function directoryLooksLikePackageRoot(candidate: string) {
  if (!existsSync(candidate)) {
    return false;
  }

  try {
    const entries = readdirSync(candidate, { withFileTypes: true });
    return entries.some(
      (entry) =>
        entry.isFile() &&
        (entry.name === "descriptor.json" || entry.name === "go.mod" || entry.name.endsWith(".go"))
    );
  } catch {
    return false;
  }
}

function withCatalogRef(descriptor: ContribDescriptor, ref: string): ContribDescriptor {
  if (!ref.startsWith("#")) {
    return descriptor;
  }

  return ContribDescriptorSchema.parse({
    ...descriptor,
    ref
  });
}

function collectMappingPaths(nodeId: string, fields: MappingPreviewField[]): MappingPath[] {
  return fields
    .filter((field) => field.path.includes("."))
    .map((field) => ({
      nodeId,
      mappingKey: field.path.split(".").at(-1) ?? field.path,
      sourceExpression: field.expression,
      targetPath: field.path
    }));
}

function buildResolvedValueMap(fields: MappingPreviewField[]) {
  return Object.fromEntries(
    fields
      .filter((field) => field.path.includes("."))
      .map((field) => [field.path, field.resolved])
  );
}

function evaluateScopeDiagnostics(flow: FlogoFlow, task: FlogoTask, fields: MappingPreviewField[]) {
  const diagnostics: Diagnostic[] = [];
  const taskIndex = flow.data.tasks.findIndex((entry) => entry.id === task.id);
  const priorTasks = new Set(flow.data.tasks.slice(0, taskIndex).map((entry) => entry.id));

  for (const field of fields) {
    for (const reference of field.references) {
      if (reference.startsWith("$trigger")) {
        diagnostics.push(
          createDiagnostic(
            "flogo.mapping.invalid_trigger_scope",
            `Reference "${reference}" is not directly available inside flow task mappings`,
            "warning",
            field.path
          )
        );
        continue;
      }

      if (reference.startsWith("$activity[")) {
        const match = /^\$activity\[([^\]]+)\]/.exec(reference);
        const activityId = match?.[1];
        if (activityId && !priorTasks.has(activityId)) {
          diagnostics.push(
            createDiagnostic(
              "flogo.mapping.invalid_activity_scope",
              `Reference "${reference}" points to an activity that is not available before task "${task.id}"`,
              "error",
              field.path
            )
          );
        }
      }
    }
  }

  return dedupeDiagnostics(diagnostics);
}

function diffResolvedValues(expected: Record<string, unknown>, actual: Record<string, unknown>) {
  const differences: MappingDifference[] = [];
  for (const [pathKey, expectedValue] of Object.entries(expected)) {
    if (!(pathKey in actual)) {
      differences.push({
        path: pathKey,
        expected: expectedValue,
        actual: undefined,
        message: `Expected value for "${pathKey}" was not resolved`
      });
      continue;
    }

    if (!isEqualValue(expectedValue, actual[pathKey])) {
      differences.push({
        path: pathKey,
        expected: expectedValue,
        actual: actual[pathKey],
        message: `Resolved value for "${pathKey}" does not match the expected output`
      });
    }
  }

  return differences;
}

function isEqualValue(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}

function dedupeDiagnostics(diagnostics: Diagnostic[]) {
  const seen = new Set<string>();
  const result: Diagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.code}:${diagnostic.path ?? ""}:${diagnostic.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(diagnostic);
  }
  return result;
}

function cloneDiagnostics(diagnostics?: Diagnostic[]) {
  return diagnostics ? diagnostics.map((diagnostic) => ({ ...diagnostic })) : [];
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) =>
    left.localeCompare(right)
  );
}

function inferPropertyType(app: FlogoApp, propertyName: string) {
  const declared = app.properties.find((property) => property.name === propertyName);
  if (typeof declared?.type === "string") {
    return declared.type;
  }
  if (typeof declared?.value === "number") {
    return "number";
  }
  if (typeof declared?.value === "boolean") {
    return "boolean";
  }
  if (typeof declared?.value === "string") {
    return "string";
  }

  const lowerName = propertyName.toLowerCase();
  if (/(count|size|length|timeout|interval|port|code|status|limit)/i.test(lowerName)) {
    return "number";
  }
  if (/(enabled|disabled|success|retry|dryrun|debug|active)/i.test(lowerName)) {
    return "boolean";
  }
  return "string";
}

function looksSensitiveConfig(name: string) {
  return /(secret|token|password|key|credential|clientsecret|apikey)/i.test(name);
}

function buildDeploymentNotes(
  propertyRefs: Set<string>,
  envRefs: Set<string>,
  undefinedPropertyRefs: Set<string>,
  unusedProperties: string[]
) {
  const notes: string[] = [];
  if (propertyRefs.size > 0) {
    notes.push("Property-backed configuration should be declared on the app so flows can be reused across trigger types.");
  }
  if (envRefs.size > 0) {
    notes.push("Environment-backed configuration should be supplied per deployment target rather than embedded in flogo.json.");
  }
  if (undefinedPropertyRefs.size > 0) {
    notes.push("Undefined property references should be declared before promoting the app beyond development.");
  }
  if (unusedProperties.length > 0) {
    notes.push("Unused declared properties should be removed or wired into mappings to keep configuration intentional.");
  }
  return notes;
}

function buildProfileSpecificNotes(
  deploymentProfile: DeploymentProfile,
  propertyRefs: Set<string>,
  envRefs: Set<string>
) {
  const notes: string[] = [];
  switch (deploymentProfile) {
    case "rest_service":
      if (envRefs.size > 0) {
        notes.push("REST services should prefer environment variables for external endpoints, secrets, and operational timeouts.");
      }
      if (propertyRefs.size > 0) {
        notes.push("REST services should keep reusable flow defaults in app properties when they are not deployment-secret values.");
      }
      break;
    case "timer_job":
      notes.push("Timer jobs should keep schedule-local defaults in properties and use environment variables for external integrations.");
      break;
    case "cli_tool":
      notes.push("CLI tools should prefer environment variables for runtime invocation values and properties for baked-in defaults.");
      break;
    case "channel_worker":
      notes.push("Channel workers should keep internal reusable defaults in properties unless the value is deployment-specific.");
      break;
    case "serverless":
      notes.push("Serverless profiles should bias toward environment variables for operational configuration.");
      break;
    case "edge_binary":
      notes.push("Edge binaries should bias toward app properties for embedded and offline-safe defaults.");
      break;
  }
  return notes;
}

function summarizeSignatureCoverage(entries: ContributionInventoryEntry[]) {
  if (entries.length === 0) {
    return "fallback_only" as const;
  }
  if (entries.every((entry) => entry.signatureCompleteness === "complete")) {
    return "full" as const;
  }
  if (entries.some((entry) => entry.signatureCompleteness !== "minimal")) {
    return "partial" as const;
  }
  return "fallback_only" as const;
}

function buildCompositionLimitations(
  entries: ContributionInventoryEntry[],
  diagnostics: Diagnostic[],
  request: CompositionCompareRequest
) {
  const limitations: string[] = [];
  if (entries.some((entry) => entry.source === "registry" || entry.source === "inferred")) {
    limitations.push("Some contribution signatures are derived from registry or inferred fallback metadata rather than package-backed evidence.");
  }
  if (entries.some((entry) => entry.signatureCompleteness !== "complete")) {
    limitations.push("Some contribution signatures are only partially known, so comparison coverage is not complete.");
  }
  if (request.target === "resource") {
    limitations.push("Resource-scoped comparison does not validate wider trigger or import topology.");
  }
  if (diagnostics.length > 0) {
    limitations.push("Comparison produced diagnostics that may reduce confidence in parity conclusions.");
  }
  return limitations;
}

function inferSignatureCompleteness(
  settings: Array<{ name: string }>,
  inputs: Array<{ name: string }>,
  outputs: Array<{ name: string }>
) {
  const declaredFieldCount = settings.length + inputs.length + outputs.length;
  if (declaredFieldCount > 0) {
    return "complete" as const;
  }
  return "minimal" as const;
}

function buildCanonicalProjection(app: FlogoApp, request: CompositionCompareRequest) {
  if (request.target === "resource") {
    const resource = request.resourceId ? app.resources.find((entry) => entry.id === request.resourceId) : undefined;
    return {
      target: "resource",
      appName: app.name,
      resource: resource ? projectFlow(resource) : undefined
    };
  }

  return {
    target: "app",
    appName: app.name,
    type: app.type,
    appModel: app.appModel,
    imports: app.imports
      .map((entry) => ({
        alias: entry.alias,
        ref: entry.ref,
        version: entry.version ?? null
      }))
      .sort((left, right) => left.alias.localeCompare(right.alias)),
    properties: app.properties
      .map((property) => ({
        name: property.name,
        type: property.type ?? null,
        required: Boolean(property.required),
        value: property.value ?? null
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    triggers: app.triggers
      .map((trigger) => ({
        id: trigger.id,
        ref: trigger.ref,
        settings: sortObject(trigger.settings),
        handlers: trigger.handlers.map((handler) => ({
          actionRef: resolveHandlerFlowRef(handler) ?? handler.action.ref,
          settings: sortObject(handler.settings),
          input: sortObject(handler.input),
          output: sortObject(handler.output)
        }))
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    resources: app.resources.map(projectFlow).sort((left, right) => left.id.localeCompare(right.id))
  };
}

function buildProgrammaticProjection(
  app: FlogoApp,
  request: CompositionCompareRequest,
  diagnostics: Diagnostic[],
  inventory: ContributionInventory
) {
  if (request.target === "resource") {
    if (!request.resourceId) {
      diagnostics.push(
        createDiagnostic(
          "flogo.composition.resource_required",
          "A resourceId is required when target=resource",
          "error",
          "resourceId"
        )
      );
      return {
        target: "resource",
        appName: app.name,
        resource: undefined
      };
    }

    const resource = app.resources.find((entry) => entry.id === request.resourceId);
    if (!resource) {
      diagnostics.push(
        createDiagnostic(
          "flogo.composition.resource_not_found",
          `Resource "${request.resourceId}" was not found`,
          "error",
          request.resourceId
        )
      );
      return {
        target: "resource",
        appName: app.name,
        resource: undefined
      };
    }

    return {
      target: "resource",
      appName: app.name,
      resource: projectFlow(resource)
    };
  }

  void inventory;
  return buildCanonicalProjection(app, request);
}

function projectFlow(resource: FlogoFlow) {
  return {
    id: resource.id,
    name: resource.data.name ?? null,
    metadata: {
      input: (resource.data.metadata?.input ?? []).map((item, index) => ({
        name: typeof item.name === "string" ? item.name : `input_${index}`,
        type: typeof item.type === "string" ? item.type : null,
        required: Boolean(item.required)
      })),
      output: (resource.data.metadata?.output ?? []).map((item, index) => ({
        name: typeof item.name === "string" ? item.name : `output_${index}`,
        type: typeof item.type === "string" ? item.type : null,
        required: Boolean(item.required)
      }))
    },
    tasks: resource.data.tasks.map((task) => ({
      id: task.id,
      name: task.name ?? null,
      activityRef: task.activityRef ?? null,
      input: sortObject(task.input),
      output: sortObject(task.output),
      settings: sortObject(task.settings)
    }))
  };
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObject(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortObject(nested)])
    );
  }
  return value ?? null;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

function diffComposition(pathPrefix: string, expected: unknown, actual: unknown) {
  const differences: Array<{
    path: string;
    kind: string;
    expected?: unknown;
    actual?: unknown;
    severity: Diagnostic["severity"];
  }> = [];

  if (Array.isArray(expected) || Array.isArray(actual)) {
    const left = Array.isArray(expected) ? expected : [];
    const right = Array.isArray(actual) ? actual : [];
    if (left.length !== right.length) {
      differences.push({
        path: pathPrefix,
        kind: "array_length_mismatch",
        expected: left.length,
        actual: right.length,
        severity: "warning"
      });
    }
    const maxLength = Math.max(left.length, right.length);
    for (let index = 0; index < maxLength; index += 1) {
      differences.push(...diffComposition(`${pathPrefix}[${index}]`, left[index], right[index]));
    }
    return differences;
  }

  if (expected && typeof expected === "object" && actual && typeof actual === "object") {
    const keys = new Set([
      ...Object.keys(expected as Record<string, unknown>),
      ...Object.keys(actual as Record<string, unknown>)
    ]);
    for (const key of Array.from(keys).sort()) {
      differences.push(
        ...diffComposition(
          `${pathPrefix}.${key}`,
          (expected as Record<string, unknown>)[key],
          (actual as Record<string, unknown>)[key]
        )
      );
    }
    return differences;
  }

  if (expected !== actual) {
    differences.push({
      path: pathPrefix,
      kind: "value_mismatch",
      expected,
      actual,
      severity: "warning"
    });
  }

  return differences;
}

function inferContribType(ref: string): ContribDescriptor["type"] {
  if (ref.includes("/trigger/") || ref.startsWith("#rest") || ref.startsWith("#timer") || ref.startsWith("#cli") || ref.startsWith("#channel")) {
    return "trigger";
  }
  if (ref.includes("/activity/") || ref.startsWith("#log")) {
    return "activity";
  }
  return "action";
}

function inferAliasFromRef(ref: string): string | undefined {
  if (ref.startsWith("#flow:")) {
    return "flow";
  }
  if (ref.startsWith("#")) {
    return normalizeAlias(ref.slice(1).split(".")[0]);
  }

  const segments = ref.split("/").filter(Boolean);
  const last = segments.at(-1);
  return last ? normalizeAlias(last) : undefined;
}

function normalizeAppShape(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }

  const appRecord = { ...(parsed as Record<string, unknown>) };
  appRecord.triggers = normalizeTriggers(appRecord.triggers);
  appRecord.resources = normalizeResources(appRecord.resources);
  appRecord.properties = normalizeProperties(appRecord.properties);
  appRecord.channels = normalizeChannels(appRecord.channels);
  return appRecord;
}

function normalizeTriggers(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((trigger) => {
    if (!trigger || typeof trigger !== "object" || Array.isArray(trigger)) {
      return trigger;
    }

    const triggerRecord = { ...(trigger as Record<string, unknown>) };
    if (Array.isArray(triggerRecord.handlers)) {
      triggerRecord.handlers = triggerRecord.handlers.map((handler) => normalizeHandler(handler));
    }

    return triggerRecord;
  });
}

function normalizeHandler(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const handlerRecord = { ...(value as Record<string, unknown>) };
  const action = handlerRecord.action;
  if (action && typeof action === "object" && !Array.isArray(action)) {
    const actionRecord = { ...(action as Record<string, unknown>) };
    if (typeof actionRecord.ref === "string" && actionRecord.ref.startsWith("flow:")) {
      actionRecord.ref = `#${actionRecord.ref}`;
    }
    handlerRecord.action = actionRecord;
  }

  return handlerRecord;
}

function normalizeResources(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.map((resource, index) => normalizeResource(resource, `resource_${index}`));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).map(([id, resource]) => normalizeResource(resource, id));
}

function normalizeResource(value: unknown, fallbackId: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const resourceRecord = { ...(value as Record<string, unknown>) };
  const normalizedData = normalizeResourceData(resourceRecord.data);

  return {
    ...resourceRecord,
    id: typeof resourceRecord.id === "string" ? resourceRecord.id : fallbackId,
    data: normalizedData
  };
}

function normalizeResourceData(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      metadata: {
        input: [],
        output: []
      },
      tasks: [],
      links: []
    };
  }

  const dataRecord = { ...(value as Record<string, unknown>) };
  const metadata = dataRecord.metadata && typeof dataRecord.metadata === "object" && !Array.isArray(dataRecord.metadata)
    ? { ...(dataRecord.metadata as Record<string, unknown>) }
    : {};

  metadata.input = normalizeMetadataFields(metadata.input);
  metadata.output = normalizeMetadataFields(metadata.output);
  dataRecord.metadata = metadata;
  dataRecord.tasks = Array.isArray(dataRecord.tasks) ? dataRecord.tasks.map((task) => normalizeTask(task)) : [];
  dataRecord.links = Array.isArray(dataRecord.links) ? dataRecord.links : [];

  return dataRecord;
}

function normalizeMetadataFields(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((field) => {
    if (typeof field === "string") {
      return { name: field };
    }
    return field;
  });
}

function normalizeTask(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const taskRecord = { ...(value as Record<string, unknown>) };
  const activity = taskRecord.activity;

  if (typeof taskRecord.activityRef !== "string" && activity && typeof activity === "object" && !Array.isArray(activity)) {
    const activityRef = (activity as Record<string, unknown>).ref;
    if (typeof activityRef === "string") {
      taskRecord.activityRef = activityRef;
    }
  }

  delete taskRecord.activity;
  return taskRecord;
}

function normalizeProperties(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value;
}

function normalizeChannels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function inferNameFromRef(ref: string): string {
  return inferAliasFromRef(ref) ?? ref;
}

function normalizeAlias(alias: string): string {
  return alias.replace(/^#/, "").trim();
}

function locateTask(app: FlogoApp, nodeId: string): LocatedTask | undefined {
  for (const flow of app.resources) {
    const task = flow.data.tasks.find((candidate) => candidate.id === nodeId);
    if (task) {
      return {
        flowId: flow.id,
        flow,
        task
      };
    }
  }

  return undefined;
}

function collectMappingFields(prefix: string, value: unknown, sampleInput: MappingPreviewContext): MappingPreviewField[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return [
      {
        path: prefix,
        kind: "array",
        references: collectResolverReferences(JSON.stringify(value)),
        resolved: resolveMappingValue(value, sampleInput),
        diagnostics: []
      },
      ...value.flatMap((entry, index) => collectMappingFields(`${prefix}[${index}]`, entry, sampleInput))
    ];
  }

  if (typeof value === "object") {
    const objectEntries = Object.entries(value as Record<string, unknown>);
    const result: MappingPreviewField[] = [
      {
        path: prefix,
        kind: "object",
        references: collectResolverReferences(JSON.stringify(value)),
        resolved: resolveMappingValue(value, sampleInput),
        diagnostics: []
      }
    ];

    for (const [key, nestedValue] of objectEntries) {
      result.push(...collectMappingFields(`${prefix}.${key}`, nestedValue, sampleInput));
    }

    return result;
  }

  const kind = classifyMappingValue(value);
  const expression = typeof value === "string" ? value : undefined;
  const references = typeof value === "string" ? collectResolverReferences(value) : [];
  const { resolved, diagnostics } = typeof value === "string" ? resolveStringMapping(value, sampleInput, prefix) : {
    resolved: resolveMappingValue(value, sampleInput),
    diagnostics: []
  };

  return [
    {
      path: prefix,
      kind,
      expression,
      references,
      resolved,
      diagnostics
    }
  ];
}

function collectResolverReferences(value: string): string[] {
  const references = new Set<string>();
  let match: RegExpExecArray | null = resolverPattern.exec(value);
  while (match) {
    references.add(`$${match[1]}`);
    match = resolverPattern.exec(value);
  }
  resolverPattern.lastIndex = 0;
  return Array.from(references);
}

function resolveMappingValue(value: unknown, sampleInput: MappingPreviewContext): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => resolveMappingValue(entry, sampleInput));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, resolveMappingValue(nestedValue, sampleInput)])
    );
  }

  if (typeof value !== "string") {
    return value;
  }

  const references = collectResolverReferences(value);
  if (references.length === 0) {
    return value;
  }

  if (references.length === 1 && references[0] === value) {
    return resolveReference(references[0], sampleInput);
  }

  let resolved = value;
  for (const reference of references) {
    const replacement = resolveReference(reference, sampleInput);
    resolved = resolved.replace(reference, replacement === undefined ? "" : String(replacement));
  }
  return resolved;
}

function resolveReference(reference: string, sampleInput: MappingPreviewContext): unknown {
  return resolveReferenceWithStatus(reference, sampleInput).resolved;
}

function resolveReferenceWithStatus(reference: string, sampleInput: MappingPreviewContext): { resolved: unknown; ok: boolean } {
  if (reference.startsWith("$activity[")) {
    const activityMatch = /^\$activity\[([^\]]+)\](?:\.(.+))?$/.exec(reference);
    if (!activityMatch) {
      return { resolved: undefined, ok: false };
    }
    const [, activityId, propertyPath] = activityMatch;
    return resolveByPathWithStatus(sampleInput.activity?.[activityId], propertyPath);
  }

  if (reference.startsWith("$flow")) {
    return resolveByPathWithStatus(sampleInput.flow, reference.replace(/^\$flow\.?/, ""));
  }
  if (reference.startsWith("$env")) {
    return resolveByPathWithStatus(sampleInput.env, reference.replace(/^\$env\.?/, ""));
  }
  if (reference.startsWith("$property")) {
    return resolveByPathWithStatus(sampleInput.property, reference.replace(/^\$property\.?/, ""));
  }
  if (reference.startsWith("$trigger")) {
    return resolveByPathWithStatus(sampleInput.trigger, reference.replace(/^\$trigger\.?/, ""));
  }

  return { resolved: undefined, ok: false };
}

function resolveByPath(value: unknown, pathExpression?: string): unknown {
  return resolveByPathWithStatus(value, pathExpression).resolved;
}

function resolveByPathWithStatus(value: unknown, pathExpression?: string): { resolved: unknown; ok: boolean } {
  if (!pathExpression || pathExpression.length === 0) {
    return { resolved: value, ok: value !== undefined };
  }
  const segments = pathExpression.split(".").filter(Boolean);
  let current = value;
  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return { resolved: undefined, ok: false };
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return { resolved: current, ok: current !== undefined };
}

function resolveStringMapping(
  value: string,
  sampleInput: MappingPreviewContext,
  path: string
): { resolved: unknown; diagnostics: Diagnostic[] } {
  const references = collectResolverReferences(value);
  if (references.length === 0) {
    return {
      resolved: value,
      diagnostics: []
    };
  }

  const diagnostics: Diagnostic[] = [];
  if (references.length === 1 && references[0] === value) {
    const resolved = resolveReferenceWithStatus(references[0], sampleInput);
    if (!resolved.ok) {
      diagnostics.push(
        createDiagnostic(
          "flogo.mapping.unresolved_reference",
          `Unable to resolve reference "${references[0]}"`,
          "warning",
          path
        )
      );
    }
    return {
      resolved: resolved.resolved,
      diagnostics
    };
  }

  let resolved = value;
  for (const reference of references) {
    const replacement = resolveReferenceWithStatus(reference, sampleInput);
    if (!replacement.ok) {
      diagnostics.push(
        createDiagnostic(
          "flogo.mapping.unresolved_reference",
          `Unable to resolve reference "${reference}"`,
          "warning",
          path
        )
      );
    }
    resolved = resolved.replace(reference, replacement.resolved === undefined ? "" : String(replacement.resolved));
  }

  return {
    resolved,
    diagnostics
  };
}

function collectResolverKinds(value: unknown, propertyRefs: Set<string>, envRefs: Set<string>): void {
  if (typeof value === "string") {
    for (const reference of collectResolverReferences(value)) {
      if (reference.startsWith("$property.")) {
        propertyRefs.add(reference.replace("$property.", ""));
      }
      if (reference.startsWith("$env.")) {
        envRefs.add(reference.replace("$env.", ""));
      }
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectResolverKinds(entry, propertyRefs, envRefs);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      collectResolverKinds(nestedValue, propertyRefs, envRefs);
    }
  }
}

function suggestTaskCoercions(
  app: FlogoApp,
  task: FlogoTask,
  sampleInput: MappingPreviewContext
) {
  const diagnostics: Diagnostic[] = [];
  const expectedFieldTypes = buildExpectedFieldTypes(app, task);
  const fields = [
    ...collectMappingFields("input", task.input, sampleInput),
    ...collectMappingFields("settings", task.settings, sampleInput),
    ...collectMappingFields("output", task.output, sampleInput)
  ];

  for (const field of fields) {
    const expectedType = expectedFieldTypes.get(field.path);
    if (!expectedType || field.resolved === undefined) {
      continue;
    }

    const actualType = inferResolvedValueType(field.resolved);
    if (!actualType || actualType === expectedType) {
      continue;
    }

    diagnostics.push(
      createDiagnostic(
        "flogo.mapping.coercion.expected_type",
        `Field "${field.path}" expects ${expectedType} based on contribution metadata but resolves to ${actualType}. Consider using toType(...) or toString(...).`,
        "warning",
        field.path,
        {
          expression: field.expression,
          expectedType,
          actualType,
          resolved: field.resolved
        }
      )
    );
  }

  const sections = [
    ["input", task.input] as const,
    ["settings", task.settings] as const,
    ["output", task.output] as const
  ];

  for (const [section, value] of sections) {
    collectCoercionDiagnostics(value, `${task.id}.${section}`, diagnostics, sampleInput);
  }

  return dedupeDiagnostics(diagnostics);
}

function buildExpectedFieldTypes(app: FlogoApp, task: FlogoTask) {
  const expectedTypes = new Map<string, string>();
  if (!task.activityRef) {
    return expectedTypes;
  }

  const descriptor = inspectContribDescriptor(app, task.activityRef)?.descriptor;
  if (!descriptor) {
    return expectedTypes;
  }

  for (const field of descriptor.inputs) {
    const expectedType = normalizeExpectedFieldType(field.type);
    if (expectedType) {
      expectedTypes.set(`input.${field.name}`, expectedType);
    }
  }
  for (const field of descriptor.settings) {
    const expectedType = normalizeExpectedFieldType(field.type);
    if (expectedType) {
      expectedTypes.set(`settings.${field.name}`, expectedType);
    }
  }
  for (const field of descriptor.outputs) {
    const expectedType = normalizeExpectedFieldType(field.type);
    if (expectedType) {
      expectedTypes.set(`output.${field.name}`, expectedType);
    }
  }

  return expectedTypes;
}

function normalizeExpectedFieldType(value?: string) {
  if (!value) {
    return undefined;
  }

  switch (value.toLowerCase()) {
    case "integer":
    case "int":
    case "long":
    case "float":
    case "double":
    case "number":
      return "number";
    case "bool":
    case "boolean":
      return "boolean";
    case "array":
      return "array";
    case "object":
    case "json":
    case "map":
      return "object";
    case "string":
      return "string";
    default:
      return undefined;
  }
}

function inferResolvedValueType(value: unknown) {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "object") {
    return "object";
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return typeof value;
  }
  return undefined;
}

function collectCoercionDiagnostics(
  value: unknown,
  path: string,
  diagnostics: Diagnostic[],
  sampleInput: MappingPreviewContext
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectCoercionDiagnostics(entry, `${path}[${index}]`, diagnostics, sampleInput));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, nestedValue] of Object.entries(value)) {
      collectCoercionDiagnostics(nestedValue, `${path}.${key}`, diagnostics, sampleInput);
    }
    return;
  }

  if (typeof value !== "string" || !value.includes("$")) {
    return;
  }
  if (value.includes("toType(") || value.includes("toString(")) {
    return;
  }

  const fieldName = path.split(".").at(-1)?.toLowerCase() ?? path.toLowerCase();
  const resolved = resolveMappingValue(value, sampleInput);
  const numericLike = /(count|size|length|timeout|interval|port|code|status|limit)/i.test(fieldName);
  const booleanLike = /(enabled|disabled|success|retry|dryrun|debug|active)/i.test(fieldName);

  if (numericLike) {
    diagnostics.push(
      createDiagnostic(
        "flogo.mapping.coercion.numeric",
        `Field "${path}" looks numeric; consider wrapping ${value} with toType(..., integer)`,
        "warning",
        path,
        { resolved }
      )
    );
    return;
  }

  if (booleanLike) {
    diagnostics.push(
      createDiagnostic(
        "flogo.mapping.coercion.boolean",
        `Field "${path}" looks boolean; consider wrapping ${value} with toType(..., boolean)`,
        "warning",
        path,
        { resolved }
      )
    );
  }
}
