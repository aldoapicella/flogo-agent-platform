import { createTwoFilesPatch } from "diff";
import fg from "fast-glob";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  ArtifactRefSchema,
  type ArtifactRef,
  type RunnerJobResult,
  RunnerJobResultSchema,
  RunnerJobSpecSchema,
  type SmokeTestSpec,
  SmokeTestSpecSchema,
  type TaskRequest,
  type ToolResponse,
  ToolResponseSchema
} from "@flogo-agent/contracts";
import { buildAppGraph, parseFlogoAppDocument, validateFlogoApp, validateMappings } from "@flogo-agent/flogo-graph";

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
  constructor(private readonly rootPath: string) {}

  async parseApp(appPath: string): Promise<ToolResponse> {
    const absolutePath = await ensureAbsolutePath(this.rootPath, appPath);
    const content = await fs.readFile(absolutePath, "utf8");
    const graph = buildAppGraph(content);
    return toolResponse({
      ok: true,
      summary: `Parsed ${appPath}`,
      data: graph as unknown as Record<string, unknown>,
      diagnostics: graph.diagnostics,
      artifacts: [],
      retryable: false
    });
  }

  async validateApp(appPath: string): Promise<ToolResponse> {
    const absolutePath = await ensureAbsolutePath(this.rootPath, appPath);
    const content = await fs.readFile(absolutePath, "utf8");
    const report = validateFlogoApp(content);
    return toolResponse({
      ok: report.ok,
      summary: report.summary,
      data: { report },
      diagnostics: report.stages.flatMap((stage) => stage.diagnostics),
      artifacts: [],
      retryable: false
    });
  }

  async validateMappings(appPath: string): Promise<ToolResponse> {
    const absolutePath = await ensureAbsolutePath(this.rootPath, appPath);
    const content = await fs.readFile(absolutePath, "utf8");
    const report = validateMappings(content);
    return toolResponse({
      ok: report.ok,
      summary: report.ok ? `Mappings are valid for ${appPath}` : `Mappings need fixes for ${appPath}`,
      data: { report },
      diagnostics: report.diagnostics,
      artifacts: [],
      retryable: false
    });
  }

  generateApp(request: TaskRequest): ToolResponse {
    const generated = {
      name: request.summary.replace(/\s+/g, "-").toLowerCase(),
      type: "flogo:app",
      appModel: "1.1.0",
      imports: [],
      triggers: [],
      resources: []
    };
    const app = parseFlogoAppDocument(generated);
    return toolResponse({
      ok: true,
      summary: `Generated base Flogo app for ${request.summary}`,
      data: { app },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }

  patchApp(document: unknown, patch: (app: ReturnType<typeof parseFlogoAppDocument>) => ReturnType<typeof parseFlogoAppDocument>): ToolResponse {
    const app = parseFlogoAppDocument(document);
    const updatedApp = patch(app);
    return toolResponse({
      ok: true,
      summary: "Patched Flogo app document",
      data: { app: updatedApp },
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
          "github.com/project-flogo/contrib/activity/rest"
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
      data: { smokeTest },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }

  runSmoke(spec: SmokeTestSpec): ToolResponse {
    const parsed = SmokeTestSpecSchema.parse(spec);
    return toolResponse({
      ok: true,
      summary: `Queued smoke test ${parsed.name}`,
      data: { smokeTest: parsed },
      diagnostics: [],
      artifacts: [],
      retryable: false
    });
  }
}

export class ArtifactTools {
  publish(artifact: ArtifactRef): ToolResponse {
    const parsed = ArtifactRefSchema.parse(artifact);
    return toolResponse({
      ok: true,
      summary: `Published artifact ${parsed.name}`,
      data: { artifact: parsed },
      diagnostics: [],
      artifacts: [parsed],
      retryable: false
    });
  }
}

export function createDefaultToolset(rootPath: string): {
  repo: RepoTools;
  flogo: FlogoTools;
  runner: RunnerDispatcher;
  test: TestTools;
  artifact: ArtifactTools;
} {
  return {
    repo: new RepoTools(rootPath),
    flogo: new FlogoTools(rootPath),
    runner: new LocalRunnerDispatcher(),
    test: new TestTools(),
    artifact: new ArtifactTools()
  };
}
