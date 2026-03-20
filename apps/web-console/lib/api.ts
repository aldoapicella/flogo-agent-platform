import { type ArtifactRef, type TaskResult } from "@flogo-agent/contracts";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export async function createTask(input: Record<string, unknown>): Promise<TaskResult> {
  const response = await fetch(`${apiBaseUrl}/v1/tasks`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error(`Failed to create task: ${response.status}`);
  }

  return response.json();
}

export async function getTask(taskId: string): Promise<TaskResult | null> {
  try {
    const response = await fetch(`${apiBaseUrl}/v1/tasks/${taskId}`, {
      next: {
        revalidate: 0
      }
    });
    if (!response.ok) {
      return null;
    }
    return response.json();
  } catch {
    return null;
  }
}

export async function getTaskArtifacts(taskId: string): Promise<ArtifactRef[]> {
  try {
    const response = await fetch(`${apiBaseUrl}/v1/tasks/${taskId}/artifacts`, {
      next: {
        revalidate: 0
      }
    });
    if (!response.ok) {
      return [];
    }
    return response.json();
  } catch {
    return [];
  }
}
