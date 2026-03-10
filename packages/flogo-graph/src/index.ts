import {
  FlogoAppGraphSchema,
  FlogoAppSchema,
  type Diagnostic,
  type FlogoApp,
  type FlogoAppGraph,
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

export function parseFlogoAppDocument(document: string | FlogoApp | unknown): FlogoApp {
  const parsed = typeof document === "string" ? JSON.parse(document) : document;
  return FlogoAppSchema.parse(parsed);
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
    FlogoAppSchema.parse(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown structural validation failure";
    diagnostics.push(createDiagnostic("flogo.structural.invalid", message, "error"));
  }

  return stageResult("structural", diagnostics);
}

export function validateSemantic(document: string | FlogoApp | unknown): ValidationStageResult {
  const graph = buildAppGraph(document);
  const diagnostics: Diagnostic[] = [];
  const resourceIds = new Set(graph.resourceIds);
  const importAliases = new Set(Object.keys(graph.importsByAlias));

  for (const trigger of graph.app.triggers) {
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
        const alias = task.activityRef.slice(1).split(".")[0];
        if (!importAliases.has(alias) && alias !== "flow" && alias !== "rest") {
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
    if (!entry.ref.includes("/")) {
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

export function summarizeAppDiff(beforeDocument: string | FlogoApp | unknown, afterDocument: string | FlogoApp | unknown): string {
  const beforeGraph = buildAppGraph(beforeDocument);
  const afterGraph = buildAppGraph(afterDocument);
  const importDelta = afterGraph.app.imports.length - beforeGraph.app.imports.length;
  const triggerDelta = afterGraph.app.triggers.length - beforeGraph.app.triggers.length;
  const resourceDelta = afterGraph.app.resources.length - beforeGraph.app.resources.length;

  return [
    `imports ${importDelta >= 0 ? "+" : ""}${importDelta}`,
    `triggers ${triggerDelta >= 0 ? "+" : ""}${triggerDelta}`,
    `resources ${resourceDelta >= 0 ? "+" : ""}${resourceDelta}`
  ].join(", ");
}

