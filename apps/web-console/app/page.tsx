import Link from "next/link";

import { TaskForm } from "../components/task-form";

export default function HomePage() {
  return (
    <main className="page">
      <section className="hero">
        <div className="pill">Foundation-first MVP</div>
        <h1>Flogo Agent Platform</h1>
        <p>
          Create, update, debug, and review Flogo apps through a shared control-plane, runner-worker, and evaluation
          pipeline.
        </p>
      </section>

      <section className="grid">
        <div className="card">
          <h2>Submit task</h2>
          <TaskForm />
        </div>
        <div className="card">
          <h2>Operator notes</h2>
          <p className="meta">
            The control-plane exposes REST, SSE, and artifact endpoints. The orchestrator owns long-running workflow
            state, and the runner-worker normalizes finite build, run, and smoke-test job runs.
          </p>
          <div className="list">
            <Link href="/tasks/example-task">Open task detail shell</Link>
            <Link href="http://localhost:3001/docs">Open control-plane docs</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
