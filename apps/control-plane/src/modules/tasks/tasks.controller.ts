import { Body, Controller, Get, Param, Post, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { EventStreamService } from "../events/event-stream.service";
import { TasksService } from "./tasks.service";

@Controller("tasks")
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly events: EventStreamService
  ) {}

  @Post()
  create(@Body() body: unknown) {
    return this.tasksService.create(body);
  }

  @Get(":taskId")
  get(@Param("taskId") taskId: string) {
    return this.tasksService.get(taskId);
  }

  @Get(":taskId/stream")
  async stream(@Param("taskId") taskId: string, @Res() reply: FastifyReply) {
    this.tasksService.get(taskId);

    reply.raw.writeHead(200, {
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream"
    });

    const send = (event: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    this.tasksService.getHistory(taskId).forEach(send);
    const unsubscribe = this.events.subscribe(taskId, send);
    reply.raw.write(": connected\n\n");

    reply.raw.on("close", () => {
      unsubscribe();
      reply.raw.end();
    });
  }
}

