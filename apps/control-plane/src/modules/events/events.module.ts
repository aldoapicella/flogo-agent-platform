import { Global, Module } from "@nestjs/common";

import { TaskEventsService } from "./task-events.service.js";

@Global()
@Module({
  providers: [TaskEventsService],
  exports: [TaskEventsService]
})
export class EventsModule {}

