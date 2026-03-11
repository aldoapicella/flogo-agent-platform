import type { TaskRequest, ToolResponse, FlogoApp, ContribCatalog, ContribDescriptor } from "@flogo-agent/contracts";
import {
  buildContribCatalog,
  defineProperties,
  introspectContrib,
  parseFlogoAppDocument,
  summarizeAppDiff,
  validateAliases,
  validateFlogoApp,
  validateMappings
} from "@flogo-agent/flogo-graph";

import { toolResponse } from "./shared.js";

export class FlogoCoreTools {
  parseApp(raw: string | FlogoApp | unknown): ToolResponse {
    const app = parseFlogoAppDocument(raw);
    return toolResponse({
      ok: true,
      summary: `Parsed ${app.name}`,
      data: { app },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }

  validateApp(raw: string | FlogoApp | unknown): ToolResponse {
    const report = validateFlogoApp(raw);
    return toolResponse({
      ok: report.ok,
      summary: report.summary,
      data: { validationReport: report },
      diagnostics: report.stages.flatMap((stage) => stage.diagnostics),
      artifacts: report.artifacts,
      retryable: false
    });
  }

  validateMappings(raw: string | FlogoApp | unknown): ToolResponse {
    const report = validateMappings(raw);
    return toolResponse({
      ok: report.ok,
      summary: report.ok ? "Mappings are valid." : "Mappings need fixes.",
      data: { validationReport: report },
      diagnostics: report.diagnostics,
      artifacts: [],
      retryable: false
    });
  }

  validateAliases(raw: string | FlogoApp | unknown): ToolResponse {
    const diagnostics = validateAliases(raw);
    return toolResponse({
      ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      summary: diagnostics.length === 0 ? "Alias validation passed." : "Alias validation found issues.",
      data: { diagnostics },
      diagnostics,
      artifacts: [],
      retryable: false
    });
  }

  catalogContribs(raw: string | FlogoApp | unknown): ToolResponse {
    const catalog: ContribCatalog = buildContribCatalog(raw);
    return toolResponse({
      ok: true,
      summary: `Cataloged ${catalog.entries.length} Flogo contributions`,
      data: { catalog },
      diagnostics: catalog.diagnostics,
      artifacts: [],
      retryable: false
    });
  }

  introspectDescriptor(raw: string | FlogoApp | unknown, refOrAlias: string): ToolResponse {
    const descriptor: ContribDescriptor | undefined = introspectContrib(raw, refOrAlias);
    return toolResponse({
      ok: Boolean(descriptor),
      summary: descriptor ? `Resolved descriptor for ${descriptor.name}` : `Unable to resolve descriptor for ${refOrAlias}`,
      data: { descriptor },
      diagnostics: descriptor
        ? []
        : [
            {
              code: "flogo.catalog.missing_descriptor",
              message: `No descriptor found for ${refOrAlias}`,
              severity: "warning"
            }
          ],
      artifacts: [],
      retryable: false
    });
  }

  generateApp(task: TaskRequest): ToolResponse {
    const generated = parseFlogoAppDocument({
      name: task.summary.replace(/\s+/g, "-").toLowerCase(),
      type: "flogo:app",
      appModel: "1.1.0",
      imports: [],
      properties: [],
      triggers: [],
      resources: []
    });

    return toolResponse({
      ok: true,
      summary: `Generated base Flogo app for ${task.summary}`,
      data: { app: generated },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }

  patchApp(document: string | FlogoApp | unknown, patcher: (app: FlogoApp) => FlogoApp): ToolResponse {
    const app = parseFlogoAppDocument(document);
    const nextApp = patcher(app);
    return toolResponse({
      ok: true,
      summary: summarizeAppDiff(app, nextApp),
      data: { app: nextApp },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }

  defineProperties(document: string | FlogoApp | unknown, properties: FlogoApp["properties"]): ToolResponse {
    const app = defineProperties(document, properties);
    return toolResponse({
      ok: true,
      summary: `Updated app properties; app now defines ${app.properties.length} properties`,
      data: { app, properties: app.properties },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }

  installContrib(contribRef: string): ToolResponse {
    return toolResponse({
      ok: true,
      summary: `Queued install for ${contribRef}`,
      data: { contribRef },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }

  listContribs(filter?: string): ToolResponse {
    const contribs = [
      "github.com/project-flogo/contrib/activity/log",
      "github.com/project-flogo/contrib/trigger/rest",
      "github.com/project-flogo/contrib/trigger/timer"
    ].filter((entry) => (filter ? entry.includes(filter) : true));

    return toolResponse({
      ok: true,
      summary: `Returned ${contribs.length} contrib references`,
      data: { contribs },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }
}
