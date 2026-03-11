import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { RunnerExecutorService } from "./runner-executor.service";

describe("RunnerExecutorService", () => {
  const originalHelperBin = process.env.FLOGO_HELPER_BIN;

  afterEach(async () => {
    if (originalHelperBin) {
      process.env.FLOGO_HELPER_BIN = originalHelperBin;
    } else {
      delete process.env.FLOGO_HELPER_BIN;
    }
  });

  it("returns a successful mock result by default", async () => {
    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-1",
      jobKind: "build",
      stepType: "build",
      snapshotUri: ".",
      appPath: "flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://build",
      jobTemplateName: "flogo-runner",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts).toHaveLength(1);
  });

  it("executes helper-backed catalog analysis and publishes a catalog artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        appName: "demo",
        entries: [],
        diagnostics: []
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-2",
      jobKind: "catalog",
      stepType: "catalog_contribs",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://catalog",
      jobTemplateName: "flogo-runner",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "contrib_catalog")).toBe(true);
  });

  it("executes helper-backed inventory analysis and publishes an inventory artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        appName: "demo",
        entries: [],
        diagnostics: []
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-inventory",
      jobKind: "inventory",
      stepType: "inventory_contribs",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://inventory",
      jobTemplateName: "flogo-runner",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "contrib_inventory")).toBe(true);
  });

  it("executes helper-backed mapping preview analysis and publishes a preview artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        nodeId: "log-request",
        flowId: "hello",
        fields: [],
        suggestedCoercions: [],
        diagnostics: []
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-3",
      jobKind: "mapping_preview",
      stepType: "preview_mapping",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://preview",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        flow: {},
        activity: {},
        env: {},
        property: {},
        trigger: {}
      },
      targetNodeId: "log-request",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "mapping_preview")).toBe(true);
  });

  it("executes helper-backed descriptor inspection and publishes a descriptor artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        descriptor: {
          ref: "github.com/project-flogo/contrib/activity/log",
          alias: "log",
          type: "activity",
          name: "log",
          settings: [],
          inputs: [],
          outputs: [],
          examples: [],
          compatibilityNotes: [],
          source: "registry"
        },
        diagnostics: []
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-4",
      jobKind: "catalog",
      stepType: "inspect_descriptor",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://descriptor",
      jobTemplateName: "flogo-runner",
      targetRef: "#log",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.name.includes("descriptor"))).toBe(true);
  });

  it("executes helper-backed governance validation and publishes a governance artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        appName: "demo",
        ok: true,
        aliasIssues: [],
        orphanedRefs: [],
        versionFindings: [],
        diagnostics: []
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-5",
      jobKind: "governance",
      stepType: "validate_governance",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://governance",
      jobTemplateName: "flogo-runner",
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "governance_report")).toBe(true);
  });

  it("executes helper-backed composition comparison and publishes a composition artifact", async () => {
    process.env.FLOGO_HELPER_BIN = await createHelperScript(
      JSON.stringify({
        appName: "demo",
        ok: true,
        canonicalHash: "abc",
        programmaticHash: "abc",
        differences: [],
        diagnostics: []
      })
    );

    const service = new RunnerExecutorService();
    const result = await service.execute({
      taskId: "task-6",
      jobKind: "composition_compare",
      stepType: "compare_composition",
      snapshotUri: ".",
      appPath: "examples/hello-rest/flogo.json",
      env: {},
      envSecretRefs: {},
      timeoutSeconds: 60,
      artifactOutputUri: "memory://compare",
      jobTemplateName: "flogo-runner",
      analysisPayload: {
        target: "app"
      },
      command: [],
      containerArgs: []
    });

    expect(result.ok).toBe(true);
    expect(result.artifacts.some((artifact) => artifact.type === "composition_compare")).toBe(true);
  });
});

async function createHelperScript(stdout: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-helper-test-"));
  const scriptPath = path.join(tempDir, process.platform === "win32" ? "helper.cmd" : "helper.sh");

  const contents =
    process.platform === "win32"
      ? `@echo off\r\necho ${stdout}\r\n`
      : `#!/usr/bin/env sh\nprintf '%s\n' '${stdout}'\n`;

  await fs.writeFile(scriptPath, contents, "utf8");
  if (process.platform !== "win32") {
    await fs.chmod(scriptPath, 0o755);
  }

  return scriptPath;
}
