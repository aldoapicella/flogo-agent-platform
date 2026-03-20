import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type ArtifactRef } from "@flogo-agent/contracts";

import { parseRuntimeArtifact } from "../lib/runtime-evidence";
import { RuntimeEvidencePanel } from "./runtime-evidence-panel";

function artifact(overrides: Partial<ArtifactRef> & Pick<ArtifactRef, "id" | "type" | "name" | "uri">): ArtifactRef {
  return {
    metadata: {},
    ...overrides
  };
}

describe("RuntimeEvidencePanel", () => {
  it("renders runtime evidence, trigger-specific panels, fallback reasons, and comparison basis", () => {
    const views = [
      parseRuntimeArtifact(
        artifact({
          id: "trace-rest",
          type: "run_trace",
          name: "trace-rest",
          uri: "memory://trace-rest",
          metadata: {
            trace: {
              appName: "demo",
              flowId: "orchestrate",
              evidenceKind: "runtime_backed",
              comparisonBasisPreference: "rest_runtime_envelope",
              runtimeEvidence: {
                kind: "runtime_backed",
                runtimeMode: "rest_trigger",
                fallbackReason: "Request envelope available from runtime-backed trace.",
                restTriggerRuntime: {
                  kind: "rest",
                  request: {
                    method: "POST",
                    path: "/orchestrate"
                  },
                  flowInput: {
                    payload: "hello"
                  },
                  reply: {
                    status: 200
                  },
                  unavailableFields: ["reply.cookies"],
                  diagnostics: []
                },
                normalizedSteps: [
                  {
                    taskId: "prepare",
                    status: "completed",
                    resolvedInputs: {
                      payload: "hello"
                    },
                    producedOutputs: {
                      message: "hello"
                    },
                    stateDelta: {
                      message: "hello"
                    },
                    unavailableFields: ["flowStateBefore"],
                    diagnostics: []
                  }
                ]
              },
              summary: {
                flowId: "orchestrate",
                status: "completed",
                input: {},
                output: {},
                stepCount: 1,
                diagnostics: []
              },
              steps: [],
              diagnostics: []
            }
          }
        })
      ),
      parseRuntimeArtifact(
        artifact({
          id: "replay-timer",
          type: "replay_report",
          name: "replay-timer",
          uri: "memory://replay-timer",
          metadata: {
            result: {
              summary: {
                flowId: "orchestrate",
                status: "completed",
                inputSource: "trace_artifact",
                baseInput: {},
                effectiveInput: {},
                overridesApplied: false,
                diagnostics: []
              },
              comparisonBasisPreference: "timer_runtime_startup",
              runtimeEvidence: {
                kind: "runtime_backed",
                runtimeMode: "timer_trigger_replay",
                timerTriggerRuntime: {
                  kind: "timer",
                  settings: {
                    runMode: "repeat",
                    repeatInterval: "30s"
                  },
                  tick: {
                    tickCount: 1
                  },
                  unavailableFields: [],
                  diagnostics: []
                },
                normalizedSteps: []
              }
            }
          }
        })
      ),
      parseRuntimeArtifact(
        artifact({
          id: "comparison-channel",
          type: "run_comparison",
          name: "comparison-channel",
          uri: "memory://comparison-channel",
          metadata: {
            result: {
              left: {
                artifactId: "left",
                kind: "run_trace",
                summaryStatus: "completed",
                flowId: "orchestrate"
              },
              right: {
                artifactId: "right",
                kind: "replay_report",
                summaryStatus: "completed",
                flowId: "orchestrate"
              },
              comparisonBasis: "channel_runtime_boundary",
              channelComparison: {
                comparisonBasis: "channel_runtime_boundary",
                channelCompared: true,
                dataCompared: true,
                flowInputCompared: true,
                flowOutputCompared: false,
                unsupportedFields: ["flowOutput"],
                diagnostics: []
              },
              summary: {
                statusChanged: false,
                inputDiff: {
                  kind: "changed"
                },
                outputDiff: {
                  kind: "same"
                },
                errorDiff: {
                  kind: "same"
                },
                stepCountDiff: {
                  kind: "same"
                },
                diagnosticDiffs: []
              },
              steps: [],
              diagnostics: []
            }
          }
        })
      )
    ].filter((value) => value !== null);

    const html = renderToStaticMarkup(<RuntimeEvidencePanel artifacts={views} />);

    expect(html).toContain("Runtime evidence");
    expect(html).toContain("Evidence: Runtime Backed");
    expect(html).toContain("Mode: Rest Trigger");
    expect(html).toContain("REST trigger");
    expect(html).toContain("reply.cookies");
    expect(html).toContain("Normalized steps");
    expect(html).toContain("Timer trigger");
    expect(html).toContain("Mode: Timer Trigger Replay");
    expect(html).toContain("Basis: Channel Runtime Boundary");
    expect(html).toContain("Channel comparison");
    expect(html).toContain("Fallback reason");
  });

  it("renders CLI trigger evidence and empty states honestly", () => {
    const cliView = parseRuntimeArtifact(
      artifact({
        id: "trace-cli",
        type: "run_trace",
        name: "trace-cli",
        uri: "memory://trace-cli",
        metadata: {
          trace: {
            appName: "demo",
            flowId: "orchestrate",
            evidenceKind: "simulated_fallback",
            runtimeEvidence: {
              kind: "simulated_fallback",
              runtimeMode: "cli_trigger",
              fallbackReason: "Unsupported flag descriptor triggered fallback.",
              cliTriggerRuntime: {
                kind: "cli",
                settings: {
                  singleCmd: true
                },
                handler: {
                  command: "say",
                  flags: ["name"]
                },
                args: ["hello"],
                flags: {
                  name: "world"
                },
                reply: {
                  stdout: "hello world"
                },
                unavailableFields: ["flowOutput"],
                diagnostics: []
              },
              normalizedSteps: []
            },
            summary: {
              flowId: "orchestrate",
              status: "completed",
              input: {},
              output: {},
              stepCount: 0,
              diagnostics: []
            },
            steps: [],
            diagnostics: []
          }
        }
      })
    );

    const html = renderToStaticMarkup(<RuntimeEvidencePanel artifacts={cliView ? [cliView] : []} />);

    expect(html).toContain("CLI trigger");
    expect(html).toContain("say");
    expect(html).toContain("hello world");
    expect(html).toContain("Evidence: Simulated Fallback");
    expect(html).toContain("flowOutput");
  });
});
