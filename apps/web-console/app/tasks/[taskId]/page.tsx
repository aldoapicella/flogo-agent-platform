import { ApprovalCard } from "../../../components/approval-card";
import { ArtifactList } from "../../../components/artifact-list";
import { DiagnosisPanel } from "../../../components/diagnosis-panel";
import { EventStreamCard } from "../../../components/event-stream-card";
import { RuntimeEvidencePanel } from "../../../components/runtime-evidence-panel";
import { StatusCard } from "../../../components/status-card";
import { getTask, getTaskArtifacts } from "../../../lib/api";
import { parseDiagnosisArtifact, selectLatestDiagnosisArtifact } from "../../../lib/diagnosis";
import { parseRuntimeArtifact, selectLatestRuntimeArtifacts } from "../../../lib/runtime-evidence";

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const task = await getTask(taskId);
  const artifacts = task ? await getTaskArtifacts(taskId) : [];
  const taskArtifacts = artifacts.length > 0 ? artifacts : (task?.artifacts ?? []);
  const runtimeArtifacts = selectLatestRuntimeArtifacts(taskArtifacts)
    .map((artifact) => parseRuntimeArtifact(artifact))
    .filter((artifact): artifact is NonNullable<typeof artifact> => artifact !== null);
  const diagnosisArtifact = parseDiagnosisArtifact(selectLatestDiagnosisArtifact(taskArtifacts));

  return (
    <main className="page">
      <section className="hero">
        <div className="pill">Task detail</div>
        <h1>{taskId}</h1>
        <p>Inspect runtime evidence, approvals, artifacts, and stream status for the current agent task.</p>
      </section>

      <section className="grid">
        <StatusCard task={task} />
        <ApprovalCard task={task} />
        <EventStreamCard taskId={taskId} />
      </section>

      <section className="grid">
        <DiagnosisPanel diagnosis={diagnosisArtifact} />
      </section>

      <section className="grid">
        <RuntimeEvidencePanel artifacts={runtimeArtifacts} />
        <ArtifactList artifacts={taskArtifacts} />
      </section>
    </main>
  );
}
