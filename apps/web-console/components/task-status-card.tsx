import type { TaskRecord } from "@flogo-agent/contracts";

export function TaskStatusCard({ task }: { task: TaskRecord }) {
  return (
    <section className="card">
      <div className="badge">{task.status}</div>
      <h2>{task.type.toUpperCase()} task</h2>
      <p className="muted">{task.planSummary ?? "Waiting for planning output."}</p>
      <div className="grid two">
        <div>
          <strong>Project</strong>
          <p className="muted mono">{task.projectId}</p>
        </div>
        <div>
          <strong>App path</strong>
          <p className="muted mono">{task.appPath}</p>
        </div>
      </div>
    </section>
  );
}

