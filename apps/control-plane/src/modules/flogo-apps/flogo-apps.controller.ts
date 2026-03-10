import { Controller, Get, Param } from "@nestjs/common";
import { FlogoAppsService } from "./flogo-apps.service";

@Controller("projects/:projectId/apps/:appId/graph")
export class FlogoAppsController {
  constructor(private readonly flogoAppsService: FlogoAppsService) {}

  @Get()
  getGraph(@Param("projectId") projectId: string, @Param("appId") appId: string) {
    return this.flogoAppsService.getGraph(projectId, appId);
  }
}

