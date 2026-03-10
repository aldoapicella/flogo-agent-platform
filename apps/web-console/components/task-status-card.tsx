import type { TaskSummary } from "@flogo-agent/contracts";

export function TaskStatusCard({ task }: { task: TaskSummary }) {
  return (
    <section className="card stack">
      <div className="pill">{task.state}</div>
      <h2>{task.appId}</h2>
      <p className="muted">{task.prompt}</p>
      <div className="list">
        <div className="listItem">
          <strong>Task</strong>
          <div>{task.id}</div>
        </div>
        <div className="listItem">
          <strong>Project</strong>
          <div>{task.projectId}</div>
        </div>
        <div className="listItem">
          <strong>Plan Summary</strong>
          <div>{task.planSummary ?? "No summary yet."}</div>
        </div>
      </div>
    </section>
  );
}

