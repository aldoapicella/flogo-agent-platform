import { describe, expect, it } from "vitest";

import { type ArtifactRef } from "@flogo-agent/contracts";

import { parseDiagnosisArtifact, selectLatestDiagnosisArtifact } from "./diagnosis";

function createArtifact(overrides: Partial<ArtifactRef> & Pick<ArtifactRef, "id" | "type" | "name" | "uri">): ArtifactRef {
  return {
    metadata: {},
    ...overrides
  };
}

describe("diagnosis helpers", () => {
  it("selects the latest diagnosis artifact", () => {
    const artifacts: ArtifactRef[] = [
      createArtifact({
        id: "trace-1",
        type: "run_trace",
        name: "trace-1",
        uri: "memory://trace-1"
      }),
      createArtifact({
        id: "diagnosis-old",
        type: "diagnosis_report",
        name: "diagnosis-old",
        uri: "memory://diagnosis-old"
      }),
      createArtifact({
        id: "diagnosis-new",
        type: "diagnosis_report",
        name: "diagnosis-new",
        uri: "memory://diagnosis-new"
      })
    ];

    expect(selectLatestDiagnosisArtifact(artifacts)?.id).toBe("diagnosis-new");
  });

  it("parses diagnosis artifacts from inline metadata", () => {
    const artifact = createArtifact({
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
            flowId: "hello_flow"
          },
          recommendedNextAction: "Rerun the trace after fixing the reply mapping.",
          recommendedPatch: {
            problem: "REST reply mapping drifted.",
            evidence: ["rest_runtime_envelope"],
            proposedPatch: "Align the reply mapping with the flow output.",
            expectedImpact: "The reply envelope should match the expected HTTP response.",
            confidence: {
              level: "high",
              score: 0.82,
              bases: ["direct_observation"],
              supportingSignals: [],
              missingSignals: [],
              conflictingSignals: []
            },
            caveats: []
          },
          confidence: {
            level: "high",
            score: 0.82,
            bases: ["direct_observation"],
            supportingSignals: [],
            missingSignals: [],
            conflictingSignals: []
          },
          evidenceQuality: "runtime_backed",
          fallbackDetected: false,
          limitations: [],
          diagnostics: [],
          relatedArtifactIds: ["trace-1"]
        }
      }
    });

    const parsed = parseDiagnosisArtifact(artifact);
    expect(parsed?.report.problemCategory).toBe("trigger");
    expect(parsed?.report.recommendedPatch.proposedPatch).toContain("reply mapping");
  });
});
