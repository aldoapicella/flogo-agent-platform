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

  it("executes helper-backed activity scaffolding and publishes bundle plus build/test proof artifacts", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          bundle: {
            kind: "activity",
            modulePath: "example.com/acme/echo",
            packageName: "echoactivity",
            bundleRoot: "/tmp/flogo-activity-echoactivity",
            descriptor: {
              ref: "example.com/acme/echo",
              alias: "echoactivity",
              type: "activity",
              name: "echo-message",
              version: "0.1.0",
              title: "Echo Message",
              settings: [{ name: "prefix", type: "string", required: true }],
              inputs: [{ name: "message", type: "string", required: true }],
              outputs: [{ name: "message", type: "string" }],
              examples: ["Import the module and wire it into a flow."],
              compatibilityNotes: ["Generated scaffold"],
              source: "activity_scaffold"
            },
            files: [
              { path: "/tmp/flogo-activity-echoactivity/descriptor.json", kind: "descriptor", bytes: 120, content: "{}" },
              { path: "/tmp/flogo-activity-echoactivity/activity.go", kind: "implementation", bytes: 240, content: "package echoactivity" }
            ],
            readmePath: "/tmp/flogo-activity-echoactivity/README.md"
          },
          validation: {
            ok: true,
            summary: "Activity scaffold generated and passed isolated go test/build proof.",
            stages: [
              { stage: "structural", ok: true, diagnostics: [] },
              { stage: "regression", ok: true, diagnostics: [] },
              { stage: "build", ok: true, diagnostics: [] }
            ],
            artifacts: []
          },
          build: {
            kind: "build",
            ok: true,
            command: ["go", "build", "./..."],
            exitCode: 0,
            summary: "go build ./... succeeded",
            output: ""
          },
          test: {
            kind: "test",
            ok: true,
            command: ["go", "test", "./..."],
            exitCode: 0,
            summary: "go test ./... succeeded",
            output: ""
          }
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-activity-scaffold",
      jobKind: "custom_contrib",
      stepType: "scaffold_activity",
      analysisKind: "activity_scaffold",
      snapshotUri: ".",
      appPath: "flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://activity-scaffold",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        activityName: "Echo Message",
        modulePath: "example.com/acme/echo",
        title: "Echo Message",
        description: "Formats a greeting",
        version: "0.1.0",
        settings: [{ name: "prefix", type: "string", required: true }],
        inputs: [{ name: "message", type: "string", required: true }],
        outputs: [{ name: "message", type: "string" }]
      },
      command: [],
      containerArgs: []
    });

    const bundleArtifact = result.artifacts.find((artifact) => artifact.type === "contrib_bundle");
    const buildArtifact = result.artifacts.find((artifact) => artifact.type === "build_log");
    const testArtifact = result.artifacts.find((artifact) => artifact.type === "test_report");
    const bundleMetadata = bundleArtifact?.metadata as
      | {
          result?: { bundle?: { packageName?: string; modulePath?: string; files?: Array<{ kind?: string }> }; validation?: { ok?: boolean }; build?: { ok?: boolean }; test?: { ok?: boolean } };
          proof?: { validation?: { ok?: boolean }; build?: { ok?: boolean }; test?: { ok?: boolean } };
        }
      | undefined;

    expect(result.ok).toBe(true);
    expect(bundleArtifact).toBeDefined();
    expect(buildArtifact).toBeDefined();
    expect(testArtifact).toBeDefined();
    expect(bundleMetadata?.result?.bundle?.packageName).toBe("echoactivity");
    expect(bundleMetadata?.result?.bundle?.modulePath).toBe("example.com/acme/echo");
    expect(bundleMetadata?.result?.bundle?.files?.some((file) => file.kind === "descriptor")).toBe(true);
    expect(bundleMetadata?.result?.validation?.ok).toBe(true);
    expect(bundleMetadata?.result?.build?.ok).toBe(true);
    expect(bundleMetadata?.result?.test?.ok).toBe(true);
    expect(bundleMetadata?.proof?.validation?.ok).toBe(true);
    expect((buildArtifact?.metadata as { contributionKind?: string } | undefined)?.contributionKind).toBe("activity");
    expect((testArtifact?.metadata as { contributionKind?: string } | undefined)?.contributionKind).toBe("activity");
  });

  it("rejects invalid activity scaffold input before dispatching the helper", async () => {
    const service = new RunnerExecutorService();

    await expect(
      service.execute({
        taskId: "task-invalid-activity-scaffold",
        jobKind: "custom_contrib",
        stepType: "scaffold_activity",
        analysisKind: "activity_scaffold",
        snapshotUri: ".",
        appPath: "flogo.json",
        env: {},
        envSecretRefs: {},
        timeoutSeconds: 60,
        artifactOutputUri: "memory://invalid-activity-scaffold",
        jobTemplateName: "flogo-runner",
        analysisPayload: {
          activityName: "Broken Activity",
          modulePath: "example.com/acme/broken",
          title: "Broken Activity",
          description: "Has an unsupported field type",
          settings: [{ name: "payload", type: "xml" }]
        },
        command: [],
        containerArgs: []
      })
    ).rejects.toThrow(/Unsupported activity scaffold field type/);
  });

  it("executes helper-backed action scaffolding and publishes bundle plus build/test proof artifacts", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          bundle: {
            kind: "action",
            modulePath: "example.com/acme/flow-action",
            packageName: "flowaction",
            bundleRoot: "/tmp/flogo-action-flowaction",
            descriptor: {
              ref: "example.com/acme/flow-action",
              alias: "flowaction",
              type: "action",
              name: "flow-action",
              version: "0.1.0",
              title: "Flow Action",
              settings: [{ name: "mode", type: "string", required: true }],
              inputs: [{ name: "payload", type: "object", required: true }],
              outputs: [{ name: "result", type: "object" }],
              examples: ["Import the module and wire the action into a handler."],
              compatibilityNotes: ["Generated scaffold"],
              source: "action_scaffold"
            },
            files: [
              { path: "/tmp/flogo-action-flowaction/descriptor.json", kind: "descriptor", bytes: 160, content: "{}" },
              { path: "/tmp/flogo-action-flowaction/action.go", kind: "implementation", bytes: 360, content: "package flowaction" }
            ],
            readmePath: "/tmp/flogo-action-flowaction/README.md"
          },
          validation: {
            ok: true,
            summary: "Action scaffold generated and passed isolated go test/build proof.",
            stages: [
              { stage: "structural", ok: true, diagnostics: [] },
              { stage: "regression", ok: true, diagnostics: [] },
              { stage: "build", ok: true, diagnostics: [] }
            ],
            artifacts: []
          },
          build: {
            kind: "build",
            ok: true,
            command: ["go", "build", "./..."],
            exitCode: 0,
            summary: "go build ./... succeeded",
            output: ""
          },
          test: {
            kind: "test",
            ok: true,
            command: ["go", "test", "./..."],
            exitCode: 0,
            summary: "go test ./... succeeded",
            output: ""
          }
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-action-scaffold",
      jobKind: "custom_contrib",
      stepType: "scaffold_action",
      analysisKind: "action_scaffold",
      snapshotUri: ".",
      appPath: "flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://action-scaffold",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        actionName: "Flow Action",
        modulePath: "example.com/acme/flow-action",
        title: "Flow Action",
        description: "Executes reusable flow work",
        version: "0.1.0",
        settings: [{ name: "mode", type: "string", required: true }],
        inputs: [{ name: "payload", type: "object", required: true }],
        outputs: [{ name: "result", type: "object" }]
      },
      command: [],
      containerArgs: []
    });

    const bundleArtifact = result.artifacts.find((artifact) => artifact.type === "contrib_bundle");
    const buildArtifact = result.artifacts.find((artifact) => artifact.type === "build_log");
    const testArtifact = result.artifacts.find((artifact) => artifact.type === "test_report");
    const bundleMetadata = bundleArtifact?.metadata as
      | {
          result?: {
            bundle?: { kind?: string; packageName?: string; modulePath?: string; files?: Array<{ kind?: string }> };
            validation?: { ok?: boolean };
            build?: { ok?: boolean };
            test?: { ok?: boolean };
          };
          proof?: { validation?: { ok?: boolean }; build?: { ok?: boolean }; test?: { ok?: boolean } };
        }
      | undefined;

    expect(result.ok).toBe(true);
    expect(bundleArtifact).toBeDefined();
    expect(buildArtifact).toBeDefined();
    expect(testArtifact).toBeDefined();
    expect(bundleMetadata?.result?.bundle?.kind).toBe("action");
    expect(bundleMetadata?.result?.bundle?.packageName).toBe("flowaction");
    expect(bundleMetadata?.result?.bundle?.modulePath).toBe("example.com/acme/flow-action");
    expect(bundleMetadata?.result?.bundle?.files?.some((file) => file.kind === "descriptor")).toBe(true);
    expect(bundleMetadata?.result?.validation?.ok).toBe(true);
    expect(bundleMetadata?.result?.build?.ok).toBe(true);
    expect(bundleMetadata?.result?.test?.ok).toBe(true);
    expect(bundleMetadata?.proof?.validation?.ok).toBe(true);
    expect((buildArtifact?.metadata as { contributionKind?: string } | undefined)?.contributionKind).toBe("action");
    expect((testArtifact?.metadata as { contributionKind?: string } | undefined)?.contributionKind).toBe("action");
  });

  it("rejects invalid action scaffold input before dispatching the helper", async () => {
    const service = new RunnerExecutorService();

    await expect(
      service.execute({
        taskId: "task-invalid-action-scaffold",
        jobKind: "custom_contrib",
        stepType: "scaffold_action",
        analysisKind: "action_scaffold",
        snapshotUri: ".",
        appPath: "flogo.json",
        env: {},
        envSecretRefs: {},
        timeoutSeconds: 60,
        artifactOutputUri: "memory://invalid-action-scaffold",
        jobTemplateName: "flogo-runner",
        analysisPayload: {
          actionName: "Broken Action",
          modulePath: "example.com/acme/broken-action",
          title: "Broken Action",
          description: "Has an unsupported field type",
          inputs: [{ name: "payload", type: "xml" }]
        },
        command: [],
        containerArgs: []
      })
    ).rejects.toThrow(/Unsupported action scaffold field type/);
  });

  it("executes helper-backed trigger scaffolding and publishes bundle plus build/test proof artifacts", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          bundle: {
            kind: "trigger",
            modulePath: "example.com/acme/webhook",
            packageName: "webhooktrigger",
            bundleRoot: "/tmp/flogo-trigger-webhooktrigger",
            descriptor: {
              ref: "example.com/acme/webhook",
              alias: "webhooktrigger",
              type: "trigger",
              name: "webhook-trigger",
              version: "0.1.0",
              title: "Webhook Trigger",
              settings: [{ name: "basePath", type: "string", required: true }],
              handlerSettings: [{ name: "route", type: "string", required: true }],
              outputs: [{ name: "payload", type: "object" }],
              reply: [{ name: "status", type: "integer" }],
              examples: ["Import the module and bind it to a handler."],
              compatibilityNotes: ["Generated scaffold"],
              source: "trigger_scaffold"
            },
            files: [
              { path: "/tmp/flogo-trigger-webhooktrigger/descriptor.json", kind: "descriptor", bytes: 180, content: "{}" },
              { path: "/tmp/flogo-trigger-webhooktrigger/trigger.go", kind: "implementation", bytes: 420, content: "package webhooktrigger" }
            ],
            readmePath: "/tmp/flogo-trigger-webhooktrigger/README.md"
          },
          validation: {
            ok: true,
            summary: "Trigger scaffold generated and passed isolated go test/build proof.",
            stages: [
              { stage: "structural", ok: true, diagnostics: [] },
              { stage: "regression", ok: true, diagnostics: [] },
              { stage: "build", ok: true, diagnostics: [] }
            ],
            artifacts: []
          },
          build: {
            kind: "build",
            ok: true,
            command: ["go", "build", "./..."],
            exitCode: 0,
            summary: "go build ./... succeeded",
            output: ""
          },
          test: {
            kind: "test",
            ok: true,
            command: ["go", "test", "./..."],
            exitCode: 0,
            summary: "go test ./... succeeded",
            output: ""
          }
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-trigger-scaffold",
      jobKind: "custom_contrib",
      stepType: "scaffold_trigger",
      analysisKind: "trigger_scaffold",
      snapshotUri: ".",
      appPath: "flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://trigger-scaffold",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        triggerName: "Webhook Trigger",
        modulePath: "example.com/acme/webhook",
        title: "Webhook Trigger",
        description: "Dispatches a webhook event",
        version: "0.1.0",
        settings: [{ name: "basePath", type: "string", required: true }],
        handlerSettings: [{ name: "route", type: "string", required: true }],
        outputs: [{ name: "payload", type: "object" }],
        replies: [{ name: "status", type: "integer" }]
      },
      command: [],
      containerArgs: []
    });

    const bundleArtifact = result.artifacts.find((artifact) => artifact.type === "contrib_bundle");
    const buildArtifact = result.artifacts.find((artifact) => artifact.type === "build_log");
    const testArtifact = result.artifacts.find((artifact) => artifact.type === "test_report");
    const bundleMetadata = bundleArtifact?.metadata as
      | {
          result?: {
            bundle?: { kind?: string; packageName?: string; modulePath?: string; files?: Array<{ kind?: string }> };
            validation?: { ok?: boolean };
            build?: { ok?: boolean };
            test?: { ok?: boolean };
          };
          proof?: { validation?: { ok?: boolean }; build?: { ok?: boolean }; test?: { ok?: boolean } };
        }
      | undefined;

    expect(result.ok).toBe(true);
    expect(bundleArtifact).toBeDefined();
    expect(buildArtifact).toBeDefined();
    expect(testArtifact).toBeDefined();
    expect(bundleMetadata?.result?.bundle?.kind).toBe("trigger");
    expect(bundleMetadata?.result?.bundle?.packageName).toBe("webhooktrigger");
    expect(bundleMetadata?.result?.bundle?.modulePath).toBe("example.com/acme/webhook");
    expect(bundleMetadata?.result?.bundle?.files?.some((file) => file.kind === "descriptor")).toBe(true);
    expect(bundleMetadata?.result?.validation?.ok).toBe(true);
    expect(bundleMetadata?.result?.build?.ok).toBe(true);
    expect(bundleMetadata?.result?.test?.ok).toBe(true);
    expect(bundleMetadata?.proof?.validation?.ok).toBe(true);
    expect((buildArtifact?.metadata as { contributionKind?: string } | undefined)?.contributionKind).toBe("trigger");
    expect((testArtifact?.metadata as { contributionKind?: string } | undefined)?.contributionKind).toBe("trigger");
  });

  it("rejects invalid trigger scaffold input before dispatching the helper", async () => {
    const service = new RunnerExecutorService();

    await expect(
      service.execute({
        taskId: "task-invalid-trigger-scaffold",
        jobKind: "custom_contrib",
        stepType: "scaffold_trigger",
        analysisKind: "trigger_scaffold",
        snapshotUri: ".",
        appPath: "flogo.json",
        env: {},
        envSecretRefs: {},
        timeoutSeconds: 60,
        artifactOutputUri: "memory://invalid-trigger-scaffold",
        jobTemplateName: "flogo-runner",
        analysisPayload: {
          triggerName: "Broken Trigger",
          modulePath: "example.com/acme/broken-trigger",
          title: "Broken Trigger",
          description: "Has an unsupported field type",
          outputs: [{ name: "payload", type: "xml" }]
        },
        command: [],
        containerArgs: []
      })
    ).rejects.toThrow(/Unsupported trigger scaffold field type/);
  });

  it("executes helper-backed shared contribution validation from a persisted contrib_bundle artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          bundle: {
            kind: "action",
            modulePath: "example.com/acme/flow-action",
            packageName: "flowaction",
            bundleRoot: "/tmp/flogo-action-flowaction",
            descriptor: {
              ref: "example.com/acme/flow-action",
              alias: "flowaction",
              type: "action",
              name: "flow-action",
              version: "0.1.0",
              title: "Flow Action",
              settings: [],
              inputs: [],
              outputs: [],
              examples: [],
              compatibilityNotes: ["Generated scaffold"],
              source: "action_scaffold"
            },
            files: [{ path: "/tmp/flogo-action-flowaction/descriptor.json", kind: "descriptor", bytes: 160, content: "{}" }],
            readmePath: "/tmp/flogo-action-flowaction/README.md"
          },
          validation: {
            ok: true,
            summary: "Contribution bundle passed shared validation proof.",
            stages: [
              { stage: "structural", ok: true, diagnostics: [] },
              { stage: "regression", ok: true, diagnostics: [] },
              { stage: "build", ok: true, diagnostics: [] }
            ],
            artifacts: []
          },
          build: {
            kind: "build",
            ok: true,
            command: ["go", "build", "./..."],
            exitCode: 0,
            summary: "go build ./... succeeded",
            output: ""
          },
          test: {
            kind: "test",
            ok: true,
            command: ["go", "test", "./..."],
            exitCode: 0,
            summary: "go test ./... succeeded",
            output: ""
          },
          source: "bundle_artifact",
          sourceArtifactId: "bundle-artifact-1"
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-validate-contrib",
      jobKind: "contrib_validation",
      stepType: "validate_contrib",
      analysisKind: "validate_contrib",
      snapshotUri: ".",
      appPath: "flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://validate-contrib",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        bundleArtifactId: "bundle-artifact-1",
        bundleArtifact: {
          id: "bundle-artifact-1",
          type: "contrib_bundle",
          name: "action-bundle-flowaction",
          uri: "memory://task/action-bundle-flowaction.json",
          metadata: {
            result: {
              bundle: {
                kind: "action",
                modulePath: "example.com/acme/flow-action",
                packageName: "flowaction",
                bundleRoot: "/tmp/flogo-action-flowaction",
                descriptor: {
                  ref: "example.com/acme/flow-action",
                  alias: "flowaction",
                  type: "action",
                  name: "flow-action",
                  version: "0.1.0",
                  title: "Flow Action",
                  settings: [],
                  inputs: [],
                  outputs: [],
                  examples: [],
                  compatibilityNotes: ["Generated scaffold"],
                  source: "action_scaffold"
                },
                files: []
              },
              validation: { ok: true, stages: [], summary: "ok", artifacts: [] },
              build: { kind: "build", ok: true, command: ["go", "build", "./..."], exitCode: 0, summary: "ok", output: "" },
              test: { kind: "test", ok: true, command: ["go", "test", "./..."], exitCode: 0, summary: "ok", output: "" }
            }
          }
        }
      },
      command: [],
      containerArgs: []
    });

    const validationArtifact = result.artifacts.find((artifact) => artifact.type === "contrib_validation_report");
    expect(result.ok).toBe(true);
    expect(validationArtifact).toBeDefined();
    expect((validationArtifact?.metadata as { result?: { source?: string; sourceArtifactId?: string; bundle?: { kind?: string } } } | undefined)?.result?.source).toBe("bundle_artifact");
    expect((validationArtifact?.metadata as { result?: { sourceArtifactId?: string; bundle?: { kind?: string } } } | undefined)?.result?.sourceArtifactId).toBe("bundle-artifact-1");
    expect((validationArtifact?.metadata as { result?: { bundle?: { kind?: string } } } | undefined)?.result?.bundle?.kind).toBe("action");
  });

  it("executes helper-backed shared contribution packaging and publishes a reviewable package artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          bundle: {
            kind: "trigger",
            modulePath: "example.com/acme/webhook",
            packageName: "webhooktrigger",
            bundleRoot: "/tmp/flogo-trigger-webhooktrigger",
            descriptor: {
              ref: "example.com/acme/webhook",
              alias: "webhooktrigger",
              type: "trigger",
              name: "webhook-trigger",
              version: "0.1.0",
              title: "Webhook Trigger",
              settings: [],
              handlerSettings: [],
              outputs: [],
              reply: [],
              examples: [],
              compatibilityNotes: ["Generated scaffold"],
              source: "trigger_scaffold"
            },
            files: [{ path: "/tmp/flogo-trigger-webhooktrigger/descriptor.json", kind: "descriptor", bytes: 180, content: "{}" }],
            readmePath: "/tmp/flogo-trigger-webhooktrigger/README.md"
          },
          validation: {
            ok: true,
            summary: "Contribution bundle passed shared validation proof.",
            stages: [
              { stage: "structural", ok: true, diagnostics: [] },
              { stage: "regression", ok: true, diagnostics: [] },
              { stage: "build", ok: true, diagnostics: [] }
            ],
            artifacts: []
          },
          build: {
            kind: "build",
            ok: true,
            command: ["go", "build", "./..."],
            exitCode: 0,
            summary: "go build ./... succeeded",
            output: ""
          },
          test: {
            kind: "test",
            ok: true,
            command: ["go", "test", "./..."],
            exitCode: 0,
            summary: "go test ./... succeeded",
            output: ""
          },
          source: "inline_result",
          package: {
            format: "zip",
            fileName: "webhooktrigger.zip",
            path: "/tmp/webhooktrigger.zip",
            bytes: 2048,
            sha256: "abc123",
            base64: "ZmFrZS16aXA="
          }
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-package-contrib",
      jobKind: "contrib_package",
      stepType: "package_contrib",
      analysisKind: "package_contrib",
      snapshotUri: ".",
      appPath: "flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://package-contrib",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        result: {
          bundle: {
            kind: "trigger",
            modulePath: "example.com/acme/webhook",
            packageName: "webhooktrigger",
            bundleRoot: "/tmp/flogo-trigger-webhooktrigger",
            descriptor: {
              ref: "example.com/acme/webhook",
              alias: "webhooktrigger",
              type: "trigger",
              name: "webhook-trigger",
              version: "0.1.0",
              title: "Webhook Trigger",
              settings: [],
              handlerSettings: [],
              outputs: [],
              reply: [],
              examples: [],
              compatibilityNotes: ["Generated scaffold"],
              source: "trigger_scaffold"
            },
            files: []
          },
          validation: { ok: true, stages: [], summary: "ok", artifacts: [] },
          build: { kind: "build", ok: true, command: ["go", "build", "./..."], exitCode: 0, summary: "ok", output: "" },
          test: { kind: "test", ok: true, command: ["go", "test", "./..."], exitCode: 0, summary: "ok", output: "" }
        },
        format: "zip"
      },
      command: [],
      containerArgs: []
    });

    const packageArtifact = result.artifacts.find((artifact) => artifact.type === "contrib_package");
    expect(result.ok).toBe(true);
    expect(packageArtifact).toBeDefined();
    expect((packageArtifact?.metadata as { result?: { package?: { format?: string; fileName?: string }; bundle?: { kind?: string } } } | undefined)?.result?.package?.format).toBe("zip");
    expect((packageArtifact?.metadata as { result?: { package?: { fileName?: string } } } | undefined)?.result?.package?.fileName).toBe("webhooktrigger.zip");
    expect((packageArtifact?.metadata as { result?: { bundle?: { kind?: string } } } | undefined)?.result?.bundle?.kind).toBe("trigger");
  });

  it("executes helper-backed contribution install planning and publishes a reviewable install-plan artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          contributionKind: "trigger",
          source: "package_artifact",
          sourceArtifactId: "package-artifact-1",
          targetApp: {
            projectId: "demo",
            appId: "hello-rest",
            appPath: "examples/hello-rest/flogo.json",
            appName: "hello-rest"
          },
          bundle: {
            kind: "trigger",
            modulePath: "example.com/acme/webhook",
            packageName: "webhooktrigger",
            bundleRoot: "/tmp/flogo-trigger-webhooktrigger",
            descriptor: {
              ref: "example.com/acme/webhook",
              alias: "webhooktrigger",
              type: "trigger",
              name: "webhook-trigger",
              version: "0.1.0",
              title: "Webhook Trigger",
              settings: [],
              handlerSettings: [],
              outputs: [],
              reply: [],
              examples: [],
              compatibilityNotes: ["Generated scaffold"],
              source: "trigger_scaffold"
            },
            files: []
          },
          package: {
            format: "zip",
            fileName: "trigger-webhooktrigger.zip",
            path: "/tmp/trigger-webhooktrigger.zip",
            bytes: 2048,
            sha256: "abc123",
            base64: "ZmFrZQ=="
          },
          modulePath: "example.com/acme/webhook",
          packageName: "webhooktrigger",
          packagePath: "example.com/acme/webhook",
          descriptorRef: "example.com/acme/webhook",
          selectedAlias: "webhooktrigger",
          installReady: true,
          readiness: "high",
          proposedImports: [
            {
              alias: "webhooktrigger",
              ref: "example.com/acme/webhook",
              action: "add"
            }
          ],
          proposedRefs: [
            {
              surface: "triggerRef",
              value: "#webhooktrigger",
              note: "Use this ref when creating a trigger instance."
            }
          ],
          predictedChanges: {
            importsToAdd: [
              {
                alias: "webhooktrigger",
                ref: "example.com/acme/webhook",
                action: "add"
              }
            ],
            importsToUpdate: [],
            reusableRefs: [
              {
                surface: "triggerRef",
                value: "#webhooktrigger"
              }
            ],
            summaryLines: ["Add import alias \"webhooktrigger\" for ref \"example.com/acme/webhook\"."],
            noMutation: true
          },
          warnings: [],
          conflicts: [],
          diagnostics: [],
          recommendedNextAction: "Review the import plan before adding a trigger instance that uses #webhooktrigger.",
          limitations: ["Planning only; no flogo.json mutation was applied."]
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-install-contrib-plan",
      jobKind: "contrib_install_plan",
      stepType: "install_contrib_plan",
      analysisKind: "install_contrib_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://install-contrib-plan",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        packageArtifactId: "package-artifact-1",
        packageArtifact: {
          id: "package-artifact-1",
          type: "contrib_package",
          name: "trigger-package-webhooktrigger",
          uri: "memory://task/trigger-package-webhooktrigger.json",
          metadata: {
            result: {
              bundle: {
                kind: "trigger",
                modulePath: "example.com/acme/webhook",
                packageName: "webhooktrigger",
                bundleRoot: "/tmp/flogo-trigger-webhooktrigger",
                descriptor: {
                  ref: "example.com/acme/webhook",
                  alias: "webhooktrigger",
                  type: "trigger",
                  name: "webhook-trigger",
                  version: "0.1.0",
                  title: "Webhook Trigger",
                  settings: [],
                  handlerSettings: [],
                  outputs: [],
                  reply: [],
                  examples: [],
                  compatibilityNotes: ["Generated scaffold"],
                  source: "trigger_scaffold"
                },
                files: []
              },
              validation: { ok: true, stages: [], summary: "ok", artifacts: [] },
              build: { kind: "build", ok: true, command: ["go", "build", "./..."], exitCode: 0, summary: "ok", output: "" },
              test: { kind: "test", ok: true, command: ["go", "test", "./..."], exitCode: 0, summary: "ok", output: "" },
              package: {
                format: "zip",
                fileName: "trigger-webhooktrigger.zip",
                path: "/tmp/trigger-webhooktrigger.zip",
                bytes: 2048,
                sha256: "abc123",
                base64: "ZmFrZQ=="
              }
            }
          }
        },
        targetApp: {
          projectId: "demo",
          appId: "hello-rest",
          appPath: "examples/hello-rest/flogo.json"
        },
        preferredAlias: "webhooktrigger"
      },
      command: [],
      containerArgs: []
    });

    const installPlanArtifact = result.artifacts.find((artifact) => artifact.type === "contrib_install_plan");
    expect(result.ok).toBe(true);
    expect(installPlanArtifact).toBeDefined();
    expect((installPlanArtifact?.metadata as { result?: { installReady?: boolean; readiness?: string; selectedAlias?: string } } | undefined)?.result?.installReady).toBe(true);
    expect((installPlanArtifact?.metadata as { result?: { readiness?: string } } | undefined)?.result?.readiness).toBe("high");
    expect((installPlanArtifact?.metadata as { result?: { selectedAlias?: string } } | undefined)?.result?.selectedAlias).toBe("webhooktrigger");
  });

  it("rejects malformed shared contribution validation input before dispatching the helper", async () => {
    const service = new RunnerExecutorService();

    await expect(
      service.execute({
        taskId: "task-invalid-validate-contrib",
        jobKind: "contrib_validation",
        stepType: "validate_contrib",
        analysisKind: "validate_contrib",
        snapshotUri: ".",
        appPath: "flogo.json",
        env: {},
        envSecretRefs: {},
        timeoutSeconds: 60,
        artifactOutputUri: "memory://invalid-validate-contrib",
        jobTemplateName: "flogo-runner",
        analysisPayload: {},
        command: [],
        containerArgs: []
      })
    ).rejects.toThrow(/Provide bundleArtifactId, bundleArtifact, or result/);
  });

  it("rejects malformed contribution install-planning input before dispatching the helper", async () => {
    const service = new RunnerExecutorService();

    await expect(
      service.execute({
        taskId: "task-invalid-install-contrib-plan",
        jobKind: "contrib_install_plan",
        stepType: "install_contrib_plan",
        analysisKind: "install_contrib_plan",
        snapshotUri: ".",
        appPath: "examples/hello-rest/flogo.json",
        env: {},
        envSecretRefs: {},
        timeoutSeconds: 60,
        artifactOutputUri: "memory://invalid-install-contrib-plan",
        jobTemplateName: "flogo-runner",
        analysisPayload: {},
        command: [],
        containerArgs: []
      })
    ).rejects.toThrow(/Provide one contribution source/);
  });

  it("executes helper-backed timer trace capture and persists timer runtime metadata", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
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
            flowId: "heartbeat",
            status: "completed",
            input: {},
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

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-timer-trace",
      jobKind: "run_trace_capture",
      stepType: "capture_run_trace",
      analysisKind: "run_trace_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://timer-trace",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "heartbeat",
        validateOnly: false
      },
      command: [],
      containerArgs: []
    });

    const traceArtifact = result.artifacts.find((artifact) => artifact.type === "run_trace");
    const metadata = traceArtifact?.metadata as
      | {
          traceComparisonBasisPreference?: string;
          traceTimerTriggerRuntimeEvidence?: boolean;
          traceTimerTriggerRuntimeKind?: string;
          traceTimerTriggerRuntimeRunMode?: string;
          traceTimerTriggerRuntimeStartDelay?: string;
          traceTimerTriggerRuntimeRepeatInterval?: string;
          traceTimerTriggerRuntimeTickObserved?: boolean;
        }
      | undefined;

    expect(result.ok).toBe(true);
    expect(traceArtifact).toBeDefined();
    expect(metadata?.traceComparisonBasisPreference).toBe("timer_runtime_startup");
    expect(metadata?.traceTimerTriggerRuntimeEvidence).toBe(true);
    expect(metadata?.traceTimerTriggerRuntimeKind).toBe("timer");
    expect(metadata?.traceTimerTriggerRuntimeRunMode).toBe("repeat");
    expect(metadata?.traceTimerTriggerRuntimeStartDelay).toBe("10s");
    expect(metadata?.traceTimerTriggerRuntimeRepeatInterval).toBe("30s");
    expect(metadata?.traceTimerTriggerRuntimeTickObserved).toBe(true);
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
    const bindingArtifact = result.artifacts.find((artifact) => artifact.type === "trigger_binding_plan");
    const bindingMetadata = bindingArtifact?.metadata as
      | { result?: { plan?: { profile?: { kind?: string; replyMode?: string; requestMappingMode?: string; replyMappingMode?: string } } } }
      | undefined;
    expect(bindingMetadata?.result?.plan?.profile?.kind).toBe("rest");
    expect(bindingMetadata?.result?.plan?.profile?.replyMode).toBe("json");
    expect(bindingMetadata?.result?.plan?.profile?.requestMappingMode).toBe("auto");
    expect(bindingMetadata?.result?.plan?.profile?.replyMappingMode).toBe("auto");
  });

  it("forwards supported trigger-binding flags and omits deprecated triggerName", async () => {
    const argsPath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "flogo-helper-args-")), "trigger-binding-args.txt");
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
      }),
      argsPath
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-trigger-binding-args",
      jobKind: "trigger_binding",
      stepType: "bind_trigger",
      analysisKind: "trigger_binding_plan",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://trigger-binding-args",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "hello",
        validateOnly: true,
        handlerName: "post_hello",
        triggerId: "flogo-rest-hello",
        triggerName: "deprecated-name",
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

    const forwardedArgs = (await fs.readFile(argsPath, "utf8")).trim().split(/\r?\n/).filter(Boolean);

    expect(result.ok).toBe(true);
    expect(forwardedArgs).toContain("--validate-only");
    expect(forwardedArgs).toContain("--handler-name");
    expect(forwardedArgs).toContain("--trigger-id");
    expect(forwardedArgs).not.toContain("--trigger-name");
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
                    name: "Ada"
                  }
                },
                flowInput: {
                  name: "Ada"
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
                    name: "$trigger.content"
                  },
                  mappedFlowOutput: {
                    data: "$flow.message"
                  },
                  requestMappings: {
                    name: "$trigger.content"
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
              steps: [{ id: "log_1" }]
            },
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
    const traceArtifact = result.artifacts.find((artifact) => artifact.type === "run_trace");
    expect(traceArtifact).toBeDefined();
    expect(traceArtifact?.metadata?.["traceEvidenceKind"]).toBe("runtime_backed");
    expect(traceArtifact?.metadata?.["traceComparisonBasisPreference"]).toBe("rest_runtime_envelope");
    expect(traceArtifact?.metadata?.["traceNormalizedStepCount"]).toBe(1);
    expect(traceArtifact?.metadata?.["traceRecorderMode"]).toBe("full");
    expect(traceArtifact?.metadata?.["traceRestTriggerRuntimeEvidence"]).toBe(true);
    expect(traceArtifact?.metadata?.["traceRestTriggerRuntimeKind"]).toBe("rest");
    expect(traceArtifact?.metadata?.["traceRestTriggerRuntimeMethod"]).toBe("POST");
    expect(traceArtifact?.metadata?.["traceRestTriggerRuntimePath"]).toBe("/hello");
    expect(traceArtifact?.metadata?.["traceRestTriggerRuntimeReplyStatus"]).toBe(200);
    expect((traceArtifact?.metadata?.["runtimeEvidence"] as { steps?: unknown[] } | undefined)?.steps).toHaveLength(1);
    expect(
      (traceArtifact?.metadata?.["runtimeEvidence"] as { normalizedSteps?: unknown[] } | undefined)?.normalizedSteps
    ).toHaveLength(1);
    expect(
      (traceArtifact?.metadata?.["runtimeEvidence"] as { restTriggerRuntime?: { kind?: string } } | undefined)
        ?.restTriggerRuntime?.kind
    ).toBe("rest");
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
                    path: "/hello",
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
                steps: [{ id: "log" }]
              },
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
    const replayArtifact = result.artifacts.find((artifact) => artifact.type === "replay_report");
    expect(replayArtifact).toBeDefined();
    expect(replayArtifact?.metadata?.["replayEvidenceKind"]).toBe("runtime_backed");
    expect(replayArtifact?.metadata?.["replayComparisonBasisPreference"]).toBe("rest_runtime_envelope");
    expect(replayArtifact?.metadata?.["replayNormalizedStepCount"]).toBe(1);
    expect(replayArtifact?.metadata?.["replayRecorderMode"]).toBe("full");
    expect(replayArtifact?.metadata?.["replayRestReplayComparisonBasis"]).toBe("rest_runtime_envelope");
    expect(replayArtifact?.metadata?.["replayRestRuntimeMode"]).toBe("independent_action_replay");
    expect(replayArtifact?.metadata?.["replayRestRequestEnvelopeObserved"]).toBe(true);
    expect(replayArtifact?.metadata?.["replayRestMappedFlowInputObserved"]).toBe(true);
    expect(replayArtifact?.metadata?.["replayRestMappedFlowOutputObserved"]).toBe(true);
    expect(replayArtifact?.metadata?.["replayRestReplyEnvelopeObserved"]).toBe(true);
    expect(replayArtifact?.metadata?.["replayRestTriggerRuntimeEvidence"]).toBe(true);
    expect(replayArtifact?.metadata?.["replayRestTriggerRuntimeKind"]).toBe("rest");
    expect(replayArtifact?.metadata?.["replayRestTriggerRuntimeMethod"]).toBe("POST");
    expect(replayArtifact?.metadata?.["replayRestTriggerRuntimePath"]).toBe("/hello");
    expect(replayArtifact?.metadata?.["replayRestTriggerRuntimeReplyStatus"]).toBe(200);
    expect((replayArtifact?.metadata?.["runtimeEvidence"] as { steps?: unknown[] } | undefined)?.steps).toHaveLength(1);
    expect(
      (replayArtifact?.metadata?.["runtimeEvidence"] as { normalizedSteps?: unknown[] } | undefined)?.normalizedSteps
    ).toHaveLength(1);
    expect(
      (replayArtifact?.metadata?.["runtimeEvidence"] as { restTriggerRuntime?: { kind?: string } } | undefined)
        ?.restTriggerRuntime?.kind
    ).toBe("rest");
  });

  it("persists CLI runtime replay metadata for the narrow CLI slice", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          summary: {
            flowId: "hello",
            status: "completed",
            inputSource: "explicit_input",
            baseInput: {
              args: ["hello"]
            },
            effectiveInput: {
              args: ["hello"],
              flags: {
                loud: true
              }
            },
            overridesApplied: false,
            diagnostics: []
          },
          trace: {
            appName: "cli-app",
            flowId: "hello",
            evidenceKind: "runtime_backed",
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
                  unavailableFields: [],
                  diagnostics: []
                }
              ],
              steps: [{ id: "prepare" }]
            },
            summary: {
              flowId: "hello",
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
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-cli-replay",
      jobKind: "flow_replay",
      stepType: "replay_flow",
      analysisKind: "replay",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://cli-replay",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flowId: "hello",
        baseInput: {
          args: ["hello"],
          flags: {
            loud: true
          }
        }
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    const replayArtifact = result.artifacts.find((artifact) => artifact.type === "replay_report");
    expect(replayArtifact?.metadata?.["replayEvidenceKind"]).toBe("runtime_backed");
    expect(replayArtifact?.metadata?.["replayComparisonBasisPreference"]).toBe("normalized_runtime_evidence");
    expect(replayArtifact?.metadata?.["replayRuntimeMode"]).toBe("cli_trigger_replay");
    expect(replayArtifact?.metadata?.["replayCLITriggerRuntimeEvidence"]).toBe(true);
    expect(replayArtifact?.metadata?.["replayCLITriggerRuntimeKind"]).toBe("cli");
    expect(replayArtifact?.metadata?.["replayCLITriggerRuntimeCommand"]).toBe("say");
    expect(replayArtifact?.metadata?.["replayCLITriggerRuntimeSingleCmd"]).toBe(true);
    expect(replayArtifact?.metadata?.["replayCLITriggerRuntimeHasArgs"]).toBe(true);
    expect(replayArtifact?.metadata?.["replayCLITriggerRuntimeHasFlags"]).toBe(true);
    expect(replayArtifact?.metadata?.["replayCLITriggerRuntimeHasMappedFlowInput"]).toBe(true);
    expect(replayArtifact?.metadata?.["replayCLITriggerRuntimeHasMappedFlowOutput"]).toBe(false);
    expect(replayArtifact?.metadata?.["replayCLITriggerRuntimeHasReply"]).toBe(true);
    expect(
      (replayArtifact?.metadata?.["runtimeEvidence"] as { cliTriggerRuntime?: { kind?: string } } | undefined)
        ?.cliTriggerRuntime?.kind
    ).toBe("cli");
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
              evidenceKind: "runtime_backed",
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
              evidenceKind: "runtime_backed",
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
            flowId: "hello",
            evidenceKind: "runtime_backed",
            normalizedStepEvidence: true,
            comparisonBasisPreference: "rest_runtime_envelope",
            restTriggerRuntimeEvidence: true,
            restTriggerRuntimeKind: "rest"
          },
          right: {
            artifactId: "right-replay",
            kind: "replay_report",
            summaryStatus: "completed",
            flowId: "hello",
            evidenceKind: "runtime_backed",
            normalizedStepEvidence: true,
            comparisonBasisPreference: "rest_runtime_envelope",
            restTriggerRuntimeEvidence: true,
            restTriggerRuntimeKind: "rest"
          },
          comparisonBasis: "rest_runtime_envelope",
          restComparison: {
            comparisonBasis: "rest_runtime_envelope",
            requestEnvelopeCompared: true,
            mappedFlowInputCompared: true,
            replyEnvelopeCompared: true,
            normalizedStepEvidenceCompared: true,
            requestEnvelopeDiff: {
              kind: "changed",
              left: {
                method: "POST",
                path: "/hello",
                body: {
                  payload: "hello"
                }
              },
              right: {
                method: "POST",
                path: "/hello",
                body: {
                  payload: "replayed"
                }
              }
            },
            mappedFlowInputDiff: {
              kind: "changed",
              left: {
                payload: "hello"
              },
              right: {
                payload: "replayed"
              }
            },
            replyEnvelopeDiff: {
              kind: "changed",
              left: {
                status: 200,
                body: {
                  message: "hello"
                }
              },
              right: {
                status: 200,
                body: {
                  message: "replayed"
                }
              }
            },
            normalizedStepCountDiff: {
              kind: "same",
              left: 1,
              right: 1
            },
            unsupportedFields: [],
            diagnostics: []
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
                    path: "/hello"
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
                    taskId: "log",
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
                      path: "/hello"
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
                  normalizedSteps: [
                    {
                      taskId: "log",
                      status: "completed",
                      resolvedInputs: {
                        payload: "replayed"
                      },
                      producedOutputs: {
                        message: "replayed"
                      },
                      unavailableFields: [],
                      diagnostics: []
                    }
                  ]
                },
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
    const comparisonArtifact = result.artifacts.find((artifact) => artifact.type === "run_comparison");
    expect(comparisonArtifact).toBeDefined();
    expect(comparisonArtifact?.metadata?.["comparisonBasis"]).toBe("rest_runtime_envelope");
    expect(comparisonArtifact?.metadata?.["leftEvidenceKind"]).toBe("runtime_backed");
    expect(comparisonArtifact?.metadata?.["leftNormalizedStepEvidence"]).toBe(true);
    expect(comparisonArtifact?.metadata?.["rightNormalizedStepEvidence"]).toBe(true);
    expect(comparisonArtifact?.metadata?.["restComparisonBasis"]).toBe("rest_runtime_envelope");
    expect(comparisonArtifact?.metadata?.["restRequestEnvelopeCompared"]).toBe(true);
    expect(comparisonArtifact?.metadata?.["restMappedFlowInputCompared"]).toBe(true);
    expect(comparisonArtifact?.metadata?.["restReplyEnvelopeCompared"]).toBe(true);
    expect(comparisonArtifact?.metadata?.["restNormalizedStepEvidenceCompared"]).toBe(true);
    expect((comparisonArtifact?.metadata?.["restComparison"] as { comparisonBasis?: string } | undefined)?.comparisonBasis).toBe(
      "rest_runtime_envelope"
    );
    expect((comparisonArtifact?.metadata?.["result"] as { steps?: Array<{ taskId: string }> } | undefined)?.steps).toHaveLength(1);
  });

  it("executes helper-backed channel comparison and publishes a channel comparison artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        result: {
          left: {
            artifactId: "left-channel-trace",
            kind: "run_trace",
            summaryStatus: "completed",
            flowId: "orchestrate",
            evidenceKind: "runtime_backed",
            normalizedStepEvidence: true,
            comparisonBasisPreference: "channel_runtime_boundary",
            channelTriggerRuntimeEvidence: true,
            channelTriggerRuntimeKind: "channel",
            channelTriggerRuntimeChannel: "orders"
          },
          right: {
            artifactId: "right-channel-replay",
            kind: "replay_report",
            summaryStatus: "completed",
            flowId: "orchestrate",
            evidenceKind: "runtime_backed",
            normalizedStepEvidence: true,
            comparisonBasisPreference: "channel_runtime_boundary",
            channelTriggerRuntimeEvidence: true,
            channelTriggerRuntimeKind: "channel",
            channelTriggerRuntimeChannel: "orders"
          },
          comparisonBasis: "channel_runtime_boundary",
          channelComparison: {
            comparisonBasis: "channel_runtime_boundary",
            runtimeMode: "channel_trigger_replay",
            channelCompared: true,
            dataCompared: true,
            flowInputCompared: true,
            flowOutputCompared: true,
            channelDiff: {
              kind: "same",
              left: "orders",
              right: "orders"
            },
            dataDiff: {
              kind: "changed",
              left: {
                orderId: "123"
              },
              right: {
                orderId: "456"
              }
            },
            flowInputDiff: {
              kind: "changed",
              left: {
                order: {
                  id: "123"
                }
              },
              right: {
                order: {
                  id: "456"
                }
              }
            },
            flowOutputDiff: {
              kind: "same",
              left: {
                status: "accepted"
              },
              right: {
                status: "accepted"
              }
            },
            unsupportedFields: [],
            diagnostics: []
          },
          summary: {
            statusChanged: false,
            inputDiff: {
              kind: "changed",
              left: { data: { orderId: "123" } },
              right: { data: { orderId: "456" } }
            },
            outputDiff: {
              kind: "same",
              left: { status: "accepted" },
              right: { status: "accepted" }
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
              taskId: "prepare",
              leftStatus: "completed",
              rightStatus: "completed",
              diagnosticDiffs: [],
              changeKind: "same"
            }
          ],
          diagnostics: []
        }
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-channel-comparison",
      jobKind: "run_comparison",
      stepType: "compare_runs",
      analysisKind: "run_comparison",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://channel-comparison",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        leftArtifactId: "left-channel-trace",
        rightArtifactId: "right-channel-replay",
        leftArtifact: {
          artifactId: "left-channel-trace",
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
                ]
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
              steps: [{ taskId: "prepare", status: "completed", diagnostics: [] }],
              diagnostics: []
            }
          }
        },
        rightArtifact: {
          artifactId: "right-channel-replay",
          kind: "replay_report",
          payload: {
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
                ]
              },
              trace: {
                appName: "demo",
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
                  ]
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
                steps: [{ taskId: "prepare", status: "completed", diagnostics: [] }],
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
    const comparisonArtifact = result.artifacts.find((artifact) => artifact.type === "run_comparison");
    expect(comparisonArtifact).toBeDefined();
    expect(comparisonArtifact?.metadata?.["comparisonBasis"]).toBe("channel_runtime_boundary");
    expect(comparisonArtifact?.metadata?.["leftChannelTriggerRuntimeEvidence"]).toBe(true);
    expect(comparisonArtifact?.metadata?.["rightChannelTriggerRuntimeEvidence"]).toBe(true);
    expect(comparisonArtifact?.metadata?.["leftChannelTriggerRuntimeKind"]).toBe("channel");
    expect(comparisonArtifact?.metadata?.["rightChannelTriggerRuntimeKind"]).toBe("channel");
    expect(comparisonArtifact?.metadata?.["leftChannelTriggerRuntimeChannel"]).toBe("orders");
    expect(comparisonArtifact?.metadata?.["rightChannelTriggerRuntimeChannel"]).toBe("orders");
    expect(comparisonArtifact?.metadata?.["channelComparisonBasis"]).toBe("channel_runtime_boundary");
    expect(comparisonArtifact?.metadata?.["channelCompared"]).toBe(true);
    expect(comparisonArtifact?.metadata?.["channelDataCompared"]).toBe(true);
    expect((comparisonArtifact?.metadata?.["channelComparison"] as { comparisonBasis?: string } | undefined)?.comparisonBasis).toBe(
      "channel_runtime_boundary"
    );
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

  it("executes diagnosis mode and publishes nested runtime artifacts plus a diagnosis report", async () => {
    process.env.FLOGO_HELPER_BIN = await createMultiResponseHelperScript({
      "flows:trace": JSON.stringify({
        trace: {
          appName: "demo",
          flowId: "hello_flow",
          evidenceKind: "runtime_backed",
          runtimeEvidence: {
            kind: "runtime_backed",
            runtimeMode: "rest_trigger",
            recorderBacked: true,
            recorderMode: "full",
            restTriggerRuntime: {
              kind: "rest",
              request: {
                method: "POST",
                path: "/hello"
              },
              flowInput: {
                payload: "hello"
              },
              reply: {
                status: 200
              },
              unavailableFields: [],
              diagnostics: []
            },
            normalizedSteps: [
              {
                taskId: "log_1",
                status: "completed",
                unavailableFields: [],
                diagnostics: []
              }
            ]
          },
          summary: {
            flowId: "hello_flow",
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
      }),
      "flows:replay": JSON.stringify({
        result: {
          summary: {
            flowId: "hello_flow",
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
          comparisonBasisPreference: "rest_runtime_envelope",
          runtimeEvidence: {
            kind: "runtime_backed",
            runtimeMode: "rest_trigger_replay",
            recorderBacked: true,
            recorderMode: "full",
            restTriggerRuntime: {
              kind: "rest",
              request: {
                method: "POST",
                path: "/hello"
              },
              flowInput: {
                payload: "hello"
              },
              reply: {
                status: 500
              },
              unavailableFields: [],
              diagnostics: []
            },
            normalizedSteps: [
              {
                taskId: "log_1",
                status: "completed",
                unavailableFields: [],
                diagnostics: []
              }
            ]
          },
          trace: {
            appName: "demo",
            flowId: "hello_flow",
            evidenceKind: "runtime_backed",
            runtimeEvidence: {
              kind: "runtime_backed",
              runtimeMode: "rest_trigger_replay",
              recorderBacked: true,
              recorderMode: "full",
              restTriggerRuntime: {
                kind: "rest",
                request: {
                  method: "POST",
                  path: "/hello"
                },
                flowInput: {
                  payload: "hello"
                },
                reply: {
                  status: 500
                },
                unavailableFields: [],
                diagnostics: []
              },
              normalizedSteps: [
                {
                  taskId: "log_1",
                  status: "completed",
                  unavailableFields: [],
                  diagnostics: []
                }
              ]
            },
            summary: {
              flowId: "hello_flow",
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
      }),
      "flows:compare-runs": JSON.stringify({
        result: {
          left: {
            artifactId: "trace-artifact",
            kind: "run_trace",
            summaryStatus: "completed",
            flowId: "hello_flow",
            normalizedStepEvidence: true,
            comparisonBasisPreference: "rest_runtime_envelope"
          },
          right: {
            artifactId: "replay-artifact",
            kind: "replay_report",
            summaryStatus: "completed",
            flowId: "hello_flow",
            normalizedStepEvidence: true,
            comparisonBasisPreference: "rest_runtime_envelope"
          },
          comparisonBasis: "rest_runtime_envelope",
          restComparison: {
            comparisonBasis: "rest_runtime_envelope",
            requestEnvelopeCompared: true,
            mappedFlowInputCompared: true,
            replyEnvelopeCompared: true,
            normalizedStepEvidenceCompared: true,
            requestEnvelopeDiff: {
              kind: "same"
            },
            mappedFlowInputDiff: {
              kind: "same"
            },
            replyEnvelopeDiff: {
              kind: "changed",
              left: {
                status: 200
              },
              right: {
                status: 500
              }
            },
            normalizedStepCountDiff: {
              kind: "same",
              left: 1,
              right: 1
            },
            unsupportedFields: [],
            diagnostics: []
          },
          summary: {
            statusChanged: false,
            inputDiff: {
              kind: "same"
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
      })
    });

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-diagnosis",
      jobKind: "diagnosis",
      stepType: "diagnose_app",
      analysisKind: "diagnosis",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://diagnosis",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        symptom: "wrong_response",
        triggerFamily: "rest",
        flowId: "hello",
        sampleInput: {
          payload: "hello"
        },
        baseInput: {
          payload: "hello"
        }
      },
      command: [],
      containerArgs: []
    });

    const diagnosisArtifact = result.artifacts.find((artifact) => artifact.type === "diagnosis_report");
    const report = diagnosisArtifact?.metadata?.["report"] as
      | {
          problemCategory?: string;
          subtype?: string;
          evidenceQuality?: string;
          plan?: { selectedOperations?: string[] };
          relatedArtifactIds?: string[];
        }
      | undefined;

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "run_trace")).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "replay_report")).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "run_comparison")).toBe(true);
    expect(diagnosisArtifact).toBeDefined();
    expect(report?.problemCategory).toBe("trigger");
    expect(report?.subtype).toBe("rest_envelope_mismatch");
    expect(report?.evidenceQuality).toBe("runtime_backed");
    expect(report?.plan?.selectedOperations).toContain("compare_runs");
    expect(report?.relatedArtifactIds?.length).toBeGreaterThan(0);
  });

  it("persists low-confidence fallback diagnosis metadata honestly", async () => {
    process.env.FLOGO_HELPER_BIN = await createMultiResponseHelperScript({
      "flows:trace": JSON.stringify({
        trace: {
          appName: "demo",
          flowId: "hello_flow",
          evidenceKind: "simulated_fallback",
          runtimeEvidence: {
            kind: "simulated_fallback",
            runtimeMode: "cli_trigger",
            fallbackReason: "Unsupported CLI flag descriptor triggered fallback."
          },
          summary: {
            flowId: "hello_flow",
            status: "failed",
            input: {},
            output: {},
            stepCount: 0,
            diagnostics: []
          },
          steps: [],
          diagnostics: []
        }
      })
    });

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-diagnosis-fallback",
      jobKind: "diagnosis",
      stepType: "diagnose_app",
      analysisKind: "diagnosis",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://diagnosis-fallback",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        symptom: "unsupported_shape",
        triggerFamily: "cli",
        flowId: "hello_flow",
        sampleInput: {
          payload: "hello"
        }
      },
      command: [],
      containerArgs: []
    });

    const diagnosisArtifact = result.artifacts.find((artifact) => artifact.type === "diagnosis_report");
    const report = diagnosisArtifact?.metadata?.["report"] as
      | {
          subtype?: string;
          evidenceQuality?: string;
          fallbackDetected?: boolean;
          confidence?: { level?: string };
        }
      | undefined;

    expect(result.ok).toBe(true);
    expect(diagnosisArtifact).toBeDefined();
    expect(report?.subtype).toBe("unsupported_shape");
    expect(report?.evidenceQuality).toBe("simulated_fallback");
    expect(report?.fallbackDetected).toBe(true);
    expect(report?.confidence?.level).toBe("low");
  });
});

async function createHelperScript(stdout: string, recordArgsPath?: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-helper-test-"));
  const scriptPath = path.join(tempDir, "helper.js");
  const wrapperPath = path.join(tempDir, process.platform === "win32" ? "helper.cmd" : "helper.sh");
  const contents = [
    'const fs = require("node:fs");',
    `const stdout = ${JSON.stringify(stdout)};`,
    recordArgsPath ? `fs.writeFileSync(${JSON.stringify(recordArgsPath)}, process.argv.slice(2).join("\\n"));` : "",
    "process.stdout.write(stdout);"
  ]
    .filter(Boolean)
    .join("\n");

  await fs.writeFile(scriptPath, contents, "utf8");
  if (process.platform === "win32") {
    await fs.writeFile(wrapperPath, `@echo off\r\nnode "%~dp0helper.js" %*\r\n`, "utf8");
  } else {
    await fs.writeFile(wrapperPath, `#!/usr/bin/env sh\nexec node "$(dirname \"$0\")/helper.js" "$@"\n`, "utf8");
    await fs.chmod(wrapperPath, 0o755);
  }

  return wrapperPath;
}

async function createMultiResponseHelperScript(outputs: Record<string, string>) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-helper-multi-test-"));
  const scriptPath = path.join(tempDir, "helper.js");
  const wrapperPath = path.join(tempDir, process.platform === "win32" ? "helper.cmd" : "helper.sh");
  const contents = [
    'const outputs = new Map(Object.entries(JSON.parse(process.env.FLOGO_HELPER_MULTI_OUTPUTS || "{}")));',
    'const key = process.argv.slice(2, 4).join(":");',
    'const stdout = outputs.get(key) ?? outputs.get(process.argv.slice(2, 3).join(":")) ?? "{}";',
    "process.stdout.write(stdout);"
  ].join("\n");

  await fs.writeFile(scriptPath, contents, "utf8");
  if (process.platform === "win32") {
    await fs.writeFile(wrapperPath, `@echo off\r\nset FLOGO_HELPER_MULTI_OUTPUTS=${JSON.stringify(JSON.stringify(outputs))}\r\nnode "%~dp0helper.js" %*\r\n`, "utf8");
  } else {
    await fs.writeFile(
      wrapperPath,
      `#!/usr/bin/env sh\nFLOGO_HELPER_MULTI_OUTPUTS='${JSON.stringify(outputs)}' exec node "$(dirname "$0")/helper.js" "$@"\n`,
      "utf8"
    );
    await fs.chmod(wrapperPath, 0o755);
  }

  return wrapperPath;
}
