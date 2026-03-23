import { describe, expect, it } from "vitest";

import {
  ApprovalTypeSchema,
  ContributionInstallApplyRequestSchema,
  ContributionInstallApplyResponseSchema,
  ContributionInstallDiffPlanRequestSchema,
  ContributionInstallDiffPlanResponseSchema,
  ContributionUninstallPlanRequestSchema,
  ContributionUninstallPlanResponseSchema,
  ContributionUpdateApplyRequestSchema,
  ContributionUpdateApplyResponseSchema,
  ContributionUpdateDiffPlanRequestSchema,
  ContributionUpdateDiffPlanResponseSchema,
  ContributionUpdatePlanRequestSchema,
  ContributionUpdatePlanResponseSchema,
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

describe("ApprovalTypeSchema", () => {
  it("accepts the explicit install contribution approval type", () => {
    expect(ApprovalTypeSchema.parse("install_contribution")).toBe("install_contribution");
  });

  it("accepts the explicit update contribution approval type", () => {
    expect(ApprovalTypeSchema.parse("update_contribution")).toBe("update_contribution");
  });
});

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

describe("ContributionInstallDiffPlanRequestSchema", () => {
  it("accepts install diff planning input backed by an install-plan artifact id", () => {
    const parsed = ContributionInstallDiffPlanRequestSchema.parse({
      installPlanArtifactId: "artifact-install-plan-1",
      targetApp: {
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json"
      }
    });

    expect(parsed.installPlanArtifactId).toBe("artifact-install-plan-1");
  });

  it("rejects missing install-plan sources", () => {
    expect(() => ContributionInstallDiffPlanRequestSchema.parse({})).toThrow(/Provide installPlanArtifactId, installPlanArtifact, or installPlanResult/);
  });

  it("accepts additive install-plan resolution that carries both an id and a resolved payload", () => {
    const parsed = ContributionInstallDiffPlanRequestSchema.parse({
      installPlanArtifactId: "artifact-install-plan-1",
      installPlanResult: {
        contributionKind: "trigger",
        source: "package_artifact",
        targetApp: {},
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
        modulePath: "example.com/acme/webhook",
        selectedAlias: "webhooktrigger",
        installReady: true,
        readiness: "high",
        proposedImports: [],
        proposedRefs: [],
        predictedChanges: {
          importsToAdd: [],
          importsToUpdate: [],
          reusableRefs: [],
          summaryLines: [],
          noMutation: true
        },
        warnings: [],
        conflicts: [],
        diagnostics: [],
        recommendedNextAction: "Review the install plan.",
        limitations: []
      }
    });

    expect(parsed.installPlanArtifactId).toBe("artifact-install-plan-1");
    expect(parsed.installPlanResult?.selectedAlias).toBe("webhooktrigger");
  });
});

describe("ContributionUninstallPlanRequestSchema", () => {
  it("accepts a selector-backed uninstall planning input", () => {
    const parsed = ContributionUninstallPlanRequestSchema.parse({
      targetApp: {
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json"
      },
      selection: {
        alias: "webhooktrigger",
        ref: "example.com/acme/webhook"
      }
    });

    expect(parsed.selection.alias).toBe("webhooktrigger");
    expect(parsed.selection.ref).toBe("example.com/acme/webhook");
  });

  it("rejects missing uninstall selectors", () => {
    expect(() =>
      ContributionUninstallPlanRequestSchema.parse({
        targetApp: {
          projectId: "demo",
          appId: "hello-rest"
        },
        selection: {}
      })
    ).toThrow(/Provide at least one installed contribution selector/);
  });
});

describe("ContributionUninstallPlanResponseSchema", () => {
  it("parses a conservative uninstall plan with orphan-risk and blocked-by metadata", () => {
    const parsed = ContributionUninstallPlanResponseSchema.parse({
      result: {
        targetApp: {
          projectId: "demo",
          appId: "hello-rest",
          appPath: "examples/hello-rest/flogo.json",
          appName: "hello-rest"
        },
        selection: {
          alias: "webhooktrigger"
        },
        detectedInstalledContribution: {
          alias: "webhooktrigger",
          ref: "example.com/acme/webhook",
          version: "0.2.0",
          contributionKind: "trigger",
          modulePath: "example.com/acme/webhook",
          packagePath: "example.com/acme/webhook",
          packageName: "webhooktrigger",
          matchedBy: ["alias"],
          confidence: "medium"
        },
        matchQuality: "likely",
        contributionKind: "trigger",
        uninstallReady: false,
        readiness: "blocked",
        appFingerprint: "app-sha",
        planFingerprint: "plan-sha",
        evidence: [
          {
            kind: "import",
            summary: "Import alias \"webhooktrigger\" currently points to the selected trigger.",
            path: "imports.webhooktrigger",
            confidence: "high"
          }
        ],
        predictedChanges: {
          importsToRemove: [
            {
              alias: "webhooktrigger",
              ref: "example.com/acme/webhook",
              action: "remove"
            }
          ],
          affectedRefs: [
            {
              surface: "triggerRef",
              value: "#webhooktrigger"
            }
          ],
          directUsages: [
            {
              surface: "triggerRef",
              path: "triggers.webhook.ref",
              ref: "#webhooktrigger",
              alias: "webhooktrigger",
              summary: "Trigger \"webhook\" still uses the selected contribution."
            }
          ],
          orphanRisks: [
            {
              surface: "triggerRef",
              path: "triggers.webhook.ref",
              ref: "#webhooktrigger",
              alias: "webhooktrigger",
              reason: "Removing import alias \"webhooktrigger\" would orphan the trigger ref.",
              severity: "error"
            }
          ],
          changedPaths: ["imports.webhooktrigger", "triggers.webhook.ref"],
          summaryLines: ["Remove import alias \"webhooktrigger\" only after replacing the trigger ref."],
          noMutation: true
        },
        blockedBy: [
          {
            code: "flogo.contrib.uninstall_plan.active_usage",
            message: "Trigger \"webhook\" still uses this contribution.",
            path: "triggers.webhook.ref",
            severity: "error"
          }
        ],
        warnings: ["Manual review is required before uninstall diff preview."],
        conflicts: [],
        diagnostics: [],
        limitations: ["Planning only."],
        recommendedNextAction: "replacement_required"
      }
    });

    expect(parsed.result.predictedChanges.importsToRemove[0]?.action).toBe("remove");
    expect(parsed.result.predictedChanges.orphanRisks[0]?.severity).toBe("error");
    expect(parsed.result.recommendedNextAction).toBe("replacement_required");
  });
});

describe("ContributionUpdatePlanRequestSchema", () => {
  it("accepts update planning input backed by a contribution package artifact id", () => {
    const parsed = ContributionUpdatePlanRequestSchema.parse({
      packageArtifactId: "artifact-package-9",
      targetApp: {
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json"
      }
    });

    expect(parsed.packageArtifactId).toBe("artifact-package-9");
  });

  it("rejects missing contribution update sources", () => {
    expect(() => ContributionUpdatePlanRequestSchema.parse({})).toThrow(
      /Provide one contribution source via bundleArtifactId, bundleArtifact, result, packageArtifactId, packageArtifact, or packageResult/
    );
  });
});

describe("ContributionUpdatePlanResponseSchema", () => {
  it("parses a conservative contribution update plan result", () => {
    const parsed = ContributionUpdatePlanResponseSchema.parse({
      result: {
        contributionKind: "trigger",
        source: "package_artifact",
        sourceArtifactId: "artifact-package-9",
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
            version: "0.2.0",
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
          bytes: 128,
          sha256: "abc123",
          base64: "YWJj"
        },
        modulePath: "example.com/acme/webhook",
        packageName: "webhooktrigger",
        packagePath: "example.com/acme/webhook",
        descriptorRef: "example.com/acme/webhook",
        appFingerprint: "app-sha",
        planFingerprint: "update-sha",
        selectedAlias: "webhooktrigger",
        detectedInstalledContribution: {
          alias: "webhooktrigger",
          ref: "example.com/acme/webhook",
          version: "0.1.0",
          type: "trigger",
          modulePath: "example.com/acme/webhook",
          matchedBy: ["ref", "alias"],
          confidence: "high"
        },
        matchQuality: "exact",
        compatibility: "compatible",
        updateReady: true,
        readiness: "high",
        predictedChanges: {
          importsToReplace: [
            {
              alias: "webhooktrigger",
              ref: "example.com/acme/webhook",
              version: "0.2.0",
              action: "replace_existing",
              existingAlias: "webhooktrigger",
              existingRef: "example.com/acme/webhook"
            }
          ],
          importsToKeep: [],
          importsToAdd: [],
          importsToRemove: [],
          refsToReplace: [],
          refsToKeep: [
            {
              surface: "triggerRef",
              value: "#webhooktrigger"
            }
          ],
          refsToAdd: [],
          refsToRemove: [],
          changedPaths: ["imports"],
          summaryLines: ["Replace the existing import metadata for alias \"webhooktrigger\"."],
          noMutation: true
        },
        warnings: [],
        conflicts: [],
        diagnostics: [],
        recommendedNextAction: "Review the update plan before requesting an exact update diff preview.",
        limitations: ["Planning only; no flogo.json mutation was applied."]
      }
    });

    expect(parsed.result.matchQuality).toBe("exact");
    expect(parsed.result.updateReady).toBe(true);
    expect(parsed.result.predictedChanges.changedPaths).toEqual(["imports"]);
  });
});

describe("ContributionUpdateDiffPlanRequestSchema", () => {
  it("accepts update diff planning input backed by an update-plan artifact id", () => {
    const parsed = ContributionUpdateDiffPlanRequestSchema.parse({
      updatePlanArtifactId: "artifact-update-plan-1",
      targetApp: {
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json"
      }
    });

    expect(parsed.updatePlanArtifactId).toBe("artifact-update-plan-1");
  });

  it("rejects missing update-plan sources", () => {
    expect(() => ContributionUpdateDiffPlanRequestSchema.parse({})).toThrow(/Provide updatePlanArtifactId, updatePlanArtifact, or updatePlanResult/);
  });

  it("accepts additive update-plan resolution that carries both an id and a resolved payload", () => {
    const parsed = ContributionUpdateDiffPlanRequestSchema.parse({
      updatePlanArtifactId: "artifact-update-plan-1",
      updatePlanResult: {
        contributionKind: "trigger",
        source: "package_artifact",
        targetApp: {},
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
            version: "0.2.0",
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
        modulePath: "example.com/acme/webhook",
        selectedAlias: "webhooktrigger",
        matchQuality: "exact",
        compatibility: "compatible",
        updateReady: true,
        readiness: "high",
        predictedChanges: {
          importsToReplace: [],
          importsToKeep: [],
          importsToAdd: [],
          importsToRemove: [],
          refsToReplace: [],
          refsToKeep: [],
          refsToAdd: [],
          refsToRemove: [],
          changedPaths: [],
          summaryLines: [],
          noMutation: true
        },
        warnings: [],
        conflicts: [],
        diagnostics: [],
        recommendedNextAction: "Review the update plan.",
        limitations: []
      }
    });

    expect(parsed.updatePlanArtifactId).toBe("artifact-update-plan-1");
    expect(parsed.updatePlanResult?.selectedAlias).toBe("webhooktrigger");
  });
});

describe("ContributionUpdateDiffPlanResponseSchema", () => {
  it("parses a conservative exact update diff preview result", () => {
    const parsed = ContributionUpdateDiffPlanResponseSchema.parse({
      result: {
        contributionKind: "trigger",
        sourceContribution: {
          kind: "trigger",
          modulePath: "example.com/acme/webhook",
          packageName: "webhooktrigger",
          packagePath: "example.com/acme/webhook",
          descriptorRef: "example.com/acme/webhook",
          selectedAlias: "webhooktrigger",
          source: "package_artifact",
          sourceArtifactId: "artifact-package-9"
        },
        detectedInstalledContribution: {
          alias: "webhooktrigger",
          ref: "example.com/acme/webhook",
          version: "0.1.0",
          matchedBy: ["alias+ref"],
          confidence: "high"
        },
        targetApp: {
          projectId: "demo",
          appId: "hello-rest",
          appPath: "examples/hello-rest/flogo.json",
          appName: "hello-rest"
        },
        basedOnUpdatePlan: {
          sourceArtifactId: "artifact-update-plan-1",
          appFingerprint: "app-sha",
          planFingerprint: "update-plan-sha"
        },
        appFingerprintBefore: "app-sha",
        appFingerprintAfter: "after-sha",
        updatePlanFingerprint: "update-plan-sha",
        isStale: false,
        previewAvailable: true,
        updateReady: true,
        readiness: "high",
        warnings: [],
        conflicts: [],
        limitations: ["Diff preview only."],
        predictedChanges: {
          importsBefore: [
            {
              alias: "webhooktrigger",
              ref: "example.com/acme/webhook",
              version: "0.1.0",
              action: "existing"
            }
          ],
          importsAfter: [
            {
              alias: "webhooktrigger",
              ref: "example.com/acme/webhook",
              version: "0.2.0",
              action: "predicted"
            }
          ],
          importsToReplace: [
            {
              alias: "webhooktrigger",
              ref: "example.com/acme/webhook",
              version: "0.2.0",
              action: "replace_existing",
              existingAlias: "webhooktrigger",
              existingRef: "example.com/acme/webhook"
            }
          ],
          importsToKeep: [],
          importsToAdd: [],
          importsToRemove: [],
          refsToReplace: [
            {
              surface: "triggerRef",
              value: "#webhooktrigger"
            }
          ],
          refsToKeep: [],
          refsToAdd: [],
          refsToRemove: [],
          structuralChanges: ["Replace import alias \"webhooktrigger\" in place."],
          changedPaths: ["imports"],
          diffEntries: [
            {
              path: "imports",
              changeType: "update",
              summary: "Update import alias \"webhooktrigger\" to ref \"example.com/acme/webhook\"."
            }
          ],
          noMutation: true
        },
        diffSummary: ["imports: update \"webhooktrigger\" from \"example.com/acme/webhook\" to \"example.com/acme/webhook\""],
        canonicalBeforeJson: "{\n  \"imports\": [{\"alias\":\"webhooktrigger\",\"version\":\"0.1.0\"}]\n}",
        canonicalAfterJson: "{\n  \"imports\": [{\"alias\":\"webhooktrigger\",\"version\":\"0.2.0\"}]\n}",
        recommendedNextAction: "Review the exact canonical update diff."
      }
    });

    expect(parsed.result.previewAvailable).toBe(true);
    expect(parsed.result.updateReady).toBe(true);
    expect(parsed.result.predictedChanges.changedPaths).toEqual(["imports"]);
  });
});

describe("ContributionInstallDiffPlanResponseSchema", () => {
  it("parses a conservative exact install diff preview result", () => {
    const parsed = ContributionInstallDiffPlanResponseSchema.parse({
      result: {
        contributionKind: "trigger",
        sourceContribution: {
          kind: "trigger",
          modulePath: "example.com/acme/webhook",
          packageName: "webhooktrigger",
          packagePath: "example.com/acme/webhook",
          descriptorRef: "example.com/acme/webhook",
          selectedAlias: "webhooktrigger",
          source: "package_artifact",
          sourceArtifactId: "artifact-package-1"
        },
        targetApp: {
          projectId: "demo",
          appId: "hello-rest",
          appPath: "examples/hello-rest/flogo.json",
          appName: "hello-rest"
        },
        basedOnInstallPlan: {
          sourceArtifactId: "artifact-install-plan-1",
          appFingerprint: "app-sha",
          planFingerprint: "plan-sha"
        },
        appFingerprintBefore: "app-sha",
        appFingerprintAfter: "after-sha",
        installPlanFingerprint: "plan-sha",
        isStale: false,
        previewAvailable: true,
        installReady: true,
        readiness: "high",
        warnings: [],
        conflicts: [],
        limitations: ["Diff preview only."],
        predictedChanges: {
          importsBefore: [],
          importsAfter: [
            {
              alias: "webhooktrigger",
              ref: "example.com/acme/webhook",
              action: "predicted"
            }
          ],
          importsToAdd: [
            {
              alias: "webhooktrigger",
              ref: "example.com/acme/webhook",
              action: "add"
            }
          ],
          importsToUpdate: [],
          aliasesToAdd: ["webhooktrigger"],
          refsToAdd: [
            {
              surface: "triggerRef",
              value: "#webhooktrigger"
            }
          ],
          refsToReuse: [],
          structuralChanges: ["Add import alias \"webhooktrigger\" for ref \"example.com/acme/webhook\"."],
          changedPaths: ["imports"],
          diffEntries: [
            {
              path: "imports",
              changeType: "add",
              summary: "Add import alias \"webhooktrigger\" for ref \"example.com/acme/webhook\"."
            }
          ],
          noMutation: true
        },
        diffSummary: ["imports: add \"webhooktrigger\" -> \"example.com/acme/webhook\""],
        canonicalBeforeJson: "{\n  \"imports\": []\n}",
        canonicalAfterJson: "{\n  \"imports\": [{\"alias\":\"webhooktrigger\"}]\n}",
        recommendedNextAction: "Review the exact canonical import diff."
      }
    });

    expect(parsed.result.previewAvailable).toBe(true);
    expect(parsed.result.predictedChanges.changedPaths).toEqual(["imports"]);
    expect(parsed.result.sourceContribution.selectedAlias).toBe("webhooktrigger");
  });
});

describe("ContributionInstallApplyRequestSchema", () => {
  it("accepts install apply input backed by a diff artifact id", () => {
    const parsed = ContributionInstallApplyRequestSchema.parse({
      installDiffArtifactId: "artifact-install-diff-1",
      targetApp: {
        projectId: "demo",
        appId: "hello-rest",
        appPath: "examples/hello-rest/flogo.json"
      }
    });

    expect(parsed.installDiffArtifactId).toBe("artifact-install-diff-1");
  });

  it("rejects missing install diff sources", () => {
    expect(() => ContributionInstallApplyRequestSchema.parse({})).toThrow(/Provide installDiffArtifactId, installDiffArtifact, or installDiffResult/);
  });
});

describe("ContributionInstallApplyResponseSchema", () => {
  it("parses a review-gated contribution install apply result", () => {
    const parsed = ContributionInstallApplyResponseSchema.parse({
      result: {
        contributionKind: "trigger",
        sourceContribution: {
          kind: "trigger",
          modulePath: "example.com/acme/webhook",
          packageName: "webhooktrigger",
          packagePath: "example.com/acme/webhook",
          descriptorRef: "example.com/acme/webhook",
          selectedAlias: "webhooktrigger",
          source: "package_artifact",
          sourceArtifactId: "artifact-package-1"
        },
        targetApp: {
          projectId: "demo",
          appId: "hello-rest",
          appPath: "examples/hello-rest/flogo.json",
          appName: "hello-rest"
        },
        basedOnInstallDiffPlan: {
          sourceArtifactId: "artifact-install-diff-1",
          installPlanArtifactId: "artifact-install-plan-1",
          diffFingerprint: "diff-sha",
          appFingerprintBefore: "before-sha",
          appFingerprintPreview: "after-sha"
        },
        appFingerprintBefore: "before-sha",
        appFingerprintAfter: "after-sha",
        isStale: false,
        applied: true,
        applyReady: true,
        readiness: "high",
        warnings: [],
        conflicts: [],
        limitations: ["Install apply only; update/apply remains deferred."],
        changedPaths: ["imports"],
        appliedImports: [
          {
            alias: "webhooktrigger",
            ref: "example.com/acme/webhook",
            action: "add"
          }
        ],
        appliedRefs: [
          {
            surface: "triggerRef",
            value: "#webhooktrigger"
          }
        ],
        applySummary: ["Applied import alias \"webhooktrigger\" for ref \"example.com/acme/webhook\"."],
        canonicalBeforeJson: "{\n  \"imports\": []\n}",
        canonicalAfterJson: "{\n  \"imports\": [{\"alias\":\"webhooktrigger\"}]\n}",
        canonicalApp: {
          name: "hello-rest",
          type: "flogo:app",
          appModel: "1.1.0",
          imports: [{ alias: "webhooktrigger", ref: "example.com/acme/webhook" }]
        },
        recommendedNextAction: "Review the updated canonical flogo.json artifact and run follow-up validation.",
        approvalRequired: true,
        mutationApplied: true
      }
    });

    expect(parsed.result.applied).toBe(true);
    expect(parsed.result.changedPaths).toEqual(["imports"]);
    expect(parsed.result.approvalRequired).toBe(true);
  });
});

describe("ContributionUpdateApplyRequestSchema", () => {
  it("accepts updateDiffPlanArtifactId for review-gated update apply", () => {
    const parsed = ContributionUpdateApplyRequestSchema.parse({
      updateDiffPlanArtifactId: "artifact-update-diff-1"
    });

    expect(parsed.updateDiffPlanArtifactId).toBe("artifact-update-diff-1");
  });

  it("rejects missing update diff plan input", () => {
    expect(() => ContributionUpdateApplyRequestSchema.parse({})).toThrow(
      /Provide updateDiffPlanArtifactId, updateDiffPlanArtifact, or updateDiffPlanResult/
    );
  });
});

describe("ContributionUpdateApplyResponseSchema", () => {
  it("parses review-gated update apply results with canonical after-state metadata", () => {
    const parsed = ContributionUpdateApplyResponseSchema.parse({
      result: {
        contributionKind: "trigger",
        sourceContribution: {
          kind: "trigger",
          modulePath: "example.com/acme/webhook",
          packageName: "webhooktrigger",
          selectedAlias: "webhooktrigger",
          source: "package_artifact",
          sourceArtifactId: "artifact-package-1"
        },
        detectedInstalledContribution: {
          alias: "webhooktrigger",
          ref: "example.com/acme/webhook",
          version: "0.1.0",
          type: "trigger",
          modulePath: "example.com/acme/webhook",
          packageName: "webhooktrigger",
          packagePath: "example.com/acme/webhook",
          matchedBy: ["alias", "ref"],
          confidence: "high"
        },
        targetApp: {
          projectId: "demo",
          appId: "hello-rest",
          appPath: "examples/hello-rest/flogo.json"
        },
        basedOnUpdateDiffPlan: {
          sourceArtifactId: "artifact-update-diff-1",
          updatePlanArtifactId: "artifact-update-plan-1",
          diffFingerprint: "diff-sha",
          appFingerprintBefore: "before-sha",
          appFingerprintPreview: "after-sha"
        },
        appFingerprintBefore: "before-sha",
        appFingerprintAfter: "after-sha",
        isStale: false,
        applied: true,
        applyReady: true,
        readiness: "high",
        warnings: [],
        conflicts: [],
        limitations: ["Update apply only."],
        changedPaths: ["imports"],
        appliedImports: [{ alias: "webhooktrigger", ref: "example.com/acme/webhook", action: "replace_existing" }],
        appliedRefs: [{ surface: "triggerRef", value: "#webhooktrigger" }],
        applySummary: ["Applied the approved contribution update to canonical flogo.json."],
        canonicalBeforeJson: "{}",
        canonicalAfterJson: "{\"imports\":[]}",
        canonicalApp: {
          name: "hello-rest",
          type: "flogo:app"
        },
        recommendedNextAction: "Review the updated canonical flogo.json artifact.",
        approvalRequired: true,
        mutationApplied: true
      }
    });

    expect(parsed.result.applied).toBe(true);
    expect(parsed.result.basedOnUpdateDiffPlan.sourceArtifactId).toBe("artifact-update-diff-1");
  });
});
