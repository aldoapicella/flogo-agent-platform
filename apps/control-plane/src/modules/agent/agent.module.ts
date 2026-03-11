import { Global, Module } from "@nestjs/common";

import { OrchestratorClientService } from "./orchestrator-client.service.js";
import { OrchestrationService } from "./orchestration.service.js";

@Global()
@Module({
  providers: [OrchestratorClientService, OrchestrationService],
  exports: [OrchestratorClientService, OrchestrationService]
})
export class AgentModule {}
