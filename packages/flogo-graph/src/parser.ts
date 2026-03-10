import {
  type Diagnostic,
  FlogoAppGraphSchema,
  type FlogoAppGraph
} from "@flogo-agent/contracts";

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function parseFlogoApp(raw: string | Record<string, unknown>): FlogoAppGraph {
  const value = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : raw;
  const imports = Array.isArray(value.imports)
    ? value.imports.map((entry) => ({
        alias: String(toRecord(entry).alias ?? ""),
        ref: String(toRecord(entry).ref ?? ""),
        version: toRecord(entry).version ? String(toRecord(entry).version) : undefined
      }))
    : [];
  const triggers = Array.isArray(value.triggers)
    ? value.triggers.map((entry, triggerIndex) => {
        const trigger = toRecord(entry);
        const handlers = Array.isArray(trigger.handlers)
          ? trigger.handlers.map((handlerEntry) => {
              const handler = toRecord(handlerEntry);
              const action = toRecord(handler.action);
              return {
                settings: toRecord(handler.settings),
                actionRef: String(action.ref ?? ""),
                inputMappings: toRecord(handler.input),
                outputMappings: toRecord(handler.output)
              };
            })
          : [];

        return {
          id: String(trigger.id ?? `trigger_${triggerIndex}`),
          ref: String(trigger.ref ?? ""),
          settings: toRecord(trigger.settings),
          handlers
        };
      })
    : [];
  const resources = Array.isArray(value.resources)
    ? value.resources.map((entry, resourceIndex) => {
        const resource = toRecord(entry);
        const data = toRecord(resource.data);
        const tasks = Array.isArray(data.tasks)
          ? data.tasks.map((taskEntry, taskIndex) => {
              const task = toRecord(taskEntry);
              const activity = toRecord(task.activity);
              return {
                id: String(task.id ?? `task_${taskIndex}`),
                ref: String(activity.ref ?? task.ref ?? ""),
                input: toRecord(task.input),
                output: toRecord(task.output)
              };
            })
          : [];

        return {
          id: String(resource.id ?? `resource_${resourceIndex}`),
          type: String(resource.type ?? ""),
          data,
          tasks
        };
      })
    : [];

  const graph = {
    name: String(value.name ?? "unnamed"),
    type: String(value.type ?? "flogo:app"),
    appModel: String(value.appModel ?? "1.1.1"),
    imports,
    triggers,
    resources,
    diagnostics: [] as Diagnostic[]
  };

  return FlogoAppGraphSchema.parse(graph);
}

