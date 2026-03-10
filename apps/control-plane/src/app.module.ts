import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AgentModule } from "./modules/agent/agent.module.js";
import { ApprovalsModule } from "./modules/approvals/approvals.module.js";
import { ArtifactsModule } from "./modules/artifacts/artifacts.module.js";
import { EventsModule } from "./modules/events/events.module.js";
import { FlogoAppsModule } from "./modules/flogo-apps/flogo-apps.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { PrismaModule } from "./modules/prisma/prisma.module.js";
import { PromptsModule } from "./modules/prompts/prompts.module.js";
import { QueueModule } from "./modules/queue/queue.module.js";
import { TasksModule } from "./modules/tasks/tasks.module.js";
import { ToolsModule } from "./modules/tools/tools.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        () => ({
          port: Number(process.env.PORT ?? process.env.CONTROL_PLANE_PORT ?? 3000),
          redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
          workspaceRoot: process.cwd()
        })
      ]
    }),
    HealthModule,
    EventsModule,
    PrismaModule,
    QueueModule,
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
