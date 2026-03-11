import { describe, expect, it } from "vitest";

import { FlogoAppsService } from "./flogo-apps.service.js";

describe("FlogoAppsService", () => {
  const service = new FlogoAppsService();

  it("returns a contribution catalog for example apps", async () => {
    const catalog = await service.getCatalog("hello-rest");

    expect(catalog).toBeDefined();
    expect(catalog?.entries.some((entry) => entry.type === "trigger" && entry.name === "rest")).toBe(true);
    expect(catalog?.entries.some((entry) => entry.type === "activity" && entry.name === "log")).toBe(true);
    expect(catalog?.entries.some((entry) => entry.type === "action" && entry.ref === "#flow:hello")).toBe(true);
  });

  it("previews mappings for example apps and returns an artifact ref", async () => {
    const preview = await service.previewMapping("hello-rest", {
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
  });
});
