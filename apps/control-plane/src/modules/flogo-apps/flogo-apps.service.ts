import { Injectable, NotFoundException } from "@nestjs/common";
import path from "node:path";
import { type FlogoAppGraph } from "@flogo-agent/contracts";
import { ToolsService } from "../tools/tools.service";

interface RegisteredApp {
  projectId: string;
  appId: string;
  appPath: string;
  graph?: FlogoAppGraph;
  updatedAt: string;
}

@Injectable()
export class FlogoAppsService {
  private readonly apps = new Map<string, RegisteredApp>();

  constructor(private readonly toolsService: ToolsService) {}

  private key(projectId: string, appId: string) {
    return `${projectId}:${appId}`;
  }

  async register(projectId: string, appPath: string, appId?: string) {
    const derivedAppId = appId ?? path.basename(appPath, path.extname(appPath));
    const graph = await this.toolsService.parseGraph(appPath);
    this.apps.set(this.key(projectId, derivedAppId), {
      projectId,
      appId: derivedAppId,
      appPath,
      graph,
      updatedAt: new Date().toISOString()
    });
    return derivedAppId;
  }

  async getGraph(projectId: string, appId: string): Promise<FlogoAppGraph> {
    const registered = this.apps.get(this.key(projectId, appId));
    if (!registered) {
      throw new NotFoundException(`App ${appId} is not registered for project ${projectId}.`);
    }

    const graph = await this.toolsService.parseGraph(registered.appPath);
    if (graph) {
      registered.graph = graph;
      registered.updatedAt = new Date().toISOString();
      return graph;
    }

    if (!registered.graph) {
      throw new NotFoundException(`App graph is unavailable for ${appId}.`);
    }

    return registered.graph;
  }
}

