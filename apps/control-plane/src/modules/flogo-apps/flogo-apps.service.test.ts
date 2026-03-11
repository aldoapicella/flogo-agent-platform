import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { AppAnalysisStorageService } from "./app-analysis-storage.service.js";
import { FlogoAppsService } from "./flogo-apps.service.js";

describe("FlogoAppsService", () => {
  const tempPaths: string[] = [];

  afterAll(async () => {
    await Promise.all(tempPaths.map((tempPath) => fs.rm(tempPath, { recursive: true, force: true })));
  });

  const createService = (options?: { storedAppPath?: string; storedAppId?: string; storedAppName?: string }) => {
    const artifacts: Array<{ id: string; taskId: string; kind: string; name: string; uri: string; metadata?: unknown }> = [];
    const tasks = new Map<string, { flogoAppId?: string; requestedBy?: string }>();
    const storedPayloads: Array<{ blobPath: string; payload: Record<string, unknown> }> = [];

    const storage = {
      storeJsonArtifact: async ({
        projectId,
        appId,
        artifactId,
        kind,
        payload
      }: {
        projectId: string;
        appId: string;
        artifactId: string;
        kind: string;
        payload: Record<string, unknown>;
      }) => {
        const blobPath = `app-analysis/${projectId}/${appId}/${kind}/${artifactId}.json`;
        storedPayloads.push({ blobPath, payload });
        return {
          uri: `http://storage.test/flogo-analysis/${blobPath}`,
          blobPath,
          contentType: "application/json"
        };
      }
    } satisfies Pick<AppAnalysisStorageService, "storeJsonArtifact">;

    const prisma = {
      organization: {
        upsert: async () => ({ id: "local-organization" })
      },
      project: {
        upsert: async () => ({ id: "demo" })
      },
      flogoApp: {
        findFirst: async ({ where }: { where: { OR: Array<{ id?: string; appName?: string }> } }) => {
          const storedAppId = options?.storedAppId ?? "hello-rest";
          const storedAppName = options?.storedAppName ?? "hello-rest";
          const match = where.OR.find((entry) => entry.id === storedAppId || entry.appName === storedAppName);
          return match
            ? {
                id: `flogo-app-demo-${storedAppName}`,
                appPath: options?.storedAppPath ?? "missing"
              }
            : null;
        },
        upsert: async ({ where }: { where: { id: string } }) => ({
          id: where.id
        })
      },
      task: {
        create: async ({ data }: { data: { id: string; flogoAppId?: string; requestedBy?: string } }) => {
          tasks.set(data.id, {
            flogoAppId: data.flogoAppId,
            requestedBy: data.requestedBy
          });
          return data;
        }
      },
      artifact: {
        create: async ({
          data
        }: {
          data: { id: string; taskId: string; kind: string; name: string; uri: string; metadata?: unknown };
        }) => {
          artifacts.push({
            id: data.id,
            taskId: data.taskId,
            kind: data.kind,
            name: data.name,
            uri: data.uri,
            metadata: data.metadata
          });
          return data;
        },
        findMany: async ({
          where
        }: {
          where: { task: { flogoAppId?: string; requestedBy?: string } };
        }) =>
          artifacts.filter((artifact) => {
            const task = tasks.get(artifact.taskId);
            return task?.requestedBy === where.task.requestedBy && task.flogoAppId === where.task.flogoAppId;
          })
      }
    };

    return {
      service: new FlogoAppsService(storage as AppAnalysisStorageService, prisma as any),
      storedPayloads
    };
  };

  async function createStoredAppFile() {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-apps-service-"));
    const appPath = path.join(tempDir, "stored-app.json");
    tempPaths.push(tempDir);
    await fs.writeFile(
      appPath,
      JSON.stringify(
        {
          name: "stored-rest",
          type: "flogo:app",
          appModel: "1.1.0",
          imports: [
            {
              alias: "rest",
              ref: "#rest"
            }
          ],
          triggers: [
            {
              id: "rest_trigger",
              ref: "#rest",
              handlers: [
                {
                  settings: {
                    method: "GET",
                    path: "/stored"
                  },
                  action: {
                    ref: "flow:stored"
                  }
                }
              ]
            }
          ],
          resources: {
            stored: {
              id: "stored",
              data: {
                name: "stored",
                metadata: {
                  input: [],
                  output: []
                },
                tasks: []
              }
            }
          }
        },
        null,
        2
      ),
      "utf8"
    );
    return appPath;
  }

  it("returns a contribution catalog for example apps", async () => {
    const { service, storedPayloads } = createService();
    const response = await service.getCatalog("demo", "hello-rest");

    expect(response).toBeDefined();
    expect(response?.catalog.entries.some((entry) => entry.type === "trigger" && entry.name === "rest")).toBe(true);
    expect(response?.catalog.entries.some((entry) => entry.type === "activity" && entry.name === "log")).toBe(true);
    expect(response?.catalog.entries.some((entry) => entry.type === "action" && entry.ref === "#flow:hello")).toBe(true);
    expect(response?.artifact?.type).toBe("contrib_catalog");
    expect(response?.artifact?.metadata?.blobPath).toBeDefined();
    expect(storedPayloads).toHaveLength(1);
  });

  it("previews mappings for example apps and returns an artifact ref", async () => {
    const { service } = createService();
    const preview = await service.previewMapping("demo", "hello-rest", {
      nodeId: "log-request",
      sampleInput: {
        flow: {},
        activity: {},
        env: {},
        property: {},
        trigger: {}
      }
    });

    expect(preview).toBeDefined();
    expect(preview?.preview.flowId).toBe("hello");
    expect(preview?.preview.fields.find((field) => field.path === "input.message")?.resolved).toBe("received hello request");
    expect(preview?.artifact?.type).toBe("mapping_preview");
    expect(preview?.propertyPlan.declaredProperties).toEqual([]);
    expect(preview?.artifact?.metadata?.blobPath).toBeDefined();
  });

  it("lists persisted app-scoped analysis artifacts", async () => {
    const { service } = createService();
    await service.getCatalog("demo", "hello-rest");
    await service.previewMapping("demo", "hello-rest", {
      nodeId: "log-request",
      sampleInput: {
        flow: {},
        activity: {},
        env: {},
        property: {},
        trigger: {}
      }
    });

    const artifacts = await service.listArtifacts("demo", "hello-rest");
    expect(artifacts).toHaveLength(2);
    expect(artifacts?.some((artifact) => artifact.type === "contrib_catalog")).toBe(true);
    expect(artifacts?.some((artifact) => artifact.type === "mapping_preview")).toBe(true);
  });

  it("prefers DB-backed app records when the app exists in persistence", async () => {
    const storedAppPath = await createStoredAppFile();
    const { service } = createService({
      storedAppPath,
      storedAppId: "stored-app",
      storedAppName: "stored-rest"
    });

    const graph = await service.getGraph("demo", "stored-app");

    expect(graph).toBeDefined();
    expect(graph?.app.name).toBe("stored-rest");
    expect(graph?.app.resources.some((resource) => resource.id === "stored")).toBe(true);
  });

  it("returns undefined for unknown apps", async () => {
    const { service } = createService();

    await expect(service.getGraph("demo", "missing-app")).resolves.toBeUndefined();
    await expect(service.getCatalog("demo", "missing-app")).resolves.toBeUndefined();
    await expect(service.listArtifacts("demo", "missing-app")).resolves.toBeUndefined();
  });

  it("returns a descriptor response and persists a descriptor artifact", async () => {
    const { service, storedPayloads } = createService();

    const descriptor = await service.getDescriptor("demo", "hello-rest", "#log");

    expect(descriptor).toBeDefined();
    expect(descriptor?.descriptor.name).toBe("log");
    expect(descriptor?.artifact?.type).toBe("contrib_catalog");
    expect(descriptor?.artifact?.metadata?.analysisType).toBe("descriptor");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/descriptor/"))).toBe(true);
  });

  it("returns a governance report and persists a governance artifact", async () => {
    const { service, storedPayloads } = createService();

    const governance = await service.getGovernance("demo", "hello-rest");

    expect(governance).toBeDefined();
    expect(governance?.report.ok).toBe(true);
    expect(governance?.artifact?.type).toBe("governance_report");
    expect(governance?.artifact?.metadata?.analysisType).toBe("governance");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/governance_report/"))).toBe(true);
  });

  it("returns a composition comparison and persists a composition artifact", async () => {
    const { service, storedPayloads } = createService();

    const comparison = await service.compareComposition("demo", "hello-rest", {
      mode: "analyze",
      target: "app"
    });

    expect(comparison).toBeDefined();
    expect(comparison?.comparison.ok).toBe(true);
    expect(comparison?.comparison.artifact?.type).toBe("composition_compare");
    expect(comparison?.comparison.artifact?.metadata?.analysisType).toBe("composition_compare");
    expect(storedPayloads.some((entry) => entry.blobPath.includes("/composition_compare/"))).toBe(true);
  });

  it("lists governance and composition artifacts alongside other persisted app analysis artifacts", async () => {
    const { service } = createService();

    await service.getCatalog("demo", "hello-rest");
    await service.getGovernance("demo", "hello-rest");
    await service.compareComposition("demo", "hello-rest", {
      mode: "analyze",
      target: "app"
    });

    const artifacts = await service.listArtifacts("demo", "hello-rest");

    expect(artifacts).toHaveLength(3);
    expect(artifacts?.some((artifact) => artifact.type === "contrib_catalog")).toBe(true);
    expect(artifacts?.some((artifact) => artifact.type === "governance_report")).toBe(true);
    expect(artifacts?.some((artifact) => artifact.type === "composition_compare")).toBe(true);
  });
});
