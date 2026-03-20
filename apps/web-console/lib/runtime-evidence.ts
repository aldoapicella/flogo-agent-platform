import {
  RunComparisonResponseSchema,
  RunTraceResponseSchema,
  ReplayResponseSchema,
  type ArtifactRef,
  type NormalizedRuntimeStepEvidence,
  type RunComparisonBasis,
  type RunComparisonResponse,
  type RunTraceEvidenceKind,
  type RunTraceResponse,
  type ReplayResponse,
  type RuntimeEvidence
} from "@flogo-agent/contracts";

export type RuntimeArtifactView =
  | {
      kind: "trace";
      artifact: ArtifactRef;
      response: RunTraceResponse;
    }
  | {
      kind: "replay";
      artifact: ArtifactRef;
      response: ReplayResponse;
    }
  | {
      kind: "comparison";
      artifact: ArtifactRef;
      response: RunComparisonResponse;
    };

const runtimeArtifactTypes = ["run_trace", "replay_report", "run_comparison"] as const;

export function selectLatestRuntimeArtifacts(artifacts: ArtifactRef[]): ArtifactRef[] {
  const byType = new Map<string, ArtifactRef>();
  for (const artifact of artifacts) {
    if (isRuntimeArtifactType(artifact.type)) {
      byType.set(artifact.type, artifact);
    }
  }

  return runtimeArtifactTypes.map((type) => byType.get(type)).filter((artifact): artifact is ArtifactRef => Boolean(artifact));
}

export function parseRuntimeArtifact(artifact: ArtifactRef): RuntimeArtifactView | null {
  const metadata = artifact.metadata && typeof artifact.metadata === "object" ? artifact.metadata : {};

  if (artifact.type === "run_trace") {
    const parsed = RunTraceResponseSchema.safeParse({
      trace: metadata.trace,
      validation: metadata.validation
    });
    if (!parsed.success) {
      return null;
    }
    return {
      kind: "trace",
      artifact,
      response: parsed.data
    };
  }

  if (artifact.type === "replay_report") {
    const parsed = ReplayResponseSchema.safeParse({
      result: metadata.result,
      artifact: {
        id: artifact.id,
        type: artifact.type,
        name: artifact.name,
        uri: artifact.uri,
        metadata: artifact.metadata
      }
    });
    if (!parsed.success) {
      return null;
    }
    return {
      kind: "replay",
      artifact,
      response: parsed.data
    };
  }

  if (artifact.type === "run_comparison") {
    const parsed = RunComparisonResponseSchema.safeParse({
      result: metadata.result,
      validation: metadata.validation
    });
    if (!parsed.success) {
      return null;
    }
    return {
      kind: "comparison",
      artifact,
      response: parsed.data
    };
  }

  return null;
}

export function getRuntimeEvidence(view: RuntimeArtifactView): RuntimeEvidence | undefined {
  if (view.kind === "trace") {
    return view.response.trace?.runtimeEvidence;
  }

  if (view.kind === "replay") {
    return view.response.result.runtimeEvidence ?? view.response.result.trace?.runtimeEvidence;
  }

  return undefined;
}

export function getEvidenceKind(view: RuntimeArtifactView): RunTraceEvidenceKind | undefined {
  if (view.kind === "trace") {
    return view.response.trace?.evidenceKind ?? view.response.trace?.runtimeEvidence?.kind;
  }

  if (view.kind === "replay") {
    return view.response.result.trace?.evidenceKind ?? view.response.result.runtimeEvidence?.kind;
  }

  return undefined;
}

export function getComparisonBasis(view: RuntimeArtifactView): RunComparisonBasis | undefined {
  if (view.kind === "trace") {
    return view.response.trace?.comparisonBasisPreference;
  }

  if (view.kind === "replay") {
    return view.response.result.comparisonBasisPreference;
  }

  return view.response.result?.comparisonBasis;
}

export function getFallbackReason(view: RuntimeArtifactView): string | undefined {
  return getRuntimeEvidence(view)?.fallbackReason;
}

export function getNormalizedSteps(view: RuntimeArtifactView): NormalizedRuntimeStepEvidence[] {
  return getRuntimeEvidence(view)?.normalizedSteps ?? [];
}

function isRuntimeArtifactType(value: ArtifactRef["type"]): value is (typeof runtimeArtifactTypes)[number] {
  return value === "run_trace" || value === "replay_report" || value === "run_comparison";
}
