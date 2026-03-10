import { Global, Module } from "@nestjs/common";

import { OrchestrationService } from "./orchestration.service.js";

@Global()
@Module({
  providers: [OrchestrationService],
  exports: [OrchestrationService]
})
export class AgentModule {}

