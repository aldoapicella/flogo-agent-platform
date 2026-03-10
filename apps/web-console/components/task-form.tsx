"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskRequest, TaskType } from "@flogo-agent/contracts";

const defaultRequest: TaskRequest = {
  type: "create",
  projectId: "demo-project",
  appPath: "examples/hello-rest/flogo.json",
  prompt: "Create a REST endpoint that says hello.",
  requestedBy: "operator",
  constraints: {
    allowDependencyChanges: false,
    allowCustomCode: false,
    targetEnv: "dev"
  },
  expectedOutputs: [],
  metadata: {}
};

export function TaskForm() {
  const [form, setForm] = useState(defaultRequest);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  return (
    <section className="card">
      <h2>Submit task</h2>
      <div className="grid">
        <label className="field">
          <span>Workflow</span>
          <select
            value={form.type}
            onChange={(event) =>
              setForm((current) => ({ ...current, type: event.target.value as TaskType }))
            }
          >
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="debug">Debug</option>
            <option value="review">Review</option>
          </select>
        </label>
        <label className="field">
          <span>Project ID</span>
          <input
            value={form.projectId}
            onChange={(event) => setForm((current) => ({ ...current, projectId: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>App path</span>
          <input
            value={form.appPath}
            onChange={(event) => setForm((current) => ({ ...current, appPath: event.target.value }))}
          />
        </label>
        <label className="field">
          <span>Prompt</span>
          <textarea
            value={form.prompt}
            onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))}
          />
        </label>
        <div className="actions">
          <button
            className="primary"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
              const response = await fetch(`${baseUrl}/v1/tasks`, {
                method: "POST",
                headers: {
                  "content-type": "application/json"
                },
                body: JSON.stringify(form)
              });
              const task = (await response.json()) as { id: string };
              setLoading(false);
              router.push(`/tasks/${task.id}`);
            }}
          >
            {loading ? "Submitting..." : "Create task"}
          </button>
        </div>
      </div>
    </section>
  );
}

