import { describe, expect, it } from "vitest";

import {
  TriggerScaffoldRequestSchema,
  TriggerScaffoldResponseSchema
} from "./index.js";

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
