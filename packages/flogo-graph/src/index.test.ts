import { describe, expect, it } from "vitest";

import { buildAppGraph, summarizeAppDiff, validateFlogoApp } from "./index.js";

const validApp = {
  name: "hello",
  type: "flogo:app",
  appModel: "1.1.0",
  imports: [
    {
      alias: "log",
      ref: "github.com/project-flogo/contrib/activity/log"
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
    changed.imports.push({
      alias: "rest",
      ref: "github.com/project-flogo/contrib/activity/rest"
    });
    expect(summarizeAppDiff(validApp, changed)).toContain("imports +1");
  });
});
