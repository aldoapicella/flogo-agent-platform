import { Body, Controller, Get, NotFoundException, Param, Post, Query } from "@nestjs/common";

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

  @Get(":appId/inventory")
  async getInventory(@Param("projectId") projectId: string, @Param("appId") appId: string) {
    const inventory = await this.flogoAppsService.getInventory(projectId, appId);
    if (!inventory) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return inventory;
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

  @Get(":appId/descriptors")
  async getDescriptor(
    @Param("projectId") projectId: string,
    @Param("appId") appId: string,
    @Query("ref") ref: string
  ) {
    const descriptor = await this.flogoAppsService.getDescriptor(projectId, appId, ref);
    if (!descriptor) {
      throw new NotFoundException(`Unknown descriptor ${ref} for app ${appId}`);
    }
    return descriptor;
  }

  @Get(":appId/governance")
  async getGovernance(@Param("projectId") projectId: string, @Param("appId") appId: string) {
    const governance = await this.flogoAppsService.getGovernance(projectId, appId);
    if (!governance) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return governance;
  }

  @Post(":appId/mappings/preview")
  async previewMapping(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    const preview = await this.flogoAppsService.previewMapping(projectId, appId, body);
    if (!preview) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return preview;
  }

  @Post(":appId/composition/compare")
  async compareComposition(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    const comparison = await this.flogoAppsService.compareComposition(projectId, appId, body);
    if (!comparison) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return comparison;
  }
}
