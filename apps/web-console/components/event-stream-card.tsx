export function EventStreamCard({ taskId }: { taskId: string }) {
  return (
    <div className="card">
      <h3>Event stream</h3>
      <p className="meta">
        Subscribe to <code>/v1/tasks/{taskId}/events</code> from the control-plane for live status, log, artifact, and
        approval events.
      </p>
    </div>
  );
}
