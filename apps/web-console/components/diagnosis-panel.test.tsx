import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DiagnosisPanel } from "./diagnosis-panel";

describe("DiagnosisPanel", () => {
  it("renders diagnosis summary, confidence, and patch guidance honestly", () => {
    const html = renderToStaticMarkup(
      <DiagnosisPanel
        diagnosis={{
          artifact: {
            id: "diagnosis-1",
            type: "diagnosis_report",
            name: "diagnosis-1",
            uri: "memory://diagnosis-1"
          },
          report: {
            plan: {
              symptom: "wrong_response",
              triggerFamily: "rest",
              selectedOperations: ["static_validation", "run_trace", "compare_runs"],
              rationale: [],
              limitations: ["Comparison used the narrow REST slice."]
            },
            problemCategory: "trigger",
            subtype: "rest_envelope_mismatch",
            likelyRootCause: "REST request or reply mapping drifted across compared runs.",
            supportingEvidence: [
              {
                fieldPath: "comparison.restComparison.replyEnvelopeDiff",
                source: "comparison",
                direct: true,
                diff: {
                  kind: "changed",
                  left: {
                    status: 200
                  },
                  right: {
                    status: 500
                  }
                }
              }
            ],
            affected: {
              triggerFamily: "rest",
              flowId: "hello_flow"
            },
            recommendedNextAction: "Fix the REST reply mapping and rerun trace plus compare.",
            recommendedPatch: {
              problem: "REST request or reply mapping drifted across compared runs.",
              evidence: ["rest_runtime_envelope"],
              proposedPatch: "Align the REST reply mapping with the flow output contract.",
              expectedImpact: "REST-triggered runs should return the expected HTTP status and body.",
              confidence: {
                level: "high",
                score: 0.83,
                bases: ["direct_observation", "comparison"],
                supportingSignals: [],
                missingSignals: [],
                conflictingSignals: []
              },
              caveats: ["Runtime coverage is still narrow."]
            },
            confidence: {
              level: "high",
              score: 0.83,
              bases: ["direct_observation", "comparison"],
              supportingSignals: [],
              missingSignals: [],
              conflictingSignals: []
            },
            evidenceQuality: "runtime_backed",
            fallbackDetected: false,
            limitations: ["Comparison used the narrow REST slice."],
            diagnostics: [],
            relatedArtifactIds: ["trace-1", "compare-1"]
          }
        }}
      />
    );

    expect(html).toContain("Diagnosis summary");
    expect(html).toContain("Trigger / Rest Envelope Mismatch");
    expect(html).toContain("Evidence quality");
    expect(html).toContain("Runtime Backed");
    expect(html).toContain("Fix the REST reply mapping");
    expect(html).toContain("Align the REST reply mapping with the flow output contract.");
    expect(html).toContain("comparison.restComparison.replyEnvelopeDiff");
  });

  it("renders low-confidence fallback diagnosis without overstating certainty", () => {
    const html = renderToStaticMarkup(
      <DiagnosisPanel
        diagnosis={{
          artifact: {
            id: "diagnosis-2",
            type: "diagnosis_report",
            name: "diagnosis-2",
            uri: "memory://diagnosis-2"
          },
          report: {
            plan: {
              symptom: "unsupported_shape",
              triggerFamily: "cli",
              selectedOperations: ["static_validation", "run_trace"],
              rationale: [],
              limitations: ["Diagnosis relied on simulated fallback evidence rather than a fully runtime-backed slice."]
            },
            problemCategory: "runtime",
            subtype: "unsupported_shape",
            likelyRootCause: "Unsupported CLI flag descriptor triggered fallback.",
            supportingEvidence: [],
            affected: {
              triggerFamily: "cli",
              flowId: "hello_flow"
            },
            recommendedNextAction: "Stay on the supported CLI slice or gather stronger static evidence before patching.",
            recommendedPatch: {
              problem: "Unsupported CLI flag descriptor triggered fallback.",
              evidence: ["runtime fallback", "cli"],
              proposedPatch: "Do not patch yet. First gather a supported runtime-backed trace or deterministic mapping evidence.",
              expectedImpact: "The next diagnosis should be grounded in stronger evidence.",
              confidence: {
                level: "low",
                score: 0.22,
                bases: ["fallback_reason"],
                supportingSignals: [],
                missingSignals: ["Runtime corroboration was not captured."],
                conflictingSignals: ["Diagnosis used simulated fallback evidence for at least part of the proof path."]
              },
              caveats: ["Diagnosis Loop v1 does not auto-fix without grounded evidence."]
            },
            confidence: {
              level: "low",
              score: 0.22,
              bases: ["fallback_reason"],
              supportingSignals: [],
              missingSignals: ["Runtime corroboration was not captured."],
              conflictingSignals: ["Diagnosis used simulated fallback evidence for at least part of the proof path."]
            },
            evidenceQuality: "simulated_fallback",
            fallbackDetected: true,
            limitations: ["Diagnosis relied on simulated fallback evidence rather than a fully runtime-backed slice."],
            diagnostics: [],
            relatedArtifactIds: []
          }
        }}
      />
    );

    expect(html).toContain("Low (0.22)");
    expect(html).toContain("Fallback");
    expect(html).toContain("Detected");
    expect(html).toContain("Diagnosis Loop v1 does not auto-fix without grounded evidence.");
    expect(html).toContain("Do not patch yet.");
  });
});
