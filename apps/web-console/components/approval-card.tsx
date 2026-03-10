import { type TaskResult } from "@flogo-agent/contracts";

export function ApprovalCard({ task }: { task: TaskResult | null }) {
  return (
    <div className="card">
      <h3>Approval gates</h3>
      {task && task.requiredApprovals.length > 0 ? (
        <div className="list">
          {task.requiredApprovals.map((approval) => (
            <div key={approval} className="pill">
              {approval}
            </div>
          ))}
        </div>
      ) : (
        <p className="meta">No approvals are currently blocking this task.</p>
      )}
    </div>
  );
}

