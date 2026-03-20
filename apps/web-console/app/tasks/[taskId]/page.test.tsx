import { renderToStaticMarkup } from "react-dom/server";
import { type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/api", () => ({
  getTask: vi.fn(),
  getTaskArtifacts: vi.fn()
}));

describe("TaskDetailPage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders diagnosis, runtime evidence, and artifacts in task detail order", async () => {
    const api = await import("../../../lib/api.js");
    vi.mocked(api.getTask).mockResolvedValue({
      taskId: "task-1",
      type: "debug",
      status: "completed",
      summary: "Captured runtime evidence",
      artifacts: [],
      activeJobRuns: [],
      requiredApprovals: [],
      nextActions: []
    });
    vi.mocked(api.getTaskArtifacts).mockResolvedValue([
      {
        id: "diagnosis-1",
        type: "diagnosis_report",
        name: "diagnosis-1",
        uri: "memory://diagnosis-1",
        metadata: {
          report: {
            plan: {
              symptom: "wrong_response",
              triggerFamily: "rest",
              selectedOperations: ["static_validation", "run_trace"],
              rationale: [],
              limitations: []
            },
            problemCategory: "trigger",
            subtype: "rest_envelope_mismatch",
            likelyRootCause: "REST reply mapping drifted.",
            supportingEvidence: [],
            affected: {
              triggerFamily: "rest",
              flowId: "orchestrate"
            },
            recommendedNextAction: "Fix the reply mapping and rerun trace.",
            recommendedPatch: {
              problem: "REST reply mapping drifted.",
              evidence: ["rest_runtime_envelope"],
              proposedPatch: "Align the reply mapping with flow output.",
              expectedImpact: "The HTTP response should match expected output.",
              confidence: {
                level: "high",
                score: 0.8,
                bases: ["direct_observation"],
                supportingSignals: [],
                missingSignals: [],
                conflictingSignals: []
              },
              caveats: []
            },
            confidence: {
              level: "high",
              score: 0.8,
              bases: ["direct_observation"],
              supportingSignals: [],
              missingSignals: [],
              conflictingSignals: []
            },
            evidenceQuality: "runtime_backed",
            fallbackDetected: false,
            limitations: [],
            diagnostics: [],
            relatedArtifactIds: []
          }
        }
      },
      {
        id: "trace-1",
        type: "run_trace",
        name: "trace-1",
        uri: "memory://trace-1",
        metadata: {
          trace: {
            appName: "demo",
            flowId: "orchestrate",
            evidenceKind: "runtime_backed",
            runtimeEvidence: {
              kind: "runtime_backed",
              runtimeMode: "rest_trigger",
              normalizedSteps: []
            },
            summary: {
              flowId: "orchestrate",
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
      }
    ]);

    const pageModule = await import("./page.js");
    const TaskDetailPage = pageModule.default as unknown as (args: {
      params: Promise<{ taskId: string }>;
    }) => Promise<ReactElement>;
    const element = await TaskDetailPage({
      params: Promise.resolve({
        taskId: "task-1"
      })
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Diagnosis summary");
    expect(html).toContain("Runtime evidence");
    expect(html).toContain("Artifacts");
    expect(html.indexOf("Diagnosis summary")).toBeLessThan(html.indexOf("Runtime evidence"));
    expect(html.indexOf("Runtime evidence")).toBeLessThan(html.indexOf("Artifacts"));
  });
});
