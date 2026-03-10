import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { TaskEventSchema, type TaskEvent } from "@flogo-agent/contracts";

type Listener = (event: TaskEvent) => void;

@Injectable()
export class EventStreamService {
  private readonly history = new Map<string, TaskEvent[]>();
  private readonly listeners = new Map<string, Set<Listener>>();

  publish(taskId: string, type: TaskEvent["type"], payload: Record<string, unknown>) {
    const event = TaskEventSchema.parse({
      id: randomUUID(),
      taskId,
      type,
      timestamp: new Date().toISOString(),
      payload
    });

    this.history.set(taskId, [...(this.history.get(taskId) ?? []), event]);
    this.listeners.get(taskId)?.forEach((listener) => listener(event));
    return event;
  }

  getHistory(taskId: string): TaskEvent[] {
    return this.history.get(taskId) ?? [];
  }

  subscribe(taskId: string, listener: Listener): () => void {
    const existing = this.listeners.get(taskId) ?? new Set<Listener>();
    existing.add(listener);
    this.listeners.set(taskId, existing);
    return () => {
      existing.delete(listener);
      if (existing.size === 0) {
        this.listeners.delete(taskId);
      }
    };
  }
}

