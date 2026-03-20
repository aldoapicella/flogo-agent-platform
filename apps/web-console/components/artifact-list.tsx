import { type ArtifactRef } from "@flogo-agent/contracts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function artifactSummary(artifact: ArtifactRef) {
  if (
    (artifact.type !== "contrib_bundle" && artifact.type !== "contrib_validation_report" && artifact.type !== "contrib_package") ||
    !isRecord(artifact.metadata)
  ) {
    return null;
  }

  const result = isRecord(artifact.metadata.result) ? artifact.metadata.result : undefined;
  const bundle = result && isRecord(result.bundle) ? result.bundle : undefined;
  const validation = result && isRecord(result.validation) ? result.validation : undefined;
  const build = result && isRecord(result.build) ? result.build : undefined;
  const test = result && isRecord(result.test) ? result.test : undefined;
  const storage = isRecord(artifact.metadata.storage) ? artifact.metadata.storage : undefined;
  const kind = typeof bundle?.kind === "string" ? bundle.kind : undefined;
  const packageName = typeof bundle?.packageName === "string" ? bundle.packageName : undefined;
  const modulePath = typeof bundle?.modulePath === "string" ? bundle.modulePath : undefined;
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
