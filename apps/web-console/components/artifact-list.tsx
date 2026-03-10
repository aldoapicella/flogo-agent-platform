import type { ArtifactRef } from "@flogo-agent/contracts";

export function ArtifactList({ artifacts }: { artifacts: ArtifactRef[] }) {
  return (
    <section className="card">
      <h2>Artifacts</h2>
      <div className="list">
        {artifacts.length ? (
          artifacts.map((artifact) => (
            <div key={`${artifact.kind}-${artifact.uri}`}>
              <strong>{artifact.kind}</strong>
              <div className="muted mono">{artifact.uri}</div>
            </div>
          ))
        ) : (
          <p className="muted">No artifacts published yet.</p>
        )}
      </div>
    </section>
  );
}

