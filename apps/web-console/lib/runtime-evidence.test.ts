import { describe, expect, it } from "vitest";

import { type ArtifactRef } from "@flogo-agent/contracts";

import { parseRuntimeArtifact, selectLatestRuntimeArtifacts } from "./runtime-evidence";

function createArtifact(overrides: Partial<ArtifactRef> & Pick<ArtifactRef, "id" | "type" | "name" | "uri">): ArtifactRef {
  return {
    metadata: {},
    ...overrides
  };
}

describe("runtime-evidence helpers", () => {
  it("selects the latest runtime artifacts and ignores plan artifacts", () => {
    const artifacts: ArtifactRef[] = [
      createArtifact({
        id: "trace-plan",
        type: "run_trace_plan",
        name: "trace-plan",
        uri: "memory://trace-plan"
      }),
      createArtifact({
        id: "trace-old",
        type: "run_trace",
        name: "trace-old",
        uri: "memory://trace-old"
      }),
      createArtifact({
        id: "replay-old",
        type: "replay_report",
        name: "replay-old",
        uri: "memory://replay-old"
      }),
      createArtifact({
        id: "trace-new",
        type: "run_trace",
        name: "trace-new",
        uri: "memory://trace-new"
      }),
      createArtifact({
        id: "compare-new",
        type: "run_comparison",
        name: "compare-new",
        uri: "memory://compare-new"
      }),
      createArtifact({
        id: "replay-new",
        type: "replay_report",
        name: "replay-new",
        uri: "memory://replay-new"
      })
    ];

    expect(selectLatestRuntimeArtifacts(artifacts).map((artifact) => artifact.id)).toEqual([
      "trace-new",
      "replay-new",
      "compare-new"
    ]);
  });

  it("parses runtime trace artifacts from inline metadata", () => {
    const artifact = createArtifact({
      id: "trace-1",
      type: "run_trace",
      name: "trace-1",
      uri: "memory://trace-1",
      metadata: {
        trace: {
          appName: "demo",
          flowId: "orchestrate",
          evidenceKind: "runtime_backed",
          runtimeEvidence: {
            kind: "runtime_backed",
            runtimeMode: "rest_trigger",
            normalizedSteps: [
              {
                taskId: "prepare",
                status: "completed",
                unavailableFields: [],
                diagnostics: []
              }
            ]
          },
          summary: {
            flowId: "orchestrate",
            status: "completed",
            input: {
              payload: "hello"
            },
            output: {
              message: "hello"
            },
            stepCount: 1,
            diagnostics: []
          },
          steps: [],
          diagnostics: []
        }
      }
    });

    const parsed = parseRuntimeArtifact(artifact);
    expect(parsed?.kind).toBe("trace");
    if (!parsed || parsed.kind !== "trace") {
      throw new Error("Expected a trace artifact");
    }
    expect(parsed.response.trace?.runtimeEvidence?.runtimeMode).toBe("rest_trigger");
    expect(parsed.response.trace?.runtimeEvidence?.normalizedSteps).toHaveLength(1);
  });
});
