import {
  flogoAppGraphSchema,
  type FlogoAppGraph,
  type FlogoFlow,
  type FlogoImport,
  type FlogoTask,
  type FlogoTrigger
} from "@flogo-agent/contracts";

const normalizeImports = (rawImports: unknown): FlogoImport[] => {
  if (!Array.isArray(rawImports)) {
    return [];
  }

  return rawImports.flatMap((entry) => {
    if (typeof entry === "string") {
      const alias = entry.split("/").at(-1)?.split(".").at(0) ?? entry;
      return [{ alias: `#${alias}`, ref: entry }];
    }

    if (entry && typeof entry === "object") {
      const maybeAlias =
        typeof (entry as Record<string, unknown>).alias === "string"
          ? ((entry as Record<string, unknown>).alias as string)
          : undefined;
      const maybeRef =
        typeof (entry as Record<string, unknown>).ref === "string"
          ? ((entry as Record<string, unknown>).ref as string)
          : undefined;

      if (maybeAlias && maybeRef) {
        return [{ alias: maybeAlias, ref: maybeRef }];
      }
    }

    return [];
  });
};

const normalizeTasks = (rawTasks: unknown): FlogoTask[] => {
  if (!Array.isArray(rawTasks)) {
    return [];
  }

  return rawTasks
    .map((task, index) => {
      const value = (task ?? {}) as Record<string, unknown>;
      const settings = (value.settings ?? {}) as Record<string, unknown>;

      return {
        id: typeof value.id === "string" ? value.id : `task_${index + 1}`,
        name: typeof value.name === "string" ? value.name : undefined,
        ref:
          typeof value.activityRef === "string"
            ? value.activityRef
            : typeof value.ref === "string"
              ? value.ref
              : "#unknown",
        input: typeof settings.input === "object" && settings.input !== null ? settings.input : {},
        output: typeof settings.output === "object" && settings.output !== null ? settings.output : {}
      };
    })
    .filter((task) => task.ref.length > 0);
};

const normalizeResources = (rawResources: unknown): FlogoFlow[] => {
  if (!Array.isArray(rawResources)) {
    return [];
  }

  return rawResources.flatMap((resource, index) => {
    const value = (resource ?? {}) as Record<string, unknown>;
    const data = (value.data ?? value.resource ?? {}) as Record<string, unknown>;
    const metadata = (data.metadata ?? {}) as Record<string, unknown>;

    if (typeof value.id !== "string") {
      return [];
    }

    return [
      {
        id: value.id,
        name: typeof value.name === "string" ? value.name : `flow_${index + 1}`,
        input: Array.isArray(metadata.input)
          ? metadata.input.map((item) =>
              typeof item === "string"
                ? item
                : typeof (item as Record<string, unknown>).name === "string"
                  ? ((item as Record<string, unknown>).name as string)
                  : "input"
            )
          : [],
        output: Array.isArray(metadata.output)
          ? metadata.output.map((item) =>
              typeof item === "string"
                ? item
                : typeof (item as Record<string, unknown>).name === "string"
                  ? ((item as Record<string, unknown>).name as string)
                  : "output"
            )
          : [],
        tasks: normalizeTasks(data.tasks)
      }
    ];
  });
};

const normalizeTriggers = (rawTriggers: unknown): FlogoTrigger[] => {
  if (!Array.isArray(rawTriggers)) {
    return [];
  }

  return rawTriggers.map((trigger, index) => {
    const value = (trigger ?? {}) as Record<string, unknown>;
    const handlers = Array.isArray(value.handlers) ? value.handlers : [];

    return {
      id: typeof value.id === "string" ? value.id : `trigger_${index + 1}`,
      ref:
        typeof value.ref === "string"
          ? value.ref
          : typeof value.activityRef === "string"
            ? value.activityRef
            : "#unknown",
      handlers: handlers.map((handler) => {
        const item = (handler ?? {}) as Record<string, unknown>;
        const action = (item.action ?? {}) as Record<string, unknown>;

        return {
          actionRef: typeof action.ref === "string" ? action.ref : "#unknown",
          settings: typeof item.settings === "object" && item.settings !== null ? item.settings : {},
          input: typeof item.input === "object" && item.input !== null ? item.input : {},
          output: typeof item.output === "object" && item.output !== null ? item.output : {}
        };
      })
    };
  });
};

export const parseFlogoJson = (source: string | Record<string, unknown>): FlogoAppGraph => {
  const raw = typeof source === "string" ? (JSON.parse(source) as Record<string, unknown>) : source;

  const graph: FlogoAppGraph = {
    name: typeof raw.name === "string" ? raw.name : "unnamed-app",
    type: typeof raw.type === "string" ? raw.type : "flogo:app",
    appModel: typeof raw.appModel === "string" ? raw.appModel : "1.1.0",
    imports: normalizeImports(raw.imports),
    triggers: normalizeTriggers(raw.triggers),
    resources: normalizeResources(raw.resources),
    diagnostics: []
  };

  return flogoAppGraphSchema.parse(graph);
};
