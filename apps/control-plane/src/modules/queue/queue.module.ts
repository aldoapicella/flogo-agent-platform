import { Global, Module } from "@nestjs/common";

import { RunnerQueueService } from "./runner-queue.service.js";

@Global()
@Module({
  providers: [RunnerQueueService],
  exports: [RunnerQueueService]
})
export class QueueModule {}

