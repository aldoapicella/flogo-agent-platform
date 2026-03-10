"use client";

import { useEffect, useState } from "react";
import type { ProgressEvent } from "@flogo-agent/contracts";

export function EventStreamPanel({ taskId }: { taskId: string }) {
  const [events, setEvents] = useState<ProgressEvent[]>([]);

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
    const source = new EventSource(`${baseUrl}/v1/tasks/${taskId}/stream`);

    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as ProgressEvent;
        if (parsed.id) {
          setEvents((current) => [parsed, ...current].slice(0, 20));
        }
      } catch {
        // Ignore heartbeats and connection frames.
      }
    };

    return () => {
      source.close();
    };
  }, [taskId]);

  return (
    <section className="card">
      <h2>Event stream</h2>
      <div className="list">
        {events.length ? (
          events.map((event) => (
            <div key={event.id}>
              <strong>{event.type}</strong>
              <div className="muted mono">{event.timestamp}</div>
            </div>
          ))
        ) : (
          <p className="muted">Waiting for events.</p>
        )}
      </div>
    </section>
  );
}

