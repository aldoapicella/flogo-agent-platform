import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module";
import { EventsModule } from "./modules/events/events.module";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { QueueModule } from "./modules/queue/queue.module";
import { ToolsModule } from "./modules/tools/tools.module";
import { PromptsModule } from "./modules/prompts/prompts.module";
import { AgentModule } from "./modules/agent/agent.module";
import { ArtifactsModule } from "./modules/artifacts/artifacts.module";
import { FlogoAppsModule } from "./modules/flogo-apps/flogo-apps.module";
import { ApprovalsModule } from "./modules/approvals/approvals.module";
import { TasksModule } from "./modules/tasks/tasks.module";

@Module({
  imports: [
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

