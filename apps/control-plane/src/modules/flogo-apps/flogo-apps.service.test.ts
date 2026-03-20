import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { AppAnalysisStorageService } from "./app-analysis-storage.service.js";
import { FlogoAppsService } from "./flogo-apps.service.js";

describe("FlogoAppsService", () => {
  const tempPaths: string[] = [];
  const originalHelperBin = process.env.FLOGO_HELPER_BIN;

  afterAll(async () => {
    if (originalHelperBin) {
      process.env.FLOGO_HELPER_BIN = originalHelperBin;
    } else {
      delete process.env.FLOGO_HELPER_BIN;
    }
    await Promise.all(tempPaths.map((tempPath) => fs.rm(tempPath, { recursive: true, force: true })));
  });

  const createService = (options?: { storedAppPath?: string; storedAppId?: string; storedAppName?: string }) => {
    const artifacts: Array<{ id: string; taskId: string; kind: string; name: string; uri: string; metadata?: unknown }> = [];
    const tasks = new Map<string, { flogoAppId?: string; requestedBy?: string }>();
    const storedPayloads: Array<{ blobPath: string; payload: Record<string, unknown> }> = [];

    const storage = {
      storeJsonArtifact: async ({
        projectId,
        appId,
        artifactId,
        kind,
        payload
      }: {
        projectId: string;
        appId: string;
        artifactId: string;
        kind: string;
        payload: Record<string, unknown>;
      }) => {
        const blobPath = `app-analysis/${projectId}/${appId}/${kind}/${artifactId}.json`;
        storedPayloads.push({ blobPath, payload });
        return {
          uri: `http://storage.test/flogo-analysis/${blobPath}`,
          blobPath,
          contentType: "application/json"
        };
      },
      loadJsonArtifact: async (blobPath: string) => {
        const match = storedPayloads.find((entry) => entry.blobPath === blobPath);
        if (!match) {
          throw new Error(`Unknown blob path ${blobPath}`);
        }
        return match.payload;
      }
    } satisfies Pick<AppAnalysisStorageService, "storeJsonArtifact" | "loadJsonArtifact">;

    const prisma = {
      organization: {
        upsert: async () => ({ id: "local-organization" })
      },
      project: {
        upsert: async () => ({ id: "demo" })
      },
      flogoApp: {
        findFirst: async ({ where }: { where: { OR: Array<{ id?: string; appName?: string }> } }) => {
          const storedAppId = options?.storedAppId ?? "hello-rest";
          const storedAppName = options?.storedAppName ?? "hello-rest";
          const match = where.OR.find((entry) => entry.id === storedAppId || entry.appName === storedAppName);
          return match
            ? {
                id: `flogo-app-demo-${storedAppName}`,
                appPath: options?.storedAppPath ?? "missing"
              }
            : null;
        },
        upsert: async ({ where }: { where: { id: string } }) => ({
          id: where.id
        })
      },
      task: {
        create: async ({ data }: { data: { id: string; flogoAppId?: string; requestedBy?: string } }) => {
          tasks.set(data.id, {
            flogoAppId: data.flogoAppId,
            requestedBy: data.requestedBy
          });
          return data;
        }
      },
      artifact: {
        create: async ({
          data
        }: {
          data: { id: string; taskId: string; kind: string; name: string; uri: string; metadata?: unknown };
        }) => {
          artifacts.push({
            id: data.id,
            taskId: data.taskId,
            kind: data.kind,
            name: data.name,
            uri: data.uri,
            metadata: data.metadata
          });
          return data;
        },
        findMany: async ({
          where
        }: {
          where: { task: { flogoAppId?: string; requestedBy?: string } };
        }) =>
          artifacts.filter((artifact) => {
            const task = tasks.get(artifact.taskId);
            return task?.requestedBy === where.task.requestedBy && task.flogoAppId === where.task.flogoAppId;
          }),
        findFirst: async ({
          where
        }: {
          where: { id: string; kind?: string; task?: { flogoAppId?: string; requestedBy?: string } };
        }) => {
          const artifact = artifacts.find((entry) => entry.id === where.id && (!where.kind || entry.kind === where.kind));
          if (!artifact) {
            return null;
          }
          const task = tasks.get(artifact.taskId);
          if (where.task?.requestedBy && task?.requestedBy !== where.task.requestedBy) {
            return null;
          }
          if (where.task?.flogoAppId && task?.flogoAppId !== where.task.flogoAppId) {
            return null;
          }
          return artifact;
        }
      }
    };

    return {
      service: new FlogoAppsService(storage as AppAnalysisStorageService, prisma as any),
      storedPayloads
    };
  };

  async function createStoredAppFile() {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-apps-service-"));
    const appPath = path.join(tempDir, "stored-app.json");
    tempPaths.push(tempDir);
    await fs.writeFile(
      appPath,
      JSON.stringify(
        {
          name: "stored-rest",
          type: "flogo:app",
          appModel: "1.1.0",
          imports: [
            {
              alias: "rest",
              ref: "#rest"
            }
          ],
          triggers: [
            {
              id: "rest_trigger",
              ref: "#rest",
              handlers: [
                {
                  settings: {
                    method: "GET",
                    path: "/stored"
                  },
                  action: {
                    ref: "flow:stored"
                  }
                }
              ]
            }
          ],
          resources: {
            stored: {
              id: "stored",
              data: {
                name: "stored",
                metadata: {
                  input: [],
                  output: []
                },
                tasks: []
              }
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );
    return appPath;
  }

  async function createBindableStoredAppFile() {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-apps-bindable-"));
    const appPath = path.join(tempDir, "bindable-app.json");
    tempPaths.push(tempDir);
    await fs.writeFile(
      appPath,
      JSON.stringify(
        {
          name: "bindable-rest",
          type: "flogo:app",
          appModel: "1.1.0",
          imports: [
            {
              alias: "log",
              ref: "#log"
            }
          ],
          resources: {
            hello: {
              type: "flow",
              data: {
                name: "hello",
                metadata: {
                  input: ["payload"],
                  output: ["message"]
                },
                tasks: [
                  {
                    id: "log-request",
                    activity: {
                      ref: "#log"
                    },
                    input: {
                      message: "received request"
                    }
                  }
                ]
              }
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );
    return appPath;
  }

  async function createSubflowStoredAppFile() {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-apps-subflow-"));
    const appPath = path.join(tempDir, "subflow-app.json");
    tempPaths.push(tempDir);
    await fs.writeFile(
      appPath,
      JSON.stringify(
        {
          name: "subflow-app",
          type: "flogo:app",
          appModel: "1.1.0",
          imports: [
            {
              alias: "log",
              ref: "#log"
            }
          ],
          resources: {
            orchestrate: {
              type: "flow",
              data: {
                name: "orchestrate",
                metadata: {
                  input: [{ name: "payload", required: true }],
                  output: [{ name: "message" }]
                },
                tasks: [
                  {
                    id: "prepare",
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
        },
        null,
        2
      ),
      "utf8"
    );
    return appPath;
  }

  async function createHelperScript(stdout: string) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-helper-test-"));
    const scriptPath = path.join(tempDir, process.platform === "win32" ? "helper.cmd" : "helper.sh");
    tempPaths.push(tempDir);

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

  it("returns a contribution catalog for example apps", async () => {
    const { service, storedPayloads } = createService();
    const response = await service.getCatalog("demo", "hello-rest");

    expect(response).toBeDefined();
    expect(response?.catalog.entries.some((entry) => entry.type === "trigger" && entry.name === "rest")).toBe(true);
    expect(response?.catalog.entries.some((entry) => entry.type === "activity" && entry.name === "log")).toBe(true);
    expect(response?.catalog.entries.some((entry) => entry.type === "action" && entry.ref === "#flow:hello")).toBe(true);
    expect(response?.artifact?.type).toBe("contrib_catalog");
    expect(response?.artifact?.metadata?.blobPath).toBeDefined();
    expect(storedPayloads).toHaveLength(1);
  });

  it("returns a contribution inventory for example apps", async () => {
    const { service, storedPayloads } = createService();
    const response = await service.getInventory("demo", "hello-rest");

    expect(response).toBeDefined();
    expect(response?.inventory.entries.some((entry) => entry.alias === "rest")).toBe(true);
    expect(response?.inventory.entries.some((entry) => entry.ref === "#flow:hello")).toBe(true);
    expect(response?.artifact?.type).toBe("contrib_inventory");
    expect(response?.artifact?.metadata?.blobPath).toBeDefined();
    expect(storedPayloads).toHaveLength(1);
  });

  it("returns inferred flow contracts for example apps", async () => {
    const { service, storedPayloads } = createService();
    const response = await service.getFlowContracts("demo", "hello-rest");

    expect(response).toBeDefined();
    expect(response?.contracts.contracts.some((contract) => contract.flowId === "hello")).toBe(true);
    expect(response?.artifact?.type).toBe("flow_contract");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/flow_contract/"))).toBe(true);
  });

  it("returns a single inferred flow contract when flowId is provided", async () => {
    const { service } = createService();
    const response = await service.getFlowContracts("demo", "hello-rest", "hello");

    expect(response).toBeDefined();
    expect(response?.contracts.contracts).toHaveLength(1);
    expect(response?.contracts.contracts[0]?.flowId).toBe("hello");
  });

  it("plans a runtime trace without mutating the app file", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });
    const before = await fs.readFile(storedAppPath, "utf8");

    const response = await service.traceFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      sampleInput: {
        payload: "hello"
      },
      validateOnly: true
    });

    const after = await fs.readFile(storedAppPath, "utf8");
    expect(response?.validation?.ok).toBe(true);
    expect(response?.artifact?.type).toBe("run_trace_plan");
    expect(after).toBe(before);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/run_trace_plan/"))).toBe(true);
  });

  it("captures a runtime trace with the helper and persists the trace artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        trace: {
          appName: "subflow-app",
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
                path: "/orchestrate",
                headers: {
                  "content-type": "application/json"
                },
                queryParams: {},
                pathParams: {},
                body: {
                  payload: "hello"
                }
              },
              flowInput: {
                payload: "hello"
              },
              flowOutput: {
                message: "hello"
              },
              reply: {
                status: 200,
                headers: {
                  "content-type": "application/json"
                },
                body: {
                  message: "hello"
                },
                data: {
                  message: "hello"
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
            steps: [{ id: "prepare" }]
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
          steps: [
            {
              taskId: "prepare",
              status: "completed",
              diagnostics: []
            }
          ],
          diagnostics: []
        }
      })
    );

    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    const response = await service.traceFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      sampleInput: {
        payload: "hello"
      }
    });

    expect(response?.trace?.flowId).toBe("orchestrate");
    expect(response?.trace?.runtimeEvidence?.steps).toHaveLength(1);
    expect(response?.trace?.runtimeEvidence?.normalizedSteps).toHaveLength(1);
    expect(response?.artifact?.type).toBe("run_trace");
    expect(response?.artifact?.metadata?.traceEvidenceKind).toBe("runtime_backed");
    expect(response?.artifact?.metadata?.traceComparisonBasisPreference).toBe("rest_runtime_envelope");
    expect(response?.artifact?.metadata?.traceNormalizedStepCount).toBe(1);
    expect(response?.artifact?.metadata?.traceRecorderBacked).toBe(true);
    expect(response?.artifact?.metadata?.traceRecorderMode).toBe("full");
    expect(response?.artifact?.metadata?.traceRestTriggerRuntimeEvidence).toBe(true);
    expect(response?.artifact?.metadata?.traceRestTriggerRuntimeKind).toBe("rest");
    expect(response?.artifact?.metadata?.traceRestTriggerRuntimeMethod).toBe("POST");
    expect(response?.artifact?.metadata?.traceRestTriggerRuntimePath).toBe("/orchestrate");
    expect(response?.artifact?.metadata?.traceRestTriggerRuntimeReplyStatus).toBe(200);
    expect(response?.trace?.runtimeEvidence?.restTriggerRuntime?.kind).toBe("rest");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/run_trace/"))).toBe(true);
  });

  it("rejects runtime trace capture when the flow input contract is not satisfied", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    await expect(
      service.traceFlow("demo", "subflow-app", {
        flowId: "orchestrate",
        sampleInput: {}
      })
    ).rejects.toThrow(/Run trace request is invalid/);
  });

  it("persists CLI runtime trace metadata for the narrow CLI slice", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        trace: {
          appName: "cli-app",
          flowId: "orchestrate",
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
                args: ["hello"],
                flags: {
                  loud: true
                }
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
                resolvedInputs: {
                  args: ["hello"]
                },
                unavailableFields: [],
                diagnostics: []
              }
            ],
            steps: [{ id: "prepare" }]
          },
          summary: {
            flowId: "orchestrate",
            status: "completed",
            input: {
              args: ["hello"],
              flags: {
                loud: true
              }
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
      })
    );

    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    const response = await service.traceFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      sampleInput: {
        args: ["hello"],
        flags: {
          loud: true
        }
      }
    });

    expect(response?.trace?.runtimeEvidence?.cliTriggerRuntime?.kind).toBe("cli");
    expect(response?.artifact?.metadata?.traceComparisonBasisPreference).toBe("normalized_runtime_evidence");
    expect(response?.artifact?.metadata?.traceCLITriggerRuntimeEvidence).toBe(true);
    expect(response?.artifact?.metadata?.traceCLITriggerRuntimeKind).toBe("cli");
    expect(response?.artifact?.metadata?.traceCLITriggerRuntimeCommand).toBe("say");
    expect(response?.artifact?.metadata?.traceCLITriggerRuntimeSingleCmd).toBe(true);
    expect(response?.artifact?.metadata?.traceCLITriggerRuntimeHasArgs).toBe(true);
    expect(response?.artifact?.metadata?.traceCLITriggerRuntimeHasFlags).toBe(true);
    expect(response?.artifact?.metadata?.traceCLITriggerRuntimeHasMappedFlowInput).toBe(true);
    expect(response?.artifact?.metadata?.traceCLITriggerRuntimeHasMappedFlowOutput).toBe(false);
    expect(response?.artifact?.metadata?.traceCLITriggerRuntimeHasReply).toBe(true);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/run_trace/"))).toBe(true);
  });

  it("persists Channel runtime trace metadata for the narrow Channel slice", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        trace: {
          appName: "channel-app",
          flowId: "orchestrate",
          evidenceKind: "runtime_backed",
          runtimeEvidence: {
            kind: "runtime_backed",
            recorderBacked: true,
            recorderKind: "flow_state_recorder",
            recorderMode: "full",
            runtimeMode: "channel_trigger",
            channelTriggerRuntime: {
              kind: "channel",
              settings: {
                channels: ["orders:1"]
              },
              handler: {
                name: "channel",
                channel: "orders",
                bufferSize: 1
              },
              data: {
                orderId: "123"
              },
              flowInput: {
                order: {
                  id: "123"
                }
              },
              flowOutput: {
                status: "accepted"
              },
              unavailableFields: [],
              diagnostics: []
            },
            normalizedSteps: [
              {
                taskId: "prepare",
                status: "completed",
                resolvedInputs: {
                  order: {
                    id: "123"
                  }
                },
                producedOutputs: {
                  status: "accepted"
                },
                unavailableFields: [],
                diagnostics: []
              }
            ],
            steps: [{ id: "prepare" }]
          },
          summary: {
            flowId: "orchestrate",
            status: "completed",
            input: {
              order: {
                id: "123"
              }
            },
            output: {
              status: "accepted"
            },
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
      })
    );

    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    const response = await service.traceFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      sampleInput: {
        data: {
          orderId: "123"
        }
      }
    });

    expect(response?.trace?.runtimeEvidence?.channelTriggerRuntime?.kind).toBe("channel");
    expect(response?.artifact?.metadata?.traceComparisonBasisPreference).toBe("channel_runtime_boundary");
    expect(response?.artifact?.metadata?.traceChannelTriggerRuntimeEvidence).toBe(true);
    expect(response?.artifact?.metadata?.traceChannelTriggerRuntimeKind).toBe("channel");
    expect(response?.artifact?.metadata?.traceChannelTriggerRuntimeChannel).toBe("orders");
    expect(response?.artifact?.metadata?.traceChannelTriggerRuntimeHasData).toBe(true);
    expect(response?.artifact?.metadata?.traceChannelTriggerRuntimeHasMappedFlowInput).toBe(true);
    expect(response?.artifact?.metadata?.traceChannelTriggerRuntimeHasMappedFlowOutput).toBe(true);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/run_trace/"))).toBe(true);
  });

  it("plans a replay with explicit input without mutating the app file", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });
    const before = await fs.readFile(storedAppPath, "utf8");

    const response = await service.replayFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      baseInput: {
        payload: "hello"
      },
      overrides: {
        payload: "replayed"
      },
      validateOnly: true
    });

    const after = await fs.readFile(storedAppPath, "utf8");
    expect(response?.result.summary.effectiveInput).toEqual({ payload: "replayed" });
    expect(response?.artifact?.type).toBe("replay_plan");
    expect(after).toBe(before);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/replay_plan/"))).toBe(true);
  });

  it("replays a flow with explicit input and persists the replay artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
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
            appName: "subflow-app",
            flowId: "orchestrate",
            evidenceKind: "runtime_backed",
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
                  path: "/orchestrate",
                  headers: {
                    "content-type": "application/json"
                  },
                  queryParams: {},
                  pathParams: {},
                  body: {
                    payload: "replayed"
                  }
                },
                flowInput: {
                  payload: "replayed"
                },
                flowOutput: {
                  message: "replayed"
                },
                reply: {
                  status: 200,
                  headers: {
                    "content-type": "application/json"
                  },
                  body: {
                    message: "replayed"
                  },
                  data: {
                    message: "replayed"
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
              steps: [{ id: "prepare" }]
            },
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
                diagnostics: []
              }
            ],
            diagnostics: []
          }
        }
      })
    );

    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    const response = await service.replayFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      baseInput: {
        payload: "hello"
      },
      overrides: {
        payload: "replayed"
      }
    });

    expect(response?.result.summary.inputSource).toBe("explicit_input");
    expect(response?.result.trace?.runtimeEvidence?.steps).toHaveLength(1);
    expect(response?.result.trace?.runtimeEvidence?.normalizedSteps).toHaveLength(1);
    expect(response?.artifact?.type).toBe("replay_report");
    expect(response?.artifact?.metadata?.replayEvidenceKind).toBe("runtime_backed");
    expect(response?.result.restReplay?.comparisonBasis).toBe("rest_runtime_envelope");
    expect(response?.result.restReplay?.requestEnvelopeObserved).toBe(true);
    expect(response?.result.restReplay?.replyEnvelopeObserved).toBe(true);
    expect(response?.artifact?.metadata?.replayComparisonBasisPreference).toBe("rest_runtime_envelope");
    expect(response?.artifact?.metadata?.replayNormalizedStepCount).toBe(1);
    expect(response?.artifact?.metadata?.replayRecorderMode).toBe("full");
    expect(response?.artifact?.metadata?.replayRestReplayComparisonBasis).toBe("rest_runtime_envelope");
    expect(response?.artifact?.metadata?.replayRestRuntimeMode).toBe("independent_action_replay");
    expect(response?.artifact?.metadata?.replayRestRequestEnvelopeObserved).toBe(true);
    expect(response?.artifact?.metadata?.replayRestMappedFlowInputObserved).toBe(true);
    expect(response?.artifact?.metadata?.replayRestMappedFlowOutputObserved).toBe(true);
    expect(response?.artifact?.metadata?.replayRestReplyEnvelopeObserved).toBe(true);
    expect(response?.artifact?.metadata?.replayRestTriggerRuntimeEvidence).toBe(true);
    expect(response?.artifact?.metadata?.replayRestTriggerRuntimeKind).toBe("rest");
    expect(response?.artifact?.metadata?.replayRestTriggerRuntimeMethod).toBe("POST");
    expect(response?.artifact?.metadata?.replayRestTriggerRuntimePath).toBe("/orchestrate");
    expect(response?.artifact?.metadata?.replayRestTriggerRuntimeReplyStatus).toBe(200);
    expect(response?.result.trace?.runtimeEvidence?.restTriggerRuntime?.kind).toBe("rest");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/replay_report/"))).toBe(true);
  });

  it("replays a timer-backed flow and persists timer runtime metadata", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          summary: {
            flowId: "orchestrate",
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
            appName: "timer-app",
            flowId: "orchestrate",
            evidenceKind: "runtime_backed",
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
                  status: "tick"
                },
                tick: {
                  startedAt: "2026-03-18T00:00:00Z",
                  firedAt: "2026-03-18T00:00:30Z",
                  tickCount: 1
                },
                unavailableFields: [],
                diagnostics: []
              },
              steps: [{ id: "tick" }]
            },
            summary: {
              flowId: "orchestrate",
              status: "completed",
              input: {
                payload: "hello"
              },
              output: {
                status: "tick"
              },
              stepCount: 1,
              diagnostics: []
            },
            steps: [
              {
                taskId: "tick",
                status: "completed",
                diagnostics: []
              }
            ],
            diagnostics: []
          }
        }
      })
    );

    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    const response = await service.replayFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      baseInput: {
        payload: "hello"
      },
      validateOnly: false
    });

    expect(response?.artifact?.type).toBe("replay_report");
    expect(response?.artifact?.metadata?.replayComparisonBasisPreference).toBe("timer_runtime_startup");
    expect(response?.artifact?.metadata?.replayTimerTriggerRuntimeEvidence).toBe(true);
    expect(response?.artifact?.metadata?.replayTimerTriggerRuntimeKind).toBe("timer");
    expect(response?.artifact?.metadata?.replayTimerTriggerRuntimeRunMode).toBe("repeat");
    expect(response?.artifact?.metadata?.replayTimerTriggerRuntimeStartDelay).toBe("10s");
    expect(response?.artifact?.metadata?.replayTimerTriggerRuntimeRepeatInterval).toBe("30s");
    expect(response?.artifact?.metadata?.replayTimerTriggerRuntimeTickObserved).toBe(true);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/replay_report/"))).toBe(true);
  });

  it("replays a channel-backed trace and persists channel replay metadata", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          summary: {
            flowId: "orchestrate",
            status: "completed",
            inputSource: "explicit_input",
            baseInput: {
              data: {
                orderId: "123"
              }
            },
            effectiveInput: {
              data: {
                orderId: "123"
              }
            },
            overridesApplied: false,
            diagnostics: []
          },
          runtimeEvidence: {
            kind: "runtime_backed",
            recorderBacked: true,
            recorderKind: "flow_state_recorder",
            recorderMode: "full",
            runtimeMode: "channel_trigger_replay",
            channelTriggerRuntime: {
              kind: "channel",
              settings: {
                channels: ["orders:1"]
              },
              handler: {
                name: "channel",
                channel: "orders",
                bufferSize: 1
              },
              data: {
                orderId: "123"
              },
              flowInput: {
                order: {
                  id: "123"
                }
              },
              flowOutput: {
                status: "accepted"
              },
              unavailableFields: [],
              diagnostics: []
            },
            normalizedSteps: [
              {
                taskId: "prepare",
                status: "completed",
                resolvedInputs: {
                  order: {
                    id: "123"
                  }
                },
                producedOutputs: {
                  status: "accepted"
                },
                unavailableFields: [],
                diagnostics: []
              }
            ],
            steps: [{ id: "prepare" }]
          },
          trace: {
            appName: "subflow-app",
            flowId: "orchestrate",
            evidenceKind: "runtime_backed",
            runtimeEvidence: {
              kind: "runtime_backed",
              recorderBacked: true,
              recorderKind: "flow_state_recorder",
              recorderMode: "full",
              runtimeMode: "channel_trigger_replay",
              channelTriggerRuntime: {
                kind: "channel",
                settings: {
                  channels: ["orders:1"]
                },
                handler: {
                  name: "channel",
                  channel: "orders",
                  bufferSize: 1
                },
                data: {
                  orderId: "123"
                },
                flowInput: {
                  order: {
                    id: "123"
                  }
                },
                flowOutput: {
                  status: "accepted"
                },
                unavailableFields: [],
                diagnostics: []
              },
              normalizedSteps: [
                {
                  taskId: "prepare",
                  status: "completed",
                  resolvedInputs: {
                    order: {
                      id: "123"
                    }
                  },
                  producedOutputs: {
                    status: "accepted"
                  },
                  unavailableFields: [],
                  diagnostics: []
                }
              ],
              steps: [{ id: "prepare" }]
            },
            summary: {
              flowId: "orchestrate",
              status: "completed",
              input: {
                data: {
                  orderId: "123"
                }
              },
              output: {
                status: "accepted"
              },
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
      })
    );

    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    const response = await service.replayFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      baseInput: {
        data: {
          orderId: "123"
        }
      },
      validateOnly: false
    });

    expect(response?.artifact?.metadata?.replayComparisonBasisPreference).toBe("channel_runtime_boundary");
    expect(response?.artifact?.metadata?.replayChannelTriggerRuntimeEvidence).toBe(true);
    expect(response?.artifact?.metadata?.replayChannelTriggerRuntimeKind).toBe("channel");
    expect(response?.artifact?.metadata?.replayChannelTriggerRuntimeChannel).toBe("orders");
    expect(response?.artifact?.metadata?.replayChannelTriggerRuntimeHasData).toBe(true);
    expect(response?.artifact?.metadata?.replayChannelTriggerRuntimeHasMappedFlowInput).toBe(true);
    expect(response?.artifact?.metadata?.replayChannelTriggerRuntimeHasMappedFlowOutput).toBe(true);
    expect(response?.artifact?.metadata?.channelReplay?.comparisonBasis).toBe("channel_runtime_boundary");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/replay_report/"))).toBe(true);
  });

  it("replays from a stored trace artifact and applies overrides", async () => {
    const traceHelper = await createHelperScript(
      JSON.stringify({
        trace: {
          appName: "subflow-app",
          flowId: "orchestrate",
          evidenceKind: "runtime_backed",
          summary: {
            flowId: "orchestrate",
            status: "completed",
            input: {
              payload: "hello",
              nested: {
                count: 1
              }
            },
            output: {
              message: "hello"
            },
            stepCount: 1,
            diagnostics: []
          },
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
                path: "/orchestrate"
              },
              flowInput: {
                payload: "hello"
              },
              flowOutput: {
                message: "hello"
              },
              reply: {
                status: 200
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
                  payload: "hello"
                },
                producedOutputs: {
                  message: "hello"
                },
                unavailableFields: [],
                diagnostics: []
              }
            ]
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
      })
    );
    const replayHelper = await createHelperScript(
      JSON.stringify({
        result: {
          summary: {
            flowId: "orchestrate",
            status: "completed",
            inputSource: "trace_artifact",
            baseInput: {
              payload: "hello",
              nested: {
                count: 1
              }
            },
            effectiveInput: {
              payload: "hello",
              nested: {
                count: 2
              }
            },
            overridesApplied: true,
            diagnostics: []
          },
          trace: {
            appName: "subflow-app",
            flowId: "orchestrate",
            evidenceKind: "runtime_backed",
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
                  path: "/orchestrate"
                },
                flowInput: {
                  payload: "replayed"
                },
                flowOutput: {
                  message: "replayed"
                },
                reply: {
                  status: 200
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
                  unavailableFields: [],
                  diagnostics: []
                },
                unavailableFields: [],
                diagnostics: []
              },
              flowStart: {
                flow_inputs: {
                  payload: "replayed"
                }
              },
              flowDone: {
                flow_outputs: {
                  message: "replayed"
                }
              },
              steps: [{ id: "prepare" }]
            },
            summary: {
              flowId: "orchestrate",
              status: "completed",
              input: {
                payload: "hello",
                nested: {
                  count: 2
                }
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
                diagnostics: []
              }
            ],
            diagnostics: []
          }
        }
      })
    );
    process.env.FLOGO_HELPER_BIN = traceHelper;

    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });
    const traceResponse = await service.traceFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      sampleInput: {
        payload: "hello",
        nested: {
          count: 1
        }
      },
      validateOnly: true
    });

    await service.traceFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      sampleInput: {
        payload: "hello",
        nested: {
          count: 1
        }
      }
    });

    process.env.FLOGO_HELPER_BIN = replayHelper;
    const artifactList = await service.listArtifacts("demo", "subflow-app");
    const storedTraceArtifact = artifactList?.find((artifact) => artifact.type === "run_trace");

    const response = await service.replayFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      traceArtifactId: storedTraceArtifact?.id,
      overrides: {
        nested: {
          count: 2
        }
      }
    });

    expect(traceResponse?.artifact?.type).toBe("run_trace_plan");
    expect(storedTraceArtifact?.type).toBe("run_trace");
    expect(response?.result.summary.inputSource).toBe("trace_artifact");
    expect(response?.result.trace?.evidenceKind).toBe("runtime_backed");
    expect(response?.result.summary.effectiveInput).toEqual({
      payload: "hello",
      nested: {
        count: 2
      }
    });
  });

  it("rejects replay requests that provide both baseInput and traceArtifactId", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    await expect(
      service.replayFlow("demo", "subflow-app", {
        flowId: "orchestrate",
        traceArtifactId: "trace-1",
        baseInput: {
          payload: "hello"
        }
      })
    ).rejects.toThrow();
  });

  it("plans a run comparison without mutating the app file", async () => {
    const traceHelper = await createHelperScript(
      JSON.stringify({
        trace: {
          appName: "subflow-app",
          flowId: "orchestrate",
          evidenceKind: "runtime_backed",
          runtimeEvidence: {
            kind: "runtime_backed",
            recorderBacked: true,
            recorderKind: "flow_state_recorder",
            recorderMode: "full",
            runtimeMode: "independent_action",
            flowStart: {
              flow_inputs: {
                payload: "hello"
              }
            },
            flowDone: {
              flow_outputs: {
                message: "hello"
              }
            },
            steps: [{ id: "prepare" }]
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
          steps: [
            {
              taskId: "prepare",
              status: "completed",
              diagnostics: []
            }
          ],
          diagnostics: []
        }
      })
    );
    process.env.FLOGO_HELPER_BIN = traceHelper;

    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });
    const before = await fs.readFile(storedAppPath, "utf8");

    await service.traceFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      sampleInput: {
        payload: "hello"
      }
    });

    const artifacts = await service.listArtifacts("demo", "subflow-app");
    const traceArtifact = artifacts?.find((artifact) => artifact.type === "run_trace");

    const response = await service.compareRuns("demo", "subflow-app", {
      leftArtifactId: traceArtifact?.id,
      rightArtifactId: traceArtifact?.id,
      validateOnly: true
    });

    const after = await fs.readFile(storedAppPath, "utf8");
    expect(response?.validation?.ok).toBe(true);
    expect(response?.artifact?.type).toBe("run_comparison_plan");
    expect(after).toBe(before);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/run_comparison_plan/"))).toBe(true);
  });

  it("compares a stored run trace and replay report and persists a run-comparison artifact", async () => {
    const traceHelper = await createHelperScript(
      JSON.stringify({
        trace: {
          appName: "subflow-app",
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
                path: "/orchestrate",
                headers: {
                  "content-type": "application/json"
                },
                queryParams: {},
                pathParams: {},
                body: {
                  payload: "hello"
                }
              },
              flowInput: {
                payload: "hello"
              },
              flowOutput: {
                message: "hello"
              },
              reply: {
                status: 200,
                headers: {
                  "content-type": "application/json"
                },
                body: {
                  message: "hello"
                },
                data: {
                  message: "hello"
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
            steps: [{ id: "prepare" }]
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
      })
    );
    const replayHelper = await createHelperScript(
      JSON.stringify({
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
            appName: "subflow-app",
            flowId: "orchestrate",
            evidenceKind: "runtime_backed",
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
      })
    );

    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    process.env.FLOGO_HELPER_BIN = traceHelper;
    await service.traceFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      sampleInput: {
        payload: "hello"
      }
    });

    process.env.FLOGO_HELPER_BIN = replayHelper;
    await service.replayFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      baseInput: {
        payload: "hello"
      },
      overrides: {
        payload: "replayed"
      }
    });

    const artifacts = await service.listArtifacts("demo", "subflow-app");
    const left = artifacts?.find((artifact) => artifact.type === "run_trace");
    const right = artifacts?.find((artifact) => artifact.type === "replay_report");

    const response = await service.compareRuns("demo", "subflow-app", {
      leftArtifactId: left?.id,
      rightArtifactId: right?.id
    });

    expect(response?.artifact?.type).toBe("run_comparison");
    expect(response?.artifact?.metadata?.comparisonBasis).toBe("rest_runtime_envelope");
    expect(response?.artifact?.metadata?.rightEvidenceKind).toBe("runtime_backed");
    expect(response?.artifact?.metadata?.leftNormalizedStepEvidence).toBe(true);
    expect(response?.artifact?.metadata?.rightNormalizedStepEvidence).toBe(true);
    expect(response?.artifact?.metadata?.leftRestTriggerRuntimeEvidence).toBe(true);
    expect(response?.artifact?.metadata?.rightRestTriggerRuntimeEvidence).toBe(true);
    expect(response?.artifact?.metadata?.leftRestTriggerRuntimeKind).toBe("rest");
    expect(response?.artifact?.metadata?.rightRestTriggerRuntimeKind).toBe("rest");
    expect(response?.artifact?.metadata?.restComparisonBasis).toBe("rest_runtime_envelope");
    expect(response?.artifact?.metadata?.restRequestEnvelopeCompared).toBe(true);
    expect(response?.artifact?.metadata?.restMappedFlowInputCompared).toBe(true);
    expect(response?.artifact?.metadata?.restReplyEnvelopeCompared).toBe(true);
    expect(response?.artifact?.metadata?.restNormalizedStepEvidenceCompared).toBe(true);
    expect(response?.artifact?.metadata?.restComparisonUnsupportedFields).toEqual([]);
    expect(response?.result?.restComparison?.comparisonBasis).toBe("rest_runtime_envelope");
    expect(response?.result?.summary.outputDiff.kind).toBe("changed");
    expect(response?.result?.steps.some((step) => step.taskId === "prepare")).toBe(true);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/run_comparison/"))).toBe(true);
  });

  it("compares timer-backed trace and replay artifacts using timer startup evidence", async () => {
    const traceHelper = await createHelperScript(
      JSON.stringify({
        trace: {
          appName: "timer-app",
          flowId: "orchestrate",
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
                status: "tick"
              },
              tick: {
                startedAt: "2026-03-18T00:00:00Z",
                firedAt: "2026-03-18T00:00:30Z",
                tickCount: 1
              },
              unavailableFields: [],
              diagnostics: []
            },
            steps: [{ id: "tick" }]
          },
          summary: {
            flowId: "orchestrate",
            status: "completed",
            input: {
              payload: "hello"
            },
            output: {
              status: "tick"
            },
            stepCount: 1,
            diagnostics: []
          },
          steps: [
            {
              taskId: "tick",
              status: "completed",
              diagnostics: []
            }
          ],
          diagnostics: []
        }
      })
    );
    const replayHelper = await createHelperScript(
      JSON.stringify({
        result: {
          summary: {
            flowId: "orchestrate",
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
            appName: "timer-app",
            flowId: "orchestrate",
            evidenceKind: "runtime_backed",
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
                  status: "tick"
                },
                tick: {
                  startedAt: "2026-03-18T00:00:00Z",
                  firedAt: "2026-03-18T00:00:30Z",
                  tickCount: 1
                },
                unavailableFields: [],
                diagnostics: []
              },
              steps: [{ id: "tick" }]
            },
            summary: {
              flowId: "orchestrate",
              status: "completed",
              input: {
                payload: "hello"
              },
              output: {
                status: "tick"
              },
              stepCount: 1,
              diagnostics: []
            },
            steps: [
              {
                taskId: "tick",
                status: "completed",
                diagnostics: []
              }
            ],
            diagnostics: []
          }
        }
      })
    );

    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    process.env.FLOGO_HELPER_BIN = traceHelper;
    await service.traceFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      sampleInput: {
        payload: "hello"
      }
    });

    process.env.FLOGO_HELPER_BIN = replayHelper;
    await service.replayFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      baseInput: {
        payload: "hello"
      }
    });

    const artifacts = await service.listArtifacts("demo", "subflow-app");
    const left = artifacts?.find((artifact) => artifact.type === "run_trace");
    const right = artifacts?.find((artifact) => artifact.type === "replay_report");
    const response = await service.compareRuns("demo", "subflow-app", {
      leftArtifactId: left?.id,
      rightArtifactId: right?.id
    });

    expect(response?.artifact?.metadata?.comparisonBasis).toBe("timer_runtime_startup");
    expect(response?.artifact?.metadata?.timerComparisonBasis).toBe("timer_runtime_startup");
    expect(response?.artifact?.metadata?.leftTimerTriggerRuntimeEvidence).toBe(true);
    expect(response?.artifact?.metadata?.rightTimerTriggerRuntimeEvidence).toBe(true);
    expect(response?.artifact?.metadata?.timerSettingsCompared).toBe(true);
    expect(response?.result?.timerComparison?.comparisonBasis).toBe("timer_runtime_startup");
    expect(response?.result?.timerComparison?.settingsCompared).toBe(true);
    expect(response?.result?.timerComparison?.flowInputCompared).toBe(true);
    expect(response?.result?.timerComparison?.flowOutputCompared).toBe(true);
    expect(response?.result?.timerComparison?.tickCompared).toBe(true);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/run_comparison/"))).toBe(true);
  });

  it("compares channel-backed trace and replay artifacts using channel boundary evidence", async () => {
    const traceHelper = await createHelperScript(
      JSON.stringify({
        trace: {
          appName: "channel-app",
          flowId: "orchestrate",
          evidenceKind: "runtime_backed",
          runtimeEvidence: {
            kind: "runtime_backed",
            recorderBacked: true,
            recorderKind: "flow_state_recorder",
            recorderMode: "full",
            runtimeMode: "channel_trigger",
            channelTriggerRuntime: {
              kind: "channel",
              settings: {
                channels: ["orders:1"]
              },
              handler: {
                name: "channel",
                channel: "orders",
                bufferSize: 1
              },
              data: {
                orderId: "123"
              },
              flowInput: {
                order: {
                  id: "123"
                }
              },
              flowOutput: {
                status: "accepted"
              },
              unavailableFields: [],
              diagnostics: []
            },
            normalizedSteps: [
              {
                taskId: "prepare",
                status: "completed",
                resolvedInputs: {
                  order: {
                    id: "123"
                  }
                },
                producedOutputs: {
                  status: "accepted"
                },
                unavailableFields: [],
                diagnostics: []
              }
            ],
            steps: [{ id: "prepare" }]
          },
          summary: {
            flowId: "orchestrate",
            status: "completed",
            input: {
              data: {
                orderId: "123"
              }
            },
            output: {
              status: "accepted"
            },
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
      })
    );
    const replayHelper = await createHelperScript(
      JSON.stringify({
        result: {
          summary: {
            flowId: "orchestrate",
            status: "completed",
            inputSource: "explicit_input",
            baseInput: {
              data: {
                orderId: "123"
              }
            },
            effectiveInput: {
              data: {
                orderId: "456"
              }
            },
            overridesApplied: true,
            diagnostics: []
          },
          runtimeEvidence: {
            kind: "runtime_backed",
            recorderBacked: true,
            recorderKind: "flow_state_recorder",
            recorderMode: "full",
            runtimeMode: "channel_trigger_replay",
            channelTriggerRuntime: {
              kind: "channel",
              settings: {
                channels: ["orders:1"]
              },
              handler: {
                name: "channel",
                channel: "orders",
                bufferSize: 1
              },
              data: {
                orderId: "456"
              },
              flowInput: {
                order: {
                  id: "456"
                }
              },
              flowOutput: {
                status: "accepted"
              },
              unavailableFields: [],
              diagnostics: []
            },
            normalizedSteps: [
              {
                taskId: "prepare",
                status: "completed",
                resolvedInputs: {
                  order: {
                    id: "456"
                  }
                },
                producedOutputs: {
                  status: "accepted"
                },
                unavailableFields: [],
                diagnostics: []
              }
            ],
            steps: [{ id: "prepare" }]
          },
          trace: {
            appName: "channel-app",
            flowId: "orchestrate",
            evidenceKind: "runtime_backed",
            runtimeEvidence: {
              kind: "runtime_backed",
              recorderBacked: true,
              recorderKind: "flow_state_recorder",
              recorderMode: "full",
              runtimeMode: "channel_trigger_replay",
              channelTriggerRuntime: {
                kind: "channel",
                settings: {
                  channels: ["orders:1"]
                },
                handler: {
                  name: "channel",
                  channel: "orders",
                  bufferSize: 1
                },
                data: {
                  orderId: "456"
                },
                flowInput: {
                  order: {
                    id: "456"
                  }
                },
                flowOutput: {
                  status: "accepted"
                },
                unavailableFields: [],
                diagnostics: []
              },
              normalizedSteps: [
                {
                  taskId: "prepare",
                  status: "completed",
                  resolvedInputs: {
                    order: {
                      id: "456"
                    }
                  },
                  producedOutputs: {
                    status: "accepted"
                  },
                  unavailableFields: [],
                  diagnostics: []
                }
              ],
              steps: [{ id: "prepare" }]
            },
            summary: {
              flowId: "orchestrate",
              status: "completed",
              input: {
                data: {
                  orderId: "456"
                }
              },
              output: {
                status: "accepted"
              },
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
      })
    );

    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    process.env.FLOGO_HELPER_BIN = traceHelper;
    await service.traceFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      sampleInput: {
        data: {
          orderId: "123"
        }
      }
    });

    process.env.FLOGO_HELPER_BIN = replayHelper;
    await service.replayFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      baseInput: {
        data: {
          orderId: "123"
        }
      },
      overrides: {
        data: {
          orderId: "456"
        }
      }
    });

    const artifacts = await service.listArtifacts("demo", "subflow-app");
    const left = artifacts?.find((artifact) => artifact.type === "run_trace");
    const right = artifacts?.find((artifact) => artifact.type === "replay_report");
    const response = await service.compareRuns("demo", "subflow-app", {
      leftArtifactId: left?.id,
      rightArtifactId: right?.id
    });

    expect(response?.artifact?.metadata?.comparisonBasis).toBe("channel_runtime_boundary");
    expect(response?.artifact?.metadata?.leftChannelTriggerRuntimeEvidence).toBe(true);
    expect(response?.artifact?.metadata?.rightChannelTriggerRuntimeEvidence).toBe(true);
    expect(response?.artifact?.metadata?.leftChannelTriggerRuntimeKind).toBe("channel");
    expect(response?.artifact?.metadata?.rightChannelTriggerRuntimeKind).toBe("channel");
    expect(response?.artifact?.metadata?.leftChannelTriggerRuntimeChannel).toBe("orders");
    expect(response?.artifact?.metadata?.rightChannelTriggerRuntimeChannel).toBe("orders");
    expect(response?.artifact?.metadata?.channelComparisonBasis).toBe("channel_runtime_boundary");
    expect(response?.artifact?.metadata?.channelCompared).toBe(true);
    expect(response?.artifact?.metadata?.channelDataCompared).toBe(true);
    expect(response?.result?.channelComparison?.comparisonBasis).toBe("channel_runtime_boundary");
    expect(response?.result?.channelComparison?.channelCompared).toBe(true);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/run_comparison/"))).toBe(true);
  });

  it("compares a stored run trace with a replay report summary when embedded replay trace data is unavailable", async () => {
    const traceHelper = await createHelperScript(
      JSON.stringify({
        trace: {
          appName: "subflow-app",
          flowId: "orchestrate",
          evidenceKind: "runtime_backed",
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
      })
    );
    const replayHelper = await createHelperScript(
      JSON.stringify({
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
                path: "/orchestrate",
                headers: {
                  "content-type": "application/json"
                },
                queryParams: {},
                pathParams: {},
                body: {
                  payload: "replayed"
                }
              },
              flowInput: {
                payload: "replayed"
              },
              flowOutput: {
                message: "replayed"
              },
              reply: {
                status: 200,
                headers: {
                  "content-type": "application/json"
                },
                body: {
                  message: "replayed"
                },
                data: {
                  message: "replayed"
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
            steps: [{ id: "prepare" }]
          }
        }
      })
    );

    const storedAppPath = await createSubflowStoredAppFile();
    const { service } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    process.env.FLOGO_HELPER_BIN = traceHelper;
    await service.traceFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      sampleInput: {
        payload: "hello"
      }
    });

    process.env.FLOGO_HELPER_BIN = replayHelper;
    await service.replayFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      baseInput: {
        payload: "hello"
      },
      overrides: {
        payload: "replayed"
      }
    });

    const artifacts = await service.listArtifacts("demo", "subflow-app");
    const left = artifacts?.find((artifact) => artifact.type === "run_trace");
    const right = artifacts?.find((artifact) => artifact.type === "replay_report");

    const response = await service.compareRuns("demo", "subflow-app", {
      leftArtifactId: left?.id,
      rightArtifactId: right?.id
    });

    expect(response?.artifact?.type).toBe("run_comparison");
    expect(response?.result?.summary.outputDiff.kind).toBe("removed");
    expect(response?.result?.steps.some((step) => step.changeKind === "removed")).toBe(true);
  });

  it("rejects run comparison when an artifact is missing", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    await expect(
      service.compareRuns("demo", "subflow-app", {
        leftArtifactId: "missing-left",
        rightArtifactId: "missing-right"
      })
    ).rejects.toThrow(/was not found/);
  });

  it("rejects run comparison when artifacts are not comparable runtime artifacts", async () => {
    const traceHelper = await createHelperScript(
      JSON.stringify({
        trace: {
          appName: "subflow-app",
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
              diagnostics: []
            }
          ],
          diagnostics: []
        }
      })
    );
    process.env.FLOGO_HELPER_BIN = traceHelper;

    const storedAppPath = await createSubflowStoredAppFile();
    const { service } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    await service.traceFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      sampleInput: {
        payload: "hello"
      }
    });
    await service.getCatalog("demo", "subflow-app");

    const artifacts = await service.listArtifacts("demo", "subflow-app");
    const traceArtifact = artifacts?.find((artifact) => artifact.type === "run_trace");
    const catalogArtifact = artifacts?.find((artifact) => artifact.type === "contrib_catalog");

    await expect(
      service.compareRuns("demo", "subflow-app", {
        leftArtifactId: traceArtifact?.id,
        rightArtifactId: catalogArtifact?.id
      })
    ).rejects.toThrow(/not a comparable runtime artifact/);
  });

  it("rejects run comparison when artifacts belong to different apps", async () => {
    const traceHelper = await createHelperScript(
      JSON.stringify({
        trace: {
          appName: "demo",
          flowId: "hello",
          summary: {
            flowId: "hello",
            status: "completed",
            input: {},
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
    process.env.FLOGO_HELPER_BIN = traceHelper;

    const storedAppPath = await createSubflowStoredAppFile();
    const { service } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    await service.traceFlow("demo", "hello-rest", {
      flowId: "hello",
      sampleInput: {}
    });
    await service.traceFlow("demo", "subflow-app", {
      flowId: "orchestrate",
      sampleInput: {
        payload: "hello"
      }
    });

    const helloArtifacts = await service.listArtifacts("demo", "hello-rest");
    const subflowArtifacts = await service.listArtifacts("demo", "subflow-app");
    const left = helloArtifacts?.find((artifact) => artifact.type === "run_trace");
    const right = subflowArtifacts?.find((artifact) => artifact.type === "run_trace");

    await expect(
      service.compareRuns("demo", "subflow-app", {
        leftArtifactId: left?.id,
        rightArtifactId: right?.id
      })
    ).rejects.toThrow(/different app context/);
  });

  it("plans a trigger binding without mutating the app file", async () => {
    const storedAppPath = await createBindableStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "bindable-app",
      storedAppName: "bindable-rest"
    });
    const before = await fs.readFile(storedAppPath, "utf8");

    const response = await service.bindTrigger("demo", "bindable-app", {
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
    });

    const after = await fs.readFile(storedAppPath, "utf8");
    expect(response.result.applied).toBe(false);
    expect(response.result.artifact?.type).toBe("trigger_binding_plan");
    expect(response.result.plan.profile.kind).toBe("rest");
    expect(response.result.plan.profile.replyMode).toBe("json");
    expect(response.result.plan.profile.requestMappingMode).toBe("auto");
    expect(response.result.plan.profile.replyMappingMode).toBe("auto");
    expect(response.result.plan.triggerRef).toBe("#rest");
    expect(after).toBe(before);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/trigger_binding_plan/"))).toBe(true);
  });

  it("applies a trigger binding and persists a result artifact", async () => {
    const storedAppPath = await createBindableStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "bindable-app",
      storedAppName: "bindable-rest"
    });

    const response = await service.bindTrigger("demo", "bindable-app", {
      flowId: "hello",
      profile: {
        kind: "channel",
        channel: "orders"
      }
    });

    const updated = JSON.parse(await fs.readFile(storedAppPath, "utf8")) as {
      imports: Array<{ alias: string }>;
      triggers: Array<{ ref: string; handlers: Array<{ action: { ref: string; settings: { flowURI: string } } }> }>;
    };

    expect(response.result.applied).toBe(true);
    expect(response.result.artifact?.type).toBe("trigger_binding_result");
    expect(response.result.plan.profile.kind).toBe("channel");
    expect(updated.imports.some((entry) => entry.alias === "channel")).toBe(true);
    expect(updated.triggers.some((trigger) => trigger.ref === "#channel")).toBe(true);
    expect(updated.triggers[0]?.handlers[0]?.action?.ref).toBe("#flow");
    expect(updated.triggers[0]?.handlers[0]?.action?.settings?.flowURI).toBe("res://flow:hello");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/trigger_binding_result/"))).toBe(true);
  });

  it("plans subflow extraction without mutating the app file", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });
    const before = await fs.readFile(storedAppPath, "utf8");

    const response = await service.extractSubflow("demo", "subflow-app", {
      flowId: "orchestrate",
      taskIds: ["prepare", "work"],
      validateOnly: true
    });

    const after = await fs.readFile(storedAppPath, "utf8");
    expect(response?.result.applied).toBe(false);
    expect(response?.result.artifact?.type).toBe("subflow_extraction_plan");
    expect(response?.result.plan.newFlowContract.flowId).toBeDefined();
    expect(after).toBe(before);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/subflow_extraction_plan/"))).toBe(true);
  });

  it("applies subflow extraction and persists a result artifact", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    const response = await service.extractSubflow("demo", "subflow-app", {
      flowId: "orchestrate",
      taskIds: ["prepare", "work"]
    });
    const updated = JSON.parse(await fs.readFile(storedAppPath, "utf8")) as {
      resources: Record<string, { data: { tasks: Array<{ id: string }>; metadata: { input: unknown[]; output: unknown[] } } }>;
    };

    expect(response?.result.applied).toBe(true);
    expect(response?.result.artifact?.type).toBe("subflow_extraction_result");
    expect(updated.resources.orchestrate.data.tasks).toHaveLength(2);
    expect(Object.keys(updated.resources).length).toBe(2);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/subflow_extraction_result/"))).toBe(true);
  });

  it("plans and applies subflow inlining", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    const extracted = await service.extractSubflow("demo", "subflow-app", {
      flowId: "orchestrate",
      taskIds: ["prepare", "work"]
    });
    const invocationTaskId = extracted?.result.plan.invocation.taskId;

    const plan = await service.inlineSubflow("demo", "subflow-app", {
      parentFlowId: "orchestrate",
      invocationTaskId,
      validateOnly: true
    });
    expect(plan?.result.applied).toBe(false);
    expect(plan?.result.artifact?.type).toBe("subflow_inlining_plan");

    const applied = await service.inlineSubflow("demo", "subflow-app", {
      parentFlowId: "orchestrate",
      invocationTaskId,
      removeExtractedFlowIfUnused: true
    });
    const updated = JSON.parse(await fs.readFile(storedAppPath, "utf8")) as {
      resources: Record<string, { data: { tasks: Array<{ id: string }> } }>;
    };

    expect(applied?.result.applied).toBe(true);
    expect(applied?.result.artifact?.type).toBe("subflow_inlining_result");
    expect(updated.resources.orchestrate.data.tasks.map((task) => task.id)).toEqual([
      `${invocationTaskId}__prepare`,
      `${invocationTaskId}__work`,
      "finish"
    ]);
    expect(updated.resources[extracted?.result.plan.newFlowId ?? ""]).toBeUndefined();
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/subflow_inlining_result/"))).toBe(true);
  });

  it("plans iterator synthesis without mutating the app file", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });
    const before = await fs.readFile(storedAppPath, "utf8");

    const response = await service.addIterator("demo", "subflow-app", {
      flowId: "orchestrate",
      taskId: "work",
      iterateExpr: "=$flow.items",
      validateOnly: true
    });

    const after = await fs.readFile(storedAppPath, "utf8");
    expect(response?.result.applied).toBe(false);
    expect(response?.result.artifact?.type).toBe("iterator_plan");
    expect(response?.result.plan.updatedSettings.iterate).toBe("=$flow.items");
    expect(after).toBe(before);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/iterator_plan/"))).toBe(true);
  });

  it("applies retry policy synthesis and persists a result artifact", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    const response = await service.addRetryPolicy("demo", "subflow-app", {
      flowId: "orchestrate",
      taskId: "work",
      count: 3,
      intervalMs: 250
    });
    const updated = JSON.parse(await fs.readFile(storedAppPath, "utf8")) as {
      resources: Record<string, { data: { tasks: Array<{ id: string; settings: Record<string, unknown> }> } }>;
    };

    const task = updated.resources.orchestrate.data.tasks.find((entry) => entry.id === "work");
    expect(response?.result.applied).toBe(true);
    expect(response?.result.artifact?.type).toBe("retry_policy_result");
    expect(task?.settings.retryOnError).toEqual({ count: 3, interval: 250 });
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/retry_policy_result/"))).toBe(true);
  });

  it("applies doWhile synthesis and persists a result artifact", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    const response = await service.addDoWhile("demo", "subflow-app", {
      flowId: "orchestrate",
      taskId: "work",
      condition: "=$flow.keepGoing",
      delayMs: 100
    });
    const updated = JSON.parse(await fs.readFile(storedAppPath, "utf8")) as {
      resources: Record<string, { data: { tasks: Array<{ id: string; type?: string; settings: Record<string, unknown> }> } }>;
    };

    const task = updated.resources.orchestrate.data.tasks.find((entry) => entry.id === "work");
    expect(response?.result.applied).toBe(true);
    expect(response?.result.artifact?.type).toBe("dowhile_result");
    expect(task?.type).toBe("doWhile");
    expect(task?.settings.condition).toBe("=$flow.keepGoing");
    expect(task?.settings.delay).toBe(100);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/dowhile_result/"))).toBe(true);
  });

  it("plans an error path without mutating the app file", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });
    const before = await fs.readFile(storedAppPath, "utf8");

    const response = await service.addErrorPath("demo", "subflow-app", {
      flowId: "orchestrate",
      taskId: "work",
      template: "log_and_continue",
      validateOnly: true
    });

    const after = await fs.readFile(storedAppPath, "utf8");
    expect(response?.result.applied).toBe(false);
    expect(response?.result.artifact?.type).toBe("error_path_plan");
    expect(after).toBe(before);
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/error_path_plan/"))).toBe(true);
  });

  it("applies an error path and persists a result artifact", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service, storedPayloads } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    const response = await service.addErrorPath("demo", "subflow-app", {
      flowId: "orchestrate",
      taskId: "work",
      template: "log_and_stop",
      logMessage: "work failed"
    });
    const updated = JSON.parse(await fs.readFile(storedAppPath, "utf8")) as {
      resources: Record<
        string,
        { data: { tasks: Array<{ id: string; input?: Record<string, unknown>; activityRef?: string }>; links: Array<{ from: string; to: string; type: string }> } }
      >;
    };

    const tasks = updated.resources.orchestrate.data.tasks;
    const links = updated.resources.orchestrate.data.links;
    const generatedTask = tasks.find((entry) => entry.id === "error_log_work");

    expect(response?.result.applied).toBe(true);
    expect(response?.result.artifact?.type).toBe("error_path_result");
    expect(generatedTask?.input?.message).toBe("work failed");
    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "work", to: "finish", type: "expression" }),
        expect.objectContaining({ from: "work", to: "error_log_work", type: "expression" })
      ])
    );
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/error_path_result/"))).toBe(true);
  });

  it("rejects unknown flows and tasks when planning an error path", async () => {
    const storedAppPath = await createSubflowStoredAppFile();
    const { service } = createService({
      storedAppPath,
      storedAppId: "subflow-app",
      storedAppName: "subflow-app"
    });

    await expect(
      service.addErrorPath("demo", "subflow-app", {
        flowId: "missing",
        taskId: "work",
        template: "log_and_stop",
        validateOnly: true
      })
    ).rejects.toThrow(/was not found/i);

    await expect(
      service.addErrorPath("demo", "subflow-app", {
        flowId: "orchestrate",
        taskId: "missing",
        template: "log_and_stop",
        validateOnly: true
      })
    ).rejects.toThrow(/was not found in flow/i);
  });

  it("previews mappings for example apps and returns an artifact ref", async () => {
    const { service } = createService();
    const preview = await service.previewMapping("demo", "hello-rest", {
      nodeId: "log-request",
      sampleInput: {
        flow: {},
        activity: {},
        env: {},
        property: {},
        trigger: {}
      }
    });

    expect(preview).toBeDefined();
    expect(preview?.preview.flowId).toBe("hello");
    expect(preview?.preview.fields.find((field) => field.path === "input.message")?.resolved).toBe("received hello request");
    expect(preview?.artifact?.type).toBe("mapping_preview");
    expect(preview?.propertyPlan.declaredProperties).toEqual([]);
    expect(preview?.artifact?.metadata?.blobPath).toBeDefined();
  });

  it("returns a property plan and persists a property-plan artifact", async () => {
    const { service, storedPayloads } = createService();

    const plan = await service.getPropertyPlan("demo", "hello-rest", "rest_service");

    expect(plan).toBeDefined();
    expect(plan?.propertyPlan.deploymentProfile).toBe("rest_service");
    expect(plan?.artifact?.type).toBe("property_plan");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/property_plan/"))).toBe(true);
  });

  it("runs a mapping test and persists a mapping-test artifact", async () => {
    const { service, storedPayloads } = createService();

    const result = await service.testMapping("demo", "hello-rest", {
      nodeId: "log-request",
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
    });

    expect(result).toBeDefined();
    expect(result?.result.pass).toBe(true);
    expect(result?.result.artifact?.type).toBe("mapping_test");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/mapping_test/"))).toBe(true);
  });

  it("lists persisted app-scoped analysis artifacts", async () => {
    const { service } = createService();
    await service.getInventory("demo", "hello-rest");
    await service.getCatalog("demo", "hello-rest");
    await service.getFlowContracts("demo", "hello-rest");
    await service.previewMapping("demo", "hello-rest", {
      nodeId: "log-request",
      sampleInput: {
        flow: {},
        activity: {},
        env: {},
        property: {},
        trigger: {}
      }
    });
    await service.getPropertyPlan("demo", "hello-rest", "rest_service");
    await service.testMapping("demo", "hello-rest", {
      nodeId: "log-request",
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
    });

    const artifacts = await service.listArtifacts("demo", "hello-rest");
    expect(artifacts).toHaveLength(6);
    expect(artifacts?.some((artifact) => artifact.type === "contrib_inventory")).toBe(true);
    expect(artifacts?.some((artifact) => artifact.type === "contrib_catalog")).toBe(true);
    expect(artifacts?.some((artifact) => artifact.type === "flow_contract")).toBe(true);
    expect(artifacts?.some((artifact) => artifact.type === "mapping_preview")).toBe(true);
    expect(artifacts?.some((artifact) => artifact.type === "property_plan")).toBe(true);
    expect(artifacts?.some((artifact) => artifact.type === "mapping_test")).toBe(true);
  });

  it("prefers DB-backed app records when the app exists in persistence", async () => {
    const storedAppPath = await createStoredAppFile();
    const { service } = createService({
      storedAppPath,
      storedAppId: "stored-app",
      storedAppName: "stored-rest"
    });

    const graph = await service.getGraph("demo", "stored-app");

    expect(graph).toBeDefined();
    expect(graph?.app.name).toBe("stored-rest");
    expect(graph?.app.resources.some((resource) => resource.id === "stored")).toBe(true);
  });

  it("returns undefined for unknown apps", async () => {
    const { service } = createService();

    await expect(service.getGraph("demo", "missing-app")).resolves.toBeUndefined();
    await expect(service.getCatalog("demo", "missing-app")).resolves.toBeUndefined();
    await expect(service.listArtifacts("demo", "missing-app")).resolves.toBeUndefined();
  });

  it("returns a descriptor response and persists a descriptor artifact", async () => {
    const { service, storedPayloads } = createService();

    const descriptor = await service.getDescriptor("demo", "hello-rest", "#log");

    expect(descriptor).toBeDefined();
    expect(descriptor?.descriptor.name).toBe("log");
    expect(descriptor?.artifact?.type).toBe("contrib_catalog");
    expect(descriptor?.artifact?.metadata?.analysisType).toBe("descriptor");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/descriptor/"))).toBe(true);
  });

  it("returns contribution evidence and persists an evidence artifact", async () => {
    const { service, storedPayloads } = createService();

    const evidence = await service.getContribEvidence("demo", "hello-rest", "#log");

    expect(evidence).toBeDefined();
    expect(evidence?.evidence.name).toBe("log");
    expect(evidence?.evidence.confidence).toBeDefined();
    expect(evidence?.artifact?.type).toBe("contrib_evidence");
    expect(evidence?.artifact?.metadata?.analysisType).toBe("contrib_evidence");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/contrib_evidence/"))).toBe(true);
  });

  it("returns a governance report and persists a governance artifact", async () => {
    const { service, storedPayloads } = createService();

    const governance = await service.getGovernance("demo", "hello-rest");

    expect(governance).toBeDefined();
    expect(governance?.report.ok).toBe(true);
    expect(governance?.artifact?.type).toBe("governance_report");
    expect(governance?.artifact?.metadata?.analysisType).toBe("governance");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/governance_report/"))).toBe(true);
  });

  it("returns a composition comparison and persists a composition artifact", async () => {
    const { service, storedPayloads } = createService();

    const comparison = await service.compareComposition("demo", "hello-rest", {
      mode: "analyze",
      target: "app"
    });

    expect(comparison).toBeDefined();
    expect(comparison?.comparison.ok).toBe(true);
    expect(comparison?.comparison.artifact?.type).toBe("composition_compare");
    expect(comparison?.comparison.artifact?.metadata?.analysisType).toBe("composition_compare");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/composition_compare/"))).toBe(true);
  });

  it("lists governance and composition artifacts alongside other persisted app analysis artifacts", async () => {
    const { service } = createService();

    await service.getCatalog("demo", "hello-rest");
    await service.getContribEvidence("demo", "hello-rest", "#log");
    await service.getGovernance("demo", "hello-rest");
    await service.compareComposition("demo", "hello-rest", {
      mode: "analyze",
      target: "app"
    });

    const artifacts = await service.listArtifacts("demo", "hello-rest");

    expect(artifacts).toHaveLength(4);
    expect(artifacts?.some((artifact) => artifact.type === "contrib_catalog")).toBe(true);
    expect(artifacts?.some((artifact) => artifact.type === "contrib_evidence")).toBe(true);
    expect(artifacts?.some((artifact) => artifact.type === "governance_report")).toBe(true);
    expect(artifacts?.some((artifact) => artifact.type === "composition_compare")).toBe(true);
  });
});
