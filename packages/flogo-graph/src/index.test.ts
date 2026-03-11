import { describe, expect, it } from "vitest";

import {
  analyzePropertyUsage,
  buildAppGraph,
  buildContribCatalog,
  previewMapping,
  suggestCoercions,
  summarizeAppDiff,
  validateFlogoApp
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

describe("flogo graph", () => {
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

    const plan = analyzePropertyUsage(app);

    expect(plan.propertyRefs).toContain("retryCount");
    expect(plan.envRefs).toContain("REGION");
  });
});
