import type { Diagnostic, FlogoAppGraph, ValidationReport } from "@flogo-agent/contracts";

function diagnostic(
  code: string,
  message: string,
  severity: Diagnostic["severity"],
  path?: string
): Diagnostic {
  return { code, message, severity, path };
}

export function validateStructural(graph: FlogoAppGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (graph.type !== "flogo:app") {
    diagnostics.push(diagnostic("app.type", "App type must be flogo:app", "error", "type"));
  }

  if (!graph.appModel) {
    diagnostics.push(
      diagnostic("app.appModel", "App model version is required", "error", "appModel")
    );
  }

  if (!graph.triggers.length) {
    diagnostics.push(diagnostic("app.triggers", "At least one trigger is recommended", "warning"));
  }

  return diagnostics;
}

export function validateSemantic(graph: FlogoAppGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const aliases = new Set(graph.imports.map((entry) => entry.alias));
  const resourceIds = new Set(graph.resources.map((resource) => resource.id));

  for (const trigger of graph.triggers) {
    if (!trigger.ref) {
      diagnostics.push(
        diagnostic("trigger.ref", `Trigger ${trigger.id} is missing a ref`, "error", trigger.id)
      );
    }

    for (const handler of trigger.handlers) {
      if (handler.actionRef.startsWith("#") && !aliases.has(handler.actionRef)) {
        diagnostics.push(
          diagnostic(
            "handler.actionRef",
            `Handler on ${trigger.id} references missing alias ${handler.actionRef}`,
            "error",
            trigger.id
          )
        );
      }

      if (handler.actionRef.startsWith("res://") && !resourceIds.has(handler.actionRef.slice(6))) {
        diagnostics.push(
          diagnostic(
            "handler.actionRef",
            `Handler on ${trigger.id} references missing resource ${handler.actionRef}`,
            "error",
            trigger.id
          )
        );
      }
    }
  }

  return diagnostics;
}

const mappingPattern = /\$(activity|flow|env|property)(?:\[([^\]]+)\])?/g;

export function validateMappings(graph: FlogoAppGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const taskIds = new Set(graph.resources.flatMap((resource) => resource.tasks.map((task) => task.id)));

  for (const resource of graph.resources) {
    for (const task of resource.tasks) {
      const mappingValues = [
        ...Object.values(task.input),
        ...Object.values(task.output)
      ].filter((value): value is string => typeof value === "string");

      for (const mapping of mappingValues) {
        for (const match of mapping.matchAll(mappingPattern)) {
          if (match[1] === "activity" && match[2] && !taskIds.has(match[2])) {
            diagnostics.push(
              diagnostic(
                "mapping.activity",
                `Mapping on task ${task.id} references missing activity ${match[2]}`,
                "error",
                resource.id
              )
            );
          }
        }
      }
    }
  }

  return diagnostics;
}

export function buildValidationReport(graph: FlogoAppGraph): ValidationReport {
  const structural = validateStructural(graph);
  const semantic = validateSemantic(graph);
  const mapping = validateMappings(graph);
  const combinedSemantic = [...semantic, ...mapping];

  return {
    summary: structural.concat(combinedSemantic).length
      ? "Validation found issues that should be resolved before execution."
      : "Validation completed without blocking findings.",
    stages: [
      { stage: "structural", ok: !structural.some((item) => item.severity === "error"), diagnostics: structural },
      { stage: "semantic", ok: !combinedSemantic.some((item) => item.severity === "error"), diagnostics: combinedSemantic },
      { stage: "dependency", ok: true, diagnostics: [] },
      { stage: "build", ok: true, diagnostics: [] },
      { stage: "runtime", ok: true, diagnostics: [] },
      { stage: "regression", ok: true, diagnostics: [] }
    ]
  };
}

