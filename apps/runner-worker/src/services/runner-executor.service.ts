import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  type CompositionCompareResult,
  type ArtifactRef,
  type ContributionInventory,
  type ContribCatalog,
  type ContribDescriptor,
  type ContribDescriptorResponse,
  type Diagnostic,
  type GovernanceReport,
  type MappingPreviewResult,
  type RunnerJobResult,
  type RunnerJobSpec,
  type RunnerJobState,
  type RunnerJobStatus,
  RunnerJobResultSchema,
  RunnerJobSpecSchema,
  RunnerJobStatusSchema
} from "@flogo-agent/contracts";

export interface RunnerExecutor {
  execute(spec: RunnerJobSpec): Promise<RunnerJobResult>;
  getStatus?(currentStatus: RunnerJobStatus): Promise<RunnerJobStatus>;
}

type PreparedCommand = {
  command: string[];
  cleanup?: () => Promise<void>;
};

function createLogArtifact(taskId: string, stepType: string, log: string): ArtifactRef {
  const type = stepType === "build" ? "build_log" : "runtime_log";
  return {
    id: randomUUID(),
    type,
    name: `${taskId}-${stepType}.log`,
    uri: `memory://${taskId}/${stepType}.log`,
    metadata: { log }
  };
}

function createCommand(spec: RunnerJobSpec): string[] {
  if (spec.command.length > 0) {
    return spec.command;
  }

  switch (spec.stepType) {
    case "build":
      return ["echo", `build:${spec.appPath}`];
    case "run":
      return ["echo", `run:${spec.appPath}`];
    case "collect_logs":
      return ["echo", `logs:${spec.taskId}`];
    case "run_smoke":
      return ["echo", `smoke:${spec.appPath}`];
    case "inventory_contribs":
      return createHelperCommand("inventory", "contribs", "--app", spec.appPath);
    case "catalog_contribs":
      return createHelperCommand("catalog", "contribs", "--app", spec.appPath);
    case "inspect_descriptor":
      return createHelperCommand("inspect", "descriptor", "--app", spec.appPath, "--ref", spec.targetRef ?? "");
    case "preview_mapping":
      return ["echo", `mapping-preview:${spec.appPath}`];
    case "validate_governance":
      return createHelperCommand("governance", "validate", "--app", spec.appPath);
    case "compare_composition":
      return createHelperCommand(
        "compose",
        "compare",
        "--app",
        spec.appPath,
        "--target",
        typeof spec.analysisPayload?.target === "string" ? String(spec.analysisPayload.target) : "app",
        ...(typeof spec.analysisPayload?.resourceId === "string" ? ["--resource", String(spec.analysisPayload.resourceId)] : [])
      );
    default:
      return ["echo", `runner:${spec.stepType}`];
  }
}

function createHelperCommand(...args: string[]): string[] {
  const helperBin = process.env.FLOGO_HELPER_BIN;
  if (helperBin) {
    return [helperBin, ...args];
  }

  return ["go", "run", "./go-runtime/flogo-helper", ...args];
}

function mapExecutionState(rawState: string | undefined): RunnerJobState {
  const state = rawState?.toLowerCase() ?? "";
  if (state.includes("succeed") || state.includes("complete")) {
    return "succeeded";
  }
  if (state.includes("fail") || state.includes("error")) {
    return "failed";
  }
  if (state.includes("cancel")) {
    return "cancelled";
  }
  if (state.includes("running")) {
    return "running";
  }
  return "pending";
}

function parseJsonResponse<T>(value: unknown): T {
  return value as T;
}

function isAnalysisStep(stepType: RunnerJobSpec["stepType"]) {
  return (
    stepType === "inventory_contribs" ||
    stepType === "catalog_contribs" ||
    stepType === "inspect_descriptor" ||
    stepType === "preview_mapping" ||
    stepType === "validate_governance" ||
    stepType === "compare_composition"
  );
}

function createAnalysisArtifact(
  spec: RunnerJobSpec,
  type: ArtifactRef["type"],
  suffix: string,
  metadata: Record<string, unknown>
): ArtifactRef {
  return {
    id: randomUUID(),
    type,
    name: `${spec.taskId}-${suffix}.json`,
    uri: `memory://${spec.taskId}/${suffix}.json`,
    metadata
  };
}

async function prepareCommand(spec: RunnerJobSpec): Promise<PreparedCommand> {
  if (spec.stepType !== "preview_mapping") {
    return {
      command: createCommand(spec)
    };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-mapping-preview-"));
  const inputPath = path.join(tempDir, "sample-input.json");
  await fs.writeFile(inputPath, JSON.stringify(spec.analysisPayload ?? {}, null, 2), "utf8");

  return {
    command: createHelperCommand("preview", "mapping", "--app", spec.appPath, "--node", spec.targetNodeId ?? "", "--input", inputPath),
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };
}

function createAnalysisArtifacts(spec: RunnerJobSpec, stdout: string, diagnostics: Diagnostic[]): ArtifactRef[] {
  try {
    if (spec.stepType === "inventory_contribs") {
      const inventory = JSON.parse(stdout) as ContributionInventory;
      return [
        createAnalysisArtifact(spec, "contrib_inventory", "contrib-inventory", {
          inventory,
          diagnostics
        })
      ];
    }

    if (spec.stepType === "catalog_contribs") {
      const catalog = JSON.parse(stdout) as ContribCatalog;
      return [
        createAnalysisArtifact(spec, "contrib_catalog", "contrib-catalog", {
          catalog,
          diagnostics
        })
      ];
    }

    if (spec.stepType === "preview_mapping") {
      const preview = JSON.parse(stdout) as MappingPreviewResult;
      return [
        createAnalysisArtifact(spec, "mapping_preview", `mapping-preview-${spec.targetNodeId ?? "node"}`, {
          preview,
          diagnostics
        })
      ];
    }

    if (spec.stepType === "inspect_descriptor") {
      const response = JSON.parse(stdout) as ContribDescriptorResponse;
      const descriptor = response.descriptor as ContribDescriptor;
      return [
        createAnalysisArtifact(spec, "contrib_catalog", `descriptor-${spec.targetRef ?? "target"}`, {
          descriptor,
          diagnostics: [...(response.diagnostics ?? []), ...diagnostics]
        })
      ];
    }

    if (spec.stepType === "validate_governance") {
      const report = JSON.parse(stdout) as GovernanceReport;
      return [
        createAnalysisArtifact(spec, "governance_report", "governance-report", {
          report,
          diagnostics
        })
      ];
    }

    if (spec.stepType === "compare_composition") {
      const comparison = JSON.parse(stdout) as CompositionCompareResult;
      return [
        createAnalysisArtifact(spec, "composition_compare", "composition-compare", {
          comparison,
          diagnostics
        })
      ];
    }
  } catch (error) {
    diagnostics.push({
      code: "runner.analysis_parse_failed",
      message: error instanceof Error ? error.message : String(error),
      severity: "warning"
    });
  }

  return [];
}

export class RunnerExecutorService implements RunnerExecutor {
  async execute(specInput: RunnerJobSpec): Promise<RunnerJobResult> {
    const spec = RunnerJobSpecSchema.parse(specInput);
    const prepared = await prepareCommand(spec);
    const command = prepared.command;
    const [binary, ...args] = command;
    const startedAt = new Date().toISOString();

    return new Promise((resolve) => {
      const child = spawn(binary, args, {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32"
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        void prepared.cleanup?.();
        const logArtifact = createLogArtifact(spec.taskId, spec.stepType, `${stdout}\n${stderr}`.trim());
        const diagnostics: Diagnostic[] = stderr
          ? [
              {
                code: "runner.stderr",
                message: stderr.trim(),
                severity: "warning"
              } satisfies Diagnostic
            ]
          : [];
        const artifacts = [logArtifact];
        if (code === 0 && isAnalysisStep(spec.stepType)) {
          artifacts.push(...createAnalysisArtifacts(spec, stdout, diagnostics));
        }

        resolve(
          RunnerJobResultSchema.parse({
            jobId: `${spec.taskId}-${spec.stepType}`,
            jobRunId: spec.jobRunId,
            ok: code === 0,
            status: code === 0 ? "succeeded" : "failed",
            summary: code === 0 ? `Executed ${spec.stepType}` : `Execution failed for ${spec.stepType}`,
            exitCode: code ?? 1,
            startedAt,
            finishedAt: new Date().toISOString(),
            jobTemplateName: spec.jobTemplateName,
            logArtifact,
            artifacts,
            diagnostics
          })
        );
      });

      child.on("error", (error) => {
        void prepared.cleanup?.();
        const logArtifact = createLogArtifact(spec.taskId, spec.stepType, error.message);
        resolve(
          RunnerJobResultSchema.parse({
            jobId: `${spec.taskId}-${spec.stepType}`,
            jobRunId: spec.jobRunId,
            ok: false,
            status: "failed",
            summary: `Failed to spawn command for ${spec.stepType}`,
            exitCode: 1,
            startedAt,
            finishedAt: new Date().toISOString(),
            jobTemplateName: spec.jobTemplateName,
            logArtifact,
            artifacts: [logArtifact],
            diagnostics: [
              {
                code: "runner.spawn_error",
                message: error.message,
                severity: "error"
              }
            ]
          })
        );
      });
    });
  }
}

type AzureTokenResponse = {
  access_token: string;
};

type AzureJobExecution = {
  id?: string;
  name?: string;
  properties?: {
    status?: string;
    provisioningState?: string;
    startTime?: string;
    endTime?: string;
  };
};

export class ContainerAppsJobRunnerExecutor implements RunnerExecutor {
  private readonly subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  private readonly resourceGroup = process.env.AZURE_RESOURCE_GROUP;
  private readonly apiVersion = process.env.CONTAINER_APPS_API_VERSION ?? "2023-05-01";
  private readonly managementEndpoint = (process.env.AZURE_RESOURCE_MANAGER_ENDPOINT ?? "https://management.azure.com").replace(
    /\/$/,
    ""
  );

  async execute(specInput: RunnerJobSpec): Promise<RunnerJobResult> {
    const spec = RunnerJobSpecSchema.parse(specInput);
    if (!this.subscriptionId || !this.resourceGroup) {
      const artifact = createLogArtifact(spec.taskId, spec.stepType, "Container Apps job configuration is incomplete");
      return RunnerJobResultSchema.parse({
        jobId: `${spec.taskId}-${spec.stepType}`,
        jobRunId: spec.jobRunId,
        ok: false,
        status: "failed",
        summary: "Missing Azure Container Apps job configuration",
        exitCode: 1,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        jobTemplateName: spec.jobTemplateName,
        logArtifact: artifact,
        artifacts: [artifact],
        diagnostics: [
          {
            code: "runner.azure_config_missing",
            message: "AZURE_SUBSCRIPTION_ID and AZURE_RESOURCE_GROUP are required for Container Apps job execution",
            severity: "error"
          }
        ]
      });
    }

    const token = await this.acquireManagementToken();
    const url = `${this.managementEndpoint}/subscriptions/${this.subscriptionId}/resourceGroups/${this.resourceGroup}/providers/Microsoft.App/jobs/${spec.jobTemplateName}/start?api-version=${this.apiVersion}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(this.buildStartPayload(spec))
    });

    if (!response.ok) {
      const message = await response.text();
      const artifact = createLogArtifact(spec.taskId, spec.stepType, message);
      return RunnerJobResultSchema.parse({
        jobId: `${spec.taskId}-${spec.stepType}`,
        jobRunId: spec.jobRunId,
        ok: false,
        status: "failed",
        summary: `Failed to start Container Apps Job ${spec.jobTemplateName}`,
        exitCode: 1,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        jobTemplateName: spec.jobTemplateName,
        logArtifact: artifact,
        artifacts: [artifact],
        diagnostics: [
          {
            code: "runner.azure_job_start_failed",
            message,
            severity: "error"
          }
        ]
      });
    }

    const payload = response.status === 204 ? {} : parseJsonResponse<AzureJobExecution>(await response.json());
    const executionName = payload.name;
    const resourceId = payload.id;
    const logArtifact = createLogArtifact(
      spec.taskId,
      spec.stepType,
      `Started Container Apps Job ${spec.jobTemplateName}${executionName ? ` (${executionName})` : ""}`
    );

    return RunnerJobResultSchema.parse({
      jobId: `${spec.taskId}-${spec.stepType}`,
      jobRunId: spec.jobRunId,
      azureJobExecutionName: executionName,
      azureJobResourceId: resourceId,
      ok: true,
      status: "running",
      summary: executionName
        ? `Started Container Apps Job execution ${executionName}`
        : `Started Container Apps Job ${spec.jobTemplateName}`,
      exitCode: 0,
      startedAt: new Date().toISOString(),
      jobTemplateName: spec.jobTemplateName,
      logArtifact,
      artifacts: [logArtifact],
      diagnostics: []
    });
  }

  async getStatus(currentStatus: RunnerJobStatus): Promise<RunnerJobStatus> {
    const current = RunnerJobStatusSchema.parse(currentStatus);
    const resourceId = current.result?.azureJobResourceId ?? current.azureJobResourceId;
    if (!resourceId) {
      return current;
    }

    const token = await this.acquireManagementToken();
    const response = await fetch(`${this.managementEndpoint}${resourceId}?api-version=${this.apiVersion}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return RunnerJobStatusSchema.parse({
        ...current,
        status: "failed",
        summary: `Failed to poll Container Apps Job execution ${current.result?.azureJobExecutionName ?? ""}`.trim(),
        result: {
          ...(current.result ?? {
            jobId: `${current.spec.taskId}-${current.spec.stepType}`,
            jobRunId: current.jobRunId,
            ok: false,
            status: "failed",
            summary: "Container Apps Job polling failed",
            exitCode: 1
          }),
          ok: false,
          status: "failed",
          summary: `Polling failed with status ${response.status}`,
          exitCode: 1,
          finishedAt: new Date().toISOString()
        }
      });
    }

    const payload = parseJsonResponse<AzureJobExecution>(await response.json());
    const mappedStatus = mapExecutionState(payload.properties?.status ?? payload.properties?.provisioningState);
    const result = RunnerJobResultSchema.parse({
      ...(current.result ?? {
        jobId: `${current.spec.taskId}-${current.spec.stepType}`,
        jobRunId: current.jobRunId,
        ok: mappedStatus === "succeeded",
        status: mappedStatus,
        summary: current.summary,
        exitCode: mappedStatus === "succeeded" ? 0 : mappedStatus === "failed" ? 1 : 0
      }),
      azureJobExecutionName: payload.name ?? current.result?.azureJobExecutionName,
      azureJobResourceId: payload.id ?? current.result?.azureJobResourceId,
      ok: mappedStatus !== "failed" && mappedStatus !== "cancelled",
      status: mappedStatus,
      summary:
        mappedStatus === "succeeded"
          ? `Container Apps Job ${payload.name ?? current.spec.jobTemplateName} completed`
          : mappedStatus === "failed"
            ? `Container Apps Job ${payload.name ?? current.spec.jobTemplateName} failed`
            : `Container Apps Job ${payload.name ?? current.spec.jobTemplateName} is ${mappedStatus}`,
      startedAt: payload.properties?.startTime ?? current.result?.startedAt,
      finishedAt:
        mappedStatus === "succeeded" || mappedStatus === "failed" || mappedStatus === "cancelled"
          ? payload.properties?.endTime ?? new Date().toISOString()
          : undefined,
      exitCode: mappedStatus === "succeeded" ? 0 : mappedStatus === "failed" ? 1 : 0
    });

    return RunnerJobStatusSchema.parse({
      jobRunId: current.jobRunId,
      status: mappedStatus,
      summary: result.summary,
      spec: current.spec,
      azureJobExecutionName: result.azureJobExecutionName,
      azureJobResourceId: result.azureJobResourceId,
      result
    });
  }

  private async acquireManagementToken(): Promise<string> {
    if (process.env.AZURE_MANAGEMENT_ACCESS_TOKEN) {
      return process.env.AZURE_MANAGEMENT_ACCESS_TOKEN;
    }

    const endpoint = process.env.IDENTITY_ENDPOINT ?? process.env.MSI_ENDPOINT;
    const secret = process.env.IDENTITY_HEADER ?? process.env.MSI_SECRET;
    if (!endpoint || !secret) {
      throw new Error("No Azure managed identity endpoint is available for Container Apps job execution");
    }

    const response = await fetch(
      `${endpoint}?resource=${encodeURIComponent(this.managementEndpoint)}&api-version=2019-08-01`,
      {
        headers: {
          "X-IDENTITY-HEADER": secret,
          secret
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to acquire Azure management token: ${response.status}`);
    }

    const payload = parseJsonResponse<AzureTokenResponse>(await response.json());
    return payload.access_token;
  }

  private buildStartPayload(spec: RunnerJobSpec) {
    return {
      template: {
        containers: [
          {
            name: "flogo-runner",
            env: [
              {
                name: "RUNNER_SPEC_JSON",
                value: JSON.stringify(spec)
              }
            ]
          }
        ]
      }
    };
  }
}

export function createRunnerExecutor(): RunnerExecutor {
  return process.env.RUNNER_EXECUTION_MODE === "container-apps-job"
    ? new ContainerAppsJobRunnerExecutor()
    : new RunnerExecutorService();
}
