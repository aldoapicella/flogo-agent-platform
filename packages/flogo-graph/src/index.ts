import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  CompositionCompareRequestSchema,
  type CompositionCompareRequest,
  CompositionCompareResultSchema,
  type CompositionCompareResult,
  ContribCatalogSchema,
  type ContribCatalog,
  ContribDescriptorSchema,
  type ContribDescriptor,
  ContribDescriptorResponseSchema,
  type ContribDescriptorResponse,
  ContribResolutionEvidenceSchema,
  type ContribResolutionEvidence,
  type Diagnostic,
  FlogoAppGraphSchema,
  FlogoAppSchema,
  type FlogoApp,
  type FlogoAppGraph,
  type FlogoFlow,
  GovernanceReportSchema,
  type GovernanceReport,
  MappingKindSchema,
  MappingPreviewResultSchema,
  type MappingPreviewContext,
  type MappingPreviewField,
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
      const references = new Set<string>();
      collectActivityReferences(task.input, references);
      collectActivityReferences(task.settings, references);
      collectActivityReferences(task.output, references);

      for (const reference of references) {
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

export function buildContribCatalog(document: string | FlogoApp | unknown, options?: ContribLookupOptions): ContribCatalog {
  const app = parseFlogoAppDocument(document);
  const entries = new Map<string, ContribDescriptor>();
  const diagnostics: Diagnostic[] = [];

  const upsert = (entry: ContribDescriptor) => {
    const key = `${entry.type}:${entry.alias ?? entry.ref}`;
    entries.set(key, ContribDescriptorSchema.parse(entry));
  };

  for (const entry of app.imports) {
    const resolved = resolveDescriptor(app, entry.ref, entry.alias, entry.version, undefined, options);
    upsert(resolved.descriptor);
    diagnostics.push(...resolved.diagnostics);
  }

  for (const trigger of app.triggers) {
    const resolved = resolveDescriptor(app, trigger.ref, inferAliasFromRef(trigger.ref), undefined, "trigger", options);
    upsert(withCatalogRef(resolved.descriptor, trigger.ref));
    diagnostics.push(...resolved.diagnostics);
  }

  for (const resource of app.resources) {
    upsert(
      ContribDescriptorSchema.parse({
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
        evidence: createDescriptorEvidence("flow_resource", `#flow:${resource.id}`, "flow")
      })
    );

    for (const task of resource.data.tasks) {
      if (!task.activityRef) {
        continue;
      }
      const resolved = resolveDescriptor(app, task.activityRef, inferAliasFromRef(task.activityRef), undefined, undefined, options);
      upsert(withCatalogRef(resolved.descriptor, task.activityRef));
      diagnostics.push(...resolved.diagnostics);
    }
  }

  return ContribCatalogSchema.parse({
    appName: app.name,
    entries: Array.from(entries.values()).sort((left, right) => left.name.localeCompare(right.name)),
    diagnostics: dedupeDiagnostics(diagnostics)
  });
}

export function inspectContribDescriptor(
  document: string | FlogoApp | unknown,
  refOrAlias: string,
  options?: ContribLookupOptions
): ContribDescriptorResponse | undefined {
  const app = parseFlogoAppDocument(document);
  const flowDescriptor = resolveFlowDescriptor(app, refOrAlias);
  if (flowDescriptor) {
    return ContribDescriptorResponseSchema.parse({
      descriptor: flowDescriptor,
      diagnostics: []
    });
  }

  const appRef = resolveAppRef(app, refOrAlias);
  if (!appRef) {
    return undefined;
  }

  const resolved = resolveDescriptor(app, appRef.ref, appRef.alias, appRef.version, appRef.forcedType, options);
  return ContribDescriptorResponseSchema.parse({
    descriptor: resolved.descriptor,
    diagnostics: dedupeDiagnostics(resolved.diagnostics)
  });
}

export function introspectContrib(
  document: string | FlogoApp | unknown,
  refOrAlias: string,
  options?: ContribLookupOptions
): ContribDescriptor | undefined {
  return inspectContribDescriptor(document, refOrAlias, options)?.descriptor;
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
      suggestedCoercions: [],
      diagnostics: [createDiagnostic("flogo.mapping.node_not_found", `Unable to locate node "${nodeId}"`, "error", nodeId)]
    });
  }

  const fieldEntries: MappingPreviewField[] = [
    ...collectMappingFields("input", located.task.input, sampleInput),
    ...collectMappingFields("settings", located.task.settings, sampleInput),
    ...collectMappingFields("output", located.task.output, sampleInput)
  ];
  const suggestedCoercions = suggestCoercions(app, sampleInput).filter((diagnostic) => diagnostic.path?.startsWith(nodeId));

  return MappingPreviewResultSchema.parse({
    nodeId,
    flowId: located.flowId,
    fields: fieldEntries,
    suggestedCoercions,
    diagnostics: fieldEntries.flatMap((field) => field.diagnostics)
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
      const sections = [
        ["input", task.input] as const,
        ["settings", task.settings] as const,
        ["output", task.output] as const
      ];

      for (const [section, value] of sections) {
        collectCoercionDiagnostics(value, `${task.id}.${section}`, diagnostics, sampleInput);
      }
    }
  }

  return diagnostics;
}

export function analyzePropertyUsage(document: string | FlogoApp | unknown): PropertyPlan {
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

  return PropertyPlanSchema.parse({
    declaredProperties: Array.from(declaredProperties).sort(),
    propertyRefs: Array.from(propertyRefs).sort(),
    envRefs: Array.from(envRefs).sort(),
    undefinedPropertyRefs: Array.from(undefinedPropertyRefs).sort(),
    unusedProperties,
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
    recommendedEnv: Array.from(envRefs)
      .sort()
      .map((name) => ({
        name,
        rationale: "This environment variable is referenced through $env and should be supplied per deployment environment."
      })),
    deploymentNotes: buildDeploymentNotes(propertyRefs, envRefs, undefinedPropertyRefs, unusedProperties),
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
  const catalogDiagnostics = buildContribCatalog(app, options).diagnostics;

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
    for (const handler of trigger.handlers) {
      trackRefUsage(handler.action.ref, `triggers.${trigger.id}.handlers.action`, "action");
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
    ...catalogDiagnostics
  ]);

  return GovernanceReportSchema.parse({
    appName: app.name,
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    aliasIssues,
    orphanedRefs,
    versionFindings,
    diagnostics
  });
}

export function compareJsonVsProgrammatic(
  document: string | FlogoApp | unknown,
  requestInput?: CompositionCompareRequest | unknown
): CompositionCompareResult {
  const app = parseFlogoAppDocument(document);
  const request = CompositionCompareRequestSchema.parse(requestInput ?? {});
  const diagnostics: Diagnostic[] = [];

  const canonicalProjection = buildCanonicalProjection(app, request);
  const programmaticProjection = buildProgrammaticProjection(app, request, diagnostics);
  const differences = diffComposition("app", canonicalProjection, programmaticProjection);
  const canonicalHash = createHash("sha256").update(stableStringify(canonicalProjection)).digest("hex");
  const programmaticHash = createHash("sha256").update(stableStringify(programmaticProjection)).digest("hex");

  return CompositionCompareResultSchema.parse({
    appName: app.name,
    ok:
      diagnostics.every((diagnostic) => diagnostic.severity !== "error") &&
      differences.every((difference) => difference.severity !== "error"),
    canonicalHash,
    programmaticHash,
    differences,
    diagnostics
  });
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
    evidence: createDescriptorEvidence(registryMatch ? "registry" : "inferred", ref, normalizedAlias, version)
  });
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
  const descriptorFile = findDescriptorFile(resolvedRef, options);

  if (descriptorFile) {
    const source = inferDescriptorSourceFromPath(descriptorFile, resolvedRef);
    return {
      descriptor: parseDescriptorFile(descriptorFile, resolvedRef, normalizedAlias, version, forcedType, source),
      diagnostics: []
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

  return ContribDescriptorSchema.parse({
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
    evidence: createDescriptorEvidence("flow_resource", `#flow:${resource.id}`, "flow")
  });
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

function resolveImportRef(app: FlogoApp, ref: string, alias?: string) {
  if (!ref.startsWith("#")) {
    return ref;
  }

  const normalizedAlias = normalizeAlias(alias ?? ref);
  const match = app.imports.find((entry) => entry.alias === normalizedAlias);
  return match?.ref ?? ref;
}

function findDescriptorFile(ref: string, options?: ContribLookupOptions) {
  const normalizedRef = ref.replace(/^#/, "").replace(/\\/g, "/");
  const searchRoots = buildSearchRoots(options);
  const refBasename = normalizedRef.split("/").filter(Boolean).at(-1);

  for (const root of searchRoots) {
    const candidates = [
      path.join(root, normalizedRef, "descriptor.json"),
      path.join(root, "vendor", normalizedRef, "descriptor.json"),
      path.join(root, ".flogo", "descriptors", normalizedRef, "descriptor.json"),
      path.join(root, "descriptors", normalizedRef, "descriptor.json"),
      refBasename ? path.join(root, refBasename, "descriptor.json") : undefined,
      refBasename ? path.join(root, "descriptors", refBasename, "descriptor.json") : undefined
    ].filter((candidate): candidate is string => Boolean(candidate));

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
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

function parseDescriptorFile(
  descriptorPath: string,
  ref: string,
  alias?: string,
  version?: string,
  forcedType?: ContribDescriptor["type"],
  source: "descriptor" | "workspace_descriptor" = "descriptor"
): ContribDescriptor {
  const raw = JSON.parse(readFileSync(descriptorPath, "utf8")) as Record<string, unknown>;
  const fieldSet = (value: unknown) => normalizeDescriptorFields(value);
  const descriptorType = normalizeDescriptorType(raw.type) ?? forcedType ?? inferContribType(ref);

  return ContribDescriptorSchema.parse({
    ref,
    alias,
    type: descriptorType,
    name: typeof raw.name === "string" ? raw.name : alias ?? inferNameFromRef(ref),
    version: typeof raw.version === "string" ? raw.version : version,
    title: typeof raw.title === "string" ? raw.title : undefined,
    settings: fieldSet(raw.settings),
    inputs: fieldSet(raw.input ?? raw.inputs),
    outputs: fieldSet(raw.output ?? raw.outputs),
    examples: normalizeStringArray(raw.examples),
    compatibilityNotes: normalizeStringArray(raw.compatibilityNotes),
    source,
    evidence: createDescriptorEvidence(source, ref, alias, version, descriptorPath)
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
  diagnostics: Diagnostic[] = []
): ContribResolutionEvidence {
  return ContribResolutionEvidenceSchema.parse({
    source,
    resolvedRef,
    descriptorPath,
    importAlias,
    version,
    diagnostics
  });
}

function inferDescriptorSourceFromPath(descriptorPath: string, ref: string): "descriptor" | "workspace_descriptor" {
  const normalizedPath = descriptorPath.replace(/\\/g, "/");
  const normalizedRef = ref.replace(/^#/, "").replace(/\\/g, "/");
  if (
    normalizedPath.includes(`/vendor/${normalizedRef}/descriptor.json`) ||
    normalizedPath.includes(`/.flogo/descriptors/${normalizedRef}/descriptor.json`) ||
    normalizedPath.includes(`/descriptors/${normalizedRef}/descriptor.json`)
  ) {
    return "descriptor";
  }

  return "workspace_descriptor";
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
          actionRef: handler.action.ref,
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
  diagnostics: Diagnostic[]
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
