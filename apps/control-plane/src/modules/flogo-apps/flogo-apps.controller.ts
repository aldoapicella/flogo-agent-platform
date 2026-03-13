import { Body, ConflictException, Controller, Get, NotFoundException, Param, Post, Query, UnprocessableEntityException } from "@nestjs/common";

import { ControlFlowSynthesisError, ErrorPathTemplateError, ReplayError, RunComparisonError, RunTraceError, SubflowOperationError, TriggerBindingError } from "@flogo-agent/flogo-graph";

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

  @Get(":appId/flows/contracts")
  async getFlowContracts(
    @Param("projectId") projectId: string,
    @Param("appId") appId: string,
    @Query("flowId") flowId?: string
  ) {
    const contracts = await this.flogoAppsService.getFlowContracts(projectId, appId, flowId);
    if (!contracts) {
      throw new NotFoundException(flowId ? `Unknown flow ${flowId} for app ${appId}` : `Unknown app ${appId}`);
    }
    return contracts;
  }

  @Post(":appId/flows/trace")
  async traceFlow(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    try {
      const result = await this.flogoAppsService.traceFlow(projectId, appId, body);
      if (!result) {
        throw new NotFoundException(`Unknown app ${appId}`);
      }
      return result;
    } catch (error) {
      if (error instanceof RunTraceError) {
        if (error.status === 404) {
          throw new NotFoundException(error.message);
        }
        throw new UnprocessableEntityException({
          message: error.message,
          diagnostics: error.diagnostics
        });
      }
      throw error;
    }
  }

  @Post(":appId/flows/replay")
  async replayFlow(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    try {
      const result = await this.flogoAppsService.replayFlow(projectId, appId, body);
      if (!result) {
        throw new NotFoundException(`Unknown app ${appId}`);
      }
      return result;
    } catch (error) {
      if (error instanceof ReplayError) {
        if (error.status === 404) {
          throw new NotFoundException(error.message);
        }
        throw new UnprocessableEntityException({
          message: error.message,
          diagnostics: error.diagnostics
        });
      }
      throw error;
    }
  }

  @Post(":appId/flows/compare-runs")
  async compareRuns(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    try {
      const result = await this.flogoAppsService.compareRuns(projectId, appId, body);
      if (!result) {
        throw new NotFoundException(`Unknown app ${appId}`);
      }
      return result;
    } catch (error) {
      if (error instanceof RunComparisonError) {
        if (error.status === 404) {
          throw new NotFoundException(error.message);
        }
        throw new UnprocessableEntityException({
          message: error.message,
          diagnostics: error.diagnostics
        });
      }
      throw error;
    }
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

  @Get(":appId/contribs/evidence")
  async getContribEvidence(
    @Param("projectId") projectId: string,
    @Param("appId") appId: string,
    @Query("ref") ref: string
  ) {
    const evidence = await this.flogoAppsService.getContribEvidence(projectId, appId, ref);
    if (!evidence) {
      throw new NotFoundException(`Unknown contribution evidence target ${ref} for app ${appId}`);
    }
    return evidence;
  }

  @Get(":appId/governance")
  async getGovernance(@Param("projectId") projectId: string, @Param("appId") appId: string) {
    const governance = await this.flogoAppsService.getGovernance(projectId, appId);
    if (!governance) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return governance;
  }

  @Get(":appId/properties/plan")
  async getPropertyPlan(
    @Param("projectId") projectId: string,
    @Param("appId") appId: string,
    @Query("profile") profile?: string
  ) {
    const plan = await this.flogoAppsService.getPropertyPlan(projectId, appId, profile);
    if (!plan) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return plan;
  }

  @Post(":appId/mappings/preview")
  async previewMapping(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    const preview = await this.flogoAppsService.previewMapping(projectId, appId, body);
    if (!preview) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return preview;
  }

  @Post(":appId/mappings/test")
  async testMapping(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    const result = await this.flogoAppsService.testMapping(projectId, appId, body);
    if (!result) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return result;
  }

  @Post(":appId/composition/compare")
  async compareComposition(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    const comparison = await this.flogoAppsService.compareComposition(projectId, appId, body);
    if (!comparison) {
      throw new NotFoundException(`Unknown app ${appId}`);
    }
    return comparison;
  }

  @Post(":appId/triggers/bind")
  async bindTrigger(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    try {
      const result = await this.flogoAppsService.bindTrigger(projectId, appId, body);
      if (!result) {
        throw new NotFoundException(`Unknown app ${appId}`);
      }
      return result;
    } catch (error) {
      if (error instanceof TriggerBindingError) {
        if (error.status === 404) {
          throw new NotFoundException(error.message);
        }
        if (error.status === 409) {
          throw new ConflictException({
            message: error.message,
            diagnostics: error.diagnostics
          });
        }
        throw new UnprocessableEntityException({
          message: error.message,
          diagnostics: error.diagnostics
        });
      }
      throw error;
    }
  }

  @Post(":appId/flows/extract-subflow")
  async extractSubflow(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    try {
      const result = await this.flogoAppsService.extractSubflow(projectId, appId, body);
      if (!result) {
        throw new NotFoundException(`Unknown app ${appId}`);
      }
      return result;
    } catch (error) {
      if (error instanceof SubflowOperationError) {
        if (error.status === 404) {
          throw new NotFoundException(error.message);
        }
        if (error.status === 409) {
          throw new ConflictException({
            message: error.message,
            diagnostics: error.diagnostics
          });
        }
        throw new UnprocessableEntityException({
          message: error.message,
          diagnostics: error.diagnostics
        });
      }
      throw error;
    }
  }

  @Post(":appId/flows/inline-subflow")
  async inlineSubflow(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    try {
      const result = await this.flogoAppsService.inlineSubflow(projectId, appId, body);
      if (!result) {
        throw new NotFoundException(`Unknown app ${appId}`);
      }
      return result;
    } catch (error) {
      if (error instanceof SubflowOperationError) {
        if (error.status === 404) {
          throw new NotFoundException(error.message);
        }
        if (error.status === 409) {
          throw new ConflictException({
            message: error.message,
            diagnostics: error.diagnostics
          });
        }
        throw new UnprocessableEntityException({
          message: error.message,
          diagnostics: error.diagnostics
        });
      }
      throw error;
    }
  }

  @Post(":appId/flows/add-iterator")
  async addIterator(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    try {
      const result = await this.flogoAppsService.addIterator(projectId, appId, body);
      if (!result) {
        throw new NotFoundException(`Unknown app ${appId}`);
      }
      return result;
    } catch (error) {
      if (error instanceof ControlFlowSynthesisError) {
        if (error.status === 404) {
          throw new NotFoundException(error.message);
        }
        if (error.status === 409) {
          throw new ConflictException({
            message: error.message,
            diagnostics: error.diagnostics
          });
        }
        throw new UnprocessableEntityException({
          message: error.message,
          diagnostics: error.diagnostics
        });
      }
      throw error;
    }
  }

  @Post(":appId/flows/add-retry-policy")
  async addRetryPolicy(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    try {
      const result = await this.flogoAppsService.addRetryPolicy(projectId, appId, body);
      if (!result) {
        throw new NotFoundException(`Unknown app ${appId}`);
      }
      return result;
    } catch (error) {
      if (error instanceof ControlFlowSynthesisError) {
        if (error.status === 404) {
          throw new NotFoundException(error.message);
        }
        if (error.status === 409) {
          throw new ConflictException({
            message: error.message,
            diagnostics: error.diagnostics
          });
        }
        throw new UnprocessableEntityException({
          message: error.message,
          diagnostics: error.diagnostics
        });
      }
      throw error;
    }
  }

  @Post(":appId/flows/add-dowhile")
  async addDoWhile(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    try {
      const result = await this.flogoAppsService.addDoWhile(projectId, appId, body);
      if (!result) {
        throw new NotFoundException(`Unknown app ${appId}`);
      }
      return result;
    } catch (error) {
      if (error instanceof ControlFlowSynthesisError) {
        if (error.status === 404) {
          throw new NotFoundException(error.message);
        }
        if (error.status === 409) {
          throw new ConflictException({
            message: error.message,
            diagnostics: error.diagnostics
          });
        }
        throw new UnprocessableEntityException({
          message: error.message,
          diagnostics: error.diagnostics
        });
      }
      throw error;
    }
  }

  @Post(":appId/flows/add-error-path")
  async addErrorPath(@Param("projectId") projectId: string, @Param("appId") appId: string, @Body() body: unknown) {
    try {
      const result = await this.flogoAppsService.addErrorPath(projectId, appId, body);
      if (!result) {
        throw new NotFoundException(`Unknown app ${appId}`);
      }
      return result;
    } catch (error) {
      if (error instanceof ErrorPathTemplateError) {
        if (error.status === 404) {
          throw new NotFoundException(error.message);
        }
        if (error.status === 409) {
          throw new ConflictException({
            message: error.message,
            diagnostics: error.diagnostics
          });
        }
        throw new UnprocessableEntityException({
          message: error.message,
          diagnostics: error.diagnostics
        });
      }
      throw error;
    }
  }
}
