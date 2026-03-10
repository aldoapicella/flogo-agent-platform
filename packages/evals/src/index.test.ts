import { describe, expect, it } from "vitest";

import { evalCases, scoreEvalRun } from "./index.js";

describe("eval harness", () => {
  it("ships at least 25 eval cases", () => {
    expect(evalCases.length).toBeGreaterThanOrEqual(25);
  });

  it("scores eval runs", () => {
    const score = scoreEvalRun([
      { id: "1", passed: true, durationMs: 100, toolCalls: 3 },
      { id: "2", passed: false, durationMs: 300, toolCalls: 5 }
    ]);

    expect(score.total).toBe(2);
    expect(score.passed).toBe(1);
    expect(score.avgToolCalls).toBe(4);
  });
});
