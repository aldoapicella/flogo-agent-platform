import { type ReactNode } from "react";

import { type DiagnosisArtifactView } from "../lib/diagnosis";

export function DiagnosisPanel({ diagnosis }: { diagnosis: DiagnosisArtifactView | null }) {
  return (
    <section className="card">
      <div className="panel-header">
        <div>
          <div className="pill">Agent diagnosis</div>
          <h3>Diagnosis summary</h3>
        </div>
        <p className="meta">Evidence-backed diagnosis and patch recommendation derived from the stored runtime and static analysis artifacts.</p>
      </div>

      {!diagnosis ? (
        <p className="meta">No diagnosis artifact is available for this task yet.</p>
      ) : (
        <div className="runtime-section-stack">
          <SummaryGrid
            items={[
              {
                label: "Problem",
                value: `${formatLabel(diagnosis.report.problemCategory)} / ${formatLabel(diagnosis.report.subtype)}`
              },
              {
                label: "Evidence quality",
                value: formatLabel(diagnosis.report.evidenceQuality)
              },
              {
                label: "Confidence",
                value: `${formatLabel(diagnosis.report.confidence.level)} (${diagnosis.report.confidence.score})`
              },
              {
                label: "Fallback",
                value: diagnosis.report.fallbackDetected ? "Detected" : "No"
              }
            ]}
          />

          <article className="runtime-subsection">
            <h4>Likely root cause</h4>
            <p>{diagnosis.report.likelyRootCause}</p>
          </article>

          <article className="runtime-subsection">
            <h4>Recommended next action</h4>
            <p>{diagnosis.report.recommendedNextAction}</p>
          </article>

          <article className="runtime-subsection">
            <h4>Recommended patch</h4>
            <p><strong>Problem:</strong> {diagnosis.report.recommendedPatch.problem}</p>
            <p><strong>Patch:</strong> {diagnosis.report.recommendedPatch.proposedPatch}</p>
            <p><strong>Expected impact:</strong> {diagnosis.report.recommendedPatch.expectedImpact}</p>
            {diagnosis.report.recommendedPatch.caveats.length > 0 ? (
              <ValueList
                title="Caveats"
                values={diagnosis.report.recommendedPatch.caveats}
              />
            ) : null}
          </article>

          <article className="runtime-subsection">
            <h4>Selected proof path</h4>
            <ValueList title="Operations" values={diagnosis.report.plan.selectedOperations.map((value) => formatLabel(value))} />
            {diagnosis.report.plan.limitations.length > 0 ? <ValueList title="Limitations" values={diagnosis.report.plan.limitations} /> : null}
          </article>

          <article className="runtime-subsection">
            <h4>Supporting evidence</h4>
            {diagnosis.report.supportingEvidence.length === 0 ? (
              <p className="meta">No direct evidence refs were attached.</p>
            ) : (
              <div className="runtime-step-list">
                {diagnosis.report.supportingEvidence.map((evidence, index) => (
                  <details className="runtime-details" key={`${evidence.fieldPath}-${index}`}>
                    <summary>
                      <strong>{evidence.fieldPath}</strong>
                      <span className="meta">{formatLabel(evidence.source)}</span>
                    </summary>
                    <SummaryGrid
                      items={[
                        {
                          label: "Artifact",
                          value: evidence.artifactId ?? "Inline"
                        },
                        {
                          label: "Direct",
                          value: evidence.direct ? "Yes" : "No"
                        }
                      ]}
                    />
                    {evidence.observedValue !== undefined ? <JsonBlock title="Observed" value={evidence.observedValue} /> : null}
                    {evidence.expectedValue !== undefined ? <JsonBlock title="Expected" value={evidence.expectedValue} /> : null}
                    {evidence.diff !== undefined ? <JsonBlock title="Diff" value={evidence.diff} /> : null}
                  </details>
                ))}
              </div>
            )}
          </article>
        </div>
      )}
    </section>
  );
}

function SummaryGrid({ items }: { items: Array<{ label: string; value: string } | undefined> }) {
  return (
    <div className="runtime-summary-grid">
      {items.filter(Boolean).map((item) => (
        <div className="runtime-summary-item" key={item!.label}>
          <span className="meta">{item!.label}</span>
          <strong>{item!.value}</strong>
        </div>
      ))}
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div className="meta">{title}</div>
      <pre className="runtime-code">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function ValueList({ title, values }: { title: string; values: string[] }) {
  return (
    <div>
      <div className="meta">{title}</div>
      {values.length === 0 ? (
        <p className="meta">None</p>
      ) : (
        <ul className="runtime-list">
          {values.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (segment) => segment.toUpperCase());
}
