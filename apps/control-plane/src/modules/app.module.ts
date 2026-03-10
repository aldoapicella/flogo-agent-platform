import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./health/health.module";
import { EventsModule } from "./events/events.module";
import { QueueModule } from "./queue/queue.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AgentModule } from "./agent/agent.module";
import { ToolsModule } from "./tools/tools.module";
import { PromptsModule } from "./prompts/prompts.module";
import { TasksModule } from "./tasks/tasks.module";
import { ApprovalsModule } from "./approvals/approvals.module";
import { ArtifactsModule } from "./artifacts/artifacts.module";
import { FlogoAppsModule } from "./flogo-apps/flogo-apps.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    HealthModule,
    EventsModule,
    QueueModule,
    PrismaModule,
    AgentModule,
    ToolsModule,
    PromptsModule,
    TasksModule,
    ApprovalsModule,
    ArtifactsModule,
    FlogoAppsModule
  ]
})
export class AppModule {}

