import { type ArtifactRef } from "@flogo-agent/contracts";

export function ArtifactList({ artifacts }: { artifacts: ArtifactRef[] }) {
  return (
    <div className="card">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
