"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitTask } from "../lib/api";

export function TaskSubmissionForm() {
  const router = useRouter();
  const [type, setType] = useState("create");
  const [projectId, setProjectId] = useState("sample-project");
  const [appPath, setAppPath] = useState("examples/hello-rest/flogo.json");
  const [prompt, setPrompt] = useState("Create or update a REST Flogo app for customer lookup.");
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  return (
    <section className="card">
      <h2>Submit Task</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError(undefined);
          startTransition(async () => {
            try {
              const task = await submitTask({
                type,
                projectId,
                appPath,
                prompt,
                constraints: {
                  allowDependencyChanges: false,
                  allowCustomCode: false,
                  targetEnv: "dev"
                }
              });
              router.push(`/tasks/${task.id}`);
            } catch (submissionError) {
              setError(submissionError instanceof Error ? submissionError.message : "Task submission failed.");
            }
          });
        }}
      >
        <label>
          Workflow
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="debug">Debug</option>
            <option value="review">Review</option>
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
          Prompt
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <button type="submit" disabled={isPending}>
          {isPending ? "Submitting..." : "Create task"}
        </button>
        {error ? <div className="muted">{error}</div> : null}
      </form>
    </section>
  );
}

