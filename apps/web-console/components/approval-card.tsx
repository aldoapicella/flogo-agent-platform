"use client";

import { useState } from "react";
import type { ApprovalDecision, ApprovalRequest, TaskRecord } from "@flogo-agent/contracts";

interface ApprovalCardProps {
  approval?: ApprovalRequest;
  taskId: string;
  onDecision(decision: ApprovalDecision): Promise<void>;
}

export function ApprovalCard({ approval, taskId, onDecision }: ApprovalCardProps) {
  const [loading, setLoading] = useState(false);

  if (!approval) {
    return null;
  }

  return (
    <section className="card">
      <div className="badge">Approval Required</div>
      <h2>{approval.type}</h2>
      <p className="muted">{approval.rationale}</p>
      <p className="mono">{taskId}</p>
      <div className="actions">
        <button
          className="primary"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            await onDecision({ status: "approved" });
            setLoading(false);
          }}
        >
          Approve
        </button>
        <button
          className="secondary"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            await onDecision({ status: "rejected", rationale: "Rejected from UI" });
            setLoading(false);
          }}
        >
          Reject
        </button>
      </div>
    </section>
  );
}

