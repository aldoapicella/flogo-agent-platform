import { ApprovalCard } from "../../../components/approval-card";
import { ArtifactList } from "../../../components/artifact-list";
import { EventStreamPanel } from "../../../components/event-stream-panel";
import { TaskStatusCard } from "../../../components/task-status-card";
import { getTask, listArtifacts, submitApproval } from "../../../lib/api";

export default async function TaskDetailPage({
  params
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;
  const [task, artifacts] = await Promise.all([getTask(taskId), listArtifacts(taskId)]);

  return (
    <main className="shell">
      <section className="hero">
        <div className="badge">Task detail</div>
        <h1 className="mono">{taskId}</h1>
        <p className="muted">{task.prompt}</p>
      </section>
      <div className="grid two">
        <TaskStatusCard task={task} />
        <ApprovalCard
          approval={task.approval}
          taskId={taskId}
          onDecision={(decision) => submitApproval(taskId, decision)}
        />
      </div>
      <div className="grid two">
        <ArtifactList artifacts={artifacts} />
        <EventStreamPanel taskId={taskId} />
      </div>
    </main>
  );
}
