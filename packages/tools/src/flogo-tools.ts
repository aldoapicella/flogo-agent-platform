import type { FlogoAppGraph, ToolResult, ValidationReport } from "@flogo-agent/contracts";
import { buildValidationReport, parseFlogoJson } from "@flogo-agent/flogo-graph";

const ok = (summary: string, data?: unknown): ToolResult => ({
  ok: true,
  summary,
  data,
  diagnostics: [],
  artifacts: [],
  retryable: false
});

export class FlogoTools {
  parseApp(input: string | Record<string, unknown>): ToolResult {
    const graph = parseFlogoJson(input);
    return ok(`Parsed app ${graph.name}`, graph);
  }

  validateApp(graph: FlogoAppGraph): ToolResult {
    const report: ValidationReport = buildValidationReport(graph);
    return ok(`Validated app ${graph.name}`, report);
  }

  validateMappings(graph: FlogoAppGraph): ToolResult {
    const report = buildValidationReport(graph);
    return ok(`Validated mappings for ${graph.name}`, report.regression);
  }

  generateApp(intent: { name: string; description: string }): ToolResult {
    const app: FlogoAppGraph = {
      name: intent.name,
      type: "flogo:app",
      appModel: "1.1.0",
      imports: [],
      triggers: [],
      resources: [],
      diagnostics: []
    };

    return ok(`Generated app shell for ${intent.name}`, app);
  }

  patchApp(graph: FlogoAppGraph, patchSummary: string): ToolResult {
    return ok(`Prepared app patch for ${graph.name}`, {
      graph,
      patchSummary
    });
  }

  installContrib(ref: string): ToolResult {
    return ok(`Scheduled contrib install ${ref}`, { ref });
  }

  listContribs(): ToolResult {
    return ok("Listed contrib placeholders", {
      contribs: ["github.com/project-flogo/contrib/activity/log", "github.com/project-flogo/contrib/trigger/rest"]
    });
  }
}
