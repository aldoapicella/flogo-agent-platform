import { describe, expect, it } from "vitest";

import { EvalCaseSchema } from "@flogo-agent/contracts";

import { evalCases, runtimeEvidenceEvalCases, summarizeRuntimeEvidenceEvalCoverage, workflowEvalCases } from "./index.js";

describe("runtime evidence eval suite", () => {
  it("keeps every exported eval case schema-valid", () => {
    for (const testCase of evalCases) {
      expect(EvalCaseSchema.parse(testCase)).toEqual(testCase);
    }
  });

  it("extends the baseline workflow corpus instead of replacing it", () => {
    expect(evalCases.length).toBe(workflowEvalCases.length + runtimeEvidenceEvalCases.length);
  });

  it("covers every current runtime family with one supported and one fallback case", () => {
    const summary = summarizeRuntimeEvidenceEvalCoverage();

    expect(summary.total).toBe(10);
    expect(summary.families.direct_flow).toEqual({ supported: 1, fallback: 1 });
    expect(summary.families.rest).toEqual({ supported: 1, fallback: 1 });
    expect(summary.families.timer).toEqual({ supported: 1, fallback: 1 });
    expect(summary.families.cli).toEqual({ supported: 1, fallback: 1 });
    expect(summary.families.channel).toEqual({ supported: 1, fallback: 1 });
  });

  it("covers the implemented comparison bases plus simulated fallback", () => {
    const summary = summarizeRuntimeEvidenceEvalCoverage();

    expect(summary.comparisonBases).toEqual([
      "channel_runtime_boundary",
      "normalized_runtime_evidence",
      "rest_runtime_envelope",
      "simulated_fallback",
      "timer_runtime_startup"
    ]);
  });

  it("tracks replay only where the repo currently proves it", () => {
    const summary = summarizeRuntimeEvidenceEvalCoverage();

    expect(summary.replayRuntimeModes).toEqual([
      "channel_trigger_replay",
      "cli_trigger_replay",
      "independent_action_replay",
      "rest_trigger_replay",
      "timer_trigger_replay"
    ]);
  });

  it("marks fallback cases with explicit fallback metadata expectations", () => {
    const fallbackCases = runtimeEvidenceEvalCases.filter((testCase) => testCase.runtimeEvidence?.scenario === "fallback");

    expect(fallbackCases).toHaveLength(5);
    for (const testCase of fallbackCases) {
      expect(testCase.runtimeEvidence?.trace.fallbackReasonExpected).toBe(true);
      expect(testCase.runtimeEvidence?.trace.fallbackDiagnosticCode).toBeTruthy();
    }
  });

  it("keeps supported cases aligned with the trigger-specific evidence fields the backend emits", () => {
    const byId = Object.fromEntries(runtimeEvidenceEvalCases.map((testCase) => [testCase.id, testCase]));

    expect(byId["runtime-001"]?.runtimeEvidence?.trace.triggerEvidenceField).toBeUndefined();
    expect(byId["runtime-003"]?.runtimeEvidence?.trace.triggerEvidenceField).toBe("restTriggerRuntime");
    expect(byId["runtime-005"]?.runtimeEvidence?.trace.triggerEvidenceField).toBe("timerTriggerRuntime");
    expect(byId["runtime-007"]?.runtimeEvidence?.trace.triggerEvidenceField).toBe("cliTriggerRuntime");
    expect(byId["runtime-009"]?.runtimeEvidence?.trace.triggerEvidenceField).toBe("channelTriggerRuntime");
  });

  it("mirrors the existing helper and integration regression seams instead of inventing a new harness", () => {
    for (const testCase of runtimeEvidenceEvalCases) {
      expect(testCase.runtimeEvidence?.mirrors.length).toBeGreaterThan(0);
      expect(testCase.runtimeEvidence?.artifacts.length).toBeGreaterThan(0);
      expect(testCase.suite).toBe("runtime_evidence");
    }
  });
});
