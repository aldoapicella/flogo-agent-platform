import { Injectable, NotFoundException } from "@nestjs/common";
import { type ApprovalDecision, type ApprovalRequest } from "@flogo-agent/contracts";
import { EventStreamService } from "../events/event-stream.service";

interface ApprovalRecord {
  request: ApprovalRequest;
  status: "pending" | "approved" | "rejected";
  decidedAt?: string;
  rationale?: string;
}

@Injectable()
export class ApprovalsService {
  private readonly approvals = new Map<string, ApprovalRecord[]>();

  constructor(private readonly events: EventStreamService) {}

  initialize(taskId: string, approvalRequests: ApprovalRequest[]) {
    if (approvalRequests.length === 0) {
      return;
    }

    this.approvals.set(
      taskId,
      approvalRequests.map((request) => ({
        request,
        status: "pending"
      }))
    );
    this.events.publish(taskId, "task.approval", {
      approvalStatus: "pending",
      approvals: approvalRequests
    });
  }

  status(taskId: string): "pending" | "approved" | "rejected" | undefined {
    const approvals = this.approvals.get(taskId);
    if (!approvals || approvals.length === 0) {
      return undefined;
    }
    if (approvals.some((item) => item.status === "rejected")) {
      return "rejected";
    }
    if (approvals.every((item) => item.status === "approved")) {
      return "approved";
    }
    return "pending";
  }

  list(taskId: string): ApprovalRecord[] {
    return this.approvals.get(taskId) ?? [];
  }

  decide(taskId: string, decision: ApprovalDecision): ApprovalRecord[] {
    const approvals = this.approvals.get(taskId);
    if (!approvals || approvals.length === 0) {
      throw new NotFoundException(`Task ${taskId} has no pending approvals.`);
    }

    const next = approvals.map((approval) =>
      approval.status === "pending"
        ? {
            ...approval,
            status: decision.status,
            rationale: decision.rationale,
            decidedAt: new Date().toISOString()
          }
        : approval
    );

    this.approvals.set(taskId, next);
    this.events.publish(taskId, "task.approval", {
      approvalStatus: this.status(taskId),
      rationale: decision.rationale
    });
    return next;
  }
}

