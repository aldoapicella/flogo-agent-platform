import { type ReactNode } from "react";

import {
  type ChannelRuntimeComparison,
  type ChannelTriggerRuntimeEvidence,
  type CLITriggerRuntimeEvidence,
  type NormalizedRuntimeStepEvidence,
  type RestEnvelopeComparison,
  type RestTriggerRuntimeEvidence,
  type RunComparisonResult,
  type RunComparisonStepDiff,
  type RunComparisonValueDiff,
  type RunTrace,
  type RuntimeEvidence,
  type TimerRuntimeComparison,
  type TimerTriggerRuntimeEvidence
} from "@flogo-agent/contracts";

import {
  getComparisonBasis,
  getEvidenceKind,
  getFallbackReason,
  getNormalizedSteps,
  getRuntimeEvidence,
  type RuntimeArtifactView
} from "../lib/runtime-evidence";

export function RuntimeEvidencePanel({ artifacts }: { artifacts: RuntimeArtifactView[] }) {
  return (
    <section className="card span-full">
      <div className="panel-header">
        <div>
          <div className="pill">Phase 3 runtime evidence</div>
          <h3>Runtime evidence</h3>
        </div>
        <p className="meta">Trace, replay, and comparison artifacts rendered from stored runtime-backed or fallback evidence.</p>
      </div>

      {artifacts.length === 0 ? (
        <p className="meta">No runtime trace, replay, or comparison artifacts are available for this task yet.</p>
      ) : (
        <div className="runtime-artifact-stack">
          {artifacts.map((artifact) => (
            <RuntimeArtifactCard key={artifact.artifact.id} artifact={artifact} />
          ))}
        </div>
      )}
    </section>
  );
}

function RuntimeArtifactCard({ artifact }: { artifact: RuntimeArtifactView }) {
  const evidenceKind = getEvidenceKind(artifact);
  const comparisonBasis = getComparisonBasis(artifact);
  const runtimeEvidence = getRuntimeEvidence(artifact);
  const runtimeMode = runtimeEvidence?.runtimeMode;
  const fallbackReason = getFallbackReason(artifact);
  const normalizedSteps = getNormalizedSteps(artifact);

  return (
    <article className="runtime-artifact-card">
      <div className="runtime-artifact-header">
        <div>
          <h4>{artifactTitle(artifact.kind)}</h4>
          <div className="meta">
            {artifact.artifact.name} · <code>{artifact.artifact.type}</code>
          </div>
        </div>
        <div className="badge-row">
          {evidenceKind ? <Badge label={`Evidence: ${formatLabel(evidenceKind)}`} tone={evidenceKind} /> : null}
          {runtimeMode ? <Badge label={`Mode: ${formatLabel(runtimeMode)}`} /> : null}
          {comparisonBasis ? <Badge label={`Basis: ${formatLabel(comparisonBasis)}`} /> : null}
        </div>
      </div>

      {artifact.kind === "comparison" ? (
        <ComparisonArtifactBody comparison={artifact.response.result} />
      ) : (
        <RuntimeArtifactBody
          trace={artifact.kind === "trace" ? artifact.response.trace : artifact.response.result.trace}
          runtimeEvidence={runtimeEvidence}
          normalizedSteps={normalizedSteps}
          replayInputSource={artifact.kind === "replay" ? artifact.response.result.summary.inputSource : undefined}
        />
      )}

      {fallbackReason ? <FallbackNotice reason={fallbackReason} /> : null}
    </article>
  );
}

function RuntimeArtifactBody(args: {
  trace: RunTrace | undefined;
  runtimeEvidence: RuntimeEvidence | undefined;
  normalizedSteps: NormalizedRuntimeStepEvidence[];
  replayInputSource?: string;
}) {
  const { trace, runtimeEvidence, normalizedSteps, replayInputSource } = args;

  return (
    <div className="runtime-section-stack">
      <SummaryGrid
        items={[
          {
            label: "Flow",
            value: trace?.flowId ?? "Unavailable"
          },
          {
            label: "Status",
            value: trace?.summary.status ?? "Unavailable"
          },
          replayInputSource
            ? {
                label: "Replay input",
                value: replayInputSource
              }
            : undefined,
          {
            label: "Steps",
            value: String(normalizedSteps.length || (trace?.summary.stepCount ?? 0))
          },
          {
            label: "Recorder",
            value: runtimeEvidence?.recorderBacked ? `${runtimeEvidence.recorderKind ?? "runtime"} (${runtimeEvidence.recorderMode ?? "unknown"})` : "No"
          }
        ]}
      />

      {runtimeEvidence?.restTriggerRuntime ? <RestTriggerPanel evidence={runtimeEvidence.restTriggerRuntime} /> : null}
      {runtimeEvidence?.timerTriggerRuntime ? <TimerTriggerPanel evidence={runtimeEvidence.timerTriggerRuntime} /> : null}
      {runtimeEvidence?.cliTriggerRuntime ? <CLITriggerPanel evidence={runtimeEvidence.cliTriggerRuntime} /> : null}
      {runtimeEvidence?.channelTriggerRuntime ? <ChannelTriggerPanel evidence={runtimeEvidence.channelTriggerRuntime} /> : null}

      <StepsPanel steps={normalizedSteps} />
    </div>
  );
}

function ComparisonArtifactBody({ comparison }: { comparison: RunComparisonResult | undefined }) {
  if (!comparison) {
    return <p className="meta">Comparison payload unavailable.</p>;
  }

  return (
    <div className="runtime-section-stack">
      <SummaryGrid
        items={[
          {
            label: "Basis",
            value: comparison.comparisonBasis ? formatLabel(comparison.comparisonBasis) : "Unavailable"
          },
          {
            label: "Left artifact",
            value: comparison.left.artifactId
          },
          {
            label: "Right artifact",
            value: comparison.right.artifactId
          },
          {
            label: "Step diffs",
            value: String(comparison.steps.length)
          }
        ]}
      />

      <ComparisonDiffList
        title="Summary differences"
        diffs={[
          ["Input", comparison.summary.inputDiff],
          ["Output", comparison.summary.outputDiff],
          ["Error", comparison.summary.errorDiff],
          ["Step count", comparison.summary.stepCountDiff]
        ]}
      />

      {comparison.restComparison ? <RestComparisonPanel comparison={comparison.restComparison} /> : null}
      {comparison.timerComparison ? <TimerComparisonPanel comparison={comparison.timerComparison} /> : null}
      {comparison.channelComparison ? <ChannelComparisonPanel comparison={comparison.channelComparison} /> : null}

      <details className="runtime-details">
        <summary>
          <strong>Step differences</strong>
          <span className="meta">{comparison.steps.length} entries</span>
        </summary>
        {comparison.steps.length === 0 ? (
          <p className="meta">No per-step differences were recorded.</p>
        ) : (
          <div className="runtime-step-list">
            {comparison.steps.map((step) => (
              <StepDiffCard key={step.taskId} step={step} />
            ))}
          </div>
        )}
      </details>
    </div>
  );
}

function RestTriggerPanel({ evidence }: { evidence: RestTriggerRuntimeEvidence }) {
  return (
    <TriggerPanel title="REST trigger">
      <ComparisonDiffList
        title="Envelope"
        diffs={[
          ["Request", evidence.request],
          ["Mapped flow input", evidence.flowInput ?? evidence.mapping?.mappedFlowInput],
          ["Flow output", evidence.flowOutput ?? evidence.mapping?.mappedFlowOutput],
          ["Reply", evidence.reply]
        ]}
      />
      <UnavailableFields fields={[...evidence.unavailableFields, ...(evidence.mapping?.unavailableFields ?? [])]} />
    </TriggerPanel>
  );
}

function TimerTriggerPanel({ evidence }: { evidence: TimerTriggerRuntimeEvidence }) {
  return (
    <TriggerPanel title="Timer trigger">
      <ComparisonDiffList
        title="Observed timer state"
        diffs={[
          ["Settings", evidence.settings],
          ["Tick", evidence.tick],
          ["Mapped flow input", evidence.flowInput],
          ["Flow output", evidence.flowOutput]
        ]}
      />
      <UnavailableFields fields={evidence.unavailableFields} />
    </TriggerPanel>
  );
}

function CLITriggerPanel({ evidence }: { evidence: CLITriggerRuntimeEvidence }) {
  return (
    <TriggerPanel title="CLI trigger">
      <ComparisonDiffList
        title="Command boundary"
        diffs={[
          ["Settings", evidence.settings],
          ["Command", evidence.handler],
          ["Args", evidence.args],
          ["Flags", evidence.flags],
          ["Mapped flow input", evidence.flowInput],
          ["Flow output", evidence.flowOutput],
          ["Reply", evidence.reply]
        ]}
      />
      <UnavailableFields fields={evidence.unavailableFields} />
    </TriggerPanel>
  );
}

function ChannelTriggerPanel({ evidence }: { evidence: ChannelTriggerRuntimeEvidence }) {
  return (
    <TriggerPanel title="Channel trigger">
      <ComparisonDiffList
        title="Channel boundary"
        diffs={[
          ["Settings", evidence.settings],
          ["Handler", evidence.handler],
          ["Sent data", evidence.data],
          ["Mapped flow input", evidence.flowInput],
          ["Flow output", evidence.flowOutput]
        ]}
      />
      <UnavailableFields fields={evidence.unavailableFields} />
    </TriggerPanel>
  );
}

function RestComparisonPanel({ comparison }: { comparison: RestEnvelopeComparison }) {
  return (
    <TriggerPanel title="REST comparison">
      <SummaryGrid
        items={[
          {
            label: "Request envelope",
            value: comparison.requestEnvelopeCompared ? "Compared" : "Unavailable"
          },
          {
            label: "Mapped flow input",
            value: comparison.mappedFlowInputCompared ? "Compared" : "Unavailable"
          },
          {
            label: "Reply envelope",
            value: comparison.replyEnvelopeCompared ? "Compared" : "Unavailable"
          },
          {
            label: "Normalized steps",
            value: comparison.normalizedStepEvidenceCompared ? "Compared" : "Unavailable"
          }
        ]}
      />
      <ComparisonDiffList
        title="REST differences"
        diffs={[
          ["Request envelope", comparison.requestEnvelopeDiff],
          ["Mapped flow input", comparison.mappedFlowInputDiff],
          ["Reply envelope", comparison.replyEnvelopeDiff],
          ["Normalized step count", comparison.normalizedStepCountDiff]
        ]}
      />
      <UnavailableFields fields={comparison.unsupportedFields} />
    </TriggerPanel>
  );
}

function TimerComparisonPanel({ comparison }: { comparison: TimerRuntimeComparison }) {
  return (
    <TriggerPanel title="Timer comparison">
      <SummaryGrid
        items={[
          {
            label: "Settings",
            value: comparison.settingsCompared ? "Compared" : "Unavailable"
          },
          {
            label: "Flow input",
            value: comparison.flowInputCompared ? "Compared" : "Unavailable"
          },
          {
            label: "Flow output",
            value: comparison.flowOutputCompared ? "Compared" : "Unavailable"
          },
          {
            label: "Tick",
            value: comparison.tickCompared ? "Compared" : "Unavailable"
          }
        ]}
      />
      <ComparisonDiffList
        title="Timer differences"
        diffs={[
          ["Settings", comparison.settingsDiff],
          ["Flow input", comparison.flowInputDiff],
          ["Flow output", comparison.flowOutputDiff],
          ["Tick", comparison.tickDiff]
        ]}
      />
      <UnavailableFields fields={comparison.unsupportedFields} />
    </TriggerPanel>
  );
}

function ChannelComparisonPanel({ comparison }: { comparison: ChannelRuntimeComparison }) {
  return (
    <TriggerPanel title="Channel comparison">
      <SummaryGrid
        items={[
          {
            label: "Channel identity",
            value: comparison.channelCompared ? "Compared" : "Unavailable"
          },
          {
            label: "Sent data",
            value: comparison.dataCompared ? "Compared" : "Unavailable"
          },
          {
            label: "Flow input",
            value: comparison.flowInputCompared ? "Compared" : "Unavailable"
          },
          {
            label: "Flow output",
            value: comparison.flowOutputCompared ? "Compared" : "Unavailable"
          }
        ]}
      />
      <ComparisonDiffList
        title="Channel differences"
        diffs={[
          ["Channel", comparison.channelDiff],
          ["Data", comparison.dataDiff],
          ["Flow input", comparison.flowInputDiff],
          ["Flow output", comparison.flowOutputDiff]
        ]}
      />
      <UnavailableFields fields={comparison.unsupportedFields} />
    </TriggerPanel>
  );
}

function StepsPanel({ steps }: { steps: NormalizedRuntimeStepEvidence[] }) {
  return (
    <details className="runtime-details" open={steps.length > 0}>
      <summary>
        <strong>Normalized steps</strong>
        <span className="meta">{steps.length} recorded</span>
      </summary>
      {steps.length === 0 ? (
        <p className="meta">No normalized per-step evidence was recorded for this artifact.</p>
      ) : (
        <div className="runtime-step-list">
          {steps.map((step) => (
            <details key={step.taskId} className="runtime-step-card">
              <summary>
                <strong>{step.taskName ?? step.taskId}</strong>
                <span className="meta">{formatLabel(step.status)}</span>
              </summary>
              <SummaryGrid
                items={[
                  {
                    label: "Task ID",
                    value: step.taskId
                  },
                  step.activityRef
                    ? {
                        label: "Ref",
                        value: step.activityRef
                      }
                    : undefined,
                  step.type
                    ? {
                        label: "Type",
                        value: step.type
                      }
                    : undefined,
                  step.startedAt
                    ? {
                        label: "Started",
                        value: step.startedAt
                      }
                    : undefined,
                  step.finishedAt
                    ? {
                        label: "Finished",
                        value: step.finishedAt
                      }
                    : undefined
                ]}
              />
              <ComparisonDiffList
                title="Step evidence"
                diffs={[
                  ["Declared input mappings", step.declaredInputMappings],
                  ["Resolved inputs", step.resolvedInputs],
                  ["Produced outputs", step.producedOutputs],
                  ["Flow state before", step.flowStateBefore],
                  ["Flow state after", step.flowStateAfter],
                  ["State delta", step.stateDelta]
                ]}
              />
              <UnavailableFields fields={step.unavailableFields} />
            </details>
          ))}
        </div>
      )}
    </details>
  );
}

function StepDiffCard({ step }: { step: RunComparisonStepDiff }) {
  return (
    <details className="runtime-step-card">
      <summary>
        <strong>{step.taskId}</strong>
        <span className="meta">{formatLabel(step.changeKind)}</span>
      </summary>
      <SummaryGrid
        items={[
          step.leftStatus
            ? {
                label: "Left status",
                value: step.leftStatus
              }
            : undefined,
          step.rightStatus
            ? {
                label: "Right status",
                value: step.rightStatus
              }
            : undefined
        ]}
      />
      <ComparisonDiffList
        title="Step diff"
        diffs={[
          ["Input", step.inputDiff],
          ["Output", step.outputDiff],
          ["Flow state", step.flowStateDiff],
          ["Activity state", step.activityStateDiff]
        ]}
      />
    </details>
  );
}

function ComparisonDiffList({ title, diffs }: { title: string; diffs: Array<[string, unknown]> }) {
  const visibleDiffs = diffs.filter(([, value]) => value !== undefined);
  if (visibleDiffs.length === 0) {
    return null;
  }

  return (
    <div className="runtime-subsection">
      <h5>{title}</h5>
      <div className="runtime-json-grid">
        {visibleDiffs.map(([label, value]) => (
          <div key={label} className="runtime-json-card">
            <div className="meta">{label}</div>
            <JsonValue value={value} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryGrid({
  items
}: {
  items: Array<
    | {
        label: string;
        value: string;
      }
    | undefined
  >;
}) {
  const visibleItems = items.filter(
    (item): item is {
      label: string;
      value: string;
    } => Boolean(item)
  );
  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div className="runtime-summary-grid">
      {visibleItems.map((item) => (
        <div key={item.label} className="runtime-summary-item">
          <div className="meta">{item.label}</div>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function TriggerPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="runtime-subsection">
      <h5>{title}</h5>
      {children}
    </section>
  );
}

function FallbackNotice({ reason }: { reason: string }) {
  return (
    <div className="runtime-note">
      <strong>Fallback reason</strong>
      <p className="meta">{reason}</p>
    </div>
  );
}

function UnavailableFields({ fields }: { fields: string[] }) {
  const visibleFields = Array.from(new Set(fields)).filter(Boolean);
  if (visibleFields.length === 0) {
    return null;
  }

  return (
    <div className="runtime-note">
      <strong>Unavailable or unsupported fields</strong>
      <div className="badge-row">
        {visibleFields.map((field) => (
          <Badge key={field} label={field} tone="muted" />
        ))}
      </div>
    </div>
  );
}

function Badge({ label, tone = "default" }: { label: string; tone?: "default" | "runtime_backed" | "simulated_fallback" | "muted" }) {
  return <span className={`runtime-badge runtime-badge-${tone}`}>{label}</span>;
}

function JsonValue({ value }: { value: unknown }) {
  if (isComparisonValueDiff(value)) {
    return <pre className="runtime-code">{JSON.stringify(value, null, 2)}</pre>;
  }

  return <pre className="runtime-code">{JSON.stringify(value, null, 2)}</pre>;
}

function artifactTitle(kind: RuntimeArtifactView["kind"]) {
  if (kind === "trace") {
    return "Trace artifact";
  }
  if (kind === "replay") {
    return "Replay artifact";
  }
  return "Comparison artifact";
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function isComparisonValueDiff(value: unknown): value is RunComparisonValueDiff {
  return typeof value === "object" && value !== null && "kind" in value;
}
