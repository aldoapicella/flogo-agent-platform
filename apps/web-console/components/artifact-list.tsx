import { type ArtifactRef } from "@flogo-agent/contracts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function artifactSummary(artifact: ArtifactRef) {
  if (artifact.type !== "contrib_bundle" || !isRecord(artifact.metadata)) {
    return null;
  }

  const result = isRecord(artifact.metadata.result) ? artifact.metadata.result : undefined;
  const bundle = result && isRecord(result.bundle) ? result.bundle : undefined;
  const validation = result && isRecord(result.validation) ? result.validation : undefined;
  const build = result && isRecord(result.build) ? result.build : undefined;
  const test = result && isRecord(result.test) ? result.test : undefined;
  const packageName = typeof bundle?.packageName === "string" ? bundle.packageName : undefined;
  const modulePath = typeof bundle?.modulePath === "string" ? bundle.modulePath : undefined;
  const validationOk = typeof validation?.ok === "boolean" ? validation.ok : undefined;
  const buildOk = typeof build?.ok === "boolean" ? build.ok : undefined;
  const testOk = typeof test?.ok === "boolean" ? test.ok : undefined;

  if (!packageName && !modulePath && validationOk === undefined && buildOk === undefined && testOk === undefined) {
    return null;
  }

  return (
    <div className="meta">
      {packageName ? <div>package: {packageName}</div> : null}
      {modulePath ? <div>module: {modulePath}</div> : null}
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
