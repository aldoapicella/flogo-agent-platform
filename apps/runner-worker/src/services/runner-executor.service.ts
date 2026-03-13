import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  type CompositionCompareResult,
  type ArtifactRef,
  type ContribEvidenceResponse,
  type ContributionInventory,
  type ContribCatalog,
  type ContribDescriptor,
  type ContribDescriptorResponse,
  type ErrorPathTemplateResponse,
  type FlowContractsResponse,
  type RunComparisonResponse,
  type ReplayResponse,
  type RunTraceResponse,
  type IteratorSynthesisResponse,
  type MappingTestResponse,
  type Diagnostic,
  type DoWhileSynthesisResponse,
  type GovernanceReport,
  type MappingPreviewResult,
  type PropertyPlanResponse,
  type RetryPolicyResponse,
  type SubflowExtractionResponse,
  type SubflowInliningResponse,
  type TriggerBindingResponse,
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
    case "infer_flow_contracts":
      return createHelperCommand(
        "flows",
        "contracts",
        "--app",
        spec.appPath,
        ...(typeof spec.analysisPayload?.flowId === "string" ? ["--flow", String(spec.analysisPayload.flowId)] : [])
      );
    case "bind_trigger":
      return createHelperCommand("triggers", "bind", "--app", spec.appPath);
    case "extract_subflow":
      return createHelperCommand("flows", "extract-subflow", "--app", spec.appPath);
    case "inline_subflow":
      return createHelperCommand("flows", "inline-subflow", "--app", spec.appPath);
    case "add_iterator":
      return createHelperCommand("flows", "add-iterator", "--app", spec.appPath);
    case "add_retry_policy":
      return createHelperCommand("flows", "add-retry-policy", "--app", spec.appPath);
    case "add_dowhile":
      return createHelperCommand("flows", "add-dowhile", "--app", spec.appPath);
    case "add_error_path":
      return createHelperCommand("flows", "add-error-path", "--app", spec.appPath);
    case "capture_run_trace":
      return createHelperCommand("flows", "trace", "--app", spec.appPath);
    case "replay_flow":
      return createHelperCommand("flows", "replay", "--app", spec.appPath);
    case "compare_runs":
      return createHelperCommand("flows", "compare-runs", "--app", spec.appPath);
    case "inventory_contribs":
      return createHelperCommand("inventory", "contribs", "--app", spec.appPath);
    case "catalog_contribs":
      return createHelperCommand("catalog", "contribs", "--app", spec.appPath);
    case "inspect_descriptor":
      return createHelperCommand("inspect", "descriptor", "--app", spec.appPath, "--ref", spec.targetRef ?? "");
    case "inspect_contrib_evidence":
      return createHelperCommand("evidence", "inspect", "--app", spec.appPath, "--ref", spec.targetRef ?? "");
    case "preview_mapping":
      return createHelperCommand("preview", "mapping", "--app", spec.appPath, "--node", spec.targetNodeId ?? "");
    case "test_mapping":
      return createHelperCommand("mapping", "test", "--app", spec.appPath, "--node", spec.targetNodeId ?? "");
    case "plan_properties":
      return createHelperCommand("properties", "plan", "--app", spec.appPath, "--profile", String(spec.analysisPayload?.profile ?? "rest_service"));
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
    stepType === "infer_flow_contracts" ||
    stepType === "bind_trigger" ||
    stepType === "extract_subflow" ||
    stepType === "inline_subflow" ||
    stepType === "add_iterator" ||
    stepType === "add_retry_policy" ||
    stepType === "add_dowhile" ||
    stepType === "add_error_path" ||
    stepType === "capture_run_trace" ||
    stepType === "replay_flow" ||
    stepType === "compare_runs" ||
    stepType === "inventory_contribs" ||
    stepType === "catalog_contribs" ||
    stepType === "inspect_descriptor" ||
    stepType === "inspect_contrib_evidence" ||
    stepType === "preview_mapping" ||
    stepType === "test_mapping" ||
    stepType === "plan_properties" ||
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
  if (
    spec.stepType !== "preview_mapping" &&
    spec.stepType !== "test_mapping" &&
    spec.stepType !== "bind_trigger" &&
    spec.stepType !== "extract_subflow" &&
    spec.stepType !== "inline_subflow" &&
    spec.stepType !== "add_iterator" &&
    spec.stepType !== "add_retry_policy" &&
    spec.stepType !== "add_dowhile" &&
    spec.stepType !== "add_error_path" &&
    spec.stepType !== "capture_run_trace" &&
    spec.stepType !== "replay_flow" &&
    spec.stepType !== "compare_runs"
  ) {
    return {
      command: createCommand(spec)
    };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-mapping-preview-"));
  const inputPath = path.join(tempDir, "sample-input.json");
  const samplePayload =
    spec.stepType === "test_mapping"
      ? (spec.analysisPayload?.sampleInput as Record<string, unknown> | undefined) ?? {}
      : spec.analysisPayload ?? {};
  await fs.writeFile(inputPath, JSON.stringify(samplePayload, null, 2), "utf8");

  if (spec.stepType === "test_mapping") {
    const expectedPath = path.join(tempDir, "expected-output.json");
    await fs.writeFile(expectedPath, JSON.stringify((spec.analysisPayload?.expectedOutput as Record<string, unknown> | undefined) ?? {}, null, 2), "utf8");
    return {
      command: createHelperCommand(
        "mapping",
        "test",
        "--app",
        spec.appPath,
        "--node",
        spec.targetNodeId ?? "",
        "--input",
        inputPath,
        "--expected",
        expectedPath,
        ...(spec.analysisPayload?.strict === false ? ["--strict", "false"] : [])
      ),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "bind_trigger") {
    const profilePath = path.join(tempDir, "trigger-profile.json");
    await fs.writeFile(profilePath, JSON.stringify((spec.analysisPayload?.profile as Record<string, unknown> | undefined) ?? {}, null, 2), "utf8");
    return {
      command: createHelperCommand(
        "triggers",
        "bind",
        "--app",
        spec.appPath,
        "--flow",
        String(spec.analysisPayload?.flowId ?? ""),
        "--profile",
        profilePath,
        ...(spec.analysisPayload?.validateOnly === false ? [] : ["--validate-only"]),
        ...(spec.analysisPayload?.replaceExisting === true ? ["--replace-existing"] : []),
        ...(typeof spec.analysisPayload?.handlerName === "string" ? ["--handler-name", String(spec.analysisPayload.handlerName)] : []),
        ...(typeof spec.analysisPayload?.triggerId === "string" ? ["--trigger-id", String(spec.analysisPayload.triggerId)] : []),
        ...(typeof spec.analysisPayload?.triggerName === "string" ? ["--trigger-name", String(spec.analysisPayload.triggerName)] : [])
      ),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "extract_subflow") {
    const requestPath = path.join(tempDir, "subflow-extraction-request.json");
    await fs.writeFile(requestPath, JSON.stringify(spec.analysisPayload ?? {}, null, 2), "utf8");
    return {
      command: createHelperCommand("flows", "extract-subflow", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "inline_subflow") {
    const requestPath = path.join(tempDir, "subflow-inlining-request.json");
    await fs.writeFile(requestPath, JSON.stringify(spec.analysisPayload ?? {}, null, 2), "utf8");
    return {
      command: createHelperCommand("flows", "inline-subflow", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "add_iterator") {
    const requestPath = path.join(tempDir, "iterator-request.json");
    await fs.writeFile(requestPath, JSON.stringify(spec.analysisPayload ?? {}, null, 2), "utf8");
    return {
      command: createHelperCommand("flows", "add-iterator", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "add_retry_policy") {
    const requestPath = path.join(tempDir, "retry-policy-request.json");
    await fs.writeFile(requestPath, JSON.stringify(spec.analysisPayload ?? {}, null, 2), "utf8");
    return {
      command: createHelperCommand("flows", "add-retry-policy", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "add_dowhile") {
    const requestPath = path.join(tempDir, "dowhile-request.json");
    await fs.writeFile(requestPath, JSON.stringify(spec.analysisPayload ?? {}, null, 2), "utf8");
    return {
      command: createHelperCommand("flows", "add-dowhile", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "add_error_path") {
    const requestPath = path.join(tempDir, "error-path-request.json");
    await fs.writeFile(requestPath, JSON.stringify(spec.analysisPayload ?? {}, null, 2), "utf8");
    return {
      command: createHelperCommand("flows", "add-error-path", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "capture_run_trace") {
    const requestPath = path.join(tempDir, "run-trace-request.json");
    await fs.writeFile(requestPath, JSON.stringify(spec.analysisPayload ?? {}, null, 2), "utf8");
    return {
      command: createHelperCommand("flows", "trace", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "replay_flow") {
    const requestPath = path.join(tempDir, "replay-request.json");
    await fs.writeFile(requestPath, JSON.stringify(spec.analysisPayload ?? {}, null, 2), "utf8");
    return {
      command: createHelperCommand("flows", "replay", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "compare_runs") {
    const requestPath = path.join(tempDir, "compare-runs-request.json");
    await fs.writeFile(requestPath, JSON.stringify(spec.analysisPayload ?? {}, null, 2), "utf8");
    return {
      command: createHelperCommand("flows", "compare-runs", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

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

    if (spec.stepType === "infer_flow_contracts") {
      const response = JSON.parse(stdout) as FlowContractsResponse;
      return [
        createAnalysisArtifact(spec, "flow_contract", `flow-contracts${spec.analysisPayload?.flowId ? `-${String(spec.analysisPayload.flowId)}` : ""}`, {
          contracts: response.contracts,
          diagnostics
        })
      ];
    }

    if (spec.stepType === "bind_trigger") {
      const response = JSON.parse(stdout) as TriggerBindingResponse;
      return [
        createAnalysisArtifact(
          spec,
          response.result.applied ? "trigger_binding_result" : "trigger_binding_plan",
          `trigger-binding-${String(spec.analysisPayload?.flowId ?? "flow")}`,
          {
            result: response.result,
            diagnostics
          }
        )
      ];
    }

    if (spec.stepType === "extract_subflow") {
      const response = JSON.parse(stdout) as SubflowExtractionResponse;
      return [
        createAnalysisArtifact(
          spec,
          response.result.applied ? "subflow_extraction_result" : "subflow_extraction_plan",
          `subflow-extraction-${String(spec.analysisPayload?.flowId ?? "flow")}`,
          {
            result: response.result,
            diagnostics
          }
        )
      ];
    }

    if (spec.stepType === "inline_subflow") {
      const response = JSON.parse(stdout) as SubflowInliningResponse;
      return [
        createAnalysisArtifact(
          spec,
          response.result.applied ? "subflow_inlining_result" : "subflow_inlining_plan",
          `subflow-inlining-${String(spec.analysisPayload?.parentFlowId ?? "flow")}`,
          {
            result: response.result,
            diagnostics
          }
        )
      ];
    }

    if (spec.stepType === "add_iterator") {
      const response = JSON.parse(stdout) as IteratorSynthesisResponse;
      return [
        createAnalysisArtifact(
          spec,
          response.result.applied ? "iterator_result" : "iterator_plan",
          `iterator-${String(spec.analysisPayload?.taskId ?? "task")}`,
          {
            result: response.result,
            diagnostics
          }
        )
      ];
    }

    if (spec.stepType === "add_retry_policy") {
      const response = JSON.parse(stdout) as RetryPolicyResponse;
      return [
        createAnalysisArtifact(
          spec,
          response.result.applied ? "retry_policy_result" : "retry_policy_plan",
          `retry-policy-${String(spec.analysisPayload?.taskId ?? "task")}`,
          {
            result: response.result,
            diagnostics
          }
        )
      ];
    }

    if (spec.stepType === "add_dowhile") {
      const response = JSON.parse(stdout) as DoWhileSynthesisResponse;
      return [
        createAnalysisArtifact(
          spec,
          response.result.applied ? "dowhile_result" : "dowhile_plan",
          `dowhile-${String(spec.analysisPayload?.taskId ?? "task")}`,
          {
            result: response.result,
            diagnostics
          }
        )
      ];
    }

    if (spec.stepType === "add_error_path") {
      const response = JSON.parse(stdout) as ErrorPathTemplateResponse;
      return [
        createAnalysisArtifact(
          spec,
          response.result.applied ? "error_path_result" : "error_path_plan",
          `error-path-${String(spec.analysisPayload?.taskId ?? "task")}`,
          {
            result: response.result,
            diagnostics
          }
        )
      ];
    }

    if (spec.stepType === "capture_run_trace") {
      const response = JSON.parse(stdout) as RunTraceResponse;
      const validateOnly = spec.analysisPayload?.validateOnly === true || !response.trace;
      return [
        createAnalysisArtifact(
          spec,
          validateOnly ? "run_trace_plan" : "run_trace",
          `run-trace-${String(spec.analysisPayload?.flowId ?? "flow")}`,
          {
            trace: response.trace,
            validation: response.validation,
            diagnostics
          }
        )
      ];
    }

    if (spec.stepType === "replay_flow") {
      const response = JSON.parse(stdout) as ReplayResponse;
      const validateOnly = spec.analysisPayload?.validateOnly === true || !response.result.trace;
      return [
        createAnalysisArtifact(
          spec,
          validateOnly ? "replay_plan" : "replay_report",
          `replay-${String(spec.analysisPayload?.flowId ?? "flow")}`,
          {
            result: response.result,
            diagnostics
          }
        )
      ];
    }

    if (spec.stepType === "compare_runs") {
      const response = JSON.parse(stdout) as RunComparisonResponse;
      const validateOnly = spec.analysisPayload?.validateOnly === true || !response.result;
      return [
        createAnalysisArtifact(
          spec,
          validateOnly ? "run_comparison_plan" : "run_comparison",
          `run-comparison-${String(spec.analysisPayload?.leftArtifactId ?? "left")}-${String(spec.analysisPayload?.rightArtifactId ?? "right")}`,
          {
            result: response.result,
            validation: response.validation,
            diagnostics
          }
        )
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

    if (spec.stepType === "test_mapping") {
      const response = JSON.parse(stdout) as MappingTestResponse;
      return [
        createAnalysisArtifact(spec, "mapping_test", `mapping-test-${spec.targetNodeId ?? "node"}`, {
          result: response.result,
          propertyPlan: response.propertyPlan,
          diagnostics
        })
      ];
    }

    if (spec.stepType === "plan_properties") {
      const response = JSON.parse(stdout) as PropertyPlanResponse;
      return [
        createAnalysisArtifact(spec, "property_plan", "property-plan", {
          propertyPlan: response.propertyPlan,
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

    if (spec.stepType === "inspect_contrib_evidence") {
      const response = JSON.parse(stdout) as ContribEvidenceResponse;
      return [
        createAnalysisArtifact(spec, "contrib_evidence", `contrib-evidence-${spec.targetRef ?? "target"}`, {
          evidence: response.evidence,
          diagnostics
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
