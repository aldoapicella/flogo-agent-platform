import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function walk(dir: string, entries: string[] = []): Promise<string[]> {
  const children = await readdir(dir);

  for (const child of children) {
    const fullPath = join(dir, child);
    const details = await stat(fullPath);

    if (details.isDirectory() && !["node_modules", ".git", "dist"].includes(child)) {
      await walk(fullPath, entries);
    } else if (details.isFile()) {
      entries.push(fullPath);
    }
  }

  return entries;
}

export class RepoTooling {
  async read(path: string): Promise<string> {
    return readFile(path, "utf8");
  }

  async search(root: string, query: string): Promise<string[]> {
    const files = await walk(root);
    const matches: string[] = [];

    for (const file of files) {
      const content = await readFile(file, "utf8");
      if (content.includes(query)) {
        matches.push(file);
      }
    }

    return matches;
  }

  async writePatch(path: string, content: string): Promise<void> {
    await writeFile(path, content, "utf8");
  }

  diff(previousContent: string, nextContent: string): string {
    const previousLines = previousContent.split("\n");
    const nextLines = nextContent.split("\n");
    const changes: string[] = [];
    const lineCount = Math.max(previousLines.length, nextLines.length);

    for (let index = 0; index < lineCount; index += 1) {
      if (previousLines[index] !== nextLines[index]) {
        changes.push(`Line ${index + 1}: "${previousLines[index] ?? ""}" -> "${nextLines[index] ?? ""}"`);
      }
    }

    return changes.join("\n");
  }
}

