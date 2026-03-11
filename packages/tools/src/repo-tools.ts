import { createTwoFilesPatch } from "diff";
import fg from "fast-glob";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { ToolResponse } from "@flogo-agent/contracts";

import { toolResponse } from "./shared.js";

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
