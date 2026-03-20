import { DiagnosisResponseSchema, type ArtifactRef, type DiagnosisReport } from "@flogo-agent/contracts";

export type DiagnosisArtifactView = {
  artifact: ArtifactRef;
  report: DiagnosisReport;
};

export function selectLatestDiagnosisArtifact(artifacts: ArtifactRef[]): ArtifactRef | null {
  for (let index = artifacts.length - 1; index >= 0; index -= 1) {
    if (artifacts[index]?.type === "diagnosis_report") {
      return artifacts[index] ?? null;
    }
  }
  return null;
}

export function parseDiagnosisArtifact(artifact: ArtifactRef | null | undefined): DiagnosisArtifactView | null {
  if (!artifact || artifact.type !== "diagnosis_report") {
    return null;
  }

  const parsed = DiagnosisResponseSchema.safeParse({
    report: artifact.metadata?.report
  });
  if (!parsed.success) {
    return null;
  }

  return {
    artifact,
    report: parsed.data.report
  };
}
