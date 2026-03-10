import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Observable, Subject } from "rxjs";

import { type TaskEvent, TaskEventSchema } from "@flogo-agent/contracts";

@Injectable()
export class TaskEventsService {
  private readonly streams = new Map<string, Subject<TaskEvent>>();
  private readonly history = new Map<string, TaskEvent[]>();

  stream(taskId: string): Observable<TaskEvent> {
    if (!this.streams.has(taskId)) {
      this.streams.set(taskId, new Subject<TaskEvent>());
    }
    return this.streams.get(taskId)!.asObservable();
  }

  list(taskId: string): TaskEvent[] {
    return this.history.get(taskId) ?? [];
  }

  publish(taskId: string, type: TaskEvent["type"], message: string, payload?: Record<string, unknown>): TaskEvent {
    const event = TaskEventSchema.parse({
      id: randomUUID(),
      taskId,
      type,
      message,
      timestamp: new Date().toISOString(),
      payload
    });

    if (!this.streams.has(taskId)) {
      this.streams.set(taskId, new Subject<TaskEvent>());
    }
    if (!this.history.has(taskId)) {
      this.history.set(taskId, []);
    }

    this.history.get(taskId)!.push(event);
    this.streams.get(taskId)!.next(event);

    return event;
  }
}

