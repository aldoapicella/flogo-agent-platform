import type {
  FlogoAppGraph,
  ValidationIssue,
  ValidationReport
} from "@flogo-agent/contracts";

const issue = (
  code: string,
  severity: "info" | "warning" | "error",
  message: string,
  path?: string
): ValidationIssue => ({
  code,
  severity,
  message,
  path
});

const gatherAliases = (graph: FlogoAppGraph): Set<string> => {
  const aliases = new Set<string>();
  graph.imports.forEach((entry) => aliases.add(entry.alias));
  return aliases;
};

const collectRefStrings = (value: unknown, refs: string[] = []): string[] => {
  if (typeof value === "string" && value.startsWith("#")) {
    refs.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectRefStrings(item, refs));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectRefStrings(item, refs));
  }

  return refs;
};

export const validateStructural = (graph: FlogoAppGraph): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  if (graph.type !== "flogo:app") {
    issues.push(issue("app.type", "error", "Flogo app type must be flogo:app", "type"));
  }

  if (!graph.appModel) {
    issues.push(issue("app.model", "error", "appModel is required", "appModel"));
  }

  if (graph.triggers.length === 0) {
    issues.push(issue("app.triggers", "warning", "App has no triggers configured", "triggers"));
  }

  if (graph.resources.length === 0) {
    issues.push(issue("app.resources", "warning", "App has no resources configured", "resources"));
  }

  return issues;
};

export const validateSemantic = (graph: FlogoAppGraph): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const aliases = gatherAliases(graph);
  const flowIds = new Set(graph.resources.map((resource) => resource.id));
  const refCandidates = [
    ...collectRefStrings(graph.triggers),
    ...collectRefStrings(graph.resources)
  ];

  refCandidates
    .filter((ref) => ref.startsWith("#"))
    .forEach((ref) => {
      if (!aliases.has(ref) && ref !== "#unknown") {
        issues.push(issue("import.alias", "error", `Missing import for alias ${ref}`));
      }
    });

  graph.triggers.forEach((trigger, triggerIndex) => {
    trigger.handlers.forEach((handler, handlerIndex) => {
      const actionRef = handler.actionRef.replace(/^#/, "");
      const flowRef = actionRef.startsWith("flow:")
        ? actionRef
        : handler.settings.flowURI && typeof handler.settings.flowURI === "string"
          ? String(handler.settings.flowURI)
          : undefined;

      if (flowRef && !flowIds.has(flowRef)) {
        issues.push(
          issue(
            "trigger.flow",
            "error",
            `Handler references missing flow resource ${flowRef}`,
            `triggers.${triggerIndex}.handlers.${handlerIndex}.actionRef`
          )
        );
      }
    });
  });

  return issues;
};

const collectActivityRefs = (expression: string): string[] => {
  return Array.from(expression.matchAll(/\$activity\[([^\]]+)\]/g)).map((match) => match[1] ?? "");
};

export const validateMappings = (graph: FlogoAppGraph): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  graph.resources.forEach((resource, resourceIndex) => {
    const seenTaskIds = new Set<string>();

    resource.tasks.forEach((task, taskIndex) => {
      Object.values(task.input).forEach((value) => {
        if (typeof value !== "string") {
          return;
        }

        if (value.includes("$flow.") && resource.input.length === 0) {
          issues.push(
            issue(
              "mapping.flow",
              "warning",
              `Task ${task.id} references $flow without declared flow inputs`,
              `resources.${resourceIndex}.tasks.${taskIndex}.input`
            )
          );
        }

        collectActivityRefs(value).forEach((activityRef) => {
          if (!seenTaskIds.has(activityRef)) {
            issues.push(
              issue(
                "mapping.activity",
                "error",
                `Task ${task.id} references activity ${activityRef} before it exists`,
                `resources.${resourceIndex}.tasks.${taskIndex}.input`
              )
            );
          }
        });
      });

      seenTaskIds.add(task.id);
    });
  });

  return issues;
};

export const buildValidationReport = (graph: FlogoAppGraph): ValidationReport => ({
  structural: validateStructural(graph),
  semantic: validateSemantic(graph),
  dependency: [],
  build: [],
  runtime: [],
  regression: validateMappings(graph)
});
