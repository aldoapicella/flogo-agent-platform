import {
  type FlogoAppGraph,
  FlogoAppGraphSchema,
  type FlogoImport,
  type FlogoResource,
  type FlogoTask,
  type ValidationIssue,
  type ValidationReport,
  ValidationReportSchema
} from "@flogo-agent/contracts";

type JsonObject = Record<string, unknown>;

function toObject(input: string | JsonObject): JsonObject {
  return typeof input === "string" ? (JSON.parse(input) as JsonObject) : input;
}

function normalizeImports(raw: unknown): FlogoImport[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is JsonObject => typeof item === "object" && item !== null)
      .map((item) => ({
        alias: String(item.alias ?? item.name ?? ""),
        ref: String(item.ref ?? ""),
        version: item.version ? String(item.version) : undefined
      }))
      .filter((item) => item.alias && item.ref);
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw as JsonObject).map(([alias, value]) => ({
      alias,
      ref: typeof value === "string" ? value : String((value as JsonObject).ref ?? ""),
      version:
        value && typeof value === "object" && "version" in (value as JsonObject)
          ? String((value as JsonObject).version)
          : undefined
    }));
  }

  return [];
}

function normalizeTasks(raw: unknown): FlogoTask[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is JsonObject => typeof item === "object" && item !== null)
    .map((item, index) => ({
      id: String(item.id ?? `task-${index}`),
      name: item.name ? String(item.name) : undefined,
      activityRef:
        typeof item.activity === "object" && item.activity !== null
          ? String((item.activity as JsonObject).ref ?? "")
          : item.activityRef
            ? String(item.activityRef)
            : undefined,
      inputMappings:
        typeof item.input === "object" && item.input !== null
          ? (item.input as Record<string, unknown>)
          : undefined,
      outputMappings:
        typeof item.output === "object" && item.output !== null
          ? (item.output as Record<string, unknown>)
          : undefined
    }));
}

function normalizeResources(raw: unknown): FlogoResource[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is JsonObject => typeof item === "object" && item !== null)
      .map((item, index) => ({
        id: String(item.id ?? `resource-${index}`),
        type: String(item.type ?? "flow"),
        input: Array.isArray(item.input) ? item.input.map(String) : [],
        output: Array.isArray(item.output) ? item.output.map(String) : [],
        tasks: normalizeTasks(item.tasks)
      }));
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw as JsonObject).map(([resourceId, value]) => {
      const resource = value as JsonObject;
      const data =
        typeof resource.data === "object" && resource.data !== null
          ? (resource.data as JsonObject)
          : resource;
      const metadata =
        typeof data.metadata === "object" && data.metadata !== null
          ? (data.metadata as JsonObject)
          : {};

      return {
        id: resourceId,
        type: String(resource.type ?? "flow"),
        input: Array.isArray(metadata.input) ? metadata.input.map(String) : [],
        output: Array.isArray(metadata.output) ? metadata.output.map(String) : [],
        tasks: normalizeTasks(data.tasks)
      };
    });
  }

  return [];
}

function normalizeTriggers(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is JsonObject => typeof item === "object" && item !== null)
    .map((trigger, index) => ({
      id: String(trigger.id ?? `trigger-${index}`),
      ref: String(trigger.ref ?? ""),
      settings:
        typeof trigger.settings === "object" && trigger.settings !== null
          ? (trigger.settings as Record<string, unknown>)
          : {},
      handlers: Array.isArray(trigger.handlers)
        ? trigger.handlers
            .filter((item): item is JsonObject => typeof item === "object" && item !== null)
            .map((handler, handlerIndex) => ({
              id: String(handler.id ?? `${trigger.id ?? `trigger-${index}`}-handler-${handlerIndex}`),
              actionRef:
                typeof handler.action === "object" && handler.action !== null
                  ? String((handler.action as JsonObject).ref ?? "")
                  : String(handler.actionRef ?? ""),
              settings:
                typeof handler.settings === "object" && handler.settings !== null
                  ? (handler.settings as Record<string, unknown>)
                  : {},
              inputMappings:
                typeof handler.input === "object" && handler.input !== null
                  ? (handler.input as Record<string, unknown>)
                  : undefined,
              outputMappings:
                typeof handler.output === "object" && handler.output !== null
                  ? (handler.output as Record<string, unknown>)
                  : undefined
            }))
        : []
    }));
}

function emptyReport(): ValidationReport {
  return ValidationReportSchema.parse({});
}

function addIssue(issues: ValidationIssue[], code: string, message: string, path?: string) {
  issues.push({ code, message, path, severity: "error" });
}

function collectExpressions(value: unknown, expressions: string[] = []): string[] {
  if (typeof value === "string") {
    expressions.push(value);
    return expressions;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectExpressions(item, expressions));
    return expressions;
  }

  if (value && typeof value === "object") {
    Object.values(value as JsonObject).forEach((item) => collectExpressions(item, expressions));
  }

  return expressions;
}

export function parseFlogoApp(input: string | JsonObject): FlogoAppGraph {
  const raw = toObject(input);
  return FlogoAppGraphSchema.parse({
    name: String(raw.name ?? "Unnamed Flogo App"),
    type: String(raw.type ?? "flogo:app"),
    appModel: String(raw.appModel ?? raw.app_model ?? ""),
    imports: normalizeImports(raw.imports),
    triggers: normalizeTriggers(raw.triggers),
    resources: normalizeResources(raw.resources),
    diagnostics: []
  });
}

export function validateStructural(input: string | JsonObject): ValidationReport {
  const raw = toObject(input);
  const report = emptyReport();

  if (raw.type !== "flogo:app") {
    addIssue(report.structural.issues, "invalid_type", "Root `type` must be `flogo:app`.", "type");
  }

  if (!raw.appModel && !raw.app_model) {
    addIssue(report.structural.issues, "missing_app_model", "`appModel` is required.", "appModel");
  }

  if (!Array.isArray(raw.triggers)) {
    addIssue(report.structural.issues, "missing_triggers", "`triggers` must be an array.", "triggers");
  }

  if (!raw.resources || (typeof raw.resources !== "object" && !Array.isArray(raw.resources))) {
    addIssue(report.structural.issues, "missing_resources", "`resources` must be present.", "resources");
  }

  report.structural.valid = report.structural.issues.length === 0;
  report.overallValid = report.structural.valid;
  return report;
}

export function validateSemantic(input: string | JsonObject): ValidationReport {
  const graph = parseFlogoApp(input);
  const report = emptyReport();
  const importAliases = new Set(graph.imports.map((item) => item.alias));
  const resourceIds = new Set(graph.resources.map((item) => item.id));

  graph.triggers.forEach((trigger) => {
    trigger.handlers.forEach((handler) => {
      if (handler.actionRef.startsWith("#") && !importAliases.has(handler.actionRef.slice(1))) {
        addIssue(
          report.semantic.issues,
          "missing_import_alias",
          `Handler ${handler.id} references missing import alias ${handler.actionRef}.`,
          `triggers.${trigger.id}.handlers.${handler.id}.actionRef`
        );
      }

      if (handler.actionRef.includes("flow:")) {
        const resourceId = handler.actionRef.split(":").pop();
        if (resourceId && !resourceIds.has(resourceId)) {
          addIssue(
            report.semantic.issues,
            "missing_flow_resource",
            `Handler ${handler.id} points to missing resource ${resourceId}.`,
            `triggers.${trigger.id}.handlers.${handler.id}.actionRef`
          );
        }
      }
    });
  });

  graph.resources.forEach((resource) => {
    resource.tasks.forEach((task) => {
      if (task.activityRef?.startsWith("#") && !importAliases.has(task.activityRef.slice(1))) {
        addIssue(
          report.semantic.issues,
          "missing_activity_alias",
          `Task ${task.id} references missing import alias ${task.activityRef}.`,
          `resources.${resource.id}.tasks.${task.id}.activityRef`
        );
      }

      collectExpressions(task.inputMappings)
        .concat(collectExpressions(task.outputMappings))
        .forEach((expression) => {
          const activityMatches = expression.match(/\$activity\[(?<id>[^\]]+)\]/g);
          activityMatches?.forEach((match) => {
            const activityId = match.replace("$activity[", "").replace("]", "");
            const known = resource.tasks.some((candidate) => candidate.id === activityId);
            if (!known) {
              addIssue(
                report.semantic.issues,
                "invalid_activity_reference",
                `Task ${task.id} references unknown activity ${activityId}.`,
                `resources.${resource.id}.tasks.${task.id}`
              );
            }
          });

          if (expression.includes("$flow.") && resource.type !== "flow") {
            addIssue(
              report.semantic.issues,
              "invalid_flow_scope",
              `Task ${task.id} uses $flow outside a flow resource.`,
              `resources.${resource.id}.tasks.${task.id}`
            );
          }
        });
    });
  });

  report.semantic.valid = report.semantic.issues.length === 0;
  report.overallValid = report.semantic.valid;
  return report;
}

export function validateFlogoApp(input: string | JsonObject): ValidationReport {
  const structural = validateStructural(input);
  const semantic = validateSemantic(input);

  return {
    structural: structural.structural,
    semantic: semantic.semantic,
    dependency: { valid: true, issues: [] },
    build: { valid: true, issues: [] },
    runtime: { valid: true, issues: [] },
    regression: { valid: true, issues: [] },
    overallValid: structural.structural.valid && semantic.semantic.valid
  };
}

export function summarizeGraphDiff(before: FlogoAppGraph, after: FlogoAppGraph): string[] {
  const summary: string[] = [];
  if (before.imports.length !== after.imports.length) {
    summary.push(`Imports: ${before.imports.length} -> ${after.imports.length}`);
  }
  if (before.triggers.length !== after.triggers.length) {
    summary.push(`Triggers: ${before.triggers.length} -> ${after.triggers.length}`);
  }
  if (before.resources.length !== after.resources.length) {
    summary.push(`Resources: ${before.resources.length} -> ${after.resources.length}`);
  }
  return summary.length > 0 ? summary : ["No structural graph changes detected."];
}

