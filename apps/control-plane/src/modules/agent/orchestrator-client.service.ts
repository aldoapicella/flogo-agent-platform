import { Injectable } from "@nestjs/common";

import {
  type ApprovalDecision,
  OrchestratorApprovalSignalSchema,
  type OrchestratorStartRequest,
  OrchestratorStartRequestSchema,
  type OrchestratorStartResponse,
  OrchestratorStartResponseSchema,
  type OrchestratorStatus,
  OrchestratorStatusSchema
} from "@flogo-agent/contracts";

@Injectable()
export class OrchestratorClientService {
  private readonly baseUrl = process.env.ORCHESTRATOR_BASE_URL?.replace(/\/$/, "");
  private readonly internalServiceToken = process.env.INTERNAL_SERVICE_TOKEN;
  private readonly localStates = new Map<string, OrchestratorStatus>();

  private buildHeaders(): Record<string, string> {
    return this.internalServiceToken
      ? {
          "x-internal-service-token": this.internalServiceToken
        }
      : {};
  }

  async startWorkflow(payload: OrchestratorStartRequest): Promise<OrchestratorStartResponse> {
    const request = OrchestratorStartRequestSchema.parse(payload);

    if (!this.baseUrl) {
      const orchestrationId = `local-${request.taskId}`;
      this.localStates.set(
        orchestrationId,
        OrchestratorStatusSchema.parse({
          orchestrationId,
          taskId: request.taskId,
          runtimeStatus: "running",
          approvalStatus: request.requiredApprovals.length > 0 ? "pending" : undefined,
          activeJobRuns: [],
          summary: request.requiredApprovals.length > 0 ? "Workflow waiting for approval" : "Workflow started",
          lastUpdatedAt: new Date().toISOString()
        })
      );

      return OrchestratorStartResponseSchema.parse({
        orchestrationId,
        status: request.requiredApprovals.length > 0 ? "pending" : "running",
        activeJobRuns: [],
        summary: request.requiredApprovals.length > 0 ? "Workflow waiting for approval" : "Workflow started"
      });
    }

    const response = await fetch(`${this.baseUrl}/orchestrations/tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.buildHeaders()
      },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`Failed to start workflow: ${response.status}`);
    }

    return OrchestratorStartResponseSchema.parse(await response.json());
  }

  async signalApproval(orchestrationId: string, decision: ApprovalDecision): Promise<OrchestratorStatus | undefined> {
    const signal = OrchestratorApprovalSignalSchema.parse(decision);

    if (!this.baseUrl) {
      const current = this.localStates.get(orchestrationId);
      if (!current) {
        return undefined;
      }

      const next = OrchestratorStatusSchema.parse({
        ...current,
        runtimeStatus: signal.status === "approved" ? "running" : "terminated",
        approvalStatus: signal.status,
        summary: signal.status === "approved" ? "Approval recorded; workflow resumed" : "Approval rejected; workflow stopped",
        lastUpdatedAt: new Date().toISOString()
      });
      this.localStates.set(orchestrationId, next);
      return next;
    }

    const response = await fetch(`${this.baseUrl}/orchestrations/${orchestrationId}/approvals`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...this.buildHeaders()
      },
      body: JSON.stringify(signal)
    });

    if (!response.ok) {
      throw new Error(`Failed to signal approval: ${response.status}`);
    }

    return this.getStatus(orchestrationId);
  }

  async getStatus(orchestrationId: string): Promise<OrchestratorStatus | undefined> {
    if (!this.baseUrl) {
      return this.localStates.get(orchestrationId);
    }

    const response = await fetch(`${this.baseUrl}/orchestrations/${orchestrationId}`, {
      headers: this.buildHeaders()
    });
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch orchestration status: ${response.status}`);
    }

    return OrchestratorStatusSchema.parse(await response.json());
  }
}
