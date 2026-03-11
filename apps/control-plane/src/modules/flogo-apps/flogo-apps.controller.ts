import { Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";

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

  @Get(":appId/catalog")
  async getCatalog(@Param("appId") appId: string) {
    const catalog = await this.flogoAppsService.getCatalog(appId);
    if (!catalog) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return catalog;
  }

  @Post(":appId/mappings/preview")
  async previewMapping(@Param("appId") appId: string, @Body() body: unknown) {
    const preview = await this.flogoAppsService.previewMapping(appId, body);
    if (!preview) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return preview;
  }
}
