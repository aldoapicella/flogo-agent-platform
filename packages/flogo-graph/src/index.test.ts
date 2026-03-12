import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  analyzePropertyUsage,
  buildAppGraph,
  buildContributionInventory,
  buildContribCatalog,
  compareJsonVsProgrammatic,
  inspectContribEvidence,
  inspectContribDescriptor,
  previewMapping,
  runMappingTest,
  suggestCoercions,
  summarizeAppDiff,
  validateFlogoApp,
  validateGovernance
} from "./index.js";

const validApp = {
  name: "hello",
  type: "flogo:app",
  appModel: "1.1.0",
  imports: [
    {
      alias: "log",
      ref: "github.com/project-flogo/contrib/activity/log"
    },
    {
      alias: "rest",
      ref: "github.com/project-flogo/contrib/trigger/rest"
    }
  ],
  properties: [
    {
      name: "retryCount",
      value: 3
    }
  ],
  triggers: [
    {
      id: "rest_trigger",
      ref: "#rest",
      settings: { port: 9999 },
      handlers: [
        {
          settings: {
            method: "GET",
            path: "/hello"
          },
          action: {
            ref: "#flow:hello_flow"
          }
        }
      ]
    }
  ],
  resources: [
    {
      id: "hello_flow",
      data: {
        tasks: [
          {
            id: "log_1",
            activityRef: "#log",
            input: {
              message: "hello"
            }
          }
        ],
        links: []
      }
    }
  ]
};

const legacyShapeApp = {
  name: "legacy-hello",
  type: "flogo:app",
  appModel: "1.1.0",
  imports: [
    {
      alias: "log",
      ref: "github.com/project-flogo/contrib/activity/log"
    },
    {
      alias: "rest",
      ref: "github.com/project-flogo/contrib/trigger/rest"
    }
  ],
  triggers: [
    {
      id: "rest",
      ref: "#rest",
      settings: { port: 8080 },
      handlers: [
        {
          settings: {
            method: "GET",
            path: "/hello"
          },
          action: {
            ref: "flow:hello"
          }
        }
      ]
    }
  ],
  resources: {
    hello: {
      type: "flow",
      data: {
        metadata: {
          input: ["name"],
          output: ["message"]
        },
        tasks: [
          {
            id: "log-request",
            name: "log-request",
            activity: {
              ref: "#log"
            },
            input: {
              message: "received hello request"
            }
          }
        ]
      }
    }
  }
};

describe("flogo graph", () => {
  const tempPaths: string[] = [];

  afterAll(async () => {
    await Promise.all(tempPaths.map((tempPath) => fs.rm(tempPath, { recursive: true, force: true })));
  });

  it("builds a graph from a valid app", () => {
    const graph = buildAppGraph(validApp);
    expect(graph.resourceIds).toContain("hello_flow");
    expect(graph.taskIds).toContain("log_1");
  });

  it("detects missing flow references", () => {
    const invalid = structuredClone(validApp);
    invalid.triggers[0].handlers[0].action.ref = "#flow:missing";
    const report = validateFlogoApp(invalid);
    expect(report.ok).toBe(false);
    expect(report.stages.some((stage) => stage.diagnostics.some((diagnostic) => diagnostic.code === "flogo.semantic.missing_flow"))).toBe(true);
  });

  it("detects bad mapping scopes", () => {
    const invalid = structuredClone(validApp);
    invalid.resources[0].data.tasks.push({
      id: "log_2",
      activityRef: "#log",
      input: {
        message: "$activity[future].message"
      }
    });
    const report = validateFlogoApp(invalid);
    expect(report.stages.some((stage) => stage.diagnostics.some((diagnostic) => diagnostic.code === "flogo.mapping.invalid_activity_scope"))).toBe(true);
  });

  it("summarizes app diffs", () => {
    const changed = structuredClone(validApp);
    changed.properties.push({
      name: "apiBaseUrl",
      value: "https://example.test"
    });
    expect(summarizeAppDiff(validApp, changed)).toContain("properties +1");
  });

  it("builds a contribution catalog from imports, triggers, and flows", () => {
    const catalog = buildContribCatalog(validApp);
    expect(catalog.entries.some((entry) => entry.type === "trigger" && entry.name === "rest")).toBe(true);
    expect(catalog.entries.some((entry) => entry.type === "activity" && entry.name === "log")).toBe(true);
    expect(catalog.entries.some((entry) => entry.type === "action" && entry.ref === "#flow:hello_flow")).toBe(true);
  });

  it("builds a contribution inventory with package evidence and flow entries", () => {
    const inventory = buildContributionInventory(validApp);

    expect(inventory.entries.some((entry) => entry.alias === "rest" && entry.ref === "github.com/project-flogo/contrib/trigger/rest")).toBe(
      true
    );
    expect(inventory.entries.some((entry) => entry.alias === "log" && entry.ref === "github.com/project-flogo/contrib/activity/log")).toBe(
      true
    );
    expect(inventory.entries.some((entry) => entry.ref === "#flow:hello_flow" && entry.source === "flow_resource")).toBe(true);
  });

  it("normalizes legacy object-shaped resources and task activity refs", () => {
    const graph = buildAppGraph(legacyShapeApp);
    const report = validateFlogoApp(legacyShapeApp);
    const catalog = buildContribCatalog(legacyShapeApp);

    expect(graph.resourceIds).toContain("hello");
    expect(graph.taskIds).toContain("log-request");
    expect(report.ok).toBe(true);
    expect(catalog.entries.some((entry) => entry.ref === "#flow:hello")).toBe(true);
    expect(catalog.entries.some((entry) => entry.ref === "#log")).toBe(true);
  });

  it("previews mapping values with sample input", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      message: "$flow.customerId",
      retryCount: "$property.retryCount",
      origin: "value:$env.REGION"
    };

    const preview = previewMapping(app, "log_1", {
      flow: { customerId: "abc-123" },
      property: { retryCount: 3 },
      env: { REGION: "us-east" }
    });

    expect(preview.fields.find((field) => field.path === "input.message")?.resolved).toBe("abc-123");
    expect(preview.fields.find((field) => field.path === "input.retryCount")?.resolved).toBe(3);
    expect(preview.fields.find((field) => field.path === "input.origin")?.resolved).toBe("value:us-east");
    expect(preview.paths.some((entry) => entry.targetPath === "input.message")).toBe(true);
    expect(preview.resolvedValues["input.message"]).toBe("abc-123");
  });

  it("suggests coercions for numeric-looking mapping fields", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      retryCount: "$property.retryCount"
    };

    const diagnostics = suggestCoercions(app, {
      property: { retryCount: "3" }
    });

    expect(diagnostics.some((diagnostic) => diagnostic.code === "flogo.mapping.coercion.numeric")).toBe(true);
  });

  it("emits descriptor-aware coercion diagnostics when resolved values do not match activity field types", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      message: "$property.retryCount"
    };

    const preview = previewMapping(app, "log_1", {
      flow: {},
      activity: {},
      env: {},
      property: { retryCount: 3 },
      trigger: {}
    });

    expect(preview.coercionDiagnostics.some((diagnostic) => diagnostic.code === "flogo.mapping.coercion.expected_type")).toBe(true);
  });

  it("reports unresolved mapping references in previews", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      message: "$activity[missing].message"
    };

    const preview = previewMapping(app, "log_1", {
      flow: {},
      activity: {},
      env: {},
      property: {},
      trigger: {}
    });

    expect(preview.diagnostics.some((diagnostic) => diagnostic.code === "flogo.mapping.unresolved_reference")).toBe(true);
  });

  it("analyzes property and environment usage", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      retryCount: "$property.retryCount",
      region: "$env.REGION"
    };

    const plan = analyzePropertyUsage(app, "rest_service");

    expect(plan.propertyRefs).toContain("retryCount");
    expect(plan.envRefs).toContain("REGION");
    expect(plan.declaredProperties).toContain("retryCount");
    expect(plan.recommendedEnv.some((entry) => entry.name === "REGION")).toBe(true);
    expect(plan.recommendedPlainEnv.some((entry) => entry.name === "REGION")).toBe(true);
    expect(plan.profileSpecificNotes.length).toBeGreaterThan(0);
  });

  it("reports undefined and unused properties in the property plan", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      missingValue: "$property.apiBaseUrl"
    };

    const plan = analyzePropertyUsage(app, "rest_service");

    expect(plan.undefinedPropertyRefs).toContain("apiBaseUrl");
    expect(plan.unusedProperties).toContain("retryCount");
    expect(plan.recommendedProperties.some((entry) => entry.name === "apiBaseUrl")).toBe(true);
  });

  it("separates secret environment recommendations by deployment profile", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      apiKey: "$env.API_KEY"
    };

    const plan = analyzePropertyUsage(app, "serverless");

    expect(plan.recommendedSecretEnv.some((entry) => entry.name === "API_KEY")).toBe(true);
    expect(plan.deploymentProfile).toBe("serverless");
  });

  it("runs a deterministic mapping test", () => {
    const app = structuredClone(validApp);
    app.resources[0].data.tasks[0].input = {
      message: "$flow.customerId"
    };

    const result = runMappingTest(
      app,
      "log_1",
      {
        flow: { customerId: "abc-123" },
        activity: {},
        env: {},
        property: {},
        trigger: {}
      },
      { "input.message": "abc-123" },
      true
    );

    expect(result.pass).toBe(true);
    expect(result.actualOutput["input.message"]).toBe("abc-123");
  });

  it("prefers descriptor metadata from descriptor.json when available", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-descriptor-"));
    tempPaths.push(tempDir);
    const descriptorPath = path.join(
      tempDir,
      "github.com",
      "project-flogo",
      "contrib",
      "activity",
      "log",
      "descriptor.json"
    );
    await fs.mkdir(path.dirname(descriptorPath), { recursive: true });
    await fs.writeFile(
      descriptorPath,
      JSON.stringify(
        {
          name: "workspace-log",
          type: "activity",
          version: "2.0.0",
          title: "Workspace Log",
          input: [{ name: "message", type: "string", required: true }],
          output: []
        },
        null,
        2
      ),
      "utf8"
    );

    const catalog = buildContribCatalog(validApp, { searchRoots: [tempDir] });
    const descriptor = inspectContribDescriptor(validApp, "#log", { searchRoots: [tempDir] });

    expect(catalog.entries.find((entry) => entry.alias === "log")?.name).toBe("workspace-log");
    expect(descriptor?.descriptor.source).toBe("workspace_descriptor");
    expect(descriptor?.descriptor.evidence?.source).toBe("workspace_descriptor");
    expect(descriptor?.diagnostics).toEqual([]);
  });

  it("resolves package-backed contribution inventory from a go.mod workspace", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-package-inventory-"));
    tempPaths.push(tempDir);
    const appDir = path.join(tempDir, "apps", "demo");
    const appPath = path.join(appDir, "flogo.json");
    await fs.mkdir(appDir, { recursive: true });
    await fs.writeFile(path.join(tempDir, "go.mod"), "module github.com/project-flogo/contrib\n\ngo 1.22.0\n", "utf8");
    await fs.mkdir(path.join(tempDir, "activity", "customlog"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "activity", "customlog", "activity.go"), "package customlog\n", "utf8");
    await fs.mkdir(path.join(tempDir, "trigger", "customtimer"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "trigger", "customtimer", "descriptor.json"),
      JSON.stringify(
        {
          name: "customtimer",
          type: "trigger",
          title: "Custom Timer",
          version: "0.1.0",
          settings: [{ name: "interval", type: "string", required: true }]
        },
        null,
        2
      ),
      "utf8"
    );
    await fs.writeFile(appPath, JSON.stringify(validApp, null, 2), "utf8");

    const workspaceApp = {
      ...structuredClone(validApp),
      imports: [
        {
          alias: "customlog",
          ref: "github.com/project-flogo/contrib/activity/customlog"
        },
        {
          alias: "customtimer",
          ref: "github.com/project-flogo/contrib/trigger/customtimer"
        }
      ]
    };

    const inventory = buildContributionInventory(workspaceApp, { appPath });
    const customLog = inventory.entries.find((entry) => entry.alias === "customlog");
    const customTimer = inventory.entries.find((entry) => entry.alias === "customtimer");

    expect(customLog?.source).toBe("package_source");
    expect(customLog?.packageRoot).toContain(path.join("activity", "customlog"));
    expect(customLog?.modulePath).toBe("github.com/project-flogo/contrib");
    expect(customLog?.goPackagePath).toBe("github.com/project-flogo/contrib/activity/customlog");
    expect(customLog?.confidence).toBe("high");
    expect(customLog?.discoveryReason).toContain("Go package files");
    expect(customTimer?.source).toBe("package_descriptor");
    expect(customTimer?.descriptor?.version).toBe("0.1.0");
    expect(customTimer?.modulePath).toBe("github.com/project-flogo/contrib");
    expect(customTimer?.goPackagePath).toBe("github.com/project-flogo/contrib/trigger/customtimer");
  });

  it("resolves contribution inventory from the Go module cache and captures discovered versions", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-module-cache-"));
    tempPaths.push(tempDir);
    const previousGoModCache = process.env.GOMODCACHE;
    process.env.GOMODCACHE = tempDir;

    try {
      const packageDir = path.join(
        tempDir,
        "github.com",
        "project-flogo",
        "contrib@v1.2.3",
        "activity",
        "cachelog"
      );
      await fs.mkdir(packageDir, { recursive: true });
      await fs.writeFile(
        path.join(packageDir, "descriptor.json"),
        JSON.stringify(
          {
            name: "cachelog",
            type: "activity",
            title: "Cache Log",
            input: [{ name: "message", type: "string", required: true }]
          },
          null,
          2
        ),
        "utf8"
      );

      const app = {
        ...structuredClone(validApp),
        imports: [
          {
            alias: "cachelog",
            ref: "github.com/project-flogo/contrib/activity/cachelog"
          }
        ]
      };

      const inventory = buildContributionInventory(app);
      const cacheLog = inventory.entries.find((entry) => entry.alias === "cachelog");

      expect(cacheLog?.source).toBe("package_descriptor");
      expect(cacheLog?.version).toBe("v1.2.3");
      expect(cacheLog?.versionSource).toBe("package");
      expect(cacheLog?.packageRoot).toContain(path.join("contrib@v1.2.3", "activity", "cachelog"));
    } finally {
      if (previousGoModCache === undefined) {
        delete process.env.GOMODCACHE;
      } else {
        process.env.GOMODCACHE = previousGoModCache;
      }
    }
  });

  it("inspects contribution evidence with confidence metadata", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-contrib-evidence-"));
    tempPaths.push(tempDir);
    const descriptorPath = path.join(
      tempDir,
      "github.com",
      "project-flogo",
      "contrib",
      "activity",
      "log",
      "descriptor.json"
    );
    await fs.mkdir(path.dirname(descriptorPath), { recursive: true });
    await fs.writeFile(
      descriptorPath,
      JSON.stringify(
        {
          name: "workspace-log",
          type: "activity",
          version: "2.1.0",
          input: [{ name: "message", type: "string", required: true }]
        },
        null,
        2
      ),
      "utf8"
    );

    const evidence = inspectContribEvidence(validApp, "#log", { searchRoots: [tempDir] });

    expect(evidence).toBeDefined();
    expect(evidence?.source).toBe("workspace_descriptor");
    expect(evidence?.confidence).toBe("high");
    expect(evidence?.discoveryReason).toContain("workspace descriptor");
    expect(evidence?.descriptor?.evidence?.confidence).toBe("high");
  });

  it("reports governance findings for duplicate aliases and missing refs", () => {
    const app = structuredClone(validApp);
    app.imports.push({
      alias: "log",
      ref: "github.com/project-flogo/contrib/activity/log",
      version: "1.0.0"
    });
    app.resources[0].data.tasks.push({
      id: "missing_1",
      activityRef: "#missing",
      input: {}
    });

    const governance = validateGovernance(app);

    expect(governance.ok).toBe(false);
    expect(governance.aliasIssues.some((issue) => issue.kind === "duplicate_alias" && issue.alias === "log")).toBe(true);
    expect(governance.orphanedRefs.some((entry) => entry.ref === "#missing" && entry.kind === "activity")).toBe(true);
    expect(governance.versionFindings.some((finding) => finding.alias === "rest" && finding.status === "missing")).toBe(true);
    expect(governance.inventorySummary?.entryCount).toBeGreaterThan(0);
    expect(governance.fallbackContribs).toContain("github.com/project-flogo/contrib/activity/log");
    expect(governance.weakEvidenceContribs).toContain("github.com/project-flogo/contrib/activity/log");
    expect(Array.isArray(governance.unusedImports)).toBe(true);
    expect(Array.isArray(governance.duplicateAliases)).toBe(true);
  });

  it("compares canonical and programmatic composition for app and resource targets", () => {
    const appComparison = compareJsonVsProgrammatic(validApp, {
      mode: "analyze",
      target: "app"
    });
    const resourceComparison = compareJsonVsProgrammatic(legacyShapeApp, {
      mode: "analyze",
      target: "resource",
      resourceId: "hello"
    });
    const missingResource = compareJsonVsProgrammatic(validApp, {
      mode: "analyze",
      target: "resource",
      resourceId: "missing"
    });

    expect(appComparison.ok).toBe(true);
    expect(appComparison.differences).toEqual([]);
    expect(appComparison.comparisonBasis).toBe("inventory_backed");
    expect(appComparison.signatureEvidenceLevel).toBe("fallback_only");
    expect(appComparison.signatureCoverage).toBe("partial");
    expect(appComparison.inventoryRefsUsed).toContain("github.com/project-flogo/contrib/trigger/rest");
    expect(resourceComparison.ok).toBe(true);
    expect(resourceComparison.differences).toEqual([]);
    expect(missingResource.ok).toBe(false);
    expect(missingResource.diagnostics.some((diagnostic) => diagnostic.code === "flogo.composition.resource_not_found")).toBe(
      true
    );
  });
});
