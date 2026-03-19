import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  analyzePropertyUsage,
  applyErrorPathTemplate,
  applyDoWhileSynthesis,
  applyIteratorSynthesis,
  applyRetryPolicy,
  applySubflowExtraction,
  applySubflowInlining,
  buildAppGraph,
  buildContributionInventory,
  buildContribCatalog,
  compareJsonVsProgrammatic,
  compareRuns,
  applyTriggerBinding,
  inferFlowContract,
  inferFlowContracts,
  inspectContribEvidence,
  inspectContribDescriptor,
  planErrorPathTemplate,
  planReplay,
  planRunComparison,
  planRunTrace,
  planSubflowExtraction,
  planSubflowInlining,
  planDoWhileSynthesis,
  planIteratorSynthesis,
  planRetryPolicy,
  planTriggerBinding,
  previewMapping,
  runMappingTest,
  suggestCoercions,
  summarizeAppDiff,
  validateFlogoApp,
  validateGovernance
} from "./index.js";

const validApp = {
  name: "hello",
  type: "flogo:app",
  appModel: "1.1.0",
  imports: [
    {
      alias: "log",
      ref: "github.com/project-flogo/contrib/activity/log"
    },
    {
      alias: "rest",
      ref: "github.com/project-flogo/contrib/trigger/rest"
    }
  ],
  properties: [
    {
      name: "retryCount",
      value: 3
    }
  ],
  triggers: [
    {
      id: "rest_trigger",
      ref: "#rest",
      settings: { port: 9999 },
      handlers: [
        {
          settings: {
            method: "GET",
            path: "/hello"
          },
          action: {
            ref: "#flow:hello_flow"
          }
        }
      ]
    }
  ],
  resources: [
    {
      id: "hello_flow",
      data: {
        tasks: [
          {
            id: "log_1",
            activityRef: "#log",
            input: {
              message: "hello"
            }
          }
        ],
        links: []
      }
    }
  ]
};

const legacyShapeApp = {
  name: "legacy-hello",
  type: "flogo:app",
  appModel: "1.1.0",
  imports: [
    {
      alias: "log",
      ref: "github.com/project-flogo/contrib/activity/log"
    },
    {
      alias: "rest",
      ref: "github.com/project-flogo/contrib/trigger/rest"
    }
  ],
  triggers: [
    {
      id: "rest",
      ref: "#rest",
      settings: { port: 8080 },
      handlers: [
        {
          settings: {
            method: "GET",
            path: "/hello"
          },
          action: {
            ref: "flow:hello"
          }
        }
      ]
    }
  ],
  resources: {
    hello: {
      type: "flow",
      data: {
        metadata: {
          input: ["name"],
          output: ["message"]
        },
        tasks: [
          {
            id: "log-request",
            name: "log-request",
            activity: {
              ref: "#log"
            },
            input: {
              message: "received hello request"
            }
          }
        ]
      }
    }
  }
};

const bindableFlowApp = {
  name: "bindable",
  type: "flogo:app",
  appModel: "1.1.0",
  imports: [
    {
      alias: "log",
      ref: "github.com/project-flogo/contrib/activity/log"
    }
  ],
  triggers: [],
  resources: {
    hello: {
      type: "flow",
      data: {
        metadata: {
          input: ["payload"],
          output: ["message"]
        },
        tasks: [
          {
            id: "log-request",
            name: "log-request",
            activity: {
              ref: "#log"
            },
            input: {
              message: "received request"
            }
          }
        ]
      }
    },
    heartbeat: {
      type: "flow",
      data: {
        metadata: {
          input: [],
          output: ["status"]
        },
        tasks: []
      }
    }
  }
};

const subflowCandidateApp = {
  name: "subflow-candidate",
  type: "flogo:app",
  appModel: "1.1.0",
  imports: [
    {
      alias: "log",
      ref: "github.com/project-flogo/contrib/activity/log"
    }
  ],
  triggers: [],
  resources: {
    orchestrate: {
      type: "flow",
      data: {
        metadata: {
          input: [{ name: "payload", required: true }],
          output: [{ name: "message" }]
        },
        tasks: [
          {
            id: "prepare",
            name: "prepare",
            activity: {
              ref: "#log"
            },
            input: {
              message: "$flow.payload"
            },
            output: {
              prepared: "$flow.payload"
            }
          },
          {
            id: "work",
            name: "work",
            activity: {
              ref: "#log"
            },
            input: {
              message: "$flow.prepared"
            },
            output: {
              message: "$flow.prepared"
            }
          },
          {
            id: "finish",
            name: "finish",
            activity: {
              ref: "#log"
            },
            input: {
              message: "$flow.message"
            }
          }
        ]
      }
    }
  }
};

describe("flogo graph", () => {
  const tempPaths: string[] = [];

  afterAll(async () => {
    await Promise.all(tempPaths.map((tempPath) => fs.rm(tempPath, { recursive: true, force: true })));
  });

  it("builds a graph from a valid app", () => {
    const graph = buildAppGraph(validApp);
    expect(graph.resourceIds).toContain("hello_flow");
    expect(graph.taskIds).toContain("log_1");
  });

  it("detects missing flow references", () => {
    const invalid = structuredClone(validApp);
    invalid.triggers[0].handlers[0].action.ref = "#flow:missing";
    const report = validateFlogoApp(invalid);
    expect(report.ok).toBe(false);
    expect(report.stages.some((stage) => stage.diagnostics.some((diagnostic) => diagnostic.code === "flogo.semantic.missing_flow"))).toBe(true);
  });

  it("detects bad mapping scopes", () => {
    const invalid = structuredClone(validApp);
    invalid.resources[0].data.tasks.push({
      id: "log_2",
      activityRef: "#log",
      input: {
        message: "$activity[future].message"
      }
    });
    const report = validateFlogoApp(invalid);
    expect(report.stages.some((stage) => stage.diagnostics.some((diagnostic) => diagnostic.code === "flogo.mapping.invalid_activity_scope"))).toBe(true);
  });

  it("summarizes app diffs", () => {
    const changed = structuredClone(validApp);
    changed.properties.push({
      name: "apiBaseUrl",
      value: "https://example.test"
    });
    expect(summarizeAppDiff(validApp, changed)).toContain("properties +1");
  });

  it("builds a contribution catalog from imports, triggers, and flows", () => {
    const catalog = buildContribCatalog(validApp);
    expect(catalog.entries.some((entry) => entry.type === "trigger" && entry.name === "rest")).toBe(true);
    expect(catalog.entries.some((entry) => entry.type === "activity" && entry.name === "log")).toBe(true);
    expect(catalog.entries.some((entry) => entry.type === "action" && entry.ref === "#flow:hello_flow")).toBe(true);
  });

  it("builds a contribution inventory with package evidence and flow entries", () => {
    const inventory = buildContributionInventory(validApp);

    expect(inventory.entries.some((entry) => entry.alias === "rest" && entry.ref === "github.com/project-flogo/contrib/trigger/rest")).toBe(
      true
    );
    expect(inventory.entries.some((entry) => entry.alias === "log" && entry.ref === "github.com/project-flogo/contrib/activity/log")).toBe(
      true
    );
    expect(inventory.entries.some((entry) => entry.ref === "#flow:hello_flow" && entry.source === "flow_resource")).toBe(true);
  });

  it("normalizes legacy object-shaped resources and task activity refs", () => {
    const graph = buildAppGraph(legacyShapeApp);
    const report = validateFlogoApp(legacyShapeApp);
    const catalog = buildContribCatalog(legacyShapeApp);

    expect(graph.resourceIds).toContain("hello");
    expect(graph.taskIds).toContain("log-request");
    expect(report.ok).toBe(true);
    expect(catalog.entries.some((entry) => entry.ref === "#flow:hello")).toBe(true);
    expect(catalog.entries.some((entry) => entry.ref === "#log")).toBe(true);
  });

  it("infers flow contracts from metadata and handler mappings", () => {
    const app = structuredClone(legacyShapeApp);
    app.triggers[0].handlers[0].input = {
      name: "$trigger.content.name"
    };
    app.triggers[0].handlers[0].output = {
      data: "$flow.message"
    };

    const contracts = inferFlowContracts(app);
    const helloContract = contracts.contracts.find((entry) => entry.flowId === "hello");

    expect(helloContract).toBeDefined();
    expect(helloContract?.inputs.some((param) => param.name === "name")).toBe(true);
    expect(helloContract?.outputs.some((param) => param.name === "message")).toBe(true);
    expect(helloContract?.usage.triggerRefs).toContain("rest");
    expect(helloContract?.evidenceLevel).toBe("metadata_plus_mapping");
    expect(helloContract?.reusable).toBe(true);
  });

  it("returns undefined when a requested flow contract does not exist", () => {
    expect(inferFlowContract(validApp, "missing")).toBeUndefined();
  });

  it("plans a runtime trace when required inputs are satisfied", () => {
    const response = planRunTrace(subflowCandidateApp, {
      flowId: "orchestrate",
      sampleInput: {
        payload: "hello"
      }
    });

    expect(response.validation?.ok).toBe(true);
    expect(response.validation?.stages[0]?.stage).toBe("runtime");
  });

  it("rejects runtime trace planning when the flow is unknown", () => {
    expect(() =>
      planRunTrace(subflowCandidateApp, {
        flowId: "missing",
        sampleInput: {}
      })
    ).toThrow(/Unknown flow missing/);
  });

  it("rejects runtime trace planning when required input is missing", () => {
    expect(() =>
      planRunTrace(subflowCandidateApp, {
        flowId: "orchestrate",
        sampleInput: {}
      })
    ).toThrow(/Run trace request is invalid/);
  });

  it("plans a replay when effective input satisfies the flow contract", () => {
    const response = planReplay(subflowCandidateApp, {
      flowId: "orchestrate",
      baseInput: {
        payload: "hello",
        nested: {
          count: 1
        }
      },
      overrides: {
        nested: {
          count: 2
        }
      }
    });

    expect(response.result.validation?.ok).toBe(true);
    expect(response.result.summary.effectiveInput).toEqual({
      payload: "hello",
      nested: {
        count: 2
      }
    });
    expect(response.result.summary.inputSource).toBe("explicit_input");
  });

  it("rejects replay planning when the flow is unknown", () => {
    expect(() =>
      planReplay(subflowCandidateApp, {
        flowId: "missing",
        baseInput: {}
      })
    ).toThrow(/Unknown flow missing/);
  });

  it("rejects replay planning when required input is missing after overrides are applied", () => {
    expect(() =>
      planReplay(subflowCandidateApp, {
        flowId: "orchestrate",
        baseInput: {},
        overrides: {}
      })
    ).toThrow(/Replay request is invalid/);
  });

  it("plans run comparison for identical run traces", () => {
    const left = {
      artifactId: "left-trace",
      kind: "run_trace" as const,
      payload: {
        trace: {
          appName: "demo",
          flowId: "orchestrate",
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
          steps: [
            {
              taskId: "prepare",
              status: "completed",
              input: {
                payload: "hello"
              },
              output: {
                message: "hello"
              },
              diagnostics: []
            }
          ],
          diagnostics: []
        }
      }
    };

    const response = planRunComparison(
      {
        leftArtifactId: "left-trace",
        rightArtifactId: "right-trace"
      },
      left,
      {
        ...left,
        artifactId: "right-trace"
      }
    );

    expect(response.validation?.ok).toBe(true);
    expect(response.validation?.stages[0]?.stage).toBe("runtime");
  });

  it("compares a run trace and replay report by task id", () => {
    const response = compareRuns(
      {
        leftArtifactId: "trace-artifact",
        rightArtifactId: "replay-artifact"
      },
      {
        artifactId: "trace-artifact",
        kind: "run_trace",
        payload: {
          trace: {
            appName: "demo",
            flowId: "orchestrate",
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
            steps: [
              {
                taskId: "prepare",
                status: "completed",
                output: {
                  message: "hello"
                },
                diagnostics: []
              }
            ],
            diagnostics: []
          }
        }
      },
      {
        artifactId: "replay-artifact",
        kind: "replay_report",
        payload: {
          result: {
            summary: {
              flowId: "orchestrate",
              status: "completed",
              inputSource: "explicit_input",
              baseInput: {
                payload: "hello"
              },
              effectiveInput: {
                payload: "replayed"
              },
              overridesApplied: true,
              diagnostics: []
            },
            trace: {
              appName: "demo",
              flowId: "orchestrate",
              summary: {
                flowId: "orchestrate",
                status: "completed",
                input: {
                  payload: "replayed"
                },
                output: {
                  message: "replayed"
                },
                stepCount: 1,
                diagnostics: []
              },
              steps: [
                {
                  taskId: "prepare",
                  status: "completed",
                  output: {
                    message: "replayed"
                  },
                  diagnostics: []
                }
              ],
              diagnostics: []
            }
          }
        }
      }
    );

    expect(response.result?.comparisonBasis).toBe("simulated_fallback");
    expect(response.result?.summary.outputDiff.kind).toBe("changed");
    expect(response.result?.steps).toHaveLength(1);
    expect(response.result?.steps[0]?.taskId).toBe("prepare");
    expect(response.result?.steps[0]?.outputDiff?.kind).toBe("changed");
  });

  it("prefers normalized runtime evidence when both artifacts provide it", () => {
    const response = compareRuns(
      {
        leftArtifactId: "left-trace",
        rightArtifactId: "right-replay"
      },
      {
        artifactId: "left-trace",
        kind: "run_trace",
        payload: {
          trace: {
            appName: "demo",
            flowId: "orchestrate",
            evidenceKind: "runtime_backed",
            runtimeEvidence: {
              kind: "runtime_backed",
              recorderBacked: true,
              recorderKind: "flow_state_recorder",
              recorderMode: "full",
              runtimeMode: "independent_action",
              restTriggerRuntime: {
                kind: "rest",
                request: {
                  method: "POST",
                  path: "/hello",
                  headers: {
                    "content-type": "application/json"
                  },
                  queryParams: {},
                  pathParams: {},
                  body: {
                    payload: "recorded-left"
                  }
                },
                flowInput: {
                  payload: "recorded-left"
                },
                flowOutput: {
                  message: "recorded-left"
                },
                reply: {
                  status: 200,
                  headers: {
                    "content-type": "application/json"
                  },
                  body: {
                    message: "recorded-left"
                  },
                  data: {
                    message: "recorded-left"
                  }
                },
                mapping: {
                  requestMappingMode: "auto",
                  replyMappingMode: "auto",
                  mappedFlowInput: {
                    payload: "$trigger.content"
                  },
                  mappedFlowOutput: {
                    data: "$flow.message"
                  },
                  requestMappings: {
                    payload: "$trigger.content"
                  },
                  replyMappings: {
                    data: "$flow.message"
                  },
                  unavailableFields: [],
                  diagnostics: []
                },
                unavailableFields: [],
                diagnostics: []
              },
              normalizedSteps: [
                {
                  taskId: "prepare",
                  status: "completed",
                  resolvedInputs: {
                    payload: "recorded-left"
                  },
                  producedOutputs: {
                    message: "recorded-left"
                  },
                  unavailableFields: [],
                  diagnostics: []
                }
              ],
              flowStart: {
                flow_inputs: {
                  payload: "recorded-left"
                }
              },
              flowDone: {
                flow_outputs: {
                  message: "recorded-left"
                }
              },
              steps: [{ id: "step-left" }]
            },
            summary: {
              flowId: "orchestrate",
              status: "completed",
              input: {
                payload: "summary-left"
              },
              output: {
                message: "summary-left"
              },
              stepCount: 0,
              diagnostics: []
            },
            steps: [],
            diagnostics: []
          }
        }
      },
      {
        artifactId: "right-replay",
        kind: "replay_report",
        payload: {
          result: {
            summary: {
              flowId: "orchestrate",
              status: "completed",
              inputSource: "explicit_input",
              baseInput: {
                payload: "summary-right"
              },
              effectiveInput: {
                payload: "summary-right"
              },
              overridesApplied: false,
              diagnostics: []
            },
            runtimeEvidence: {
              kind: "runtime_backed",
              recorderBacked: true,
              recorderKind: "flow_state_recorder",
              recorderMode: "full",
              runtimeMode: "independent_action_replay",
              restTriggerRuntime: {
                kind: "rest",
                request: {
                  method: "POST",
                  path: "/hello",
                  headers: {
                    "content-type": "application/json"
                  },
                  queryParams: {},
                  pathParams: {},
                  body: {
                    payload: "recorded-right"
                  }
                },
                flowInput: {
                  payload: "recorded-right"
                },
                flowOutput: {
                  message: "recorded-right"
                },
                reply: {
                  status: 200,
                  headers: {
                    "content-type": "application/json"
                  },
                  body: {
                    message: "recorded-right"
                  },
                  data: {
                    message: "recorded-right"
                  }
                },
                mapping: {
                  requestMappingMode: "auto",
                  replyMappingMode: "auto",
                  mappedFlowInput: {
                    payload: "$trigger.content"
                  },
                  mappedFlowOutput: {
                    data: "$flow.message"
                  },
                  requestMappings: {
                    payload: "$trigger.content"
                  },
                  replyMappings: {
                    data: "$flow.message"
                  },
                  unavailableFields: [],
                  diagnostics: []
                },
                unavailableFields: [],
                diagnostics: []
              },
              normalizedSteps: [
                {
                  taskId: "prepare",
                  status: "completed",
                  resolvedInputs: {
                    payload: "recorded-right"
                  },
                  producedOutputs: {
                    message: "recorded-right"
                  },
                  unavailableFields: [],
                  diagnostics: []
                }
              ],
              flowStart: {
                flow_inputs: {
                  payload: "recorded-right"
                }
              },
              flowDone: {
                flow_outputs: {
                  message: "recorded-right"
                }
              },
              steps: [{ id: "step-right-a" }, { id: "step-right-b" }]
            }
          }
        }
      }
    );

    expect(response.result?.comparisonBasis).toBe("rest_runtime_envelope");
    expect(response.result?.left.evidenceKind).toBe("runtime_backed");
    expect(response.result?.right.evidenceKind).toBe("runtime_backed");
    expect(response.result?.left.normalizedStepEvidence).toBe(true);
    expect(response.result?.right.normalizedStepEvidence).toBe(true);
    expect(response.result?.left.restTriggerRuntimeEvidence).toBe(true);
    expect(response.result?.right.restTriggerRuntimeEvidence).toBe(true);
    expect(response.result?.left.restTriggerRuntimeKind).toBe("rest");
    expect(response.result?.right.restTriggerRuntimeKind).toBe("rest");
    expect(response.result?.restComparison?.comparisonBasis).toBe("rest_runtime_envelope");
    expect(response.result?.restComparison?.requestEnvelopeCompared).toBe(true);
    expect(response.result?.restComparison?.mappedFlowInputCompared).toBe(true);
    expect(response.result?.restComparison?.replyEnvelopeCompared).toBe(true);
    expect(response.result?.restComparison?.normalizedStepEvidenceCompared).toBe(true);
    expect(response.result?.restComparison?.requestEnvelopeDiff).toEqual(
      expect.objectContaining({
        kind: "changed"
      })
    );
    expect(response.result?.restComparison?.mappedFlowInputDiff).toEqual(
      expect.objectContaining({
        kind: "changed"
      })
    );
    expect(response.result?.restComparison?.replyEnvelopeDiff).toEqual(
      expect.objectContaining({
        kind: "changed"
      })
    );
    expect(response.result?.restComparison?.normalizedStepCountDiff).toEqual({
      kind: "changed",
      left: 1,
      right: 2
    });
    expect(response.result?.summary.inputDiff).toEqual({
      kind: "changed",
      left: { payload: "recorded-left" },
      right: { payload: "recorded-right" }
    });
    expect(response.result?.summary.outputDiff).toEqual({
      kind: "changed",
      left: { message: "recorded-left" },
      right: { message: "recorded-right" }
    });
    expect(response.result?.summary.diagnosticDiffs.some((diagnostic) => diagnostic.code === "flogo.run_comparison.rest_runtime_envelope_preferred")).toBe(
      true
    );
    expect(response.result?.summary.stepCountDiff).toEqual({
      kind: "changed",
      left: 1,
      right: 2
    });
  });

  it("prefers timer startup evidence when both artifacts provide it", () => {
    const response = compareRuns(
      {
        leftArtifactId: "left-trace",
        rightArtifactId: "right-replay"
      },
      {
        artifactId: "left-trace",
        kind: "run_trace",
        payload: {
          trace: {
            appName: "demo",
            flowId: "heartbeat",
            evidenceKind: "runtime_backed",
            runtimeEvidence: {
              kind: "runtime_backed",
              recorderBacked: true,
              recorderKind: "flow_state_recorder",
              recorderMode: "full",
              runtimeMode: "timer_trigger",
              timerTriggerRuntime: {
                kind: "timer",
                settings: {
                  runMode: "repeat",
                  startDelay: "10s",
                  repeatInterval: "30s"
                },
                flowInput: {},
                flowOutput: {
                  status: "tick-left"
                },
                tick: {
                  firedAt: "2026-03-18T00:00:30Z",
                  tickCount: 1
                },
                unavailableFields: [],
                diagnostics: []
              },
              steps: [{ id: "tick-left" }]
            },
            summary: {
              flowId: "heartbeat",
              status: "completed",
              input: {},
              output: {
                status: "tick-left"
              },
              stepCount: 1,
              diagnostics: []
            },
            steps: [
              {
                taskId: "tick",
                status: "completed",
                output: {
                  status: "tick-left"
                },
                diagnostics: []
              }
            ],
            diagnostics: []
          }
        }
      },
      {
        artifactId: "right-replay",
        kind: "replay_report",
        payload: {
          result: {
            summary: {
              flowId: "heartbeat",
              status: "completed",
              inputSource: "explicit_input",
              baseInput: {},
              effectiveInput: {},
              overridesApplied: false,
              diagnostics: []
            },
            runtimeEvidence: {
              kind: "runtime_backed",
              recorderBacked: true,
              recorderKind: "flow_state_recorder",
              recorderMode: "full",
              runtimeMode: "timer_trigger_replay",
              timerTriggerRuntime: {
                kind: "timer",
                settings: {
                  runMode: "repeat",
                  startDelay: "10s",
                  repeatInterval: "30s"
                },
                flowInput: {},
                flowOutput: {
                  status: "tick-right"
                },
                tick: {
                  firedAt: "2026-03-18T00:00:31Z",
                  tickCount: 1
                },
                unavailableFields: [],
                diagnostics: []
              },
              steps: [{ id: "tick-right" }]
            },
            trace: {
              appName: "demo",
              flowId: "heartbeat",
              summary: {
                flowId: "heartbeat",
                status: "completed",
                input: {},
                output: {
                  status: "tick-right"
                },
                stepCount: 1,
                diagnostics: []
              },
              steps: [
                {
                  taskId: "tick",
                  status: "completed",
                  output: {
                    status: "tick-right"
                  },
                  diagnostics: []
                }
              ],
              diagnostics: []
            }
          }
        }
      }
    );

    expect(response.result?.comparisonBasis).toBe("timer_runtime_startup");
    expect(response.result?.timerComparison?.comparisonBasis).toBe("timer_runtime_startup");
    expect(response.result?.timerComparison?.settingsCompared).toBe(true);
    expect(response.result?.timerComparison?.flowInputCompared).toBe(true);
    expect(response.result?.timerComparison?.flowOutputCompared).toBe(true);
  expect(response.result?.timerComparison?.tickCompared).toBe(true);
  expect(response.result?.timerComparison?.flowOutputDiff?.kind).toBe("changed");
  });

  it("preserves CLI runtime evidence flags on compared artifacts", () => {
    const response = compareRuns(
      {
        leftArtifactId: "left-cli-trace",
        rightArtifactId: "right-cli-replay"
      },
      {
        artifactId: "left-cli-trace",
        kind: "run_trace",
        payload: {
          trace: {
            appName: "cli-app",
            flowId: "hello",
            evidenceKind: "runtime_backed",
            runtimeEvidence: {
              kind: "runtime_backed",
              recorderBacked: true,
              recorderKind: "flow_state_recorder",
              recorderMode: "full",
              runtimeMode: "cli_trigger",
              cliTriggerRuntime: {
                kind: "cli",
                settings: {
                  singleCmd: true
                },
                handler: {
                  command: "say"
                },
                args: ["hello"],
                flags: {
                  loud: true
                },
                flowInput: {
                  args: ["hello"]
                },
                reply: {
                  data: "cli-ok",
                  stdout: "cli-ok"
                },
                unavailableFields: ["flowOutput"],
                diagnostics: []
              },
              normalizedSteps: [
                {
                  taskId: "prepare",
                  status: "completed",
                  diagnostics: [],
                  unavailableFields: []
                }
              ]
            },
            summary: {
              flowId: "hello",
              status: "completed",
              input: {
                args: ["hello"]
              },
              output: {},
              stepCount: 1,
              diagnostics: []
            },
            steps: [
              {
                taskId: "prepare",
                status: "completed",
                diagnostics: []
              }
            ],
            diagnostics: []
          }
        }
      },
      {
        artifactId: "right-cli-replay",
        kind: "replay_report",
        payload: {
          result: {
            summary: {
              flowId: "hello",
              status: "completed",
              inputSource: "explicit_input",
              baseInput: {
                args: ["hello"]
              },
              effectiveInput: {
                args: ["hello"]
              },
              overridesApplied: false,
              diagnostics: []
            },
            runtimeEvidence: {
              kind: "runtime_backed",
              recorderBacked: true,
              recorderKind: "flow_state_recorder",
              recorderMode: "full",
              runtimeMode: "cli_trigger_replay",
              cliTriggerRuntime: {
                kind: "cli",
                settings: {
                  singleCmd: true
                },
                handler: {
                  command: "say"
                },
                args: ["hello"],
                flags: {
                  loud: false
                },
                flowInput: {
                  args: ["hello"]
                },
                reply: {
                  data: "cli-ok",
                  stdout: "cli-ok"
                },
                unavailableFields: ["flowOutput"],
                diagnostics: []
              },
              normalizedSteps: [
                {
                  taskId: "prepare",
                  status: "completed",
                  diagnostics: [],
                  unavailableFields: []
                }
              ]
            },
            trace: {
              appName: "cli-app",
              flowId: "hello",
              summary: {
                flowId: "hello",
                status: "completed",
                input: {
                  args: ["hello"]
                },
                output: {},
                stepCount: 1,
                diagnostics: []
              },
              steps: [
                {
                  taskId: "prepare",
                  status: "completed",
                  diagnostics: []
                }
              ],
              diagnostics: []
            }
          }
        }
      }
    );

    expect(response.result?.left.cliTriggerRuntimeEvidence).toBe(true);
    expect(response.result?.right.cliTriggerRuntimeEvidence).toBe(true);
    expect(response.result?.left.cliTriggerRuntimeKind).toBe("cli");
    expect(response.result?.right.cliTriggerRuntimeKind).toBe("cli");
    expect(response.result?.comparisonBasis).toBe("normalized_runtime_evidence");
  });

  it("rejects run comparison for invalid artifact kinds", () => {
    expect(() =>
      planRunComparison(
        {
          leftArtifactId: "left",
          rightArtifactId: "right"
        },
        {
          artifactId: "left",
          kind: "contrib_catalog" as never,
          payload: {}
        },
        {
          artifactId: "right",
          kind: "run_trace",
          payload: {
            trace: {
              appName: "demo",
              flowId: "orchestrate",
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
        }
      )
    ).toThrow(/not a comparable runtime artifact/);
  });

  it("allows cross-flow run comparison with a warning diagnostic", () => {
    const response = planRunComparison(
      {
        leftArtifactId: "left",
        rightArtifactId: "right"
      },
      {
        artifactId: "left",
        kind: "run_trace",
        payload: {
          trace: {
            appName: "demo",
            flowId: "left-flow",
            summary: {
              flowId: "left-flow",
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
      },
      {
        artifactId: "right",
        kind: "run_trace",
        payload: {
          trace: {
            appName: "demo",
            flowId: "right-flow",
            summary: {
              flowId: "right-flow",
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
      }
    );

    expect(response.validation?.ok).toBe(true);
    expect(response.validation?.stages[0]?.diagnostics.some((diagnostic) => diagnostic.code === "flogo.run_comparison.flow_mismatch")).toBe(
      true
    );
  });

  it("plans a REST trigger binding from an inferred flow contract", () => {
    const response = planTriggerBinding(bindableFlowApp, {
      flowId: "hello",
      profile: {
        kind: "rest",
        method: "POST",
        path: "/hello",
        port: 8081,
        replyMode: "json",
        requestMappingMode: "auto",
        replyMappingMode: "auto"
      }
    });

    expect(response.result.applied).toBe(false);
    expect(response.result.plan.profile.kind).toBe("rest");
    expect(response.result.plan.profile.replyMode).toBe("json");
    expect(response.result.plan.profile.requestMappingMode).toBe("auto");
    expect(response.result.plan.profile.replyMappingMode).toBe("auto");
    expect(response.result.plan.triggerRef).toBe("#rest");
    expect(response.result.plan.generatedMappings.input.payload).toBe("$trigger.content");
    expect(response.result.plan.generatedMappings.output.data).toBe("$flow.message");
    expect(response.result.validation?.ok).toBe(true);
  });

  it("applies a channel trigger binding and injects a flow action reference", () => {
    const response = applyTriggerBinding(bindableFlowApp, {
      flowId: "hello",
      profile: {
        kind: "channel",
        channel: "orders"
      }
    });

    expect(response.result.applied).toBe(true);
    expect(response.result.app?.imports.some((entry) => entry.alias === "channel")).toBe(true);
    expect(response.result.app?.triggers.some((trigger) => trigger.ref === "#channel")).toBe(true);
    expect(response.result.app?.triggers[0]?.handlers[0]?.action?.ref).toBe("#flow");
    expect(response.result.app?.triggers[0]?.handlers[0]?.action?.settings?.flowURI).toBe("res://flow:hello");
  });

  it("rejects timer bindings for flows with required inputs", () => {
    const app = structuredClone(bindableFlowApp);
    app.resources.hello.data.metadata.input = [
      {
        name: "payload",
        required: true
      }
    ];

    expect(() =>
      planTriggerBinding(app, {
        flowId: "hello",
        profile: {
          kind: "timer",
          runMode: "repeat",
          repeatInterval: "10s"
        }
      })
    ).toThrow(/zero required inputs/i);
  });

  it("rejects duplicate trigger bindings unless replacement is requested", () => {
    expect(() =>
      planTriggerBinding(legacyShapeApp, {
        flowId: "hello",
        profile: {
          kind: "rest",
          method: "GET",
          path: "/hello",
          port: 8080,
          replyMode: "json",
          requestMappingMode: "auto",
          replyMappingMode: "auto"
        }
      })
    ).toThrow(/already exists/i);
  });

  it("plans extraction of a contiguous task sequence into a subflow", () => {
    const response = planSubflowExtraction(subflowCandidateApp, {
      flowId: "orchestrate",
      taskIds: ["prepare", "work"]
    });

    expect(response.result.applied).toBe(false);
    expect(response.result.plan.parentFlowId).toBe("orchestrate");
    expect(response.result.plan.newFlowContract.inputs.map((param) => param.name)).toContain("payload");
    expect(response.result.plan.newFlowContract.outputs.map((param) => param.name)).toContain("message");
    expect(response.result.plan.invocation.activityRef).toBe("#flow");
    expect(response.result.plan.invocation.settings.flowURI).toContain("res://flow:");
  });

  it("applies subflow extraction and replaces the selected region with one invocation", () => {
    const response = applySubflowExtraction(subflowCandidateApp, {
      flowId: "orchestrate",
      taskIds: ["prepare", "work"]
    });

    expect(response.result.applied).toBe(true);
    expect(response.result.app?.resources.some((resource) => resource.id === response.result.plan.newFlowId)).toBe(true);
    const parent = response.result.app?.resources.find((resource) => resource.id === "orchestrate");
    expect(parent?.data.tasks.map((task) => task.id)).toEqual([response.result.plan.invocation.taskId, "finish"]);
  });

  it("rejects non-contiguous extraction selections", () => {
    expect(() =>
      planSubflowExtraction(subflowCandidateApp, {
        flowId: "orchestrate",
        taskIds: ["prepare", "finish"]
      })
    ).toThrow(/contiguous/i);
  });

  it("rejects extraction for linked flows in this slice", () => {
    const app = structuredClone(subflowCandidateApp);
    app.resources.orchestrate.data.links = [
      {
        from: "prepare",
        to: "work"
      }
    ];

    expect(() =>
      planSubflowExtraction(app, {
        flowId: "orchestrate",
        taskIds: ["prepare", "work"]
      })
    ).toThrow(/branching/i);
  });

  it("plans and applies subflow inlining back into the parent flow", () => {
    const extracted = applySubflowExtraction(subflowCandidateApp, {
      flowId: "orchestrate",
      taskIds: ["prepare", "work"]
    });
    const invocationTaskId = extracted.result.plan.invocation.taskId;

    const plan = planSubflowInlining(extracted.result.app!, {
      parentFlowId: "orchestrate",
      invocationTaskId
    });
    expect(plan.result.plan.inlinedFlowId).toBe(extracted.result.plan.newFlowId);

    const inlined = applySubflowInlining(extracted.result.app!, {
      parentFlowId: "orchestrate",
      invocationTaskId,
      removeExtractedFlowIfUnused: true
    });

    const parent = inlined.result.app?.resources.find((resource) => resource.id === "orchestrate");
    expect(parent?.data.tasks.map((task) => task.id)).toEqual([`${invocationTaskId}__prepare`, `${invocationTaskId}__work`, "finish"]);
    expect(inlined.result.app?.resources.some((resource) => resource.id === extracted.result.plan.newFlowId)).toBe(false);
  });

  it("plans and applies iterator synthesis for a plain activity task", () => {
    const plan = planIteratorSynthesis(subflowCandidateApp, {
      flowId: "orchestrate",
      taskId: "work",
      iterateExpr: "=$flow.items",
      validateOnly: true
    });

    expect(plan.result.plan.nextTaskType).toBe("iterator");
    expect(plan.result.plan.updatedSettings.iterate).toBe("=$flow.items");

    const applied = applyIteratorSynthesis(subflowCandidateApp, {
      flowId: "orchestrate",
      taskId: "work",
      iterateExpr: "=$flow.items",
      accumulate: true
    });

    const flow = applied.result.app?.resources.find((resource) => resource.id === "orchestrate");
    const task = flow?.data.tasks.find((entry) => entry.id === "work");
    expect(task?.type).toBe("iterator");
    expect(task?.settings.iterate).toBe("=$flow.items");
    expect(task?.settings.accumulate).toBe(true);
  });

  it("adds retryOnError to an iterator task", () => {
    const iterated = applyIteratorSynthesis(subflowCandidateApp, {
      flowId: "orchestrate",
      taskId: "work",
      iterateExpr: "=$flow.items"
    });

    const response = applyRetryPolicy(iterated.result.app!, {
      flowId: "orchestrate",
      taskId: "work",
      count: 3,
      intervalMs: 500
    });

    const flow = response.result.app?.resources.find((resource) => resource.id === "orchestrate");
    const task = flow?.data.tasks.find((entry) => entry.id === "work");
    expect(task?.settings.retryOnError).toEqual({ count: 3, interval: 500 });
  });

  it("plans and applies doWhile synthesis for a subflow invocation task", () => {
    const extracted = applySubflowExtraction(subflowCandidateApp, {
      flowId: "orchestrate",
      taskIds: ["prepare", "work"]
    });
    const invocationTaskId = extracted.result.plan.invocation.taskId;

    const plan = planDoWhileSynthesis(extracted.result.app!, {
      flowId: "orchestrate",
      taskId: invocationTaskId,
      condition: "=$flow.keepGoing",
      validateOnly: true
    });
    expect(plan.result.plan.nextTaskType).toBe("doWhile");

    const applied = applyDoWhileSynthesis(extracted.result.app!, {
      flowId: "orchestrate",
      taskId: invocationTaskId,
      condition: "=$flow.keepGoing",
      delayMs: 250
    });
    const flow = applied.result.app?.resources.find((resource) => resource.id === "orchestrate");
    const task = flow?.data.tasks.find((entry) => entry.id === invocationTaskId);
    expect(task?.type).toBe("doWhile");
    expect(task?.settings.condition).toBe("=$flow.keepGoing");
    expect(task?.settings.delay).toBe(250);
  });

  it("rejects incompatible iterator and doWhile conversions", () => {
    const iterated = applyIteratorSynthesis(subflowCandidateApp, {
      flowId: "orchestrate",
      taskId: "work",
      iterateExpr: "=$flow.items"
    });

    expect(() =>
      planDoWhileSynthesis(iterated.result.app!, {
        flowId: "orchestrate",
        taskId: "work",
        condition: "=$flow.keepGoing"
      })
    ).toThrow(/iterator/i);
  });

  it("rejects duplicate retry policies unless replacement is requested", () => {
    const retried = applyRetryPolicy(subflowCandidateApp, {
      flowId: "orchestrate",
      taskId: "work",
      count: 2,
      intervalMs: 100
    });

    expect(() =>
      planRetryPolicy(retried.result.app!, {
        flowId: "orchestrate",
        taskId: "work",
        count: 4,
        intervalMs: 200
      })
    ).toThrow(/already has retryOnError/i);
  });

  it("plans and applies a log_and_continue error path for a linear flow", () => {
    const plan = planErrorPathTemplate(subflowCandidateApp, {
      flowId: "orchestrate",
      taskId: "work",
      template: "log_and_continue",
      validateOnly: true
    });

    expect(plan.result.applied).toBe(false);
    expect(plan.result.plan.generatedTaskId).toBe("error_log_work");

    const applied = applyErrorPathTemplate(subflowCandidateApp, {
      flowId: "orchestrate",
      taskId: "work",
      template: "log_and_continue"
    });

    const flow = applied.result.app?.resources.find((resource) => resource.id === "orchestrate");
    const generatedTask = flow?.data.tasks.find((task) => task.id === "error_log_work");

    expect(generatedTask?.activityRef).toBe("#log");
    expect(generatedTask?.input.message).toBe("Task work failed");
    expect(flow?.data.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "prepare", to: "work", type: "dependency" }),
        expect.objectContaining({ from: "work", to: "finish", type: "expression", value: "=$activity[work].error == nil" }),
        expect.objectContaining({ from: "work", to: "error_log_work", type: "expression", value: "=$activity[work].error != nil" }),
        expect.objectContaining({ from: "error_log_work", to: "finish", type: "dependency" })
      ])
    );
  });

  it("applies a log_and_stop error path and ends the failure branch at the generated log task", () => {
    const applied = applyErrorPathTemplate(subflowCandidateApp, {
      flowId: "orchestrate",
      taskId: "work",
      template: "log_and_stop",
      logMessage: "work failed"
    });

    const flow = applied.result.app?.resources.find((resource) => resource.id === "orchestrate");
    const generatedTask = flow?.data.tasks.find((task) => task.id === "error_log_work");
    const outgoing = flow?.data.links.filter((link) => link.from === "error_log_work") ?? [];

    expect(generatedTask?.input.message).toBe("work failed");
    expect(flow?.data.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "work", to: "finish", type: "expression", value: "=$activity[work].error == nil" }),
        expect.objectContaining({ from: "work", to: "error_log_work", type: "expression", value: "=$activity[work].error != nil" })
      ])
    );
    expect(outgoing).toEqual([]);
  });

  it("rejects log_and_continue for the last task in a flow", () => {
    expect(() =>
      planErrorPathTemplate(subflowCandidateApp, {
        flowId: "orchestrate",
        taskId: "finish",
        template: "log_and_continue"
      })
    ).toThrow(/requires the task to have a successor/i);
  });

  it("rejects unsupported existing branching links for error-path templates", () => {
    const app = structuredClone(subflowCandidateApp);
    app.resources.orchestrate.data.links = [
      { from: "prepare", to: "work", type: "dependency" },
      { from: "prepare", to: "finish", type: "dependency" }
    ];

    expect(() =>
      planErrorPathTemplate(app, {
        flowId: "orchestrate",
        taskId: "work",
        template: "log_and_stop"
      })
    ).toThrow(/branching links/i);
  });

  it("detects existing generated error paths unless replacement is requested", () => {
    const applied = applyErrorPathTemplate(subflowCandidateApp, {
      flowId: "orchestrate",
      taskId: "work",
      template: "log_and_continue"
    });

    expect(() =>
      planErrorPathTemplate(applied.result.app!, {
        flowId: "orchestrate",
        taskId: "work",
        template: "log_and_stop"
      })
    ).toThrow(/already has a generated error path/i);

    const replaced = applyErrorPathTemplate(applied.result.app!, {
      flowId: "orchestrate",
      taskId: "work",
      template: "log_and_stop",
      replaceExisting: true,
      logMessage: "replacement"
    });

    const flow = replaced.result.app?.resources.find((resource) => resource.id === "orchestrate");
    const generatedTask = flow?.data.tasks.find((task) => task.id === "error_log_work");
    const outgoing = flow?.data.links.filter((link) => link.from === "error_log_work") ?? [];

    expect(generatedTask?.input.message).toBe("replacement");
    expect(outgoing).toEqual([]);
  });

  it("adds or reuses the log import when applying error-path templates", () => {
    const withoutImports = structuredClone(subflowCandidateApp);
    withoutImports.imports = [];

    const applied = applyErrorPathTemplate(withoutImports, {
      flowId: "orchestrate",
      taskId: "work",
      template: "log_and_stop"
    });

    expect(applied.result.app?.imports.some((entry) => entry.alias === "log")).toBe(true);

    const reused = applyErrorPathTemplate(subflowCandidateApp, {
      flowId: "orchestrate",
      taskId: "work",
      template: "log_and_stop"
    });

    expect(reused.result.app?.imports.filter((entry) => entry.alias === "log")).toHaveLength(1);
  });

  it("rejects tasks without activityRef for error-path templates", () => {
    const app = structuredClone(subflowCandidateApp);
    delete app.resources.orchestrate.data.tasks[1].activity;

    expect(() =>
      planErrorPathTemplate(app, {
        flowId: "orchestrate",
        taskId: "work",
        template: "log_and_stop"
      })
    ).toThrow(/has no activityRef/i);
  });

  it("previews mapping values with sample input", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      message: "$flow.customerId",
      retryCount: "$property.retryCount",
      origin: "value:$env.REGION"
    };

    const preview = previewMapping(app, "log_1", {
      flow: { customerId: "abc-123" },
      property: { retryCount: 3 },
      env: { REGION: "us-east" }
    });

    expect(preview.fields.find((field) => field.path === "input.message")?.resolved).toBe("abc-123");
    expect(preview.fields.find((field) => field.path === "input.retryCount")?.resolved).toBe(3);
    expect(preview.fields.find((field) => field.path === "input.origin")?.resolved).toBe("value:us-east");
    expect(preview.paths.some((entry) => entry.targetPath === "input.message")).toBe(true);
    expect(preview.resolvedValues["input.message"]).toBe("abc-123");
  });

  it("suggests coercions for numeric-looking mapping fields", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      retryCount: "$property.retryCount"
    };

    const diagnostics = suggestCoercions(app, {
      property: { retryCount: "3" }
    });

    expect(diagnostics.some((diagnostic) => diagnostic.code === "flogo.mapping.coercion.numeric")).toBe(true);
  });

  it("emits descriptor-aware coercion diagnostics when resolved values do not match activity field types", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      message: "$property.retryCount"
    };

    const preview = previewMapping(app, "log_1", {
      flow: {},
      activity: {},
      env: {},
      property: { retryCount: 3 },
      trigger: {}
    });

    expect(preview.coercionDiagnostics.some((diagnostic) => diagnostic.code === "flogo.mapping.coercion.expected_type")).toBe(true);
  });

  it("reports unresolved mapping references in previews", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      message: "$activity[missing].message"
    };

    const preview = previewMapping(app, "log_1", {
      flow: {},
      activity: {},
      env: {},
      property: {},
      trigger: {}
    });

    expect(preview.diagnostics.some((diagnostic) => diagnostic.code === "flogo.mapping.unresolved_reference")).toBe(true);
  });

  it("analyzes property and environment usage", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      retryCount: "$property.retryCount",
      region: "$env.REGION"
    };

    const plan = analyzePropertyUsage(app, "rest_service");

    expect(plan.propertyRefs).toContain("retryCount");
    expect(plan.envRefs).toContain("REGION");
    expect(plan.declaredProperties).toContain("retryCount");
    expect(plan.recommendedEnv.some((entry) => entry.name === "REGION")).toBe(true);
    expect(plan.recommendedPlainEnv.some((entry) => entry.name === "REGION")).toBe(true);
    expect(plan.profileSpecificNotes.length).toBeGreaterThan(0);
  });

  it("reports undefined and unused properties in the property plan", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      missingValue: "$property.apiBaseUrl"
    };

    const plan = analyzePropertyUsage(app, "rest_service");

    expect(plan.undefinedPropertyRefs).toContain("apiBaseUrl");
    expect(plan.unusedProperties).toContain("retryCount");
    expect(plan.recommendedProperties.some((entry) => entry.name === "apiBaseUrl")).toBe(true);
  });

  it("separates secret environment recommendations by deployment profile", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      apiKey: "$env.API_KEY"
    };

    const plan = analyzePropertyUsage(app, "serverless");

    expect(plan.recommendedSecretEnv.some((entry) => entry.name === "API_KEY")).toBe(true);
    expect(plan.deploymentProfile).toBe("serverless");
  });

  it("runs a deterministic mapping test", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      message: "$flow.customerId"
    };

    const result = runMappingTest(
      app,
      "log_1",
      {
        flow: { customerId: "abc-123" },
        activity: {},
        env: {},
        property: {},
        trigger: {}
      },
      { "input.message": "abc-123" },
      true
    );

    expect(result.pass).toBe(true);
    expect(result.actualOutput["input.message"]).toBe("abc-123");
  });

  it("prefers descriptor metadata from descriptor.json when available", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-descriptor-"));
    tempPaths.push(tempDir);
    const descriptorPath = path.join(
      tempDir,
      "github.com",
      "project-flogo",
      "contrib",
      "activity",
      "log",
      "descriptor.json"
    );
    await fs.mkdir(path.dirname(descriptorPath), { recursive: true });
    await fs.writeFile(
      descriptorPath,
      JSON.stringify(
        {
          name: "workspace-log",
          type: "activity",
          version: "2.0.0",
          title: "Workspace Log",
          input: [{ name: "message", type: "string", required: true }],
          output: []
        },
        null,
        2
      ),
      "utf8"
    );

    const catalog = buildContribCatalog(validApp, { searchRoots: [tempDir] });
    const descriptor = inspectContribDescriptor(validApp, "#log", { searchRoots: [tempDir] });

    expect(catalog.entries.find((entry) => entry.alias === "log")?.name).toBe("workspace-log");
    expect(descriptor?.descriptor.source).toBe("workspace_descriptor");
    expect(descriptor?.descriptor.evidence?.source).toBe("workspace_descriptor");
    expect(descriptor?.diagnostics).toEqual([]);
  });

  it("resolves package-backed contribution inventory from a go.mod workspace", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-package-inventory-"));
    tempPaths.push(tempDir);
    const appDir = path.join(tempDir, "apps", "demo");
    const appPath = path.join(appDir, "flogo.json");
    await fs.mkdir(appDir, { recursive: true });
    await fs.writeFile(path.join(tempDir, "go.mod"), "module github.com/project-flogo/contrib\n\ngo 1.22.0\n", "utf8");
    await fs.mkdir(path.join(tempDir, "activity", "customlog"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "activity", "customlog", "activity.go"), "package customlog\n", "utf8");
    await fs.mkdir(path.join(tempDir, "trigger", "customtimer"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "trigger", "customtimer", "descriptor.json"),
      JSON.stringify(
        {
          name: "customtimer",
          type: "trigger",
          title: "Custom Timer",
          version: "0.1.0",
          settings: [{ name: "interval", type: "string", required: true }]
        },
        null,
        2
      ),
      "utf8"
    );
    await fs.writeFile(appPath, JSON.stringify(validApp, null, 2), "utf8");

    const workspaceApp = {
      ...structuredClone(validApp),
      imports: [
        {
          alias: "customlog",
          ref: "github.com/project-flogo/contrib/activity/customlog"
        },
        {
          alias: "customtimer",
          ref: "github.com/project-flogo/contrib/trigger/customtimer"
        }
      ]
    };

    const inventory = buildContributionInventory(workspaceApp, { appPath });
    const customLog = inventory.entries.find((entry) => entry.alias === "customlog");
    const customTimer = inventory.entries.find((entry) => entry.alias === "customtimer");

    expect(customLog?.source).toBe("package_source");
    expect(customLog?.packageRoot).toContain(path.join("activity", "customlog"));
    expect(customLog?.modulePath).toBe("github.com/project-flogo/contrib");
    expect(customLog?.goPackagePath).toBe("github.com/project-flogo/contrib/activity/customlog");
    expect(customLog?.confidence).toBe("high");
    expect(customLog?.discoveryReason).toContain("Go package files");
    expect(customTimer?.source).toBe("package_descriptor");
    expect(customTimer?.descriptor?.version).toBe("0.1.0");
    expect(customTimer?.modulePath).toBe("github.com/project-flogo/contrib");
    expect(customTimer?.goPackagePath).toBe("github.com/project-flogo/contrib/trigger/customtimer");
  });

  it("resolves contribution inventory from the Go module cache and captures discovered versions", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-module-cache-"));
    tempPaths.push(tempDir);
    const previousGoModCache = process.env.GOMODCACHE;
    process.env.GOMODCACHE = tempDir;

    try {
      const packageDir = path.join(
        tempDir,
        "github.com",
        "project-flogo",
        "contrib@v1.2.3",
        "activity",
        "cachelog"
      );
      await fs.mkdir(packageDir, { recursive: true });
      await fs.writeFile(
        path.join(packageDir, "descriptor.json"),
        JSON.stringify(
          {
            name: "cachelog",
            type: "activity",
            title: "Cache Log",
            input: [{ name: "message", type: "string", required: true }]
          },
          null,
          2
        ),
        "utf8"
      );

      const app = {
        ...structuredClone(validApp),
        imports: [
          {
            alias: "cachelog",
            ref: "github.com/project-flogo/contrib/activity/cachelog"
          }
        ]
      };

      const inventory = buildContributionInventory(app);
      const cacheLog = inventory.entries.find((entry) => entry.alias === "cachelog");

      expect(cacheLog?.source).toBe("package_descriptor");
      expect(cacheLog?.version).toBe("v1.2.3");
      expect(cacheLog?.versionSource).toBe("package");
      expect(cacheLog?.packageRoot).toContain(path.join("contrib@v1.2.3", "activity", "cachelog"));
    } finally {
      if (previousGoModCache === undefined) {
        delete process.env.GOMODCACHE;
      } else {
        process.env.GOMODCACHE = previousGoModCache;
      }
    }
  });

  it("inspects contribution evidence with confidence metadata", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-contrib-evidence-"));
    tempPaths.push(tempDir);
    const descriptorPath = path.join(
      tempDir,
      "github.com",
      "project-flogo",
      "contrib",
      "activity",
      "log",
      "descriptor.json"
    );
    await fs.mkdir(path.dirname(descriptorPath), { recursive: true });
    await fs.writeFile(
      descriptorPath,
      JSON.stringify(
        {
          name: "workspace-log",
          type: "activity",
          version: "2.1.0",
          input: [{ name: "message", type: "string", required: true }]
        },
        null,
        2
      ),
      "utf8"
    );

    const evidence = inspectContribEvidence(validApp, "#log", { searchRoots: [tempDir] });

    expect(evidence).toBeDefined();
    expect(evidence?.source).toBe("workspace_descriptor");
    expect(evidence?.confidence).toBe("high");
    expect(evidence?.discoveryReason).toContain("workspace descriptor");
    expect(evidence?.descriptor?.evidence?.confidence).toBe("high");
  });

  it("reports governance findings for duplicate aliases and missing refs", () => {
    const app = structuredClone(validApp);
    app.imports.push({
      alias: "log",
      ref: "github.com/project-flogo/contrib/activity/log",
      version: "1.0.0"
    });
    app.resources[0].data.tasks.push({
      id: "missing_1",
      activityRef: "#missing",
      input: {}
    });

    const governance = validateGovernance(app);

    expect(governance.ok).toBe(false);
    expect(governance.aliasIssues.some((issue) => issue.kind === "duplicate_alias" && issue.alias === "log")).toBe(true);
    expect(governance.orphanedRefs.some((entry) => entry.ref === "#missing" && entry.kind === "activity")).toBe(true);
    expect(governance.versionFindings.some((finding) => finding.alias === "rest" && finding.status === "missing")).toBe(true);
    expect(governance.inventorySummary?.entryCount).toBeGreaterThan(0);
    expect(governance.fallbackContribs).toContain("github.com/project-flogo/contrib/activity/log");
    expect(governance.weakEvidenceContribs).toContain("github.com/project-flogo/contrib/activity/log");
    expect(Array.isArray(governance.unusedImports)).toBe(true);
    expect(Array.isArray(governance.duplicateAliases)).toBe(true);
  });

  it("compares canonical and programmatic composition for app and resource targets", () => {
    const appComparison = compareJsonVsProgrammatic(validApp, {
      mode: "analyze",
      target: "app"
    });
    const resourceComparison = compareJsonVsProgrammatic(legacyShapeApp, {
      mode: "analyze",
      target: "resource",
      resourceId: "hello"
    });
    const missingResource = compareJsonVsProgrammatic(validApp, {
      mode: "analyze",
      target: "resource",
      resourceId: "missing"
    });

    expect(appComparison.ok).toBe(true);
    expect(appComparison.differences).toEqual([]);
    expect(appComparison.comparisonBasis).toBe("inventory_backed");
    expect(appComparison.signatureEvidenceLevel).toBe("fallback_only");
    expect(appComparison.signatureCoverage).toBe("partial");
    expect(appComparison.inventoryRefsUsed).toContain("github.com/project-flogo/contrib/trigger/rest");
    expect(resourceComparison.ok).toBe(true);
    expect(resourceComparison.differences).toEqual([]);
    expect(missingResource.ok).toBe(false);
    expect(missingResource.diagnostics.some((diagnostic) => diagnostic.code === "flogo.composition.resource_not_found")).toBe(
      true
    );
  });
});
