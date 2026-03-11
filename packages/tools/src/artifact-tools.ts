import type { ArtifactRef, ToolResponse } from "@flogo-agent/contracts";
import { ArtifactRefSchema } from "@flogo-agent/contracts";

import { toolResponse } from "./shared.js";

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
