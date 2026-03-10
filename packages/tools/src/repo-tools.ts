import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ToolResult } from "@flogo-agent/contracts";

const ok = (summary: string, data?: unknown): ToolResult => ({
  ok: true,
  summary,
  data,
  diagnostics: [],
  artifacts: [],
  retryable: false
});

export class FileSystemRepoTools {
  async read(path: string): Promise<ToolResult> {
    const content = await readFile(path, "utf8");
    return ok(`Read ${path}`, { path, content });
  }

  async search(directory: string, term: string): Promise<ToolResult> {
    const matches: string[] = [];
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        continue;
      }

      const content = await readFile(fullPath, "utf8");
      if (content.includes(term)) {
        matches.push(fullPath);
      }
    }

    return ok(`Found ${matches.length} files containing ${term}`, { matches });
  }

  async diff(before: string, after: string): Promise<ToolResult> {
    return ok("Prepared diff summary", {
      before,
      after,
      changed: before !== after
    });
  }

  async writePatch(path: string, patch: string): Promise<ToolResult> {
    return ok(`Prepared patch for ${path}`, { path, patch });
  }
}
