import { ApprovalCard } from "../../../components/approval-card";
import { ArtifactList } from "../../../components/artifact-list";
import { EventStreamCard } from "../../../components/event-stream-card";
import { StatusCard } from "../../../components/status-card";
import { getTask } from "../../../lib/api";

export default async function TaskDetailPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const task = await getTask(taskId);

  return (
    <main className="page">
      <section className="hero">
        <div className="pill">Task detail</div>
        <h1>{taskId}</h1>
        <p>Inspect current status, approvals, artifacts, and stream endpoint.</p>
      </section>

      <section className="grid">
        <StatusCard task={task} />
        <ApprovalCard task={task} />
        <ArtifactList artifacts={task?.artifacts ?? []} />
        <EventStreamCard taskId={taskId} />
      </section>
    </main>
  );
}
