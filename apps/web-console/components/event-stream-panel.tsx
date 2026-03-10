"use client";

import { useEffect, useState } from "react";
import type { TaskEvent } from "@flogo-agent/contracts";
import { eventStreamUrl } from "../lib/api";

export function EventStreamPanel({ taskId }: { taskId: string }) {
  const [events, setEvents] = useState<TaskEvent[]>([]);

  useEffect(() => {
    const source = new EventSource(eventStreamUrl(taskId));
    source.onmessage = (event) => {
      setEvents((current) => [...current, JSON.parse(event.data) as TaskEvent]);
    };
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [taskId]);

  return (
    <section className="card stack">
      <h3>Event Stream</h3>
      <div className="eventLog list">
        {events.length === 0 ? (
          <div className="listItem muted">Waiting for task events.</div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="listItem">
              <strong>{event.type}</strong>
              <div className="muted">{event.timestamp}</div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(event.payload, null, 2)}</pre>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

