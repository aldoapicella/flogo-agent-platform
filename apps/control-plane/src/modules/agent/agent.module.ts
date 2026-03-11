import { Global, Module } from "@nestjs/common";

import { OrchestratorClientService } from "./orchestrator-client.service.js";
import { OrchestrationService } from "./orchestration.service.js";
import { TaskStoreService } from "./task-store.service.js";

@Global()
@Module({
  providers: [OrchestratorClientService, OrchestrationService, TaskStoreService],
  exports: [OrchestratorClientService, OrchestrationService, TaskStoreService]
})
export class AgentModule {}
