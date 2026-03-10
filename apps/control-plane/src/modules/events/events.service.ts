import { Injectable } from "@nestjs/common";
import type { ProgressEvent } from "@flogo-agent/contracts";
import { Subject, filter, map, merge, of, timer } from "rxjs";

@Injectable()
export class EventsService {
  private readonly stream = new Subject<ProgressEvent>();

  publish(event: ProgressEvent) {
    this.stream.next(event);
  }

  streamForTask(taskId: string) {
    const heartbeat = timer(0, 15000).pipe(
      map(() => ({
        data: {
          taskId,
          heartbeat: true
        }
      }))
    );

    const events = this.stream.pipe(
      filter((event) => event.taskId === taskId),
      map((event) => ({
        data: event
      }))
    );

    return merge(of({ data: { taskId, connected: true } }), heartbeat, events);
  }
}

