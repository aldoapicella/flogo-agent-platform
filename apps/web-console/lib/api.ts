import type { ApprovalDecision, ArtifactRef, TaskRecord } from "@flogo-agent/contracts";

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export async function getTask(taskId: string): Promise<TaskRecord> {
  const response = await fetch(`${baseUrl}/v1/tasks/${taskId}`, {
    cache: "no-store"
  });
  return response.json();
}

export async function listArtifacts(taskId: string): Promise<ArtifactRef[]> {
  const response = await fetch(`${baseUrl}/v1/tasks/${taskId}/artifacts`, {
    cache: "no-store"
  });
  return response.json();
}

export async function submitApproval(taskId: string, decision: ApprovalDecision) {
  await fetch(`${baseUrl}/v1/tasks/${taskId}/approvals`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(decision)
  });
}

