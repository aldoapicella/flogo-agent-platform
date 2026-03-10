import { Body, Controller, Get, MessageEvent, NotFoundException, Param, Post, Sse } from "@nestjs/common";
import { map, Observable } from "rxjs";

import { type TaskEvent } from "@flogo-agent/contracts";

import { OrchestrationService } from "../agent/orchestration.service.js";

@Controller("tasks")
export class TasksController {
  constructor(private readonly orchestrationService: OrchestrationService) {}

  @Post()
  async createTask(@Body() body: unknown) {
    const task = await this.orchestrationService.submitTask(body);
    return task.result;
  }

  @Get(":taskId")
  getTask(@Param("taskId") taskId: string) {
    const task = this.orchestrationService.getTask(taskId);
    if (!task) {
      throw new NotFoundException(`Unknown task ${taskId}`);
    }
    return task.result;
  }

  @Sse(":taskId/stream")
  streamTask(@Param("taskId") taskId: string): Observable<MessageEvent> {
    return this.orchestrationService.streamTask(taskId).pipe(
      map((event: TaskEvent) => ({
        data: event
      }))
    );
  }
}

