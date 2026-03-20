import { describe, expect, it } from "vitest";

import {
  ActionScaffoldRequestSchema,
  ActionScaffoldResponseSchema,
  ContributionInstallPlanRequestSchema,
  ContributionInstallPlanResponseSchema,
  ContributionPackageRequestSchema,
  ContributionPackageResponseSchema,
  ContributionValidateRequestSchema,
  ContributionValidateResponseSchema,
  TriggerScaffoldRequestSchema,
  TriggerScaffoldResponseSchema
} from "./index.js";

describe("ActionScaffoldRequestSchema", () => {
  it("accepts the narrow supported action scaffold shape", () => {
    const parsed = ActionScaffoldRequestSchema.parse({
      actionName: "Flow Action",
      modulePath: "example.com/acme/flow-action",
      title: "Flow Action",
      description: "Executes reusable flow work",
      settings: [{ name: "mode", type: "string", required: true }],
      inputs: [{ name: "payload", type: "object", required: true }],
      outputs: [{ name: "result", type: "object" }]
    });

    expect(parsed.version).toBe("0.0.1");
    expect(parsed.settings).toHaveLength(1);
    expect(parsed.outputs[0]?.name).toBe("result");
  });

  it("rejects unsupported action scaffold field types", () => {
    expect(() =>
      ActionScaffoldRequestSchema.parse({
        actionName: "Broken Action",
        modulePath: "example.com/acme/broken-action",
        title: "Broken Action",
        description: "Uses an unsupported type",
        inputs: [{ name: "payload", type: "xml" }]
      })
    ).toThrow(/Unsupported action scaffold field type/);
  });
});

describe("ActionScaffoldResponseSchema", () => {
  it("parses action bundle proof metadata with settings and io fields", () => {
    const parsed = ActionScaffoldResponseSchema.parse({
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
            examples: [],
            compatibilityNotes: ["Generated scaffold"],
            source: "action_scaffold"
          },
          files: [
            { path: "/tmp/flogo-action-flowaction/descriptor.json", kind: "descriptor", bytes: 180, content: "{}" }
          ],
          readmePath: "/tmp/flogo-action-flowaction/README.md"
        },
        validation: {
          ok: true,
          stages: [
            { stage: "structural", ok: true, diagnostics: [] },
            { stage: "regression", ok: true, diagnostics: [] },
            { stage: "build", ok: true, diagnostics: [] }
          ],
          summary: "Action scaffold generated and passed isolated go test/build proof.",
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
    });

    expect(parsed.result.bundle.descriptor.type).toBe("action");
    expect(parsed.result.bundle.descriptor.inputs[0]?.name).toBe("payload");
    expect(parsed.result.bundle.kind).toBe("action");
  });
});

describe("TriggerScaffoldRequestSchema", () => {
  it("accepts the narrow supported trigger scaffold shape", () => {
    const parsed = TriggerScaffoldRequestSchema.parse({
      triggerName: "Webhook Trigger",
      modulePath: "example.com/acme/webhook",
      title: "Webhook Trigger",
      description: "Dispatches a webhook event",
      settings: [{ name: "basePath", type: "string", required: true }],
      handlerSettings: [{ name: "route", type: "string", required: true }],
      outputs: [{ name: "payload", type: "object" }],
      replies: [{ name: "status", type: "integer" }]
    });

    expect(parsed.version).toBe("0.0.1");
    expect(parsed.handlerSettings).toHaveLength(1);
    expect(parsed.replies[0]?.name).toBe("status");
  });

  it("rejects unsupported trigger scaffold field types", () => {
    expect(() =>
      TriggerScaffoldRequestSchema.parse({
        triggerName: "Broken Trigger",
        modulePath: "example.com/acme/broken-trigger",
        title: "Broken Trigger",
        description: "Uses an unsupported type",
        outputs: [{ name: "payload", type: "xml" }]
      })
    ).toThrow(/Unsupported trigger scaffold field type/);
  });
});

describe("TriggerScaffoldResponseSchema", () => {
  it("parses trigger bundle proof metadata with handler settings and reply fields", () => {
    const parsed = TriggerScaffoldResponseSchema.parse({
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
            examples: [],
            compatibilityNotes: ["Generated scaffold"],
            source: "trigger_scaffold"
          },
          files: [
            { path: "/tmp/flogo-trigger-webhooktrigger/descriptor.json", kind: "descriptor", bytes: 180, content: "{}" }
          ],
          readmePath: "/tmp/flogo-trigger-webhooktrigger/README.md"
        },
        validation: {
          ok: true,
          stages: [
            { stage: "structural", ok: true, diagnostics: [] },
            { stage: "regression", ok: true, diagnostics: [] },
            { stage: "build", ok: true, diagnostics: [] }
          ],
          summary: "Trigger scaffold generated and passed isolated go test/build proof.",
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
    });

    expect(parsed.result.bundle.descriptor.handlerSettings[0]?.name).toBe("route");
    expect(parsed.result.bundle.descriptor.reply[0]?.name).toBe("status");
    expect(parsed.result.bundle.kind).toBe("trigger");
  });
});

describe("ContributionValidateRequestSchema", () => {
  it("accepts an existing scaffold result for shared contribution validation", () => {
    const parsed = ContributionValidateRequestSchema.parse({
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
            settings: [],
            inputs: [],
            outputs: [],
            examples: [],
            compatibilityNotes: ["Generated scaffold"],
            source: "activity_scaffold"
          },
          files: [{ path: "/tmp/flogo-activity-echoactivity/descriptor.json", kind: "descriptor", bytes: 180, content: "{}" }]
        },
        validation: {
          ok: true,
          stages: [{ stage: "structural", ok: true, diagnostics: [] }],
          summary: "ok",
          artifacts: []
        },
        build: {
          kind: "build",
          ok: true,
          command: ["go", "build", "./..."],
          exitCode: 0,
          summary: "ok",
          output: ""
        },
        test: {
          kind: "test",
          ok: true,
          command: ["go", "test", "./..."],
          exitCode: 0,
          summary: "ok",
          output: ""
        }
      }
    });

    expect(parsed.result?.bundle.kind).toBe("activity");
  });

  it("requires one bundle locator or inline result", () => {
    expect(() => ContributionValidateRequestSchema.parse({})).toThrow(/Provide bundleArtifactId, bundleArtifact, or result/);
  });
});

describe("ContributionValidateResponseSchema", () => {
  it("parses a validation response for a trigger bundle artifact source", () => {
    const parsed = ContributionValidateResponseSchema.parse({
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
          files: [{ path: "/tmp/flogo-trigger-webhooktrigger/descriptor.json", kind: "descriptor", bytes: 180, content: "{}" }]
        },
        validation: {
          ok: true,
          stages: [{ stage: "structural", ok: true, diagnostics: [] }],
          summary: "ok",
          artifacts: []
        },
        build: {
          kind: "build",
          ok: true,
          command: ["go", "build", "./..."],
          exitCode: 0,
          summary: "ok",
          output: ""
        },
        test: {
          kind: "test",
          ok: true,
          command: ["go", "test", "./..."],
          exitCode: 0,
          summary: "ok",
          output: ""
        },
        source: "bundle_artifact",
        sourceArtifactId: "artifact-trigger"
      }
    });

    expect(parsed.result.source).toBe("bundle_artifact");
    expect(parsed.result.bundle.kind).toBe("trigger");
  });
});

describe("ContributionPackageRequestSchema", () => {
  it("accepts bundle-artifact packaging requests with a default zip format", () => {
    const parsed = ContributionPackageRequestSchema.parse({
      bundleArtifactId: "artifact-1"
    });

    expect(parsed.bundleArtifactId).toBe("artifact-1");
    expect(parsed.format).toBe("zip");
  });
});

describe("ContributionPackageResponseSchema", () => {
  it("parses a packaged action bundle response", () => {
    const parsed = ContributionPackageResponseSchema.parse({
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
          files: [{ path: "/tmp/flogo-action-flowaction/descriptor.json", kind: "descriptor", bytes: 180, content: "{}" }]
        },
        validation: {
          ok: true,
          stages: [{ stage: "structural", ok: true, diagnostics: [] }],
          summary: "ok",
          artifacts: []
        },
        build: {
          kind: "build",
          ok: true,
          command: ["go", "build", "./..."],
          exitCode: 0,
          summary: "ok",
          output: ""
        },
        test: {
          kind: "test",
          ok: true,
          command: ["go", "test", "./..."],
          exitCode: 0,
          summary: "ok",
          output: ""
        },
        source: "inline_result",
        package: {
          format: "zip",
          fileName: "flowaction.zip",
          path: "/tmp/flowaction.zip",
          bytes: 2048,
          sha256: "abc123",
          base64: "ZmFrZS16aXA="
        }
      }
    });

    expect(parsed.result.bundle.kind).toBe("action");
    expect(parsed.result.package.format).toBe("zip");
  });
});

describe("ContributionInstallPlanRequestSchema", () => {
  it("accepts bundle-backed install planning input", () => {
    const parsed = ContributionInstallPlanRequestSchema.parse({
      bundleArtifactId: "artifact-1",
      targetApp: {
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json"
      },
      preferredAlias: "echoactivity"
    });

    expect(parsed.bundleArtifactId).toBe("artifact-1");
    expect(parsed.preferredAlias).toBe("echoactivity");
    expect(parsed.replaceExisting).toBe(false);
  });

  it("accepts package-backed install planning input", () => {
    const parsed = ContributionInstallPlanRequestSchema.parse({
      packageArtifactId: "artifact-2",
      targetApp: {
        projectId: "demo",
        appId: "hello-rest"
      }
    });

    expect(parsed.packageArtifactId).toBe("artifact-2");
  });

  it("rejects missing contribution sources", () => {
    expect(() => ContributionInstallPlanRequestSchema.parse({})).toThrow(/Provide one contribution source/);
  });

  it("rejects mixed bundle and package sources in one request", () => {
    expect(() =>
      ContributionInstallPlanRequestSchema.parse({
        bundleArtifactId: "artifact-1",
        packageArtifactId: "artifact-2"
      })
    ).toThrow(/Provide either one bundle source or one package source/);
  });
});

describe("ContributionInstallPlanResponseSchema", () => {
  it("parses a conservative install plan result", () => {
    const parsed = ContributionInstallPlanResponseSchema.parse({
      result: {
        contributionKind: "trigger",
        source: "package_artifact",
        sourceArtifactId: "artifact-2",
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
    });

    expect(parsed.result.readiness).toBe("high");
    expect(parsed.result.proposedRefs[0]?.surface).toBe("triggerRef");
    expect(parsed.result.predictedChanges.noMutation).toBe(true);
  });
});
