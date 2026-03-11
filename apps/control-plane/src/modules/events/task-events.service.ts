import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";

import { type TaskEvent } from "@flogo-agent/contracts";

@Injectable()
export class TaskEventsService {
  private readonly streams = new Map<string, Subject<TaskEvent>>();

  stream(taskId: string): Observable<TaskEvent> {
    if (!this.streams.has(taskId)) {
      this.streams.set(taskId, new Subject<TaskEvent>());
    }
    return this.streams.get(taskId)!.asObservable();
  }

  emit(event: TaskEvent): TaskEvent {
    const taskId = event.taskId;
    if (!this.streams.has(taskId)) {
      this.streams.set(taskId, new Subject<TaskEvent>());
    }

    this.streams.get(taskId)!.next(event);

    return event;
  }
}
