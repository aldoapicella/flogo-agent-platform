import { createTwoFilesPatch } from "diff";
import fg from "fast-glob";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  ArtifactRefSchema,
  type ArtifactRef,
  type FlogoApp,
  type RunnerJobResult,
  RunnerJobResultSchema,
  RunnerJobSpecSchema,
  type SmokeTestSpec,
  SmokeTestSpecSchema,
  type TaskRequest,
  type ToolResponse,
  ToolResponseSchema
} from "@flogo-agent/contracts";
import {
  buildAppGraph,
  parseFlogoAppDocument,
  summarizeAppDiff,
  validateFlogoApp,
  validateMappings
} from "@flogo-agent/flogo-graph";

function toolResponse(partial: ToolResponse): ToolResponse {
  return ToolResponseSchema.parse(partial);
}

async function ensureAbsolutePath(rootPath: string, candidatePath: string): Promise<string> {
  return path.isAbsolute(candidatePath) ? candidatePath : path.join(rootPath, candidatePath);
}

export class RepoTools {
  constructor(private readonly rootPath: string) {}

  async read(filePath: string): Promise<ToolResponse> {
    const absolutePath = await ensureAbsolutePath(this.rootPath, filePath);
    const content = await fs.readFile(absolutePath, "utf8");
    return toolResponse({
      ok: true,
      summary: `Read ${filePath}`,
      data: { filePath: absolutePath, content },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }

  async search(pattern: string, cwd = "."): Promise<ToolResponse> {
    const files = await fg("**/*", {
      cwd: path.join(this.rootPath, cwd),
      onlyFiles: true,
      dot: false,
      ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**"]
    });
    const results: Array<{ file: string; matches: number }> = [];

    for (const file of files) {
      const content = await fs.readFile(path.join(this.rootPath, cwd, file), "utf8");
      const matches = content.match(new RegExp(pattern, "g"))?.length ?? 0;
      if (matches > 0) {
        results.push({ file, matches });
      }
    }

    return toolResponse({
      ok: true,
      summary: `Search completed with ${results.length} matching files`,
      data: { results },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }

  async diff(filePath: string, nextContent: string): Promise<ToolResponse> {
    const absolutePath = await ensureAbsolutePath(this.rootPath, filePath);
    const currentContent = await fs.readFile(absolutePath, "utf8");
    const diffText = createTwoFilesPatch(filePath, filePath, currentContent, nextContent);
    return toolResponse({
      ok: true,
      summary: `Computed diff for ${filePath}`,
      data: { diff: diffText },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }

  async writePatch(filePath: string, nextContent: string): Promise<ToolResponse> {
    const absolutePath = await ensureAbsolutePath(this.rootPath, filePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, nextContent, "utf8");
    return toolResponse({
      ok: true,
      summary: `Updated ${filePath}`,
      data: { filePath: absolutePath },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }
}

export class FlogoTools {
  parseApp(raw: string | FlogoApp | unknown): ToolResponse {
    const graph = buildAppGraph(raw);
    return toolResponse({
      ok: true,
      summary: `Parsed ${graph.app.name}`,
      data: { graph },
      diagnostics: graph.diagnostics,
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

  generateApp(task: TaskRequest): ToolResponse {
    const generated = parseFlogoAppDocument({
      name: task.summary.replace(/\s+/g, "-").toLowerCase(),
      type: "flogo:app",
      appModel: "1.1.0",
      imports: [],
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
    return toolResponse({
      ok: true,
      summary: "Returned placeholder contrib list",
      data: {
        contribs: [
          "github.com/project-flogo/contrib/activity/log",
          "github.com/project-flogo/contrib/trigger/rest"
        ].filter((entry) => (filter ? entry.includes(filter) : true))
      },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }
}

export interface RunnerDispatcher {
  dispatch(spec: unknown): Promise<RunnerJobResult>;
}

export class LocalRunnerDispatcher implements RunnerDispatcher {
  async dispatch(spec: unknown): Promise<RunnerJobResult> {
    const job = RunnerJobSpecSchema.parse(spec);
    return RunnerJobResultSchema.parse({
      jobId: `${job.taskId}-${job.stepType}`,
      ok: true,
      summary: `Prepared local runner job for ${job.stepType}`,
      exitCode: 0,
      artifacts: [],
      diagnostics: []
    });
  }
}

export class RunnerTools {
  constructor(private readonly dispatcher: RunnerDispatcher = new LocalRunnerDispatcher()) {}

  async buildApp(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch(parsed);
    return toolResponse({
      ok: result.ok,
      summary: `Queued build job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async runApp(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({ ...parsed, stepType: "run" });
    return toolResponse({
      ok: result.ok,
      summary: `Queued run job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }

  async collectLogs(spec: unknown): Promise<ToolResponse> {
    const parsed = RunnerJobSpecSchema.parse(spec);
    const result = await this.dispatcher.dispatch({ ...parsed, stepType: "collect_logs" });
    return toolResponse({
      ok: result.ok,
      summary: `Queued log collection job ${result.jobId}`,
      data: { spec: parsed, result },
      diagnostics: result.diagnostics,
      artifacts: result.artifacts,
      retryable: false
    });
  }
}

export class TestTools {
  generateSmoke(appUrl: string): ToolResponse {
    const smokeTest = SmokeTestSpecSchema.parse({
      name: "default-smoke",
      url: appUrl,
      assertions: [
        {
          field: "status",
          operator: "equals",
          expected: 200
        }
      ]
    });

    return toolResponse({
      ok: true,
      summary: `Generated smoke test for ${appUrl}`,
      data: { smoke: smokeTest },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }

  runSmoke(spec: SmokeTestSpec): ToolResponse {
    const smoke = SmokeTestSpecSchema.parse(spec);
    return toolResponse({
      ok: true,
      summary: `Prepared smoke test ${smoke.name}`,
      data: { smoke },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }
}

export class ArtifactTools {
  publish(type: ArtifactRef["type"], name: string, uri: string, metadata?: Record<string, unknown>): ToolResponse {
    const artifact = ArtifactRefSchema.parse({
      id: `${type}-${Date.now()}`,
      type,
      name,
      uri,
      metadata
    });

    return toolResponse({
      ok: true,
      summary: `Published artifact ${artifact.name}`,
      data: { artifact },
      diagnostics: [],
      artifacts: [artifact],
      retryable: false
    });
  }
}

export function createDefaultToolset(rootPath: string) {
  return {
    repo: new RepoTools(rootPath),
    flogo: new FlogoTools(),
    runner: new LocalRunnerDispatcher(),
    test: new TestTools(),
    artifact: new ArtifactTools()
  };
}
