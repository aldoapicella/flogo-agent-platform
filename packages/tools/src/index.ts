import type { CompositionCompareRequest, FlogoApp, MappingPreviewContext, TaskRequest, ToolResponse } from "@flogo-agent/contracts";

import { ArtifactTools } from "./artifact-tools.js";
import { FlogoCoreTools } from "./flogo-core-tools.js";
import { FlogoMappingTools } from "./flogo-mapping-tools.js";
import { RepoTools } from "./repo-tools.js";
import { LocalRunnerDispatcher, type RunnerDispatcher, RunnerTools } from "./runner-tools.js";
import { TestTools } from "./test-tools.js";

export { ArtifactTools } from "./artifact-tools.js";
export { FlogoCoreTools } from "./flogo-core-tools.js";
export { FlogoMappingTools } from "./flogo-mapping-tools.js";
export { RepoTools } from "./repo-tools.js";
export { LocalRunnerDispatcher, RunnerTools } from "./runner-tools.js";
export type { RunnerDispatcher } from "./runner-tools.js";
export { TestTools } from "./test-tools.js";

function createEmptyMappingContext(): MappingPreviewContext {
  return {
    flow: {},
    activity: {},
    env: {},
    property: {},
    trigger: {}
  };
}

export class FlogoTools {
  private readonly core = new FlogoCoreTools();
  private readonly mapping = new FlogoMappingTools();

  parseApp(raw: string | FlogoApp | unknown): ToolResponse {
    return this.core.parseApp(raw);
  }

  validateApp(raw: string | FlogoApp | unknown): ToolResponse {
    return this.core.validateApp(raw);
  }

  validateMappings(raw: string | FlogoApp | unknown): ToolResponse {
    return this.core.validateMappings(raw);
  }

  validateAliases(raw: string | FlogoApp | unknown): ToolResponse {
    return this.core.validateAliases(raw);
  }

  catalogContribs(raw: string | FlogoApp | unknown): ToolResponse {
    return this.core.catalogContribs(raw);
  }

  inventoryContribs(raw: string | FlogoApp | unknown): ToolResponse {
    return this.core.inventoryContribs(raw);
  }

  introspectDescriptor(raw: string | FlogoApp | unknown, refOrAlias: string): ToolResponse {
    return this.core.introspectDescriptor(raw, refOrAlias);
  }

  validateGovernance(raw: string | FlogoApp | unknown): ToolResponse {
    return this.core.validateGovernance(raw);
  }

  compareJsonVsProgrammatic(
    raw: string | FlogoApp | unknown,
    request: CompositionCompareRequest = { mode: "analyze", target: "app" }
  ): ToolResponse {
    return this.core.compareJsonVsProgrammatic(raw, request);
  }

  generateApp(task: TaskRequest): ToolResponse {
    return this.core.generateApp(task);
  }

  patchApp(document: string | FlogoApp | unknown, patcher: (app: FlogoApp) => FlogoApp): ToolResponse {
    return this.core.patchApp(document, patcher);
  }

  defineProperties(document: string | FlogoApp | unknown, properties: FlogoApp["properties"]): ToolResponse {
    return this.core.defineProperties(document, properties);
  }

  previewMapping(
    document: string | FlogoApp | unknown,
    nodeId: string,
    sampleInput: MappingPreviewContext = createEmptyMappingContext()
  ): ToolResponse {
    return this.mapping.previewMapping(document, nodeId, sampleInput);
  }

  suggestCoercions(
    document: string | FlogoApp | unknown,
    sampleInput: MappingPreviewContext = createEmptyMappingContext()
  ): ToolResponse {
    return this.mapping.suggestCoercions(document, sampleInput);
  }

  planProperties(document: string | FlogoApp | unknown): ToolResponse {
    return this.mapping.planProperties(document);
  }

  installContrib(contribRef: string): ToolResponse {
    return this.core.installContrib(contribRef);
  }

  listContribs(filter?: string): ToolResponse {
    return this.core.listContribs(filter);
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
