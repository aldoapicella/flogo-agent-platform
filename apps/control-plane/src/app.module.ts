import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AgentModule } from "./modules/agent/agent.module.js";
import { ApprovalsModule } from "./modules/approvals/approvals.module.js";
import { ArtifactsModule } from "./modules/artifacts/artifacts.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { EventsModule } from "./modules/events/events.module.js";
import { FlogoAppsModule } from "./modules/flogo-apps/flogo-apps.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { PrismaModule } from "./modules/prisma/prisma.module.js";
import { PromptsModule } from "./modules/prompts/prompts.module.js";
import { TasksModule } from "./modules/tasks/tasks.module.js";
import { ToolsModule } from "./modules/tools/tools.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => ({
          port: Number(process.env.PORT ?? process.env.CONTROL_PLANE_PORT ?? 3000),
          orchestratorBaseUrl: process.env.ORCHESTRATOR_BASE_URL ?? "http://localhost:7071/api",
          workspaceRoot: process.cwd(),
          internalServiceToken: process.env.INTERNAL_SERVICE_TOKEN,
          durableBackendProvider: process.env.DURABLE_BACKEND_PROVIDER ?? "azure_storage"
        })
      ]
    }),
    AuthModule,
    HealthModule,
    EventsModule,
    PrismaModule,
    ToolsModule,
    PromptsModule,
    AgentModule,
    ArtifactsModule,
    FlogoAppsModule,
    ApprovalsModule,
    TasksModule
  ]
})
export class AppModule {}
