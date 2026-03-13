import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { RunnerExecutorService } from "./runner-executor.service";

describe("RunnerExecutorService", () => {
  const originalHelperBin = process.env.FLOGO_HELPER_BIN;

  afterEach(async () => {
    if (originalHelperBin) {
      process.env.FLOGO_HELPER_BIN = originalHelperBin;
    } else {
      delete process.env.FLOGO_HELPER_BIN;
    }
  });

  it("returns a successful mock result by default", async () => {
    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-1",
      jobKind: "build",
      stepType: "build",
      snapshotUri: ".",
      appPath: "flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://build",
      jobTemplateName: "flogo-runner",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts).toHaveLength(1);
  });

  it("executes helper-backed catalog analysis and publishes a catalog artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        appName: "demo",
        entries: [],
        diagnostics: []
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-2",
      jobKind: "catalog",
      stepType: "catalog_contribs",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://catalog",
      jobTemplateName: "flogo-runner",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "contrib_catalog")).toBe(true);
  });

  it("executes helper-backed inventory analysis and publishes an inventory artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        appName: "demo",
        entries: [],
        diagnostics: []
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-inventory",
      jobKind: "inventory",
      stepType: "inventory_contribs",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://inventory",
      jobTemplateName: "flogo-runner",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "contrib_inventory")).toBe(true);
  });

  it("executes helper-backed flow-contract inference and publishes a flow-contract artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        contracts: {
          appName: "demo",
          contracts: [
            {
              flowId: "hello",
              name: "hello",
              resourceRef: "#flow:hello",
              inputs: [],
              outputs: [],
              reusable: false,
              usage: {
                flowId: "hello",
                handlerRefs: [],
                triggerRefs: [],
                actionRefs: [],
                usedByCount: 0
              },
              diagnostics: [],
              evidenceLevel: "metadata_only"
            }
          ],
          diagnostics: []
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-flow-contracts",
      jobKind: "flow_contracts",
      stepType: "infer_flow_contracts",
      analysisKind: "flow_contracts",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://flow-contracts",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "hello"
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "flow_contract")).toBe(true);
  });

  it("executes helper-backed trigger binding and publishes a trigger-binding plan artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          applied: false,
          plan: {
            flowId: "hello",
            profile: {
              kind: "rest",
              method: "POST",
              path: "/hello",
              port: 8081,
              replyMode: "json",
              requestMappingMode: "auto",
              replyMappingMode: "auto"
            },
            triggerRef: "#rest",
            triggerId: "flogo-rest-hello",
            handlerName: "post_hello",
            generatedMappings: {
              input: {
                payload: "$trigger.content"
              },
              output: {
                data: "$flow.message"
              }
            },
            trigger: {
              id: "flogo-rest-hello",
              ref: "#rest",
              settings: {
                port: 8081
              },
              handlers: []
            },
            diagnostics: [],
            warnings: []
          },
          patchSummary: "Added trigger \"flogo-rest-hello\"",
          validation: {
            ok: true,
            stages: []
          }
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-trigger-binding",
      jobKind: "trigger_binding",
      stepType: "bind_trigger",
      analysisKind: "trigger_binding_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://trigger-binding",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "hello",
        validateOnly: true,
        profile: {
          kind: "rest",
          method: "POST",
          path: "/hello",
          port: 8081,
          replyMode: "json",
          requestMappingMode: "auto",
          replyMappingMode: "auto"
        }
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "trigger_binding_plan")).toBe(true);
  });

  it("executes helper-backed subflow extraction and publishes a subflow-extraction plan artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          applied: false,
          plan: {
            parentFlowId: "orchestrate",
            newFlowId: "orchestrate-subflow-prepare-work",
            newFlowName: "orchestrate subflow (prepare to work)",
            selectedTaskIds: ["prepare", "work"],
            newFlowContract: {
              flowId: "orchestrate-subflow-prepare-work",
              name: "orchestrate subflow (prepare to work)",
              resourceRef: "#flow:orchestrate-subflow-prepare-work",
              inputs: [{ name: "payload", type: "unknown", required: false, source: "mapping_inferred" }],
              outputs: [{ name: "message", type: "unknown", required: false, source: "mapping_inferred" }],
              reusable: true,
              usage: {
                flowId: "orchestrate-subflow-prepare-work",
                handlerRefs: [],
                triggerRefs: [],
                actionRefs: [],
                usedByCount: 0
              },
              diagnostics: [],
              evidenceLevel: "metadata_plus_mapping"
            },
            invocation: {
              parentFlowId: "orchestrate",
              taskId: "subflow_orchestrate_subflow_prepare_work",
              activityRef: "#flow",
              input: { payload: "$flow.payload" },
              output: { message: "$activity[subflow_orchestrate_subflow_prepare_work].message" },
              settings: { flowURI: "res://flow:orchestrate-subflow-prepare-work" }
            },
            diagnostics: [],
            warnings: []
          },
          patchSummary: "resources +1",
          validation: {
            ok: true,
            stages: []
          }
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-subflow-extraction",
      jobKind: "subflow_extraction",
      stepType: "extract_subflow",
      analysisKind: "subflow_extraction_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://subflow-extraction",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "orchestrate",
        taskIds: ["prepare", "work"],
        validateOnly: true
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "subflow_extraction_plan")).toBe(true);
  });

  it("executes helper-backed subflow inlining and publishes a subflow-inlining plan artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          applied: false,
          plan: {
            parentFlowId: "orchestrate",
            invocationTaskId: "subflow_orchestrate_subflow_prepare_work",
            inlinedFlowId: "orchestrate-subflow-prepare-work",
            generatedTaskIds: [
              "subflow_orchestrate_subflow_prepare_work__prepare",
              "subflow_orchestrate_subflow_prepare_work__work"
            ],
            diagnostics: [],
            warnings: []
          },
          patchSummary: "resources -1",
          validation: {
            ok: true,
            stages: []
          }
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-subflow-inlining",
      jobKind: "subflow_inlining",
      stepType: "inline_subflow",
      analysisKind: "subflow_inlining_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://subflow-inlining",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        parentFlowId: "orchestrate",
        invocationTaskId: "subflow_orchestrate_subflow_prepare_work",
        validateOnly: true
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "subflow_inlining_plan")).toBe(true);
  });

  it("executes helper-backed iterator synthesis and publishes an iterator artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          applied: false,
          plan: {
            flowId: "orchestrate",
            taskId: "work",
            nextTaskType: "iterator",
            updatedSettings: {
              iterate: "=$flow.items"
            },
            diagnostics: [],
            warnings: []
          },
          patchSummary: "Converted task \"work\" in flow \"orchestrate\" to iterator",
          validation: {
            ok: true,
            stages: []
          }
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-iterator",
      jobKind: "iterator_synthesis",
      stepType: "add_iterator",
      analysisKind: "iterator_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://iterator",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "orchestrate",
        taskId: "work",
        iterateExpr: "=$flow.items",
        validateOnly: true
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "iterator_plan")).toBe(true);
  });

  it("executes helper-backed retry synthesis and publishes a retry artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          applied: true,
          plan: {
            flowId: "orchestrate",
            taskId: "work",
            retryOnError: {
              count: 3,
              interval: 250
            },
            diagnostics: [],
            warnings: []
          },
          patchSummary: "Added retryOnError to task \"work\" in flow \"orchestrate\"",
          validation: {
            ok: true,
            stages: []
          },
          app: {}
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-retry",
      jobKind: "retry_policy_synthesis",
      stepType: "add_retry_policy",
      analysisKind: "retry_policy_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://retry",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "orchestrate",
        taskId: "work",
        count: 3,
        intervalMs: 250,
        validateOnly: false
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "retry_policy_result")).toBe(true);
  });

  it("executes helper-backed doWhile synthesis and publishes a doWhile artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          applied: false,
          plan: {
            flowId: "orchestrate",
            taskId: "work",
            nextTaskType: "doWhile",
            updatedSettings: {
              condition: "=$flow.keepGoing",
              delay: 100
            },
            diagnostics: [],
            warnings: []
          },
          patchSummary: "Converted task \"work\" in flow \"orchestrate\" to doWhile",
          validation: {
            ok: true,
            stages: []
          }
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-dowhile",
      jobKind: "dowhile_synthesis",
      stepType: "add_dowhile",
      analysisKind: "dowhile_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://dowhile",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "orchestrate",
        taskId: "work",
        condition: "=$flow.keepGoing",
        delayMs: 100,
        validateOnly: true
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "dowhile_plan")).toBe(true);
  });

  it("executes helper-backed error-path planning and publishes an error-path plan artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          applied: false,
          plan: {
            flowId: "orchestrate",
            taskId: "work",
            template: "log_and_continue",
            generatedTaskId: "error_log_work",
            addedImport: false,
            generatedLinks: [
              {
                from: "work",
                to: "finish",
                type: "expression",
                value: "=$activity[work].error == nil"
              },
              {
                from: "work",
                to: "error_log_work",
                type: "expression",
                value: "=$activity[work].error != nil"
              }
            ],
            diagnostics: [],
            warnings: []
          },
          patchSummary: "Added log_and_continue error path to task \"work\" in flow \"orchestrate\"",
          validation: {
            ok: true,
            stages: []
          }
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-error-path-plan",
      jobKind: "error_path_synthesis",
      stepType: "add_error_path",
      analysisKind: "error_path_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://error-path-plan",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "orchestrate",
        taskId: "work",
        template: "log_and_continue",
        validateOnly: true
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "error_path_plan")).toBe(true);
  });

  it("executes helper-backed error-path apply and publishes an error-path result artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          applied: true,
          plan: {
            flowId: "orchestrate",
            taskId: "work",
            template: "log_and_stop",
            generatedTaskId: "error_log_work",
            addedImport: true,
            generatedLinks: [
              {
                from: "work",
                to: "error_log_work",
                type: "expression",
                value: "=$activity[work].error != nil"
              }
            ],
            diagnostics: [],
            warnings: []
          },
          patchSummary: "Added log_and_stop error path to task \"work\" in flow \"orchestrate\"",
          validation: {
            ok: true,
            stages: []
          },
          app: {}
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-error-path-apply",
      jobKind: "error_path_synthesis",
      stepType: "add_error_path",
      analysisKind: "error_path_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://error-path-result",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "orchestrate",
        taskId: "work",
        template: "log_and_stop",
        validateOnly: false,
        replaceExisting: true
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "error_path_result")).toBe(true);
  });

  it("executes helper-backed mapping preview analysis and publishes a preview artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        nodeId: "log-request",
        flowId: "hello",
        fields: [],
        suggestedCoercions: [],
        diagnostics: []
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-3",
      jobKind: "mapping_preview",
      stepType: "preview_mapping",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://preview",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flow: {},
        activity: {},
        env: {},
        property: {},
        trigger: {}
      },
      targetNodeId: "log-request",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "mapping_preview")).toBe(true);
  });

  it("executes helper-backed run-trace planning and publishes a run-trace plan artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        validation: {
          ok: true,
          stages: [
            {
              stage: "runtime",
              ok: true,
              diagnostics: []
            }
          ],
          summary: "Run trace plan is valid for flow hello.",
          artifacts: []
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-run-trace-plan",
      jobKind: "run_trace_capture",
      stepType: "capture_run_trace",
      analysisKind: "run_trace_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://run-trace-plan",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "hello",
        sampleInput: {},
        validateOnly: true
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "run_trace_plan")).toBe(true);
  });

  it("executes helper-backed run-trace capture and publishes a run-trace artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        trace: {
          appName: "demo",
          flowId: "hello",
          summary: {
            flowId: "hello",
            status: "completed",
            input: {
              name: "Ada"
            },
            output: {
              message: "hello"
            },
            stepCount: 1,
            diagnostics: []
          },
          steps: [
            {
              taskId: "log_1",
              status: "completed",
              diagnostics: []
            }
          ],
          diagnostics: []
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-run-trace",
      jobKind: "run_trace_capture",
      stepType: "capture_run_trace",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://run-trace",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "hello",
        sampleInput: {
          name: "Ada"
        },
        validateOnly: false
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "run_trace")).toBe(true);
  });

  it("executes helper-backed replay planning and publishes a replay-plan artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          summary: {
            flowId: "hello",
            status: "completed",
            inputSource: "explicit_input",
            baseInput: {
              payload: "hello"
            },
            effectiveInput: {
              payload: "hello"
            },
            overridesApplied: false,
            diagnostics: []
          },
          validation: {
            ok: true,
            stages: [],
            summary: "Replay plan is valid for flow hello.",
            artifacts: []
          }
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-replay-plan",
      jobKind: "flow_replay",
      stepType: "replay_flow",
      analysisKind: "replay_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://replay-plan",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "hello",
        baseInput: {
          payload: "hello"
        },
        validateOnly: true
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "replay_plan")).toBe(true);
  });

  it("executes helper-backed replay and publishes a replay-report artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          summary: {
            flowId: "hello",
            status: "completed",
            inputSource: "explicit_input",
            baseInput: {
              payload: "hello"
            },
            effectiveInput: {
              payload: "hello"
            },
            overridesApplied: false,
            diagnostics: []
          },
          trace: {
            appName: "demo",
            flowId: "hello",
            summary: {
              flowId: "hello",
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
                taskId: "log",
                status: "completed",
                diagnostics: []
              }
            ],
            diagnostics: []
          }
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-replay",
      jobKind: "flow_replay",
      stepType: "replay_flow",
      analysisKind: "replay",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://replay",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "hello",
        baseInput: {
          payload: "hello"
        }
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "replay_report")).toBe(true);
  });

  it("executes helper-backed run-comparison planning and publishes a run-comparison-plan artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        validation: {
          ok: true,
          stages: [
            {
              stage: "runtime",
              ok: true,
              diagnostics: []
            }
          ],
          summary: "Run comparison inputs are valid and ready to compare.",
          artifacts: []
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-run-comparison-plan",
      jobKind: "run_comparison",
      stepType: "compare_runs",
      analysisKind: "run_comparison_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://run-comparison-plan",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        leftArtifactId: "left-trace",
        rightArtifactId: "right-trace",
        leftArtifact: {
          artifactId: "left-trace",
          kind: "run_trace",
          payload: {
            trace: {
              appName: "demo",
              flowId: "hello",
              summary: {
                flowId: "hello",
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
        rightArtifact: {
          artifactId: "right-trace",
          kind: "run_trace",
          payload: {
            trace: {
              appName: "demo",
              flowId: "hello",
              summary: {
                flowId: "hello",
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
        validateOnly: true
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "run_comparison_plan")).toBe(true);
  });

  it("executes helper-backed run comparison and publishes a run-comparison artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          left: {
            artifactId: "left-trace",
            kind: "run_trace",
            summaryStatus: "completed",
            flowId: "hello"
          },
          right: {
            artifactId: "right-replay",
            kind: "replay_report",
            summaryStatus: "completed",
            flowId: "hello"
          },
          summary: {
            statusChanged: false,
            inputDiff: {
              kind: "changed",
              left: { payload: "hello" },
              right: { payload: "replayed" }
            },
            outputDiff: {
              kind: "changed",
              left: { message: "hello" },
              right: { message: "replayed" }
            },
            errorDiff: {
              kind: "same",
              left: null,
              right: null
            },
            stepCountDiff: {
              kind: "same",
              left: 1,
              right: 1
            },
            diagnosticDiffs: []
          },
          steps: [
            {
              taskId: "log",
              leftStatus: "completed",
              rightStatus: "completed",
              outputDiff: {
                kind: "changed",
                left: { message: "hello" },
                right: { message: "replayed" }
              },
              diagnosticDiffs: [],
              changeKind: "changed"
            }
          ],
          diagnostics: []
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-run-comparison",
      jobKind: "run_comparison",
      stepType: "compare_runs",
      analysisKind: "run_comparison",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://run-comparison",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        leftArtifactId: "left-trace",
        rightArtifactId: "right-replay",
        leftArtifact: {
          artifactId: "left-trace",
          kind: "run_trace",
          payload: {
            trace: {
              appName: "demo",
              flowId: "hello",
              summary: {
                flowId: "hello",
                status: "completed",
                input: { payload: "hello" },
                output: { message: "hello" },
                stepCount: 1,
                diagnostics: []
              },
              steps: [{ taskId: "log", status: "completed", diagnostics: [] }],
              diagnostics: []
            }
          }
        },
        rightArtifact: {
          artifactId: "right-replay",
          kind: "replay_report",
          payload: {
            result: {
              summary: {
                flowId: "hello",
                status: "completed",
                inputSource: "explicit_input",
                baseInput: { payload: "hello" },
                effectiveInput: { payload: "replayed" },
                overridesApplied: true,
                diagnostics: []
              },
              trace: {
                appName: "demo",
                flowId: "hello",
                summary: {
                  flowId: "hello",
                  status: "completed",
                  input: { payload: "replayed" },
                  output: { message: "replayed" },
                  stepCount: 1,
                  diagnostics: []
                },
                steps: [{ taskId: "log", status: "completed", diagnostics: [] }],
                diagnostics: []
              }
            }
          }
        }
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "run_comparison")).toBe(true);
  });

  it("executes helper-backed mapping test analysis and publishes a mapping-test artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          pass: true,
          nodeId: "log-request",
          actualOutput: {
            "input.message": "received hello request"
          },
          differences: [],
          diagnostics: []
        },
        propertyPlan: {
          declaredProperties: [],
          propertyRefs: [],
          envRefs: [],
          undefinedPropertyRefs: [],
          unusedProperties: [],
          deploymentProfile: "rest_service",
          recommendations: [],
          recommendedProperties: [],
          recommendedEnv: [],
          recommendedSecretEnv: [],
          recommendedPlainEnv: [],
          deploymentNotes: [],
          profileSpecificNotes: [],
          diagnostics: []
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-mapping-test",
      jobKind: "mapping_test",
      stepType: "test_mapping",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://mapping-test",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        sampleInput: {
          flow: {},
          activity: {},
          env: {},
          property: {},
          trigger: {}
        },
        expectedOutput: {
          "input.message": "received hello request"
        },
        strict: true
      },
      targetNodeId: "log-request",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "mapping_test")).toBe(true);
  });

  it("executes helper-backed property planning and publishes a property-plan artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        propertyPlan: {
          declaredProperties: [],
          propertyRefs: [],
          envRefs: [],
          undefinedPropertyRefs: [],
          unusedProperties: [],
          deploymentProfile: "rest_service",
          recommendations: [],
          recommendedProperties: [],
          recommendedEnv: [],
          recommendedSecretEnv: [],
          recommendedPlainEnv: [],
          deploymentNotes: [],
          profileSpecificNotes: [],
          diagnostics: []
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-property-plan",
      jobKind: "property_plan",
      stepType: "plan_properties",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://property-plan",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        profile: "rest_service"
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "property_plan")).toBe(true);
  });

  it("executes helper-backed descriptor inspection and publishes a descriptor artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        descriptor: {
          ref: "github.com/project-flogo/contrib/activity/log",
          alias: "log",
          type: "activity",
          name: "log",
          settings: [],
          inputs: [],
          outputs: [],
          examples: [],
          compatibilityNotes: [],
          source: "registry"
        },
        diagnostics: []
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-4",
      jobKind: "catalog",
      stepType: "inspect_descriptor",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://descriptor",
      jobTemplateName: "flogo-runner",
      targetRef: "#log",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.name.includes("descriptor"))).toBe(true);
  });

  it("executes helper-backed contribution evidence inspection and publishes an evidence artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        evidence: {
          ref: "github.com/project-flogo/contrib/activity/log",
          alias: "log",
          type: "activity",
          name: "log",
          source: "registry",
          confidence: "medium",
          settings: [],
          inputs: [],
          outputs: [],
          diagnostics: []
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-evidence",
      jobKind: "contrib_evidence",
      stepType: "inspect_contrib_evidence",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://evidence",
      jobTemplateName: "flogo-runner",
      targetRef: "#log",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "contrib_evidence")).toBe(true);
  });

  it("executes helper-backed governance validation and publishes a governance artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        appName: "demo",
        ok: true,
        aliasIssues: [],
        orphanedRefs: [],
        versionFindings: [],
        diagnostics: []
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-5",
      jobKind: "governance",
      stepType: "validate_governance",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://governance",
      jobTemplateName: "flogo-runner",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "governance_report")).toBe(true);
  });

  it("executes helper-backed composition comparison and publishes a composition artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        appName: "demo",
        ok: true,
        canonicalHash: "abc",
        programmaticHash: "abc",
        signatureEvidenceLevel: "fallback_only",
        differences: [],
        diagnostics: []
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-6",
      jobKind: "composition_compare",
      stepType: "compare_composition",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://compare",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        target: "app"
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "composition_compare")).toBe(true);
  });
});

async function createHelperScript(stdout: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-helper-test-"));
  const scriptPath = path.join(tempDir, process.platform === "win32" ? "helper.cmd" : "helper.sh");

  const contents =
    process.platform === "win32"
      ? `@echo off\r\necho ${stdout}\r\n`
      : `#!/usr/bin/env sh\nprintf '%s\n' '${stdout}'\n`;

  await fs.writeFile(scriptPath, contents, "utf8");
  if (process.platform !== "win32") {
    await fs.chmod(scriptPath, 0o755);
  }

  return scriptPath;
}
