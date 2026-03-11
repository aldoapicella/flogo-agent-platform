import { Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";

import { FlogoAppsService } from "./flogo-apps.service.js";

@Controller("projects/:projectId/apps")
export class FlogoAppsController {
  constructor(private readonly flogoAppsService: FlogoAppsService) {}

  @Get(":appId/graph")
  async getGraph(@Param("projectId") projectId: string, @Param("appId") appId: string) {
    const graph = await this.flogoAppsService.getGraph(projectId, appId);
    if (!graph) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return graph;
  }

  @Get(":appId/catalog")
  async getCatalog(@Param("projectId") projectId: string, @Param("appId") appId: string) {
    const catalog = await this.flogoAppsService.getCatalog(projectId, appId);
    if (!catalog) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return catalog;
  }

  @Get(":appId/artifacts")
  async listArtifacts(@Param("projectId") projectId: string, @Param("appId") appId: string) {
    const artifacts = await this.flogoAppsService.listArtifacts(projectId, appId);
    if (!artifacts) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return artifacts;
  }

  @Post(":appId/mappings/preview")
  async previewMapping(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    const preview = await this.flogoAppsService.previewMapping(projectId, appId, body);
    if (!preview) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return preview;
  }
}
