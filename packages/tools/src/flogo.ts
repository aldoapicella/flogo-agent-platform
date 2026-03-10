import type {
  FlogoAppGraph,
  RunnerJobSpec,
  SmokeTestSpec,
  ToolResponse
} from "@flogo-agent/contracts";
import { buildValidationReport, parseFlogoApp } from "@flogo-agent/flogo-graph";

export class FlogoTooling {
  parseApp(raw: string | Record<string, unknown>): FlogoAppGraph {
    return parseFlogoApp(raw);
  }

  validateApp(raw: string | Record<string, unknown>): ToolResponse {
    const graph = this.parseApp(raw);
    const report = buildValidationReport(graph);

    return {
      ok: report.stages.every((stage) => stage.ok),
      summary: report.summary,
      data: { report },
      diagnostics: report.stages.flatMap((stage) => stage.diagnostics),
      artifacts: [],
      retryable: false
    };
  }

  generateApp(prompt: string): FlogoAppGraph {
    return parseFlogoApp({
      name: "generated-app",
      type: "flogo:app",
      appModel: "1.1.1",
      imports: [
        {
          alias: "#rest",
          ref: "github.com/project-flogo/contrib/trigger/rest"
        }
      ],
      triggers: [],
      resources: [],
      prompt
    });
  }

  patchApp(graph: FlogoAppGraph, updater: (current: FlogoAppGraph) => FlogoAppGraph): FlogoAppGraph {
    return updater(graph);
  }

  generateSmokeTests(graph: FlogoAppGraph): SmokeTestSpec[] {
    const restTrigger = graph.triggers.find((trigger) => trigger.ref.includes("rest"));
    const port = String(restTrigger?.settings.port ?? 9999);
    const handler = restTrigger?.handlers[0];
    const path = String(handler?.settings.path ?? "/health");
    const method = String(handler?.settings.method ?? "GET");

    return [
      {
        name: `${graph.name}-smoke`,
        method,
        url: `http://127.0.0.1:${port}${path}`,
        headers: {},
        expectedStatus: 200
      }
    ];
  }

  toRunnerSpec(graph: FlogoAppGraph, stepType: RunnerJobSpec["stepType"], snapshotUri: string): RunnerJobSpec {
    return {
      taskId: graph.name,
      stepType,
      snapshotUri,
      appPath: "flogo.json",
      env: {},
      timeoutSeconds: 300,
      outputUri: `${snapshotUri}/artifacts`
    };
  }
}

