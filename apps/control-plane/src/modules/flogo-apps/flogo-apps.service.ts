import { Injectable } from "@nestjs/common";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  ArtifactRefSchema,
  MappingPreviewRequestSchema,
  MappingPreviewResponseSchema
} from "@flogo-agent/contracts";
import {
  analyzePropertyUsage,
  buildAppGraph,
  buildContribCatalog,
  previewMapping,
  suggestCoercions
} from "@flogo-agent/flogo-graph";

@Injectable()
export class FlogoAppsService {
  async getGraph(appId: string) {
    const content = await this.loadApp(appId);
    if (!content) {
      return undefined;
    }

    return buildAppGraph(content);
  }

  async getCatalog(appId: string) {
    const content = await this.loadApp(appId);
    if (!content) {
      return undefined;
    }

    return buildContribCatalog(content);
  }

  async previewMapping(appId: string, payload: unknown) {
    const content = await this.loadApp(appId);
    if (!content) {
      return undefined;
    }

    const request = MappingPreviewRequestSchema.parse(payload);
    const preview = previewMapping(content, request.nodeId, request.sampleInput);
    const propertyPlan = analyzePropertyUsage(content);
    const coercionSuggestions = suggestCoercions(content, request.sampleInput).filter((diagnostic) =>
      diagnostic.path?.startsWith(request.nodeId)
    );

    return MappingPreviewResponseSchema.parse({
      preview: {
        ...preview,
        suggestedCoercions: coercionSuggestions
      },
      propertyPlan,
      artifact: ArtifactRefSchema.parse({
        id: `mapping-preview-${appId}-${request.nodeId}`,
        type: "mapping_preview",
        name: `${appId}-${request.nodeId}-mapping-preview.json`,
        uri: `memory://mapping-preview/${appId}/${request.nodeId}`,
        metadata: {
          appId,
          nodeId: request.nodeId
        }
      })
    });
  }

  private async loadApp(appId: string) {
    const candidatePath = path.join(process.cwd(), "examples", appId, "flogo.json");

    try {
      return await fs.readFile(candidatePath, "utf8");
    } catch {
      return undefined;
    }
  }
}
