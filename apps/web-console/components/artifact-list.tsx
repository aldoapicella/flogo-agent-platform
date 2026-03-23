import { type ArtifactRef } from "@flogo-agent/contracts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function artifactSummary(artifact: ArtifactRef) {
  if (
    (artifact.type !== "contrib_bundle" &&
      artifact.type !== "contrib_validation_report" &&
      artifact.type !== "contrib_package" &&
      artifact.type !== "contrib_install_plan" &&
      artifact.type !== "contrib_update_plan" &&
      artifact.type !== "contrib_update_diff_plan" &&
      artifact.type !== "contrib_install_diff_plan" &&
      artifact.type !== "contrib_install_apply_result") ||
    !isRecord(artifact.metadata)
  ) {
    return null;
  }

  const result = isRecord(artifact.metadata.result) ? artifact.metadata.result : undefined;
  const bundle = result && isRecord(result.bundle) ? result.bundle : undefined;
  const sourceContribution = result && isRecord(result.sourceContribution) ? result.sourceContribution : undefined;
  const validation = result && isRecord(result.validation) ? result.validation : undefined;
  const build = result && isRecord(result.build) ? result.build : undefined;
  const test = result && isRecord(result.test) ? result.test : undefined;
  const storage = isRecord(artifact.metadata.storage) ? artifact.metadata.storage : undefined;
  const kind =
    typeof bundle?.kind === "string"
      ? bundle.kind
      : typeof result?.contributionKind === "string"
        ? result.contributionKind
        : typeof sourceContribution?.kind === "string"
          ? sourceContribution.kind
          : undefined;
  const packageName =
    typeof bundle?.packageName === "string"
      ? bundle.packageName
      : typeof sourceContribution?.packageName === "string"
        ? sourceContribution.packageName
        : undefined;
  const modulePath =
    typeof bundle?.modulePath === "string"
      ? bundle.modulePath
      : typeof result?.modulePath === "string"
        ? result.modulePath
        : typeof sourceContribution?.modulePath === "string"
          ? sourceContribution.modulePath
          : undefined;
  const files = Array.isArray(bundle?.files) ? bundle.files.filter(isRecord) : [];
  const generatedFileSummary =
    files.length > 0
      ? files
          .map((file) => (typeof file.kind === "string" ? file.kind : null))
          .filter((value): value is string => value !== null)
          .join(", ")
      : undefined;
  const validationOk = typeof validation?.ok === "boolean" ? validation.ok : undefined;
  const buildOk = typeof build?.ok === "boolean" ? build.ok : undefined;
  const testOk = typeof test?.ok === "boolean" ? test.ok : undefined;
  const packageResult = result && isRecord(result.package) ? result.package : undefined;
  const packageFormat = typeof packageResult?.format === "string" ? packageResult.format : undefined;
  const packageFileName = typeof packageResult?.fileName === "string" ? packageResult.fileName : undefined;
  const packageBytes = typeof packageResult?.bytes === "number" ? packageResult.bytes : undefined;
  const targetApp = result && isRecord(result.targetApp) ? result.targetApp : undefined;
  const targetAppLabel =
    typeof targetApp?.appId === "string"
      ? targetApp.appId
      : typeof targetApp?.appName === "string"
        ? targetApp.appName
        : undefined;
  const selectedAlias =
    typeof result?.selectedAlias === "string"
      ? result.selectedAlias
      : typeof sourceContribution?.selectedAlias === "string"
        ? sourceContribution.selectedAlias
        : undefined;
  const installReady = typeof result?.installReady === "boolean" ? result.installReady : undefined;
  const updateReady = typeof result?.updateReady === "boolean" ? result.updateReady : undefined;
  const matchQuality = typeof result?.matchQuality === "string" ? result.matchQuality : undefined;
  const compatibility = typeof result?.compatibility === "string" ? result.compatibility : undefined;
  const detectedInstalledContribution =
    result && isRecord(result.detectedInstalledContribution) ? result.detectedInstalledContribution : undefined;
  const detectedInstalledSummary = detectedInstalledContribution
    ? [
        typeof detectedInstalledContribution.alias === "string" ? `alias ${detectedInstalledContribution.alias}` : null,
        typeof detectedInstalledContribution.ref === "string" ? `ref ${detectedInstalledContribution.ref}` : null,
        typeof detectedInstalledContribution.version === "string" ? `version ${detectedInstalledContribution.version}` : null
      ]
        .filter((value): value is string => value !== null)
        .join(", ")
    : undefined;
  const readiness = typeof result?.readiness === "string" ? result.readiness : undefined;
  const previewAvailable = typeof result?.previewAvailable === "boolean" ? result.previewAvailable : undefined;
  const applied = typeof result?.applied === "boolean" ? result.applied : undefined;
  const applyReady = typeof result?.applyReady === "boolean" ? result.applyReady : undefined;
  const approvalRequired = typeof result?.approvalRequired === "boolean" ? result.approvalRequired : undefined;
  const sourceDiffArtifactId =
    isRecord(result?.basedOnInstallDiffPlan) && typeof result.basedOnInstallDiffPlan.sourceArtifactId === "string"
      ? result.basedOnInstallDiffPlan.sourceArtifactId
      : undefined;
  const sourceUpdatePlanArtifactId =
    isRecord(result?.basedOnUpdatePlan) && typeof result.basedOnUpdatePlan.sourceArtifactId === "string"
      ? result.basedOnUpdatePlan.sourceArtifactId
      : undefined;
  const isStale = typeof result?.isStale === "boolean" ? result.isStale : undefined;
  const staleReason = typeof result?.staleReason === "string" ? result.staleReason : undefined;
  const recommendedNextAction = typeof result?.recommendedNextAction === "string" ? result.recommendedNextAction : undefined;
  const warnings = Array.isArray(result?.warnings) ? result.warnings.filter((value): value is string => typeof value === "string") : [];
  const conflicts = Array.isArray(result?.conflicts) ? result.conflicts.filter(isRecord) : [];
  const predictedChanges = result && isRecord(result.predictedChanges) ? result.predictedChanges : undefined;
  const proposedImports =
    Array.isArray(result?.proposedImports)
      ? result.proposedImports.filter(isRecord)
      : [
            ...(Array.isArray(predictedChanges?.importsToAdd) ? predictedChanges.importsToAdd.filter(isRecord) : []),
            ...(Array.isArray(predictedChanges?.importsToUpdate) ? predictedChanges.importsToUpdate.filter(isRecord) : []),
            ...(Array.isArray(predictedChanges?.importsToReplace) ? predictedChanges.importsToReplace.filter(isRecord) : []),
            ...(Array.isArray(predictedChanges?.importsToKeep) ? predictedChanges.importsToKeep.filter(isRecord) : []),
            ...(Array.isArray(predictedChanges?.importsToRemove) ? predictedChanges.importsToRemove.filter(isRecord) : [])
          ];
  const proposedRefs =
    Array.isArray(result?.appliedRefs)
      ? result.appliedRefs.filter(isRecord)
      : Array.isArray(result?.proposedRefs)
      ? result.proposedRefs.filter(isRecord)
      : [
            ...(Array.isArray(predictedChanges?.refsToAdd) ? predictedChanges.refsToAdd.filter(isRecord) : []),
            ...(Array.isArray(predictedChanges?.refsToReuse) ? predictedChanges.refsToReuse.filter(isRecord) : []),
            ...(Array.isArray(predictedChanges?.refsToReplace) ? predictedChanges.refsToReplace.filter(isRecord) : []),
            ...(Array.isArray(predictedChanges?.refsToKeep) ? predictedChanges.refsToKeep.filter(isRecord) : []),
            ...(Array.isArray(predictedChanges?.refsToRemove) ? predictedChanges.refsToRemove.filter(isRecord) : [])
          ];
  const changedPaths = Array.isArray(result?.changedPaths)
    ? result.changedPaths.filter((value): value is string => typeof value === "string")
    : Array.isArray(predictedChanges?.changedPaths)
      ? predictedChanges.changedPaths.filter((value): value is string => typeof value === "string")
      : [];
  const diffSummary = Array.isArray(result?.applySummary)
    ? result.applySummary.filter((value): value is string => typeof value === "string")
    : Array.isArray(result?.diffSummary)
      ? result.diffSummary.filter((value): value is string => typeof value === "string")
    : [];
  const proposedImportSummary =
    Array.isArray(result?.appliedImports)
      ? result.appliedImports.filter(isRecord)
          .map((entry) => {
            const alias = typeof entry.alias === "string" ? entry.alias : "unknown";
            const ref = typeof entry.ref === "string" ? entry.ref : "unknown";
            const action = typeof entry.action === "string" ? entry.action : "applied";
            return `${alias} -> ${ref} (${action})`;
          })
          .join("; ")
      : proposedImports.length > 0
      ? proposedImports
          .map((entry) => {
            const alias = typeof entry.alias === "string" ? entry.alias : "unknown";
            const ref = typeof entry.ref === "string" ? entry.ref : "unknown";
            const action = typeof entry.action === "string" ? entry.action : "planned";
            return `${alias} -> ${ref} (${action})`;
          })
          .join("; ")
      : undefined;
  const importSummaryLabel = Array.isArray(result?.appliedImports) ? "applied imports" : "proposed imports";
  const refSummaryLabel = Array.isArray(result?.appliedRefs) ? "applied refs" : "proposed refs";
  const summaryLabel = Array.isArray(result?.applySummary) ? "apply summary" : "diff summary";
  const proposedRefSummary =
    proposedRefs.length > 0
      ? proposedRefs
          .map((entry) => {
            const surface = typeof entry.surface === "string" ? entry.surface : "ref";
            const value = typeof entry.value === "string" ? entry.value : "unknown";
            return `${surface}: ${value}`;
          })
          .join("; ")
      : undefined;
  const durablePayload = typeof storage?.durablePayload === "boolean" ? storage.durablePayload : undefined;
  const blobPath = typeof storage?.blobPath === "string" ? storage.blobPath : undefined;

  if (
    !kind &&
    !packageName &&
    !modulePath &&
    !generatedFileSummary &&
    durablePayload === undefined &&
    !blobPath &&
    validationOk === undefined &&
    buildOk === undefined &&
    testOk === undefined &&
    !targetAppLabel &&
    !selectedAlias &&
    installReady === undefined &&
    updateReady === undefined &&
    !matchQuality &&
    !compatibility &&
    !detectedInstalledSummary &&
    !readiness &&
    !recommendedNextAction &&
    previewAvailable === undefined &&
    applied === undefined &&
    applyReady === undefined &&
    approvalRequired === undefined &&
    !sourceDiffArtifactId &&
    !sourceUpdatePlanArtifactId &&
    isStale === undefined &&
    !staleReason &&
    warnings.length === 0 &&
    conflicts.length === 0 &&
    !proposedImportSummary &&
    !proposedRefSummary &&
    changedPaths.length === 0 &&
    diffSummary.length === 0 &&
    !packageFormat &&
    !packageFileName &&
    packageBytes === undefined
  ) {
    return null;
  }

  return (
    <div className="meta">
      {kind ? <div>contribution type: {kind}</div> : null}
      {packageName ? <div>package: {packageName}</div> : null}
      {modulePath ? <div>module: {modulePath}</div> : null}
      {generatedFileSummary ? <div>generated files: {generatedFileSummary}</div> : null}
      {durablePayload !== undefined ? <div>durable payload: {durablePayload ? "blob-backed" : "no"}</div> : null}
      {blobPath ? <div>blob path: {blobPath}</div> : null}
      {packageFormat ? <div>package format: {packageFormat}</div> : null}
      {packageFileName ? <div>package file: {packageFileName}</div> : null}
      {packageBytes !== undefined ? <div>package bytes: {packageBytes}</div> : null}
      {targetAppLabel ? <div>target app: {targetAppLabel}</div> : null}
      {selectedAlias ? <div>selected alias: {selectedAlias}</div> : null}
      {detectedInstalledSummary ? <div>detected installed contribution: {detectedInstalledSummary}</div> : null}
      {matchQuality ? <div>match quality: {matchQuality}</div> : null}
      {compatibility ? <div>compatibility: {compatibility}</div> : null}
      {sourceDiffArtifactId ? <div>source diff artifact: {sourceDiffArtifactId}</div> : null}
      {sourceUpdatePlanArtifactId ? <div>source update-plan artifact: {sourceUpdatePlanArtifactId}</div> : null}
      {proposedImportSummary ? <div>{importSummaryLabel}: {proposedImportSummary}</div> : null}
      {proposedRefSummary ? <div>{refSummaryLabel}: {proposedRefSummary}</div> : null}
      {previewAvailable !== undefined ? <div>preview available: {previewAvailable ? "yes" : "no"}</div> : null}
      {approvalRequired !== undefined ? <div>approval required: {approvalRequired ? "yes" : "no"}</div> : null}
      {applyReady !== undefined ? <div>apply ready: {applyReady ? "yes" : "no"}</div> : null}
      {applied !== undefined ? <div>applied: {applied ? "yes" : "no"}</div> : null}
      {isStale !== undefined ? <div>stale: {isStale ? "yes" : "no"}</div> : null}
      {staleReason ? <div>stale reason: {staleReason}</div> : null}
      {changedPaths.length > 0 ? <div>changed paths: {changedPaths.join(", ")}</div> : null}
      {diffSummary.length > 0 ? <div>{summaryLabel}: {diffSummary.join("; ")}</div> : null}
      {installReady !== undefined ? <div>install ready: {installReady ? "yes" : "no"}</div> : null}
      {updateReady !== undefined ? <div>update ready: {updateReady ? "yes" : "no"}</div> : null}
      {readiness ? <div>readiness: {readiness}</div> : null}
      {warnings.length > 0 ? <div>warnings: {warnings.length}</div> : null}
      {conflicts.length > 0 ? <div>conflicts: {conflicts.length}</div> : null}
      {recommendedNextAction ? <div>next action: {recommendedNextAction}</div> : null}
      {validationOk !== undefined ? <div>validation: {validationOk ? "passed" : "failed"}</div> : null}
      {testOk !== undefined ? <div>test proof: {testOk ? "passed" : "failed"}</div> : null}
      {buildOk !== undefined ? <div>build proof: {buildOk ? "passed" : "failed"}</div> : null}
    </div>
  );
}

export function ArtifactList({ artifacts }: { artifacts: ArtifactRef[] }) {
  return (
    <div className="card span-full">
      <h3>Artifacts</h3>
      {artifacts.length === 0 ? (
        <p className="meta">No artifacts published yet.</p>
      ) : (
        <div className="list">
          {artifacts.map((artifact) => (
            <div key={artifact.id}>
              <strong>{artifact.name}</strong>
              <div className="meta">{artifact.type}</div>
              <div className="meta">{artifact.uri}</div>
              {artifactSummary(artifact)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
