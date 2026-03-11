import type {
  ArtifactRef,
  FlogoApp,
  MappingPreviewContext,
  MappingPreviewResult,
  PropertyPlan,
  ToolResponse
} from "@flogo-agent/contracts";
import { ArtifactRefSchema } from "@flogo-agent/contracts";
import { analyzePropertyUsage, previewMapping, suggestCoercions } from "@flogo-agent/flogo-graph";

import { toolResponse } from "./shared.js";

function createEmptyMappingContext(): MappingPreviewContext {
  return {
    flow: {},
    activity: {},
    env: {},
    property: {},
    trigger: {}
  };
}

export class FlogoMappingTools {
  previewMapping(
    document: string | FlogoApp | unknown,
    nodeId: string,
    sampleInput: MappingPreviewContext = createEmptyMappingContext()
  ): ToolResponse {
    const preview: MappingPreviewResult = previewMapping(document, nodeId, sampleInput);
    const propertyPlan: PropertyPlan = analyzePropertyUsage(document);
    const artifact: ArtifactRef = ArtifactRefSchema.parse({
      id: `mapping-preview-${nodeId}`,
      type: "mapping_preview",
      name: `${nodeId}-mapping-preview.json`,
      uri: `memory://mapping-preview/${nodeId}`,
      metadata: { nodeId }
    });

    return toolResponse({
      ok: preview.diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      summary: `Previewed mapping for node ${nodeId}`,
      data: { preview, propertyPlan, artifact },
      diagnostics: [...preview.diagnostics, ...preview.suggestedCoercions, ...propertyPlan.diagnostics],
      artifacts: [artifact],
      retryable: false
    });
  }

  suggestCoercions(
    document: string | FlogoApp | unknown,
    sampleInput: MappingPreviewContext = createEmptyMappingContext()
  ): ToolResponse {
    const diagnostics = suggestCoercions(document, sampleInput);
    return toolResponse({
      ok: true,
      summary: diagnostics.length === 0 ? "No coercion suggestions found." : `Generated ${diagnostics.length} coercion suggestions`,
      data: { diagnostics },
      diagnostics,
      artifacts: [],
      retryable: false
    });
  }

  planProperties(document: string | FlogoApp | unknown): ToolResponse {
    const propertyPlan = analyzePropertyUsage(document);
    return toolResponse({
      ok: propertyPlan.diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      summary: `Analyzed ${propertyPlan.propertyRefs.length} property refs and ${propertyPlan.envRefs.length} env refs`,
      data: { propertyPlan },
      diagnostics: propertyPlan.diagnostics,
      artifacts: [],
      retryable: false
    });
  }
}
