import { type TaskResult } from "@flogo-agent/contracts";

export function StatusCard({ task }: { task: TaskResult | null }) {
  if (!task) {
    return (
      <div className="card">
        <h3>Task status</h3>
        <p className="meta">Task not found or API unavailable.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="pill">{task.status}</div>
      <h3>{task.summary}</h3>
      <p className="meta">Type: {task.type}</p>
      <p className="meta">Approvals: {task.requiredApprovals.join(", ") || "none"}</p>
      <div className="list">
        {task.nextActions.map((action) => (
          <div key={action}>{action}</div>
        ))}
      </div>
    </div>
  );
}

