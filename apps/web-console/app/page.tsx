import { TaskForm } from "../components/task-form";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="badge">Foundation-first MVP</div>
        <h1>Flogo agent platform</h1>
        <p className="muted">
          Submit create, update, debug, and review workflows against `flogo.json`, then watch
          the control-plane queue build and smoke-test work for the runner.
        </p>
      </section>
      <div className="grid two">
        <TaskForm />
        <section className="card">
          <h2>Core flow</h2>
          <div className="list">
            <div>1. Validate request and register app path.</div>
            <div>2. Build a task plan and approval state.</div>
            <div>3. Queue build and smoke-test jobs in BullMQ.</div>
            <div>4. Stream live status, approvals, and artifacts.</div>
          </div>
        </section>
      </div>
    </main>
  );
}

