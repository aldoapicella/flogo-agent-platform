import { Controller, Get, NotFoundException, Param } from "@nestjs/common";

import { FlogoAppsService } from "./flogo-apps.service.js";

@Controller("projects/:projectId/apps")
export class FlogoAppsController {
  constructor(private readonly flogoAppsService: FlogoAppsService) {}

  @Get(":appId/graph")
  async getGraph(@Param("appId") appId: string) {
    const graph = await this.flogoAppsService.getGraph(appId);
    if (!graph) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return graph;
  }
}

