import type { ArtifactKind, ArtifactRef, ToolResult } from "@flogo-agent/contracts";

const ok = (summary: string, data?: unknown): ToolResult => ({
  ok: true,
  summary,
  data,
  diagnostics: [],
  artifacts: [],
  retryable: false
});

export class ArtifactTools {
  publish(kind: ArtifactKind, name: string, uri: string): ToolResult {
    const artifact: ArtifactRef = {
      id: `${kind}-${Date.now()}`,
      kind,
      name,
      uri,
      createdAt: new Date().toISOString()
    };

    return ok(`Published artifact ${name}`, artifact);
  }
}
