"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createTask } from "../lib/api";

export function TaskForm() {
  const [summary, setSummary] = useState("Create a REST hello world app");
  const [type, setType] = useState("create");
  const [projectId, setProjectId] = useState("demo-project");
  const [appPath, setAppPath] = useState("examples/hello-rest/flogo.json");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createTask({
        type,
        projectId,
        appPath,
        summary,
        requestedBy: "web-console"
      });
      router.push(`/tasks/${result.taskId}`);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Task submission failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <label>
        Task type
        <select value={type} onChange={(event) => setType(event.target.value)}>
          <option value="create">create</option>
          <option value="update">update</option>
          <option value="debug">debug</option>
          <option value="review">review</option>
        </select>
      </label>
      <label>
        Project ID
        <input value={projectId} onChange={(event) => setProjectId(event.target.value)} />
      </label>
      <label>
        App path
        <input value={appPath} onChange={(event) => setAppPath(event.target.value)} />
      </label>
      <label>
        Summary
        <textarea value={summary} onChange={(event) => setSummary(event.target.value)} />
      </label>
      <button className="button" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Submitting..." : "Create task"}
      </button>
      {error ? <div className="meta">{error}</div> : null}
    </form>
  );
}

