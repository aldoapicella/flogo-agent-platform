import type {
  ArtifactRef,
  DeploymentProfile,
  FlogoApp,
  MappingPreviewContext,
  MappingPreviewResult,
  MappingTestResult,
  PropertyPlan,
  ToolResponse
} from "@flogo-agent/contracts";
import { ArtifactRefSchema } from "@flogo-agent/contracts";
import { analyzePropertyUsage, previewMapping, runMappingTest, suggestCoercions } from "@flogo-agent/flogo-graph";

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
      diagnostics: [...preview.diagnostics, ...preview.scopeDiagnostics, ...preview.coercionDiagnostics, ...propertyPlan.diagnostics],
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

  planProperties(document: string | FlogoApp | unknown, profile: DeploymentProfile = "rest_service"): ToolResponse {
    const propertyPlan = analyzePropertyUsage(document, profile);
    return toolResponse({
      ok: propertyPlan.diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      summary: `Analyzed ${propertyPlan.propertyRefs.length} property refs and ${propertyPlan.envRefs.length} env refs for ${profile}`,
      data: { propertyPlan },
      diagnostics: propertyPlan.diagnostics,
      artifacts: [],
      retryable: false
    });
  }

  testMapping(
    document: string | FlogoApp | unknown,
    nodeId: string,
    sampleInput: MappingPreviewContext = createEmptyMappingContext(),
    expectedOutput: Record<string, unknown> = {},
    strict = true
  ): ToolResponse {
    const result: MappingTestResult = runMappingTest(document, nodeId, sampleInput, expectedOutput, strict);
    const artifact: ArtifactRef = ArtifactRefSchema.parse({
      id: `mapping-test-${nodeId}`,
      type: "mapping_test",
      name: `${nodeId}-mapping-test.json`,
      uri: `memory://mapping-test/${nodeId}`,
      metadata: { nodeId, strict }
    });

    return toolResponse({
      ok: result.pass,
      summary: result.pass ? `Mapping test passed for ${nodeId}` : `Mapping test failed for ${nodeId}`,
      data: { result, artifact },
      diagnostics: result.diagnostics,
      artifacts: [artifact],
      retryable: false
    });
  }
}
