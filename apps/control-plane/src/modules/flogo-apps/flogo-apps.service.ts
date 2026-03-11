import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  ArtifactRefSchema,
  ContribCatalogResponseSchema,
  MappingPreviewRequestSchema,
  MappingPreviewResponseSchema
} from "@flogo-agent/contracts";
import {
  analyzePropertyUsage,
  buildAppGraph,
  buildContribCatalog,
  parseFlogoAppDocument,
  previewMapping,
  suggestCoercions
} from "@flogo-agent/flogo-graph";

import { PrismaService } from "../prisma/prisma.service.js";

const defaultOrganizationId = process.env.DEFAULT_ORGANIZATION_ID ?? "local-organization";
const defaultOrganizationName = process.env.DEFAULT_ORGANIZATION_NAME ?? "Local Organization";
const appAnalysisRequestedBy = "system:app-analysis";

type DbArtifact = {
  id: string;
  kind: string;
  name: string;
  uri: string;
  metadata?: unknown;
};

type ResolvedApp = {
  projectId: string;
  requestedAppId: string;
  recordId?: string;
  appPath: string;
  sourceType: "db" | "example";
  content: string;
};

@Injectable()
export class FlogoAppsService {
  constructor(private readonly prisma?: PrismaService) {}

  async getGraph(projectId: string, appId: string) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    return buildAppGraph(resolved.content);
  }

  async getCatalog(projectId: string, appId: string) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const catalog = buildContribCatalog(resolved.content);
    const artifact = await this.persistArtifact(
      resolved,
      "contrib_catalog",
      `${appId}-contrib-catalog.json`,
      {
        analysisType: "catalog",
        appId,
        sourceType: resolved.sourceType
      },
      {
        catalog
      }
    );

    return ContribCatalogResponseSchema.parse({
      catalog,
      artifact
    });
  }

  async listArtifacts(projectId: string, appId: string) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    if (!this.prisma || !resolved.recordId) {
      return [];
    }

    const prisma = this.prisma as any;
    const artifacts = (await prisma.artifact.findMany({
      where: {
        task: {
          flogoAppId: resolved.recordId,
          requestedBy: appAnalysisRequestedBy
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    })) as DbArtifact[];

    return artifacts.map((artifact) =>
      ArtifactRefSchema.parse({
        id: artifact.id,
        type: artifact.kind,
        name: artifact.name,
        uri: artifact.uri,
        metadata:
          artifact.metadata && typeof artifact.metadata === "object"
            ? (artifact.metadata as Record<string, unknown>)
            : undefined
      })
    );
  }

  async previewMapping(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = MappingPreviewRequestSchema.parse(payload);
    const preview = previewMapping(resolved.content, request.nodeId, request.sampleInput);
    const propertyPlan = analyzePropertyUsage(resolved.content);
    const coercionSuggestions = suggestCoercions(resolved.content, request.sampleInput).filter((diagnostic) =>
      diagnostic.path?.startsWith(request.nodeId)
    );
    const artifact = await this.persistArtifact(
      resolved,
      "mapping_preview",
      `${appId}-${request.nodeId}-mapping-preview.json`,
      {
        analysisType: "mapping_preview",
        appId,
        nodeId: request.nodeId,
        sourceType: resolved.sourceType
      },
      {
        preview: {
          ...preview,
          suggestedCoercions: coercionSuggestions
        },
        propertyPlan
      }
    );

    return MappingPreviewResponseSchema.parse({
      preview: {
        ...preview,
        suggestedCoercions: coercionSuggestions
      },
      propertyPlan,
      artifact
    });
  }

  private async resolveApp(projectId: string, appId: string): Promise<ResolvedApp | undefined> {
    const candidatePath = path.join(process.cwd(), "examples", appId, "flogo.json");

    if (this.prisma) {
      const prisma = this.prisma as any;
      const stored = (await prisma.flogoApp.findFirst({
        where: {
          projectId,
          OR: [{ id: appId }, { appName: appId }]
        }
      })) as { id: string; appPath: string } | null;

      if (stored) {
        try {
          const content = await fs.readFile(stored.appPath, "utf8");
          return {
            projectId,
            requestedAppId: appId,
            recordId: stored.id,
            appPath: stored.appPath,
            sourceType: "db",
            content
          };
        } catch {
          // Fall back to example discovery below.
        }
      }
    }

    try {
      const content = await fs.readFile(candidatePath, "utf8");
      const app = parseFlogoAppDocument(content);
      const recordId = await this.ensureAppRecord(projectId, appId, candidatePath, app);
      return {
        projectId,
        requestedAppId: appId,
        recordId,
        appPath: candidatePath,
        sourceType: "example",
        content
      };
    } catch {
      return undefined;
    }
  }

  private async ensureAppRecord(projectId: string, appId: string, appPath: string, app: ReturnType<typeof parseFlogoAppDocument>) {
    if (!this.prisma) {
      return undefined;
    }

    const prisma = this.prisma as any;
    await prisma.organization.upsert({
      where: {
        id: defaultOrganizationId
      },
      update: {
        name: defaultOrganizationName
      },
      create: {
        id: defaultOrganizationId,
        name: defaultOrganizationName
      }
    });

    await prisma.project.upsert({
      where: {
        id: projectId
      },
      update: {
        name: projectId,
        repoUrl: `local://projects/${projectId}`,
        defaultBranch: "main"
      },
      create: {
        id: projectId,
        organizationId: defaultOrganizationId,
        name: projectId,
        repoUrl: `local://projects/${projectId}`,
        defaultBranch: "main"
      }
    });

    const stableId = this.buildStableAppId(projectId, appId);
    await prisma.flogoApp.upsert({
      where: {
        id: stableId
      },
      update: {
        appName: app.name,
        appPath,
        appType: app.type,
        appModel: app.appModel
      },
      create: {
        id: stableId,
        projectId,
        appName: app.name,
        appPath,
        appType: app.type,
        appModel: app.appModel
      }
    });

    return stableId;
  }

  private async persistArtifact(
    resolved: ResolvedApp,
    type: "contrib_catalog" | "mapping_preview",
    name: string,
    metadata: Record<string, unknown>,
    payload: Record<string, unknown>
  ) {
    if (!this.prisma) {
      return ArtifactRefSchema.parse({
        id: `${type}-${resolved.requestedAppId}-${randomUUID()}`,
        type,
        name,
        uri: `memory://apps/${resolved.requestedAppId}/${type}/${randomUUID()}`,
        metadata
      });
    }

    const prisma = this.prisma as any;
    const taskId = randomUUID();
    const artifactId = randomUUID();
    const summary = `${type} analysis for ${resolved.requestedAppId}`;
    await prisma.task.create({
      data: {
        id: taskId,
        projectId: resolved.projectId,
        flogoAppId: resolved.recordId,
        type: "review",
        status: "completed",
        requestedBy: appAnalysisRequestedBy,
        prompt: summary,
        summary,
        appPath: resolved.appPath,
        inputPayload: {
          mode: "app_analysis",
          type,
          appId: resolved.requestedAppId,
          sourceType: resolved.sourceType
        },
        planSummary: "Persisted app-scoped analysis artifact",
        activeJobRuns: [],
        requiredApprovals: [],
        nextActions: []
      }
    });

    const artifact = ArtifactRefSchema.parse({
      id: artifactId,
      type,
      name,
      uri: `artifact://apps/${resolved.recordId ?? resolved.requestedAppId}/${artifactId}`,
      metadata: {
        ...metadata,
        payload
      }
    });

    await prisma.artifact.create({
      data: {
        id: artifact.id,
        taskId,
        kind: artifact.type,
        name: artifact.name,
        uri: artifact.uri,
        metadata: artifact.metadata
      }
    });

    return artifact;
  }

  private buildStableAppId(projectId: string, appId: string): string {
    const normalized = `${projectId}-${appId}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    return `flogo-app-${normalized}`.slice(0, 120);
  }
}
