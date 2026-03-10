import { describe, expect, it } from "vitest";
import { parseFlogoApp, validateFlogoApp } from "./index";

describe("flogo graph", () => {
  it("parses a minimal app", () => {
    const graph = parseFlogoApp({
      name: "hello",
      type: "flogo:app",
      appModel: "1.1.0",
      imports: [{ alias: "log", ref: "github.com/project-flogo/contrib/activity/log" }],
      triggers: [],
      resources: []
    });

    expect(graph.name).toBe("hello");
  });

  it("reports semantic issues", () => {
    const report = validateFlogoApp({
      name: "broken",
      type: "flogo:app",
      appModel: "1.1.0",
      imports: [],
      triggers: [
        {
          id: "rest",
          ref: "#rest",
          handlers: [{ action: { ref: "flow:missing" } }]
        }
      ],
      resources: {
        flow: {
          type: "flow",
          data: {
            metadata: {},
            tasks: [
              {
                id: "log",
                activity: { ref: "#log" },
                input: { message: "=$activity[missing].message" }
              }
            ]
          }
        }
      }
    });

    expect(report.overallValid).toBe(false);
    expect(report.semantic.issues.length).toBeGreaterThan(0);
  });
});
