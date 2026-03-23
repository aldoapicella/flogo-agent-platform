import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ActivityScaffoldRequestSchema,
  ActivityScaffoldResponseSchema,
  type ActivityScaffoldResponse,
  ActionScaffoldRequestSchema,
  ActionScaffoldResponseSchema,
  type ActionScaffoldResponse,
  ContributionPackageArchiveSchema,
  ContributionInstallApplyRequestSchema,
  ContributionInstallApplyResponseSchema,
  type ContributionInstallApplyResponse,
  ContributionInstallDiffPlanRequestSchema,
  ContributionInstallDiffPlanResponseSchema,
  type ContributionInstallDiffPlanResponse,
  ContributionUpdateApplyRequestSchema,
  ContributionUpdateApplyResponseSchema,
  type ContributionUpdateApplyResponse,
  ContributionUpdateDiffPlanRequestSchema,
  ContributionUpdateDiffPlanResponseSchema,
  type ContributionUpdateDiffPlanResponse,
  ContributionInstallPlanRequestSchema,
  ContributionInstallPlanResponseSchema,
  type ContributionInstallPlanResponse,
  ContributionUpdatePlanRequestSchema,
  ContributionUpdatePlanResponseSchema,
  type ContributionUpdatePlanResponse,
  ContributionPackageRequestSchema,
  ContributionPackageResponseSchema,
  type ContributionPackageResponse,
  ContributionScaffoldResultSchema,
  ContributionValidateRequestSchema,
  ContributionValidateResponseSchema,
  type ContributionValidateResponse,
  TriggerScaffoldRequestSchema,
  TriggerScaffoldResponseSchema,
  type TriggerScaffoldResponse,
  type CompositionCompareResult,
  type ArtifactRef,
  DiagnosisRequestSchema,
  type ContribEvidenceResponse,
  type ContributionInventory,
  type ContribCatalog,
  type ContribDescriptor,
  type ContribDescriptorResponse,
  type ErrorPathTemplateResponse,
  type FlowContracts,
  type FlowContractsResponse,
  ReplayResponseSchema,
  RunComparisonResponseSchema,
  type RunComparisonResponse,
  type ReplayResponse,
  RunTraceResponseSchema,
  type RunTraceResponse,
  type IteratorSynthesisResponse,
  type MappingPreviewContext,
  type MappingTestResponse,
  type Diagnostic,
  type RestEnvelopeComparison,
  type RestReplayEvidence,
  type DoWhileSynthesisResponse,
  type GovernanceReport,
  type MappingPreviewResult,
  type NormalizedRuntimeStepEvidence,
  type PropertyPlanResponse,
  type RunComparisonBasis,
  type RunTrace,
  type RetryPolicyResponse,
  RuntimeEvidenceSchema,
  type RuntimeEvidence,
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
import {
  buildAgentDiagnosisReport,
  inferFlowContracts,
  planDiagnosis,
  planTriggerBinding,
  previewMapping,
  runMappingTest,
  validateFlogoApp
} from "@flogo-agent/flogo-graph";

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
    case "scaffold_activity":
      return createHelperCommand("contrib", "scaffold-activity");
    case "scaffold_action":
      return createHelperCommand("contrib", "scaffold-action");
    case "scaffold_trigger":
      return createHelperCommand("contrib", "scaffold-trigger");
    case "validate_contrib":
      return createHelperCommand("contrib", "validate");
    case "package_contrib":
      return createHelperCommand("contrib", "package");
    case "install_contrib_plan":
      return createHelperCommand("contrib", "install-plan", "--app", spec.appPath);
    case "update_contrib_plan":
      return createHelperCommand("contrib", "update-plan", "--app", spec.appPath);
    case "update_contrib_diff_plan":
      return createHelperCommand("contrib", "update-diff-plan", "--app", spec.appPath);
    case "install_contrib_diff_plan":
      return createHelperCommand("contrib", "install-diff-plan", "--app", spec.appPath);
    case "install_contrib_apply":
      return createHelperCommand("contrib", "install-apply", "--app", spec.appPath);
    case "update_contrib_apply":
      return createHelperCommand("contrib", "update-apply", "--app", spec.appPath);
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
    stepType === "compare_composition" ||
    stepType === "scaffold_activity" ||
    stepType === "scaffold_action" ||
    stepType === "scaffold_trigger" ||
    stepType === "validate_contrib" ||
    stepType === "package_contrib" ||
    stepType === "install_contrib_plan" ||
    stepType === "update_contrib_plan" ||
    stepType === "update_contrib_diff_plan" ||
    stepType === "install_contrib_diff_plan" ||
    stepType === "install_contrib_apply" ||
    stepType === "update_contrib_apply" ||
    stepType === "diagnose_app"
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

function createNamedArtifact(
  taskId: string,
  type: ArtifactRef["type"],
  name: string,
  metadata: Record<string, unknown>
): ArtifactRef {
  return {
    id: randomUUID(),
    type,
    name,
    uri: `memory://${taskId}/${name}`,
    metadata
  };
}

type ContributionScaffoldResultLike = {
  bundle: {
    kind: "activity" | "action" | "trigger";
    modulePath: string;
    packageName: string;
    bundleRoot: string;
    descriptor: unknown;
    files: unknown[];
    readmePath?: string;
  };
  validation: unknown;
  build: {
    command: string[];
    ok: boolean;
    output: string;
    summary: string;
  };
  test: {
    command: string[];
    ok: boolean;
    output: string;
    summary: string;
  };
};

type ContributionValidateResultLike = ContributionScaffoldResultLike & {
  source: "inline_result" | "bundle_artifact";
  sourceArtifactId?: string;
};

type ContributionPackageResultLike = ContributionValidateResultLike & {
  package: {
    format: "zip";
    fileName: string;
    path: string;
    bytes: number;
    sha256: string;
    base64: string;
  };
};

type ContributionInstallPlanResultLike = {
  contributionKind: "activity" | "action" | "trigger";
  source: "inline_result" | "bundle_artifact" | "inline_package" | "package_artifact";
  sourceArtifactId?: string;
  targetApp: {
    projectId?: string;
    appId?: string;
    appPath?: string;
    appName?: string;
  };
  bundle: ContributionScaffoldResultLike["bundle"];
  package?: ContributionPackageResultLike["package"];
  modulePath: string;
  packageName?: string;
  packagePath?: string;
  descriptorRef?: string;
  selectedAlias: string;
  installReady: boolean;
  readiness: "high" | "medium" | "low";
  proposedImports: Array<{
    alias: string;
    ref: string;
    version?: string;
    action: "add" | "reuse_existing" | "update_existing" | "conflict";
    existingAlias?: string;
    existingRef?: string;
    note?: string;
  }>;
  proposedRefs: Array<{
    surface: "activityRef" | "actionRef" | "triggerRef";
    value: string;
    note?: string;
  }>;
  predictedChanges: {
    importsToAdd: Array<{
      alias: string;
      ref: string;
      version?: string;
      action: "add" | "reuse_existing" | "update_existing" | "conflict";
    }>;
    importsToUpdate: Array<{
      alias: string;
      ref: string;
      version?: string;
      action: "add" | "reuse_existing" | "update_existing" | "conflict";
    }>;
    reusableRefs: Array<{
      surface: "activityRef" | "actionRef" | "triggerRef";
      value: string;
      note?: string;
    }>;
    summaryLines: string[];
    noMutation: true;
  };
  warnings: string[];
  conflicts: Array<{
    kind: string;
    severity: "info" | "warning" | "error";
    message: string;
    existingAlias?: string;
    existingRef?: string;
    proposedAlias?: string;
    proposedRef?: string;
  }>;
  diagnostics: Diagnostic[];
  recommendedNextAction: string;
  limitations: string[];
};

type ContributionUpdatePlanResultLike = {
  contributionKind: "activity" | "action" | "trigger";
  source: ContributionInstallPlanResultLike["source"];
  sourceArtifactId?: string;
  targetApp: ContributionInstallPlanResultLike["targetApp"];
  bundle: ContributionScaffoldResultLike["bundle"];
  package?: ContributionPackageResultLike["package"];
  modulePath: string;
  packageName?: string;
  packagePath?: string;
  descriptorRef?: string;
  appFingerprint?: string;
  planFingerprint?: string;
  selectedAlias: string;
  detectedInstalledContribution?: {
    alias?: string;
    ref?: string;
    version?: string;
    type?: string;
    modulePath?: string;
    packagePath?: string;
    packageName?: string;
    matchedBy: string[];
    confidence: "high" | "medium" | "low";
  };
  matchQuality: "exact" | "likely" | "ambiguous" | "none";
  compatibility: "compatible" | "incompatible" | "ambiguous" | "not_installed";
  updateReady: boolean;
  readiness: "high" | "medium" | "low";
  predictedChanges: {
    importsToReplace: ContributionInstallPlanResultLike["proposedImports"];
    importsToKeep: ContributionInstallPlanResultLike["proposedImports"];
    importsToAdd: ContributionInstallPlanResultLike["proposedImports"];
    importsToRemove: ContributionInstallPlanResultLike["proposedImports"];
    refsToReplace: ContributionInstallPlanResultLike["proposedRefs"];
    refsToKeep: ContributionInstallPlanResultLike["proposedRefs"];
    refsToAdd: ContributionInstallPlanResultLike["proposedRefs"];
    refsToRemove: ContributionInstallPlanResultLike["proposedRefs"];
    changedPaths: string[];
    summaryLines: string[];
    noMutation: true;
  };
  warnings: string[];
  conflicts: ContributionInstallPlanResultLike["conflicts"];
  diagnostics: Diagnostic[];
  recommendedNextAction: string;
  limitations: string[];
};

type ContributionUpdateDiffPlanResultLike = {
  contributionKind: "activity" | "action" | "trigger";
  sourceContribution: ContributionInstallDiffPlanResultLike["sourceContribution"];
  detectedInstalledContribution?: ContributionUpdatePlanResultLike["detectedInstalledContribution"];
  targetApp: ContributionInstallPlanResultLike["targetApp"];
  basedOnUpdatePlan: {
    sourceArtifactId?: string;
    appFingerprint?: string;
    planFingerprint?: string;
    targetApp?: ContributionInstallPlanResultLike["targetApp"];
  };
  appFingerprintBefore: string;
  appFingerprintAfter?: string;
  updatePlanFingerprint?: string;
  isStale: boolean;
  staleReason?: string;
  previewAvailable: boolean;
  updateReady: boolean;
  readiness: "high" | "medium" | "low";
  warnings: string[];
  conflicts: ContributionInstallPlanResultLike["conflicts"];
  limitations: string[];
  predictedChanges: {
    importsBefore: Array<{
      alias: string;
      ref: string;
      version?: string;
      action: "existing" | "predicted" | "keep_existing" | "replace_existing" | "add";
    }>;
    importsAfter: Array<{
      alias: string;
      ref: string;
      version?: string;
      action: "existing" | "predicted" | "keep_existing" | "replace_existing" | "add";
    }>;
    importsToReplace: ContributionUpdatePlanResultLike["predictedChanges"]["importsToReplace"];
    importsToKeep: ContributionUpdatePlanResultLike["predictedChanges"]["importsToKeep"];
    importsToAdd: ContributionUpdatePlanResultLike["predictedChanges"]["importsToAdd"];
    importsToRemove: ContributionUpdatePlanResultLike["predictedChanges"]["importsToRemove"];
    refsToReplace: ContributionUpdatePlanResultLike["predictedChanges"]["refsToReplace"];
    refsToKeep: ContributionUpdatePlanResultLike["predictedChanges"]["refsToKeep"];
    refsToAdd: ContributionUpdatePlanResultLike["predictedChanges"]["refsToAdd"];
    refsToRemove: ContributionUpdatePlanResultLike["predictedChanges"]["refsToRemove"];
    structuralChanges: string[];
    changedPaths: string[];
    diffEntries: ContributionInstallDiffPlanResultLike["predictedChanges"]["diffEntries"];
    noMutation: true;
  };
  diffSummary: string[];
  canonicalBeforeJson: string;
  canonicalAfterJson?: string;
  recommendedNextAction: string;
};

type ContributionInstallDiffPlanResultLike = {
  contributionKind: "activity" | "action" | "trigger";
  sourceContribution: {
    kind: "activity" | "action" | "trigger";
    modulePath: string;
    packageName?: string;
    packagePath?: string;
    descriptorRef?: string;
    selectedAlias: string;
    source: "inline_result" | "bundle_artifact" | "inline_package" | "package_artifact";
    sourceArtifactId?: string;
  };
  targetApp: {
    projectId?: string;
    appId?: string;
    appPath?: string;
    appName?: string;
  };
  basedOnInstallPlan: {
    sourceArtifactId?: string;
    appFingerprint?: string;
    planFingerprint?: string;
    targetApp?: {
      projectId?: string;
      appId?: string;
      appPath?: string;
      appName?: string;
    };
  };
  appFingerprintBefore: string;
  appFingerprintAfter?: string;
  installPlanFingerprint?: string;
  isStale: boolean;
  staleReason?: string;
  previewAvailable: boolean;
  installReady: boolean;
  readiness: "high" | "medium" | "low";
  warnings: string[];
  conflicts: Array<{
    kind: string;
    severity: "info" | "warning" | "error";
    message: string;
    existingAlias?: string;
    existingRef?: string;
    proposedAlias?: string;
    proposedRef?: string;
  }>;
  limitations: string[];
  predictedChanges: {
    importsBefore: Array<{
      alias: string;
      ref: string;
      version?: string;
      action: "add" | "reuse_existing" | "update_existing" | "conflict";
    }>;
    importsAfter: Array<{
      alias: string;
      ref: string;
      version?: string;
      action: "add" | "reuse_existing" | "update_existing" | "conflict";
    }>;
    importsToAdd: Array<{
      alias: string;
      ref: string;
      version?: string;
      action: "add" | "reuse_existing" | "update_existing" | "conflict";
    }>;
    importsToUpdate: Array<{
      alias: string;
      ref: string;
      version?: string;
      action: "add" | "reuse_existing" | "update_existing" | "conflict";
    }>;
    aliasesToAdd: string[];
    refsToAdd: Array<{
      surface: "activityRef" | "actionRef" | "triggerRef";
      value: string;
      note?: string;
    }>;
    refsToReuse: Array<{
      surface: "activityRef" | "actionRef" | "triggerRef";
      value: string;
      note?: string;
    }>;
    structuralChanges: string[];
    changedPaths: string[];
    diffEntries: Array<{
      path: string;
      changeType: "add" | "update" | "reuse" | "none";
      summary: string;
      before?: unknown;
      after?: unknown;
    }>;
    noMutation: true;
  };
  diffSummary: string[];
  canonicalBeforeJson: string;
  canonicalAfterJson?: string;
  recommendedNextAction: string;
};

type ContributionInstallApplyResultLike = {
  contributionKind: "activity" | "action" | "trigger";
  sourceContribution: ContributionInstallDiffPlanResultLike["sourceContribution"];
  targetApp: ContributionInstallPlanResultLike["targetApp"];
  basedOnInstallDiffPlan: {
    sourceArtifactId?: string;
    installPlanArtifactId?: string;
    diffFingerprint?: string;
    appFingerprintBefore?: string;
    appFingerprintPreview?: string;
    targetApp?: ContributionInstallPlanResultLike["targetApp"];
  };
  appFingerprintBefore: string;
  appFingerprintAfter?: string;
  isStale: boolean;
  staleReason?: string;
  applied: boolean;
  applyReady: boolean;
  readiness: "high" | "medium" | "low";
  warnings: string[];
  conflicts: ContributionInstallPlanResultLike["conflicts"];
  limitations: string[];
  changedPaths: string[];
  appliedImports: ContributionInstallPlanResultLike["proposedImports"];
  appliedRefs: ContributionInstallPlanResultLike["proposedRefs"];
  applySummary: string[];
  canonicalBeforeJson: string;
  canonicalAfterJson?: string;
  canonicalApp?: Record<string, unknown>;
  recommendedNextAction: string;
  approvalRequired?: boolean;
  mutationApplied?: boolean;
};

type ContributionUpdateApplyResultLike = {
  contributionKind: "activity" | "action" | "trigger";
  sourceContribution: ContributionInstallDiffPlanResultLike["sourceContribution"];
  detectedInstalledContribution?: ContributionUpdatePlanResultLike["detectedInstalledContribution"];
  targetApp: ContributionInstallPlanResultLike["targetApp"];
  basedOnUpdateDiffPlan: {
    sourceArtifactId?: string;
    updatePlanArtifactId?: string;
    diffFingerprint?: string;
    appFingerprintBefore?: string;
    appFingerprintPreview?: string;
    targetApp?: ContributionInstallPlanResultLike["targetApp"];
  };
  appFingerprintBefore: string;
  appFingerprintAfter?: string;
  isStale: boolean;
  staleReason?: string;
  applied: boolean;
  applyReady: boolean;
  readiness: "high" | "medium" | "low";
  warnings: string[];
  conflicts: ContributionInstallPlanResultLike["conflicts"];
  limitations: string[];
  changedPaths: string[];
  appliedImports: ContributionInstallPlanResultLike["proposedImports"];
  appliedRefs: ContributionInstallPlanResultLike["proposedRefs"];
  applySummary: string[];
  canonicalBeforeJson: string;
  canonicalAfterJson?: string;
  canonicalApp?: Record<string, unknown>;
  recommendedNextAction: string;
  approvalRequired?: boolean;
  mutationApplied?: boolean;
};

function resolveContributionScaffoldResultFromPayload(
  analysisPayload: Record<string, unknown> | undefined
): { result: ContributionScaffoldResultLike; source: "inline_result" | "bundle_artifact"; sourceArtifactId?: string } {
  const parsedResult = ContributionScaffoldResultSchema.safeParse(analysisPayload?.result);
  if (parsedResult.success) {
    return {
      result: parsedResult.data as ContributionScaffoldResultLike,
      source: "inline_result"
    };
  }

  const bundleArtifact = isRecord(analysisPayload?.bundleArtifact) ? analysisPayload.bundleArtifact : undefined;
  if (bundleArtifact) {
    const metadata = isRecord(bundleArtifact.metadata) ? bundleArtifact.metadata : undefined;
    const artifactResult = ContributionScaffoldResultSchema.safeParse(metadata?.result);
    if (artifactResult.success) {
      return {
        result: artifactResult.data as ContributionScaffoldResultLike,
        source: "bundle_artifact",
        sourceArtifactId: typeof bundleArtifact.id === "string" ? bundleArtifact.id : undefined
      };
    }
  }

  throw new Error("Contribution validation/package requires a scaffold result or contrib_bundle artifact metadata.result payload");
}

function resolveContributionInstallSourceFromPayload(
  analysisPayload: Record<string, unknown> | undefined
): {
  result: ContributionScaffoldResultLike;
  package?: ContributionPackageResultLike["package"];
  source: "inline_result" | "bundle_artifact" | "inline_package" | "package_artifact";
  sourceArtifactId?: string;
} {
  const parsedPackageResult = ContributionPackageResponseSchema.shape.result.safeParse(analysisPayload?.packageResult);
  if (parsedPackageResult.success) {
    return {
      result: {
        bundle: parsedPackageResult.data.bundle as ContributionScaffoldResultLike["bundle"],
        validation: parsedPackageResult.data.validation,
        build: parsedPackageResult.data.build,
        test: parsedPackageResult.data.test
      },
      package: parsedPackageResult.data.package as ContributionPackageResultLike["package"],
      source: "inline_package"
    };
  }

  const inlinePackagePayload = isRecord(analysisPayload?.packageResult) ? analysisPayload.packageResult : undefined;
  const inlineBundleResult = ContributionScaffoldResultSchema.safeParse(inlinePackagePayload);
  const inlinePackageArchive = ContributionPackageArchiveSchema.safeParse(inlinePackagePayload?.package);
  if (inlineBundleResult.success && inlinePackageArchive.success) {
    return {
      result: inlineBundleResult.data as ContributionScaffoldResultLike,
      package: inlinePackageArchive.data as ContributionPackageResultLike["package"],
      source: "inline_package"
    };
  }

  const packageArtifact = isRecord(analysisPayload?.packageArtifact) ? analysisPayload.packageArtifact : undefined;
  if (packageArtifact) {
    const metadata = isRecord(packageArtifact.metadata) ? packageArtifact.metadata : undefined;
    const artifactPackageResult = ContributionPackageResponseSchema.shape.result.safeParse(metadata?.result);
    if (artifactPackageResult.success) {
      return {
        result: {
          bundle: artifactPackageResult.data.bundle as ContributionScaffoldResultLike["bundle"],
          validation: artifactPackageResult.data.validation,
          build: artifactPackageResult.data.build,
          test: artifactPackageResult.data.test
        },
        package: artifactPackageResult.data.package as ContributionPackageResultLike["package"],
        source: "package_artifact",
        sourceArtifactId: typeof packageArtifact.id === "string" ? packageArtifact.id : undefined
      };
    }

    const artifactPackagePayload = isRecord(metadata?.result) ? metadata?.result : undefined;
    const artifactBundleResult = ContributionScaffoldResultSchema.safeParse(artifactPackagePayload);
    const artifactPackageArchive = ContributionPackageArchiveSchema.safeParse(artifactPackagePayload?.package);
    if (artifactBundleResult.success && artifactPackageArchive.success) {
      return {
        result: artifactBundleResult.data as ContributionScaffoldResultLike,
        package: artifactPackageArchive.data as ContributionPackageResultLike["package"],
        source: "package_artifact",
        sourceArtifactId: typeof packageArtifact.id === "string" ? packageArtifact.id : undefined
      };
    }
  }

  const resolved = resolveContributionScaffoldResultFromPayload(analysisPayload);
  return {
    result: resolved.result,
    source: resolved.source,
    sourceArtifactId: resolved.sourceArtifactId
  };
}

function resolveContributionUpdateSourceFromPayload(
  analysisPayload: Record<string, unknown> | undefined
): {
  result: ContributionScaffoldResultLike;
  package?: ContributionPackageResultLike["package"];
  source: ContributionInstallPlanResultLike["source"];
  sourceArtifactId?: string;
} {
  return resolveContributionInstallSourceFromPayload(analysisPayload);
}

function resolveContributionInstallPlanFromPayload(
  analysisPayload: Record<string, unknown> | undefined
): { result: ContributionInstallPlanResultLike; sourceArtifactId?: string } {
  const parsedResult = ContributionInstallPlanResponseSchema.shape.result.safeParse(analysisPayload?.installPlanResult);
  if (parsedResult.success) {
    return {
      result: parsedResult.data as ContributionInstallPlanResultLike
    };
  }

  const installPlanArtifact = isRecord(analysisPayload?.installPlanArtifact) ? analysisPayload.installPlanArtifact : undefined;
  if (installPlanArtifact) {
    const metadata = isRecord(installPlanArtifact.metadata) ? installPlanArtifact.metadata : undefined;
    const artifactResult = ContributionInstallPlanResponseSchema.shape.result.safeParse(metadata?.result);
    if (artifactResult.success) {
      return {
        result: artifactResult.data as ContributionInstallPlanResultLike,
        sourceArtifactId: typeof installPlanArtifact.id === "string" ? installPlanArtifact.id : undefined
      };
    }
  }

  throw new Error("Contribution install diff planning requires an installPlanResult or contrib_install_plan artifact metadata.result payload");
}

function resolveContributionUpdatePlanFromPayload(
  analysisPayload: Record<string, unknown> | undefined
): { result: ContributionUpdatePlanResultLike; sourceArtifactId?: string } {
  const parsedResult = ContributionUpdatePlanResponseSchema.shape.result.safeParse(analysisPayload?.updatePlanResult);
  if (parsedResult.success) {
    return {
      result: parsedResult.data as ContributionUpdatePlanResultLike
    };
  }

  const updatePlanArtifact = isRecord(analysisPayload?.updatePlanArtifact) ? analysisPayload.updatePlanArtifact : undefined;
  if (updatePlanArtifact) {
    const metadata = isRecord(updatePlanArtifact.metadata) ? updatePlanArtifact.metadata : undefined;
    const artifactResult = ContributionUpdatePlanResponseSchema.shape.result.safeParse(metadata?.result);
    if (artifactResult.success) {
      return {
        result: artifactResult.data as ContributionUpdatePlanResultLike,
        sourceArtifactId: typeof updatePlanArtifact.id === "string" ? updatePlanArtifact.id : undefined
      };
    }
  }

  throw new Error("Contribution update diff planning requires an updatePlanResult or contrib_update_plan artifact metadata.result payload");
}

function resolveContributionInstallDiffPlanFromPayload(
  analysisPayload: Record<string, unknown> | undefined
): { result: ContributionInstallDiffPlanResultLike; sourceArtifactId?: string } {
  const parsedResult = ContributionInstallDiffPlanResponseSchema.shape.result.safeParse(analysisPayload?.installDiffResult);
  if (parsedResult.success) {
    return {
      result: parsedResult.data as ContributionInstallDiffPlanResultLike
    };
  }

  const installDiffArtifact = isRecord(analysisPayload?.installDiffArtifact) ? analysisPayload.installDiffArtifact : undefined;
  if (installDiffArtifact) {
    const metadata = isRecord(installDiffArtifact.metadata) ? installDiffArtifact.metadata : undefined;
    const artifactResult = ContributionInstallDiffPlanResponseSchema.shape.result.safeParse(metadata?.result);
    if (artifactResult.success) {
      return {
        result: artifactResult.data as ContributionInstallDiffPlanResultLike,
        sourceArtifactId: typeof installDiffArtifact.id === "string" ? installDiffArtifact.id : undefined
      };
    }
  }

  throw new Error("Contribution install apply requires an installDiffResult or contrib_install_diff_plan artifact metadata.result payload");
}

function resolveContributionUpdateDiffPlanFromPayload(
  analysisPayload: Record<string, unknown> | undefined
): { result: ContributionUpdateDiffPlanResultLike; sourceArtifactId?: string } {
  const parsedResult = ContributionUpdateDiffPlanResponseSchema.shape.result.safeParse(analysisPayload?.updateDiffPlanResult);
  if (parsedResult.success) {
    return {
      result: parsedResult.data as ContributionUpdateDiffPlanResultLike
    };
  }

  const updateDiffPlanArtifact = isRecord(analysisPayload?.updateDiffPlanArtifact) ? analysisPayload.updateDiffPlanArtifact : undefined;
  if (updateDiffPlanArtifact) {
    const metadata = isRecord(updateDiffPlanArtifact.metadata) ? updateDiffPlanArtifact.metadata : undefined;
    const artifactResult = ContributionUpdateDiffPlanResponseSchema.shape.result.safeParse(metadata?.result);
    if (artifactResult.success) {
      return {
        result: artifactResult.data as ContributionUpdateDiffPlanResultLike,
        sourceArtifactId: typeof updateDiffPlanArtifact.id === "string" ? updateDiffPlanArtifact.id : undefined
      };
    }
  }

  throw new Error("Contribution update apply requires an updateDiffPlanResult or contrib_update_diff_plan artifact metadata.result payload");
}

function createContributionScaffoldArtifacts(
  spec: RunnerJobSpec,
  result: ContributionScaffoldResultLike,
  diagnostics: Diagnostic[]
): ArtifactRef[] {
  const scaffoldKind = result.bundle.kind;
  const proof = {
    validation: result.validation,
    build: result.build,
    test: result.test
  };

  return [
    createAnalysisArtifact(spec, "contrib_bundle", `${scaffoldKind}-bundle-${result.bundle.packageName}`, {
      result,
      descriptor: result.bundle.descriptor,
      files: result.bundle.files,
      bundleRoot: result.bundle.bundleRoot,
      modulePath: result.bundle.modulePath,
      packageName: result.bundle.packageName,
      validation: result.validation,
      build: result.build,
      test: result.test,
      proof,
      diagnostics
    }),
    createNamedArtifact(spec.taskId, "build_log", `${spec.taskId}-${scaffoldKind}-build.log`, {
      command: result.build.command,
      ok: result.build.ok,
      output: result.build.output,
      summary: result.build.summary,
      contributionKind: scaffoldKind
    }),
    createNamedArtifact(spec.taskId, "test_report", `${spec.taskId}-${scaffoldKind}-test.json`, {
      command: result.test.command,
      ok: result.test.ok,
      output: result.test.output,
      summary: result.test.summary,
      contributionKind: scaffoldKind
    })
  ];
}

function createContributionValidationArtifacts(
  spec: RunnerJobSpec,
  result: ContributionValidateResultLike,
  diagnostics: Diagnostic[]
): ArtifactRef[] {
  const contributionKind = result.bundle.kind;
  const proof = {
    validation: result.validation,
    build: result.build,
    test: result.test
  };

  return [
    createAnalysisArtifact(spec, "contrib_validation_report", `${contributionKind}-validation-${result.bundle.packageName}`, {
      result,
      bundle: result.bundle,
      validation: result.validation,
      build: result.build,
      test: result.test,
      proof,
      source: result.source,
      sourceArtifactId: result.sourceArtifactId,
      diagnostics
    }),
    createNamedArtifact(spec.taskId, "build_log", `${spec.taskId}-${contributionKind}-build.log`, {
      command: result.build.command,
      ok: result.build.ok,
      output: result.build.output,
      summary: result.build.summary,
      contributionKind
    }),
    createNamedArtifact(spec.taskId, "test_report", `${spec.taskId}-${contributionKind}-test.json`, {
      command: result.test.command,
      ok: result.test.ok,
      output: result.test.output,
      summary: result.test.summary,
      contributionKind
    })
  ];
}

function createContributionPackageArtifacts(
  spec: RunnerJobSpec,
  result: ContributionPackageResultLike,
  diagnostics: Diagnostic[]
): ArtifactRef[] {
  const contributionKind = result.bundle.kind;
  const proof = {
    validation: result.validation,
    build: result.build,
    test: result.test
  };

  return [
    createAnalysisArtifact(spec, "contrib_package", `${contributionKind}-package-${result.bundle.packageName}`, {
      result,
      bundle: result.bundle,
      package: result.package,
      validation: result.validation,
      build: result.build,
      test: result.test,
      proof,
      source: result.source,
      sourceArtifactId: result.sourceArtifactId,
      diagnostics
    }),
    createNamedArtifact(spec.taskId, "build_log", `${spec.taskId}-${contributionKind}-build.log`, {
      command: result.build.command,
      ok: result.build.ok,
      output: result.build.output,
      summary: result.build.summary,
      contributionKind
    }),
    createNamedArtifact(spec.taskId, "test_report", `${spec.taskId}-${contributionKind}-test.json`, {
      command: result.test.command,
      ok: result.test.ok,
      output: result.test.output,
      summary: result.test.summary,
      contributionKind
    })
  ];
}

function createContributionUpdatePlanArtifacts(
  spec: RunnerJobSpec,
  result: ContributionUpdatePlanResultLike,
  diagnostics: Diagnostic[]
): ArtifactRef[] {
  return [
    createAnalysisArtifact(
      spec,
      "contrib_update_plan",
      `${result.contributionKind}-update-plan-${result.packageName ?? result.bundle.packageName}`,
      {
        result,
        bundle: result.bundle,
        package: result.package,
        contributionKind: result.contributionKind,
        targetApp: result.targetApp,
        modulePath: result.modulePath,
        packageName: result.packageName,
        packagePath: result.packagePath,
        descriptorRef: result.descriptorRef,
        selectedAlias: result.selectedAlias,
        detectedInstalledContribution: result.detectedInstalledContribution,
        matchQuality: result.matchQuality,
        compatibility: result.compatibility,
        updateReady: result.updateReady,
        readiness: result.readiness,
        predictedChanges: result.predictedChanges,
        warnings: result.warnings,
        conflicts: result.conflicts,
        recommendedNextAction: result.recommendedNextAction,
        limitations: result.limitations,
        diagnostics
      }
    )
  ];
}

function createContributionInstallPlanArtifacts(
  spec: RunnerJobSpec,
  result: ContributionInstallPlanResultLike,
  diagnostics: Diagnostic[]
): ArtifactRef[] {
  return [
    createAnalysisArtifact(spec, "contrib_install_plan", `${result.contributionKind}-install-plan-${result.bundle.packageName}`, {
      result,
      bundle: result.bundle,
      package: result.package,
      contributionKind: result.contributionKind,
      targetApp: result.targetApp,
      modulePath: result.modulePath,
      packageName: result.packageName,
      packagePath: result.packagePath,
      selectedAlias: result.selectedAlias,
      installReady: result.installReady,
      readiness: result.readiness,
      proposedImports: result.proposedImports,
      proposedRefs: result.proposedRefs,
      predictedChanges: result.predictedChanges,
      warnings: result.warnings,
      conflicts: result.conflicts,
      recommendedNextAction: result.recommendedNextAction,
      limitations: result.limitations,
      diagnostics
    })
  ];
}

function createContributionInstallDiffPlanArtifacts(
  spec: RunnerJobSpec,
  result: ContributionInstallDiffPlanResultLike,
  diagnostics: Diagnostic[]
): ArtifactRef[] {
  return [
    createAnalysisArtifact(
      spec,
      "contrib_install_diff_plan",
      `${result.contributionKind}-install-diff-plan-${result.sourceContribution.packageName ?? result.sourceContribution.selectedAlias}`,
      {
        result,
        contributionKind: result.contributionKind,
        sourceContribution: result.sourceContribution,
        targetApp: result.targetApp,
        basedOnInstallPlan: result.basedOnInstallPlan,
        appFingerprintBefore: result.appFingerprintBefore,
        appFingerprintAfter: result.appFingerprintAfter,
        installPlanFingerprint: result.installPlanFingerprint,
        isStale: result.isStale,
        staleReason: result.staleReason,
        previewAvailable: result.previewAvailable,
        installReady: result.installReady,
        readiness: result.readiness,
        warnings: result.warnings,
        conflicts: result.conflicts,
        limitations: result.limitations,
        predictedChanges: result.predictedChanges,
        diffSummary: result.diffSummary,
        canonicalBeforeJson: result.canonicalBeforeJson,
        canonicalAfterJson: result.canonicalAfterJson,
        recommendedNextAction: result.recommendedNextAction,
        diagnostics
      }
    )
  ];
}

function createContributionUpdateDiffPlanArtifacts(
  spec: RunnerJobSpec,
  result: ContributionUpdateDiffPlanResultLike,
  diagnostics: Diagnostic[]
): ArtifactRef[] {
  return [
    createAnalysisArtifact(
      spec,
      "contrib_update_diff_plan",
      `${result.contributionKind}-update-diff-plan-${result.sourceContribution.packageName ?? result.sourceContribution.selectedAlias}`,
      {
        result,
        contributionKind: result.contributionKind,
        sourceContribution: result.sourceContribution,
        detectedInstalledContribution: result.detectedInstalledContribution,
        targetApp: result.targetApp,
        basedOnUpdatePlan: result.basedOnUpdatePlan,
        appFingerprintBefore: result.appFingerprintBefore,
        appFingerprintAfter: result.appFingerprintAfter,
        updatePlanFingerprint: result.updatePlanFingerprint,
        isStale: result.isStale,
        staleReason: result.staleReason,
        previewAvailable: result.previewAvailable,
        updateReady: result.updateReady,
        readiness: result.readiness,
        warnings: result.warnings,
        conflicts: result.conflicts,
        limitations: result.limitations,
        predictedChanges: result.predictedChanges,
        diffSummary: result.diffSummary,
        canonicalBeforeJson: result.canonicalBeforeJson,
        canonicalAfterJson: result.canonicalAfterJson,
        recommendedNextAction: result.recommendedNextAction,
        diagnostics
      }
    )
  ];
}

function createContributionInstallApplyArtifacts(
  spec: RunnerJobSpec,
  result: ContributionInstallApplyResultLike,
  diagnostics: Diagnostic[]
): ArtifactRef[] {
  const artifacts: ArtifactRef[] = [
    createAnalysisArtifact(
      spec,
      "contrib_install_apply_result",
      `${result.contributionKind}-install-apply-${result.sourceContribution.packageName ?? result.sourceContribution.selectedAlias}`,
      {
        result,
        contributionKind: result.contributionKind,
        sourceContribution: result.sourceContribution,
        targetApp: result.targetApp,
        basedOnInstallDiffPlan: result.basedOnInstallDiffPlan,
        appFingerprintBefore: result.appFingerprintBefore,
        appFingerprintAfter: result.appFingerprintAfter,
        isStale: result.isStale,
        staleReason: result.staleReason,
        applied: result.applied,
        applyReady: result.applyReady,
        readiness: result.readiness,
        warnings: result.warnings,
        conflicts: result.conflicts,
        limitations: result.limitations,
        changedPaths: result.changedPaths,
        appliedImports: result.appliedImports,
        appliedRefs: result.appliedRefs,
        applySummary: result.applySummary,
        canonicalBeforeJson: result.canonicalBeforeJson,
        canonicalAfterJson: result.canonicalAfterJson,
        recommendedNextAction: result.recommendedNextAction,
        approvalRequired: result.approvalRequired ?? true,
        mutationApplied: result.mutationApplied ?? result.applied,
        diagnostics
      }
    )
  ];

  if (result.applied && result.canonicalAfterJson) {
    artifacts.push(
      createNamedArtifact(
        spec.taskId,
        "flogo_json",
        `${spec.taskId}-${result.targetApp.appId ?? result.targetApp.appName ?? "app"}-flogo.json`,
        {
          appPath: result.targetApp.appPath,
          appId: result.targetApp.appId,
          appName: result.targetApp.appName,
          canonicalJson: result.canonicalAfterJson,
          canonicalApp: result.canonicalApp,
          sourceContribution: result.sourceContribution,
          basedOnInstallDiffPlan: result.basedOnInstallDiffPlan,
          appFingerprintBefore: result.appFingerprintBefore,
          appFingerprintAfter: result.appFingerprintAfter,
          changedPaths: result.changedPaths,
          producer: "runner.install_contrib_apply"
        }
      )
    );
  }

  return artifacts;
}

function createContributionUpdateApplyArtifacts(
  spec: RunnerJobSpec,
  result: ContributionUpdateApplyResultLike,
  diagnostics: Diagnostic[]
): ArtifactRef[] {
  const artifacts: ArtifactRef[] = [
    createAnalysisArtifact(
      spec,
      "contrib_update_apply",
      `${result.contributionKind}-update-apply-${result.sourceContribution.packageName ?? result.sourceContribution.selectedAlias}`,
      {
        result,
        contributionKind: result.contributionKind,
        sourceContribution: result.sourceContribution,
        detectedInstalledContribution: result.detectedInstalledContribution,
        targetApp: result.targetApp,
        basedOnUpdateDiffPlan: result.basedOnUpdateDiffPlan,
        appFingerprintBefore: result.appFingerprintBefore,
        appFingerprintAfter: result.appFingerprintAfter,
        isStale: result.isStale,
        staleReason: result.staleReason,
        applied: result.applied,
        applyReady: result.applyReady,
        readiness: result.readiness,
        warnings: result.warnings,
        conflicts: result.conflicts,
        limitations: result.limitations,
        changedPaths: result.changedPaths,
        appliedImports: result.appliedImports,
        appliedRefs: result.appliedRefs,
        applySummary: result.applySummary,
        canonicalBeforeJson: result.canonicalBeforeJson,
        canonicalAfterJson: result.canonicalAfterJson,
        recommendedNextAction: result.recommendedNextAction,
        approvalRequired: result.approvalRequired ?? true,
        mutationApplied: result.mutationApplied ?? result.applied,
        diagnostics
      }
    )
  ];

  if (result.applied && result.canonicalAfterJson) {
    artifacts.push(
      createNamedArtifact(
        spec.taskId,
        "flogo_json",
        `${spec.taskId}-${result.targetApp.appId ?? result.targetApp.appName ?? "app"}-flogo.json`,
        {
          appPath: result.targetApp.appPath,
          appId: result.targetApp.appId,
          appName: result.targetApp.appName,
          canonicalJson: result.canonicalAfterJson,
          canonicalApp: result.canonicalApp,
          sourceContribution: result.sourceContribution,
          detectedInstalledContribution: result.detectedInstalledContribution,
          basedOnUpdateDiffPlan: result.basedOnUpdateDiffPlan,
          appFingerprintBefore: result.appFingerprintBefore,
          appFingerprintAfter: result.appFingerprintAfter,
          changedPaths: result.changedPaths,
          producer: "runner.update_contrib_apply"
        }
      )
    );
  }

  return artifacts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeRuntimeEvidenceSteps(
  traceSteps: RunTrace["steps"] = [],
  runtimeEvidence?: RuntimeEvidence
): NormalizedRuntimeStepEvidence[] {
  if (Array.isArray(runtimeEvidence?.normalizedSteps) && runtimeEvidence.normalizedSteps.length > 0) {
    return runtimeEvidence.normalizedSteps;
  }

  return traceSteps.map((step) => ({
    taskId: step.taskId,
    taskName: step.taskName,
    activityRef: step.activityRef,
    type: step.type,
    status: step.status,
    error: step.error,
    startedAt: step.startedAt,
    finishedAt: step.finishedAt,
    resolvedInputs: step.input,
    producedOutputs: step.output,
    flowStateAfter: step.flowState,
    diagnostics: step.diagnostics,
    unavailableFields: []
  }));
}

function comparisonBasisPreference(
  runtimeEvidence?: RuntimeEvidence,
  evidenceKind?: unknown
): RunComparisonBasis | undefined {
  if (runtimeEvidence?.channelTriggerRuntime) {
    return "channel_runtime_boundary";
  }
  if (runtimeEvidence?.restTriggerRuntime) {
    return "rest_runtime_envelope";
  }
  if (runtimeEvidence?.timerTriggerRuntime) {
    return "timer_runtime_startup";
  }
  if ((runtimeEvidence?.normalizedSteps?.length ?? 0) > 0) {
    return "normalized_runtime_evidence";
  }
  if (runtimeEvidence?.recorderBacked) {
    return "recorder_backed";
  }
  if (evidenceKind === "runtime_backed" || runtimeEvidence?.kind === "runtime_backed") {
    return "runtime_backed";
  }
  if (evidenceKind === "simulated_fallback" || runtimeEvidence?.kind === "simulated_fallback") {
    return "simulated_fallback";
  }
  return undefined;
}

function inferComparableArtifactComparisonBasis(artifact: unknown): RunComparisonBasis | undefined {
  if (!isRecord(artifact)) {
    return undefined;
  }

  const kind = artifact.kind;
  const payload = artifact.payload;

  if (kind === "run_trace") {
    const parsed = RunTraceResponseSchema.safeParse(payload);
    if (!parsed.success || !parsed.data.trace) {
      return undefined;
    }
    const runtimeEvidence = normalizeRuntimeEvidence(
      parsed.data.trace.runtimeEvidence,
      parsed.data.trace.evidenceKind,
      parsed.data.trace.steps
    );
    return (
      parsed.data.trace.comparisonBasisPreference ??
      comparisonBasisPreference(runtimeEvidence, parsed.data.trace.evidenceKind)
    );
  }

  if (kind === "replay_report") {
    const parsed = ReplayResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return undefined;
    }
    const runtimeEvidence = normalizeRuntimeEvidence(
      parsed.data.result.runtimeEvidence ?? parsed.data.result.trace?.runtimeEvidence,
      parsed.data.result.trace?.evidenceKind,
      parsed.data.result.trace?.steps
    );
    return (
      parsed.data.result.comparisonBasisPreference ??
      parsed.data.result.trace?.comparisonBasisPreference ??
      comparisonBasisPreference(runtimeEvidence, parsed.data.result.trace?.evidenceKind)
    );
  }

  return undefined;
}

function normalizeRuntimeEvidence(
  runtimeEvidence: unknown,
  evidenceKind?: unknown,
  traceSteps: RunTrace["steps"] = []
): RuntimeEvidence | undefined {
  const runtimeEvidenceRecord = isRecord(runtimeEvidence) ? runtimeEvidence : undefined;
  const parsedRuntimeEvidence = RuntimeEvidenceSchema.safeParse(runtimeEvidence);
  const baseRuntimeEvidence = parsedRuntimeEvidence.success
    ? parsedRuntimeEvidence.data
    : runtimeEvidenceRecord
      ? ({
          ...runtimeEvidenceRecord
        } as RuntimeEvidence)
      : undefined;
  const kind =
    (baseRuntimeEvidence?.kind ?? evidenceKind) === "runtime_backed" ||
    (baseRuntimeEvidence?.kind ?? evidenceKind) === "simulated_fallback"
      ? (baseRuntimeEvidence?.kind ?? evidenceKind)
      : undefined;

  if (!kind) {
    return undefined;
  }

  const normalizedSteps = normalizeRuntimeEvidenceSteps(traceSteps, baseRuntimeEvidence);
  return RuntimeEvidenceSchema.parse({
    ...baseRuntimeEvidence,
    kind,
    runtimeMode:
      baseRuntimeEvidence?.runtimeMode ?? (kind === "runtime_backed" ? "independent_action" : undefined),
    normalizedSteps: normalizedSteps.length > 0 ? normalizedSteps : baseRuntimeEvidence?.normalizedSteps
  });
}

function restTriggerRuntimeMetadata(prefix: "trace" | "replay", runtimeEvidence?: RuntimeEvidence) {
  const restTriggerRuntime = runtimeEvidence?.restTriggerRuntime;
  if (!restTriggerRuntime) {
    return {};
  }

  return {
    [`${prefix}RestTriggerRuntimeEvidence`]: true,
    [`${prefix}RestTriggerRuntimeKind`]: restTriggerRuntime.kind,
    [`${prefix}RestTriggerRuntimeMethod`]: restTriggerRuntime.request?.method,
    [`${prefix}RestTriggerRuntimePath`]: restTriggerRuntime.request?.path,
    [`${prefix}RestTriggerRuntimeReplyStatus`]: restTriggerRuntime.reply?.status,
    [`${prefix}RestTriggerRuntimeHasMappedFlowInput`]: Object.keys(restTriggerRuntime.flowInput ?? {}).length > 0,
    [`${prefix}RestTriggerRuntimeHasMappedFlowOutput`]: Object.keys(restTriggerRuntime.flowOutput ?? {}).length > 0
  };
}

function channelTriggerRuntimeMetadata(prefix: "trace" | "replay", runtimeEvidence?: RuntimeEvidence) {
  const channelTriggerRuntime = runtimeEvidence?.channelTriggerRuntime;
  if (!channelTriggerRuntime) {
    return {};
  }

  return {
    [`${prefix}ChannelTriggerRuntimeEvidence`]: true,
    [`${prefix}ChannelTriggerRuntimeKind`]: channelTriggerRuntime.kind,
    [`${prefix}ChannelTriggerRuntimeChannel`]: channelTriggerRuntime.handler?.channel,
    [`${prefix}ChannelTriggerRuntimeHasData`]: channelTriggerRuntime.data !== undefined,
    [`${prefix}ChannelTriggerRuntimeHasMappedFlowInput`]: Object.keys(channelTriggerRuntime.flowInput ?? {}).length > 0,
    [`${prefix}ChannelTriggerRuntimeHasMappedFlowOutput`]: Object.keys(channelTriggerRuntime.flowOutput ?? {}).length > 0
  };
}

function cliTriggerRuntimeMetadata(prefix: "trace" | "replay", runtimeEvidence?: RuntimeEvidence) {
  const cliTriggerRuntime = runtimeEvidence?.cliTriggerRuntime;
  if (!cliTriggerRuntime) {
    return {};
  }

  return {
    [`${prefix}CLITriggerRuntimeEvidence`]: true,
    [`${prefix}CLITriggerRuntimeKind`]: cliTriggerRuntime.kind,
    [`${prefix}CLITriggerRuntimeCommand`]: cliTriggerRuntime.handler?.command,
    [`${prefix}CLITriggerRuntimeSingleCmd`]: cliTriggerRuntime.settings?.singleCmd,
    [`${prefix}CLITriggerRuntimeHasArgs`]: (cliTriggerRuntime.args?.length ?? 0) > 0,
    [`${prefix}CLITriggerRuntimeHasFlags`]: Object.keys(cliTriggerRuntime.flags ?? {}).length > 0,
    [`${prefix}CLITriggerRuntimeHasMappedFlowInput`]: Object.keys(cliTriggerRuntime.flowInput ?? {}).length > 0,
    [`${prefix}CLITriggerRuntimeHasMappedFlowOutput`]: Object.keys(cliTriggerRuntime.flowOutput ?? {}).length > 0,
    [`${prefix}CLITriggerRuntimeHasReply`]: Boolean(cliTriggerRuntime.reply?.data ?? cliTriggerRuntime.reply?.stdout)
  };
}

function timerTriggerRuntimeMetadata(prefix: "trace" | "replay", runtimeEvidence?: RuntimeEvidence) {
  const timerTriggerRuntime = runtimeEvidence?.timerTriggerRuntime;
  if (!timerTriggerRuntime) {
    return {};
  }

  return {
    [`${prefix}TimerTriggerRuntimeEvidence`]: true,
    [`${prefix}TimerTriggerRuntimeKind`]: timerTriggerRuntime.kind,
    [`${prefix}TimerTriggerRuntimeRunMode`]: timerTriggerRuntime.settings?.runMode,
    [`${prefix}TimerTriggerRuntimeStartDelay`]: timerTriggerRuntime.settings?.startDelay,
    [`${prefix}TimerTriggerRuntimeRepeatInterval`]: timerTriggerRuntime.settings?.repeatInterval,
    [`${prefix}TimerTriggerRuntimeTickObserved`]: Boolean(timerTriggerRuntime.tick),
    [`${prefix}TimerTriggerRuntimeHasMappedFlowInput`]: Object.keys(timerTriggerRuntime.flowInput ?? {}).length > 0,
    [`${prefix}TimerTriggerRuntimeHasMappedFlowOutput`]: Object.keys(timerTriggerRuntime.flowOutput ?? {}).length > 0
  };
}

function buildChannelReplayEvidence(runtimeEvidence?: RuntimeEvidence) {
  const channelTriggerRuntime = runtimeEvidence?.channelTriggerRuntime;
  if (!channelTriggerRuntime) {
    return undefined;
  }

  return {
    comparisonBasis: "channel_runtime_boundary" as const,
    runtimeMode: runtimeEvidence?.runtimeMode,
    channelObserved: Boolean(channelTriggerRuntime.handler?.channel),
    dataObserved: channelTriggerRuntime.data !== undefined,
    flowInputObserved: Boolean(channelTriggerRuntime.flowInput && Object.keys(channelTriggerRuntime.flowInput).length > 0),
    flowOutputObserved: Boolean(channelTriggerRuntime.flowOutput && Object.keys(channelTriggerRuntime.flowOutput).length > 0),
    unsupportedFields: [...(channelTriggerRuntime.unavailableFields ?? [])],
    diagnostics: [...(channelTriggerRuntime.diagnostics ?? [])]
  };
}

function buildRestReplayEvidence(runtimeEvidence?: RuntimeEvidence): RestReplayEvidence | undefined {
  const restTriggerRuntime = runtimeEvidence?.restTriggerRuntime;
  if (!restTriggerRuntime) {
    return undefined;
  }

  return {
    comparisonBasis: "rest_runtime_envelope",
    runtimeMode: runtimeEvidence?.runtimeMode,
    requestEnvelopeObserved: Boolean(restTriggerRuntime.request),
    mappedFlowInputObserved: Boolean(restTriggerRuntime.flowInput && Object.keys(restTriggerRuntime.flowInput).length > 0),
    mappedFlowOutputObserved: Boolean(restTriggerRuntime.flowOutput && Object.keys(restTriggerRuntime.flowOutput).length > 0),
    replyEnvelopeObserved: Boolean(restTriggerRuntime.reply),
    unsupportedFields: Array.from(
      new Set([...(restTriggerRuntime.unavailableFields ?? []), ...(restTriggerRuntime.mapping?.unavailableFields ?? [])])
    ),
    diagnostics: [...(restTriggerRuntime.diagnostics ?? [])]
  };
}

function restReplayMetadata(restReplay?: RestReplayEvidence) {
  if (!restReplay) {
    return {};
  }

  return {
    restReplay,
    replayRestReplayComparisonBasis: restReplay.comparisonBasis,
    replayRestRuntimeMode: restReplay.runtimeMode,
    replayRestRequestEnvelopeObserved: restReplay.requestEnvelopeObserved,
    replayRestMappedFlowInputObserved: restReplay.mappedFlowInputObserved,
    replayRestMappedFlowOutputObserved: restReplay.mappedFlowOutputObserved,
    replayRestReplyEnvelopeObserved: restReplay.replyEnvelopeObserved,
    replayRestUnsupportedFields: restReplay.unsupportedFields,
      replayRestDiagnostics: restReplay.diagnostics
  };
}

function timerReplayMetadata(runtimeEvidence?: RuntimeEvidence) {
  const timerTriggerRuntime = runtimeEvidence?.timerTriggerRuntime;
  if (!timerTriggerRuntime) {
    return {};
  }

  return {
    timerReplay: {
      comparisonBasis: "timer_runtime_startup" as const,
      runtimeMode: runtimeEvidence?.runtimeMode,
      settingsObserved: Boolean(timerTriggerRuntime.settings),
      flowInputObserved: Boolean(timerTriggerRuntime.flowInput && Object.keys(timerTriggerRuntime.flowInput).length > 0),
      flowOutputObserved: Boolean(timerTriggerRuntime.flowOutput && Object.keys(timerTriggerRuntime.flowOutput).length > 0),
      tickObserved: Boolean(timerTriggerRuntime.tick),
      unsupportedFields: [...(timerTriggerRuntime.unavailableFields ?? [])],
      diagnostics: [...(timerTriggerRuntime.diagnostics ?? [])]
    }
  };
}

function restComparisonMetadata(restComparison?: RestEnvelopeComparison) {
  if (!restComparison) {
    return {};
  }

  return {
    restComparison,
    restComparisonBasis: restComparison.comparisonBasis,
    restRequestEnvelopeCompared: restComparison.requestEnvelopeCompared,
    restMappedFlowInputCompared: restComparison.mappedFlowInputCompared,
    restReplyEnvelopeCompared: restComparison.replyEnvelopeCompared,
    restNormalizedStepEvidenceCompared: restComparison.normalizedStepEvidenceCompared,
    restRequestEnvelopeDiff: restComparison.requestEnvelopeDiff,
    restMappedFlowInputDiff: restComparison.mappedFlowInputDiff,
    restReplyEnvelopeDiff: restComparison.replyEnvelopeDiff,
    restNormalizedStepCountDiff: restComparison.normalizedStepCountDiff,
      restComparisonUnsupportedFields: restComparison.unsupportedFields,
      restComparisonDiagnostics: restComparison.diagnostics
  };
}

function timerComparisonMetadata(timerComparison?: {
  comparisonBasis: "timer_runtime_startup";
  runtimeMode?: string;
  settingsCompared: boolean;
  flowInputCompared: boolean;
  flowOutputCompared: boolean;
  tickCompared: boolean;
  settingsDiff?: unknown;
  flowInputDiff?: unknown;
  flowOutputDiff?: unknown;
  tickDiff?: unknown;
  unsupportedFields: string[];
  diagnostics: unknown[];
}) {
  if (!timerComparison) {
    return {};
  }

  return {
    timerComparison,
    timerComparisonBasis: timerComparison.comparisonBasis,
    timerRuntimeMode: timerComparison.runtimeMode,
    timerSettingsCompared: timerComparison.settingsCompared,
    timerFlowInputCompared: timerComparison.flowInputCompared,
    timerFlowOutputCompared: timerComparison.flowOutputCompared,
    timerTickCompared: timerComparison.tickCompared,
    timerSettingsDiff: timerComparison.settingsDiff,
    timerFlowInputDiff: timerComparison.flowInputDiff,
    timerFlowOutputDiff: timerComparison.flowOutputDiff,
    timerTickDiff: timerComparison.tickDiff,
    timerComparisonUnsupportedFields: timerComparison.unsupportedFields,
    timerComparisonDiagnostics: timerComparison.diagnostics
  };
}

function channelComparisonMetadata(channelComparison?: {
  comparisonBasis: "channel_runtime_boundary";
  runtimeMode?: string;
  channelCompared: boolean;
  dataCompared: boolean;
  flowInputCompared: boolean;
  flowOutputCompared: boolean;
  channelDiff?: unknown;
  dataDiff?: unknown;
  flowInputDiff?: unknown;
  flowOutputDiff?: unknown;
  unsupportedFields: string[];
  diagnostics: unknown[];
}) {
  if (!channelComparison) {
    return {};
  }

  return {
    channelComparison,
    channelComparisonBasis: channelComparison.comparisonBasis,
    channelRuntimeMode: channelComparison.runtimeMode,
    channelCompared: channelComparison.channelCompared,
    channelDataCompared: channelComparison.dataCompared,
    channelFlowInputCompared: channelComparison.flowInputCompared,
    channelFlowOutputCompared: channelComparison.flowOutputCompared,
    channelChannelDiff: channelComparison.channelDiff,
    channelDataDiff: channelComparison.dataDiff,
    channelFlowInputDiff: channelComparison.flowInputDiff,
    channelFlowOutputDiff: channelComparison.flowOutputDiff,
    channelComparisonUnsupportedFields: channelComparison.unsupportedFields,
    channelComparisonDiagnostics: channelComparison.diagnostics
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
    && spec.stepType !== "scaffold_activity"
    && spec.stepType !== "scaffold_action"
    && spec.stepType !== "scaffold_trigger"
    && spec.stepType !== "validate_contrib"
    && spec.stepType !== "package_contrib"
    && spec.stepType !== "install_contrib_plan"
    && spec.stepType !== "update_contrib_plan"
    && spec.stepType !== "update_contrib_diff_plan"
    && spec.stepType !== "install_contrib_diff_plan"
    && spec.stepType !== "install_contrib_apply"
    && spec.stepType !== "update_contrib_apply"
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

  if (spec.stepType === "scaffold_activity") {
    const request = ActivityScaffoldRequestSchema.parse(spec.analysisPayload ?? {});
    const requestPath = path.join(tempDir, "activity-scaffold-request.json");
    await fs.writeFile(requestPath, JSON.stringify(request, null, 2), "utf8");
    return {
      command: createHelperCommand("contrib", "scaffold-activity", "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "scaffold_action") {
    const request = ActionScaffoldRequestSchema.parse(spec.analysisPayload ?? {});
    const requestPath = path.join(tempDir, "action-scaffold-request.json");
    await fs.writeFile(requestPath, JSON.stringify(request, null, 2), "utf8");
    return {
      command: createHelperCommand("contrib", "scaffold-action", "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "scaffold_trigger") {
    const request = TriggerScaffoldRequestSchema.parse(spec.analysisPayload ?? {});
    const requestPath = path.join(tempDir, "trigger-scaffold-request.json");
    await fs.writeFile(requestPath, JSON.stringify(request, null, 2), "utf8");
    return {
      command: createHelperCommand("contrib", "scaffold-trigger", "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "validate_contrib") {
    const request = ContributionValidateRequestSchema.parse(spec.analysisPayload ?? {});
    const resolved = resolveContributionScaffoldResultFromPayload(spec.analysisPayload);
    const requestPath = path.join(tempDir, "contrib-validate-request.json");
    await fs.writeFile(requestPath, JSON.stringify({
      result: resolved.result,
      source: resolved.source,
      sourceArtifactId: resolved.sourceArtifactId,
      bundleArtifactId: request.bundleArtifactId
    }, null, 2), "utf8");
    return {
      command: createHelperCommand("contrib", "validate", "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "package_contrib") {
    const request = ContributionPackageRequestSchema.parse(spec.analysisPayload ?? {});
    const resolved = resolveContributionScaffoldResultFromPayload(spec.analysisPayload);
    const requestPath = path.join(tempDir, "contrib-package-request.json");
    await fs.writeFile(requestPath, JSON.stringify({
      result: resolved.result,
      source: resolved.source,
      sourceArtifactId: resolved.sourceArtifactId,
      bundleArtifactId: request.bundleArtifactId,
      format: request.format
    }, null, 2), "utf8");
    return {
      command: createHelperCommand("contrib", "package", "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "install_contrib_plan") {
    const request = ContributionInstallPlanRequestSchema.parse(spec.analysisPayload ?? {});
    const resolved = resolveContributionInstallSourceFromPayload(spec.analysisPayload);
    const requestPath = path.join(tempDir, "contrib-install-plan-request.json");
    await fs.writeFile(requestPath, JSON.stringify({
      result: resolved.result,
      package: resolved.package,
      source: resolved.source,
      sourceArtifactId: resolved.sourceArtifactId,
      preferredAlias: request.preferredAlias,
      replaceExisting: request.replaceExisting,
      targetApp: request.targetApp
    }, null, 2), "utf8");
    return {
      command: createHelperCommand("contrib", "install-plan", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "update_contrib_plan") {
    const request = ContributionUpdatePlanRequestSchema.parse(spec.analysisPayload ?? {});
    const resolved = resolveContributionUpdateSourceFromPayload(spec.analysisPayload);
    const requestPath = path.join(tempDir, "contrib-update-plan-request.json");
    await fs.writeFile(requestPath, JSON.stringify({
      result: resolved.result,
      package: resolved.package,
      source: resolved.source,
      sourceArtifactId: resolved.sourceArtifactId,
      preferredAlias: request.preferredAlias,
      replaceExisting: request.replaceExisting,
      targetApp: request.targetApp
    }, null, 2), "utf8");
    return {
      command: createHelperCommand("contrib", "update-plan", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "update_contrib_diff_plan") {
    const request = ContributionUpdateDiffPlanRequestSchema.parse(spec.analysisPayload ?? {});
    const resolved = resolveContributionUpdatePlanFromPayload(spec.analysisPayload);
    const requestPath = path.join(tempDir, "contrib-update-diff-plan-request.json");
    await fs.writeFile(requestPath, JSON.stringify({
      updatePlan: resolved.result,
      updatePlanArtifactId: request.updatePlanArtifactId ?? resolved.sourceArtifactId,
      targetApp: request.targetApp
    }, null, 2), "utf8");
    return {
      command: createHelperCommand("contrib", "update-diff-plan", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "install_contrib_diff_plan") {
    const request = ContributionInstallDiffPlanRequestSchema.parse(spec.analysisPayload ?? {});
    const resolved = resolveContributionInstallPlanFromPayload(spec.analysisPayload);
    const requestPath = path.join(tempDir, "contrib-install-diff-plan-request.json");
    await fs.writeFile(requestPath, JSON.stringify({
      installPlan: resolved.result,
      installPlanArtifactId: request.installPlanArtifactId ?? resolved.sourceArtifactId,
      targetApp: request.targetApp
    }, null, 2), "utf8");
    return {
      command: createHelperCommand("contrib", "install-diff-plan", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "install_contrib_apply") {
    const request = ContributionInstallApplyRequestSchema.parse(spec.analysisPayload ?? {});
    const resolved = resolveContributionInstallDiffPlanFromPayload(spec.analysisPayload);
    const requestPath = path.join(tempDir, "contrib-install-apply-request.json");
    await fs.writeFile(requestPath, JSON.stringify({
      installDiffPlan: resolved.result,
      installDiffArtifactId: request.installDiffArtifactId ?? resolved.sourceArtifactId,
      sourceInstallPlanArtifactId:
        typeof resolved.result.basedOnInstallPlan?.sourceArtifactId === "string"
          ? resolved.result.basedOnInstallPlan.sourceArtifactId
          : undefined,
      targetApp: request.targetApp
    }, null, 2), "utf8");
    return {
      command: createHelperCommand("contrib", "install-apply", "--app", spec.appPath, "--request", requestPath),
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    };
  }

  if (spec.stepType === "update_contrib_apply") {
    const request = ContributionUpdateApplyRequestSchema.parse(spec.analysisPayload ?? {});
    const resolved = resolveContributionUpdateDiffPlanFromPayload(spec.analysisPayload);
    const requestPath = path.join(tempDir, "contrib-update-apply-request.json");
    await fs.writeFile(requestPath, JSON.stringify({
      updateDiffPlan: resolved.result,
      updateDiffPlanArtifactId: request.updateDiffPlanArtifactId ?? resolved.sourceArtifactId,
      sourceUpdatePlanArtifactId:
        typeof resolved.result.basedOnUpdatePlan?.sourceArtifactId === "string"
          ? resolved.result.basedOnUpdatePlan.sourceArtifactId
          : undefined,
      targetApp: request.targetApp
    }, null, 2), "utf8");
    return {
      command: createHelperCommand("contrib", "update-apply", "--app", spec.appPath, "--request", requestPath),
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
      const runtimeEvidence = normalizeRuntimeEvidence(
        response.trace?.runtimeEvidence,
        response.trace?.evidenceKind,
        response.trace?.steps
      );
      const traceComparisonBasisPreference = comparisonBasisPreference(
        runtimeEvidence,
        response.trace?.evidenceKind
      );
      const trace = response.trace
        ? {
            ...response.trace,
            comparisonBasisPreference: traceComparisonBasisPreference,
            runtimeEvidence: runtimeEvidence ?? response.trace.runtimeEvidence
          }
        : response.trace;
      return [
        createAnalysisArtifact(
          spec,
          validateOnly ? "run_trace_plan" : "run_trace",
          `run-trace-${String(spec.analysisPayload?.flowId ?? "flow")}`,
          {
            trace,
            validation: response.validation,
            traceEvidenceKind: trace?.evidenceKind ?? runtimeEvidence?.kind,
            traceComparisonBasisPreference:
              trace?.comparisonBasisPreference ?? traceComparisonBasisPreference,
            runtimeEvidence: trace?.runtimeEvidence ?? runtimeEvidence,
            traceNormalizedStepCount: Array.isArray(trace?.runtimeEvidence?.normalizedSteps)
              ? trace.runtimeEvidence.normalizedSteps.length
              : Array.isArray(runtimeEvidence?.normalizedSteps)
                ? runtimeEvidence.normalizedSteps.length
                : 0,
            traceRecorderBacked: trace?.runtimeEvidence?.recorderBacked ?? runtimeEvidence?.recorderBacked,
            traceRecorderMode: trace?.runtimeEvidence?.recorderMode ?? runtimeEvidence?.recorderMode,
            traceRuntimeMode: trace?.runtimeEvidence?.runtimeMode ?? runtimeEvidence?.runtimeMode,
            traceFallbackReason: trace?.runtimeEvidence?.fallbackReason ?? runtimeEvidence?.fallbackReason,
            ...restTriggerRuntimeMetadata("trace", trace?.runtimeEvidence ?? runtimeEvidence),
            ...cliTriggerRuntimeMetadata("trace", trace?.runtimeEvidence ?? runtimeEvidence),
            ...timerTriggerRuntimeMetadata("trace", trace?.runtimeEvidence ?? runtimeEvidence),
            ...channelTriggerRuntimeMetadata("trace", trace?.runtimeEvidence ?? runtimeEvidence),
            diagnostics
          }
        )
      ];
    }

    if (spec.stepType === "replay_flow") {
      const response = JSON.parse(stdout) as ReplayResponse;
      const validateOnly = spec.analysisPayload?.validateOnly === true || !response.result.trace;
      const runtimeEvidence = normalizeRuntimeEvidence(
        response.result.runtimeEvidence ?? response.result.trace?.runtimeEvidence,
        response.result.trace?.evidenceKind,
        response.result.trace?.steps
      );
      const replayComparisonBasisPreference = comparisonBasisPreference(
        runtimeEvidence,
        response.result.trace?.evidenceKind
      );
      const restReplay = response.result.restReplay ?? buildRestReplayEvidence(runtimeEvidence);
      const resultTrace = response.result.trace
        ? {
            ...response.result.trace,
            comparisonBasisPreference: replayComparisonBasisPreference,
            runtimeEvidence: runtimeEvidence ?? response.result.trace.runtimeEvidence
          }
        : response.result.trace;
      const result = {
        ...response.result,
        comparisonBasisPreference: replayComparisonBasisPreference,
        restReplay,
        trace: resultTrace,
        runtimeEvidence: runtimeEvidence ?? response.result.runtimeEvidence
      };
      return [
        createAnalysisArtifact(
          spec,
          validateOnly ? "replay_plan" : "replay_report",
          `replay-${String(spec.analysisPayload?.flowId ?? "flow")}`,
          {
            result,
            replayEvidenceKind: result.runtimeEvidence?.kind,
            replayComparisonBasisPreference: result.comparisonBasisPreference,
            replayNormalizedStepCount: Array.isArray(result.runtimeEvidence?.normalizedSteps)
              ? result.runtimeEvidence.normalizedSteps.length
              : 0,
            replayRecorderBacked: result.runtimeEvidence?.recorderBacked,
            replayRecorderMode: result.runtimeEvidence?.recorderMode,
            replayRuntimeMode: result.runtimeEvidence?.runtimeMode,
            replayFallbackReason: result.runtimeEvidence?.fallbackReason,
            runtimeEvidence: result.runtimeEvidence,
            traceEvidenceKind: result.trace?.evidenceKind ?? result.runtimeEvidence?.kind,
            ...restReplayMetadata(result.restReplay),
            ...timerReplayMetadata(result.runtimeEvidence),
            ...restTriggerRuntimeMetadata("replay", result.runtimeEvidence),
            ...cliTriggerRuntimeMetadata("replay", result.runtimeEvidence),
            ...timerTriggerRuntimeMetadata("replay", result.runtimeEvidence),
            ...channelTriggerRuntimeMetadata("replay", result.runtimeEvidence),
            replayChannelReplayEvidence: buildChannelReplayEvidence(result.runtimeEvidence),
            diagnostics
          }
        )
      ];
    }

    if (spec.stepType === "compare_runs") {
      const response = JSON.parse(stdout) as RunComparisonResponse;
      const validateOnly = spec.analysisPayload?.validateOnly === true || !response.result;
      const leftComparisonBasisPreference =
        response.result?.left.comparisonBasisPreference ??
        inferComparableArtifactComparisonBasis(spec.analysisPayload?.leftArtifact);
      const rightComparisonBasisPreference =
        response.result?.right.comparisonBasisPreference ??
        inferComparableArtifactComparisonBasis(spec.analysisPayload?.rightArtifact);
      const result = response.result
        ? {
            ...response.result,
            left: {
              ...response.result.left,
              comparisonBasisPreference: leftComparisonBasisPreference
            },
            right: {
              ...response.result.right,
              comparisonBasisPreference: rightComparisonBasisPreference
            }
          }
        : response.result;
      return [
        createAnalysisArtifact(
          spec,
          validateOnly ? "run_comparison_plan" : "run_comparison",
          `run-comparison-${String(spec.analysisPayload?.leftArtifactId ?? "left")}-${String(spec.analysisPayload?.rightArtifactId ?? "right")}`,
          {
            result,
            validation: response.validation,
            comparisonBasis: result?.comparisonBasis,
            leftComparisonBasisPreference,
            rightComparisonBasisPreference,
            leftEvidenceKind: result?.left.evidenceKind,
            rightEvidenceKind: result?.right.evidenceKind,
            leftNormalizedStepEvidence: result?.left.normalizedStepEvidence,
            rightNormalizedStepEvidence: result?.right.normalizedStepEvidence,
            leftRestTriggerRuntimeEvidence: result?.left.restTriggerRuntimeEvidence,
            rightRestTriggerRuntimeEvidence: result?.right.restTriggerRuntimeEvidence,
            leftRestTriggerRuntimeKind: result?.left.restTriggerRuntimeKind,
            rightRestTriggerRuntimeKind: result?.right.restTriggerRuntimeKind,
            leftCLITriggerRuntimeEvidence: result?.left.cliTriggerRuntimeEvidence,
            rightCLITriggerRuntimeEvidence: result?.right.cliTriggerRuntimeEvidence,
            leftCLITriggerRuntimeKind: result?.left.cliTriggerRuntimeKind,
            rightCLITriggerRuntimeKind: result?.right.cliTriggerRuntimeKind,
            leftTimerTriggerRuntimeEvidence: result?.left.timerTriggerRuntimeEvidence,
            rightTimerTriggerRuntimeEvidence: result?.right.timerTriggerRuntimeEvidence,
            leftTimerTriggerRuntimeKind: result?.left.timerTriggerRuntimeKind,
            rightTimerTriggerRuntimeKind: result?.right.timerTriggerRuntimeKind,
            leftChannelTriggerRuntimeEvidence: result?.left.channelTriggerRuntimeEvidence,
            rightChannelTriggerRuntimeEvidence: result?.right.channelTriggerRuntimeEvidence,
            leftChannelTriggerRuntimeKind: result?.left.channelTriggerRuntimeKind,
            rightChannelTriggerRuntimeKind: result?.right.channelTriggerRuntimeKind,
            leftChannelTriggerRuntimeChannel: result?.left.channelTriggerRuntimeChannel,
            rightChannelTriggerRuntimeChannel: result?.right.channelTriggerRuntimeChannel,
            ...restComparisonMetadata(result?.restComparison),
            ...channelComparisonMetadata(result?.channelComparison),
            ...timerComparisonMetadata(result?.timerComparison),
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

    if (spec.stepType === "scaffold_activity") {
      const response = ActivityScaffoldResponseSchema.parse(JSON.parse(stdout) as ActivityScaffoldResponse);
      return createContributionScaffoldArtifacts(spec, response.result, diagnostics);
    }

    if (spec.stepType === "scaffold_action") {
      const response = ActionScaffoldResponseSchema.parse(JSON.parse(stdout) as ActionScaffoldResponse);
      return createContributionScaffoldArtifacts(spec, response.result, diagnostics);
    }

    if (spec.stepType === "scaffold_trigger") {
      const response = TriggerScaffoldResponseSchema.parse(JSON.parse(stdout) as TriggerScaffoldResponse);
      return createContributionScaffoldArtifacts(spec, response.result, diagnostics);
    }

    if (spec.stepType === "validate_contrib") {
      const response = ContributionValidateResponseSchema.parse(JSON.parse(stdout) as ContributionValidateResponse);
      return createContributionValidationArtifacts(spec, response.result as ContributionValidateResultLike, diagnostics);
    }

    if (spec.stepType === "package_contrib") {
      const response = ContributionPackageResponseSchema.parse(JSON.parse(stdout) as ContributionPackageResponse);
      return createContributionPackageArtifacts(spec, response.result as ContributionPackageResultLike, diagnostics);
    }

    if (spec.stepType === "install_contrib_plan") {
      const response = ContributionInstallPlanResponseSchema.parse(JSON.parse(stdout) as ContributionInstallPlanResponse);
      return createContributionInstallPlanArtifacts(spec, response.result as ContributionInstallPlanResultLike, diagnostics);
    }

    if (spec.stepType === "update_contrib_plan") {
      const response = ContributionUpdatePlanResponseSchema.parse(JSON.parse(stdout) as ContributionUpdatePlanResponse);
      return createContributionUpdatePlanArtifacts(spec, response.result as ContributionUpdatePlanResultLike, diagnostics);
    }

    if (spec.stepType === "update_contrib_diff_plan") {
      const response = ContributionUpdateDiffPlanResponseSchema.parse(JSON.parse(stdout) as ContributionUpdateDiffPlanResponse);
      return createContributionUpdateDiffPlanArtifacts(spec, response.result as ContributionUpdateDiffPlanResultLike, diagnostics);
    }

    if (spec.stepType === "install_contrib_diff_plan") {
      const response = ContributionInstallDiffPlanResponseSchema.parse(JSON.parse(stdout) as ContributionInstallDiffPlanResponse);
      return createContributionInstallDiffPlanArtifacts(spec, response.result as ContributionInstallDiffPlanResultLike, diagnostics);
    }

    if (spec.stepType === "install_contrib_apply") {
      const response = ContributionInstallApplyResponseSchema.parse(JSON.parse(stdout) as ContributionInstallApplyResponse);
      return createContributionInstallApplyArtifacts(spec, response.result as ContributionInstallApplyResultLike, diagnostics);
    }

    if (spec.stepType === "update_contrib_apply") {
      const response = ContributionUpdateApplyResponseSchema.parse(JSON.parse(stdout) as ContributionUpdateApplyResponse);
      return createContributionUpdateApplyArtifacts(spec, response.result as ContributionUpdateApplyResultLike, diagnostics);
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

type ExecutedCommandResult = {
  ok: boolean;
  exitCode: number;
  startedAt: string;
  finishedAt: string;
  stdout: string;
  stderr: string;
  diagnostics: Diagnostic[];
  logArtifact: ArtifactRef;
  artifacts: ArtifactRef[];
};

type DiagnosisComparableArtifact = {
  artifactId: string;
  kind: "run_trace" | "replay_report";
  payload: Record<string, unknown>;
};

async function executePreparedRunnerCommand(spec: RunnerJobSpec): Promise<ExecutedCommandResult> {
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
      const diagnostics: Diagnostic[] = stderr
        ? [
            {
              code: "runner.stderr",
              message: stderr.trim(),
              severity: "warning"
            } satisfies Diagnostic
          ]
        : [];
      const logArtifact = createLogArtifact(spec.taskId, spec.stepType, `${stdout}\n${stderr}`.trim());
      const artifacts = [logArtifact];
      if (code === 0 && isAnalysisStep(spec.stepType) && spec.stepType !== "diagnose_app") {
        artifacts.push(...createAnalysisArtifacts(spec, stdout, diagnostics));
      }

      resolve({
        ok: code === 0,
        exitCode: code ?? 1,
        startedAt,
        finishedAt: new Date().toISOString(),
        stdout,
        stderr,
        diagnostics,
        logArtifact,
        artifacts
      });
    });

    child.on("error", (error) => {
      void prepared.cleanup?.();
      const logArtifact = createLogArtifact(spec.taskId, spec.stepType, error.message);
      resolve({
        ok: false,
        exitCode: 1,
        startedAt,
        finishedAt: new Date().toISOString(),
        stdout,
        stderr,
        diagnostics: [
          {
            code: "runner.spawn_error",
            message: error.message,
            severity: "error"
          }
        ],
        logArtifact,
        artifacts: [logArtifact]
      });
    });
  });
}

function artifactByType(artifacts: ArtifactRef[], type: ArtifactRef["type"]) {
  return artifacts.find((artifact) => artifact.type === type);
}

function parseContributionInstallApplyArtifact(artifact?: ArtifactRef) {
  if (!artifact) {
    return undefined;
  }

  const parsed = ContributionInstallApplyResponseSchema.safeParse({
    result: artifact.metadata?.["result"]
  });
  return parsed.success ? parsed.data : undefined;
}

function parseContributionUpdateApplyArtifact(artifact?: ArtifactRef) {
  if (!artifact) {
    return undefined;
  }

  const parsed = ContributionUpdateApplyResponseSchema.safeParse({
    result: artifact.metadata?.["result"]
  });
  return parsed.success ? parsed.data : undefined;
}

function parseContributionUpdatePlanArtifact(artifact?: ArtifactRef) {
  if (!artifact) {
    return undefined;
  }

  const parsed = ContributionUpdatePlanResponseSchema.safeParse({
    result: artifact.metadata?.["result"]
  });
  return parsed.success ? parsed.data : undefined;
}

function parseContributionUpdateDiffPlanArtifact(artifact?: ArtifactRef) {
  if (!artifact) {
    return undefined;
  }

  const parsed = ContributionUpdateDiffPlanResponseSchema.safeParse({
    result: artifact.metadata?.["result"]
  });
  return parsed.success ? parsed.data : undefined;
}

function parseTraceArtifact(artifact?: ArtifactRef) {
  if (!artifact) {
    return undefined;
  }

  const parsed = RunTraceResponseSchema.safeParse({
    trace: artifact.metadata?.["trace"],
    validation: artifact.metadata?.["validation"]
  });
  return parsed.success ? parsed.data : undefined;
}

function parseReplayArtifact(artifact?: ArtifactRef) {
  if (!artifact) {
    return undefined;
  }

  const parsed = ReplayResponseSchema.safeParse({
    result: artifact.metadata?.["result"]
  });
  return parsed.success ? parsed.data : undefined;
}

function parseComparisonArtifact(artifact?: ArtifactRef) {
  if (!artifact) {
    return undefined;
  }

  const parsed = RunComparisonResponseSchema.safeParse({
    result: artifact.metadata?.["result"],
    validation: artifact.metadata?.["validation"]
  });
  return parsed.success ? parsed.data : undefined;
}

function toComparableArtifact(artifact?: ArtifactRef): DiagnosisComparableArtifact | undefined {
  if (!artifact) {
    return undefined;
  }

  if (artifact.type === "run_trace") {
    return {
      artifactId: artifact.id,
      kind: "run_trace",
      payload: {
        trace: artifact.metadata?.["trace"],
        validation: artifact.metadata?.["validation"]
      }
    };
  }

  if (artifact.type === "replay_report") {
    return {
      artifactId: artifact.id,
      kind: "replay_report",
      payload: {
        result: artifact.metadata?.["result"]
      }
    };
  }

  return undefined;
}

async function executeNestedAnalysisStep(
  parentSpec: RunnerJobSpec,
  args: {
    stepType: RunnerJobSpec["stepType"];
    jobKind: RunnerJobSpec["jobKind"];
    analysisKind?: RunnerJobSpec["analysisKind"];
    analysisPayload?: Record<string, unknown>;
    targetNodeId?: string;
    targetRef?: string;
  }
) {
  const nestedSpec = RunnerJobSpecSchema.parse({
    ...parentSpec,
    stepType: args.stepType,
    jobKind: args.jobKind,
    analysisKind: args.analysisKind,
    analysisPayload: args.analysisPayload,
    targetNodeId: args.targetNodeId,
    targetRef: args.targetRef,
    artifactOutputUri: `${parentSpec.artifactOutputUri}/${args.stepType}`,
    artifactBlobPrefix: parentSpec.artifactBlobPrefix ? `${parentSpec.artifactBlobPrefix}/${args.stepType}` : undefined
  });

  return executePreparedRunnerCommand(nestedSpec);
}

async function executeDiagnosis(spec: RunnerJobSpec): Promise<RunnerJobResult> {
  const request = DiagnosisRequestSchema.parse(spec.analysisPayload ?? {});
  const plan = planDiagnosis(request);
  const appDocument = await fs.readFile(spec.appPath, "utf8");

  const nestedArtifacts: ArtifactRef[] = [];
  const relatedArtifactIds: string[] = [];
  const validation = validateFlogoApp(appDocument);
  let flowContracts: FlowContracts | undefined;
  let mappingPreviewResult: MappingPreviewResult | undefined;
  let mappingTestResult: MappingTestResponse["result"] | undefined;
  let triggerBindingPlan: TriggerBindingResponse["result"]["plan"] | undefined;
  let traceResponse: RunTraceResponse | undefined;
  let replayResponse: ReplayResponse | undefined;
  let comparisonResponse: RunComparisonResponse | undefined;

  if (plan.selectedOperations.includes("flow_contract_analysis") && request.flowId) {
    flowContracts = inferFlowContracts(appDocument);
  }

  if (plan.selectedOperations.includes("mapping_preview") && request.targetNodeId) {
    const mappingContext =
      request.mappingContext ??
      ({
        flow: request.sampleInput,
        activity: {},
        env: {},
        property: {},
        trigger:
          request.triggerFamily === "rest" || request.triggerFamily === "cli" || request.triggerFamily === "channel"
            ? request.sampleInput
            : {}
      } satisfies MappingPreviewContext);
    mappingPreviewResult = previewMapping(appDocument, request.targetNodeId, mappingContext);
  }

  if (plan.selectedOperations.includes("mapping_test") && request.targetNodeId && request.expectedOutput) {
    const mappingContext =
      request.mappingContext ??
      ({
        flow: request.sampleInput,
        activity: {},
        env: {},
        property: {},
        trigger:
          request.triggerFamily === "rest" || request.triggerFamily === "cli" || request.triggerFamily === "channel"
            ? request.sampleInput
            : {}
      } satisfies MappingPreviewContext);
    mappingTestResult = runMappingTest(appDocument, request.targetNodeId, mappingContext, request.expectedOutput, true);
  }

  if (plan.selectedOperations.includes("trigger_binding_analysis") && request.profile && request.flowId) {
    triggerBindingPlan = planTriggerBinding(appDocument, {
      flowId: request.flowId,
      profile: request.profile,
      validateOnly: true
    }).result.plan;
  }

  if (plan.selectedOperations.includes("run_trace") && request.flowId) {
    const traceExecution = await executeNestedAnalysisStep(spec, {
      stepType: "capture_run_trace",
      jobKind: "run_trace_capture",
      analysisPayload: {
        flowId: request.flowId,
        sampleInput: request.sampleInput,
        capture: request.capture,
        validateOnly: false
      }
    });
    nestedArtifacts.push(...traceExecution.artifacts);
    const traceArtifact = artifactByType(traceExecution.artifacts, "run_trace");
    if (traceArtifact) {
      relatedArtifactIds.push(traceArtifact.id);
      traceResponse = parseTraceArtifact(traceArtifact);
    }
  }

  let replayBaseInput = request.baseInput;
  if (!replayBaseInput && traceResponse?.trace?.summary.input) {
    replayBaseInput = traceResponse.trace.summary.input;
  }

  if (plan.selectedOperations.includes("replay") && request.flowId && replayBaseInput) {
    const replayExecution = await executeNestedAnalysisStep(spec, {
      stepType: "replay_flow",
      jobKind: "flow_replay",
      analysisPayload: {
        flowId: request.flowId,
        baseInput: replayBaseInput,
        overrides: request.overrides,
        capture: request.capture,
        validateOnly: false
      }
    });
    nestedArtifacts.push(...replayExecution.artifacts);
    const replayArtifact = artifactByType(replayExecution.artifacts, "replay_report");
    if (replayArtifact) {
      relatedArtifactIds.push(replayArtifact.id);
      replayResponse = parseReplayArtifact(replayArtifact);
    }
  }

  const leftComparable =
    request.leftArtifact
      ? (request.leftArtifact as DiagnosisComparableArtifact)
      : toComparableArtifact(artifactByType(nestedArtifacts, "run_trace"));
  const rightComparable =
    request.rightArtifact
      ? (request.rightArtifact as DiagnosisComparableArtifact)
      : toComparableArtifact(artifactByType(nestedArtifacts, "replay_report"));

  if (plan.selectedOperations.includes("compare_runs") && leftComparable && rightComparable) {
    const compareExecution = await executeNestedAnalysisStep(spec, {
      stepType: "compare_runs",
      jobKind: "run_comparison",
      analysisPayload: {
        leftArtifactId: request.leftArtifactId ?? leftComparable.artifactId,
        rightArtifactId: request.rightArtifactId ?? rightComparable.artifactId,
        leftArtifact: leftComparable,
        rightArtifact: rightComparable,
        compare: request.compare,
        validateOnly: false
      }
    });
    nestedArtifacts.push(...compareExecution.artifacts);
    const comparisonArtifact = artifactByType(compareExecution.artifacts, "run_comparison");
    if (comparisonArtifact) {
      relatedArtifactIds.push(comparisonArtifact.id);
      comparisonResponse = parseComparisonArtifact(comparisonArtifact);
    }
  }

  const report = buildAgentDiagnosisReport(request, {
    validation,
    flowContracts,
    mappingPreview: mappingPreviewResult,
    mappingTest: mappingTestResult,
    triggerBindingPlan,
    trace: traceResponse?.trace,
    replay: replayResponse?.result,
    comparison: comparisonResponse?.result,
    relatedArtifactIds
  });

  const diagnosisArtifact = createAnalysisArtifact(spec, "diagnosis_report", "diagnosis-report", {
    report,
    problemCategory: report.problemCategory,
    subtype: report.subtype,
    evidenceQuality: report.evidenceQuality,
    confidence: report.confidence,
    selectedOperations: report.plan.selectedOperations,
    relatedArtifactIds: report.relatedArtifactIds,
    fallbackDetected: report.fallbackDetected,
    diagnostics: report.diagnostics
  });

  const logArtifact = createLogArtifact(
    spec.taskId,
    spec.stepType,
    JSON.stringify(
      {
        symptom: request.symptom,
        triggerFamily: request.triggerFamily,
        selectedOperations: plan.selectedOperations,
        relatedArtifactIds
      },
      null,
      2
    )
  );

  const diagnostics = [...validation.stages.flatMap((stage) => stage.diagnostics), ...report.diagnostics];

  return RunnerJobResultSchema.parse({
    jobId: `${spec.taskId}-${spec.stepType}`,
    jobRunId: spec.jobRunId,
    ok: true,
    status: "succeeded",
    summary: `Executed ${spec.stepType}`,
    exitCode: 0,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    jobTemplateName: spec.jobTemplateName,
    logArtifact,
    artifacts: [logArtifact, ...nestedArtifacts, diagnosisArtifact],
    diagnostics
  });
}

export class RunnerExecutorService implements RunnerExecutor {
  async execute(specInput: RunnerJobSpec): Promise<RunnerJobResult> {
    const spec = RunnerJobSpecSchema.parse(specInput);
    if (spec.stepType === "diagnose_app") {
      return executeDiagnosis(spec);
    }

    const executed = await executePreparedRunnerCommand(spec);
    let ok = executed.ok;
    let summary = executed.ok ? `Executed ${spec.stepType}` : `Execution failed for ${spec.stepType}`;
    let exitCode = executed.exitCode;
    const diagnostics = [...executed.diagnostics];

    if (spec.stepType === "install_contrib_apply" && executed.ok) {
      const parsedApply = parseContributionInstallApplyArtifact(
        artifactByType(executed.artifacts, "contrib_install_apply_result")
      );
      const applyResult = parsedApply?.result;
      const changedPaths = Array.isArray(applyResult?.changedPaths) ? applyResult.changedPaths : [];
      const shouldFail =
        applyResult?.isStale === true ||
        applyResult?.applyReady === false ||
        (applyResult?.applied === false && changedPaths.length > 0);
      if (shouldFail) {
        ok = false;
        exitCode = 1;
        summary = "Execution failed for install_contrib_apply";
        diagnostics.push({
          code: "runner.install_apply_blocked",
          message:
            applyResult?.staleReason ??
            applyResult?.recommendedNextAction ??
            "Contribution install apply was blocked because the saved diff preview was stale or not apply-ready.",
          severity: "error"
        });
      }
    }

    if (spec.stepType === "update_contrib_apply" && executed.ok) {
      const parsedApply = parseContributionUpdateApplyArtifact(
        artifactByType(executed.artifacts, "contrib_update_apply")
      );
      const applyResult = parsedApply?.result;
      const changedPaths = Array.isArray(applyResult?.changedPaths) ? applyResult.changedPaths : [];
      const shouldFail =
        applyResult?.isStale === true ||
        applyResult?.applyReady === false ||
        (applyResult?.applied === false && changedPaths.length > 0);
      if (shouldFail) {
        ok = false;
        exitCode = 1;
        summary = "Execution failed for update_contrib_apply";
        diagnostics.push({
          code: "runner.update_apply_blocked",
          message:
            applyResult?.staleReason ??
            applyResult?.recommendedNextAction ??
            "Contribution update apply was blocked because the approved exact diff preview was stale or not apply-ready.",
          severity: "error"
        });
      }
    }

    if (spec.stepType === "update_contrib_plan" && executed.ok) {
      const parsedUpdate = parseContributionUpdatePlanArtifact(
        artifactByType(executed.artifacts, "contrib_update_plan")
      );
      const updateResult = parsedUpdate?.result;
      const shouldFail =
        updateResult?.updateReady === false ||
        updateResult?.matchQuality === "ambiguous" ||
        updateResult?.matchQuality === "none" ||
        updateResult?.compatibility === "ambiguous" ||
        updateResult?.compatibility === "incompatible" ||
        (updateResult?.detectedInstalledContribution == null);
      if (shouldFail) {
        ok = false;
        exitCode = 1;
        summary = "Execution failed for update_contrib_plan";
        diagnostics.push({
          code: "runner.update_plan_blocked",
          message:
            updateResult?.recommendedNextAction ??
            "Contribution update planning was blocked because the installed contribution could not be matched safely.",
          severity: "error"
        });
      }
    }

    if (spec.stepType === "update_contrib_diff_plan" && executed.ok) {
      const parsedDiff = parseContributionUpdateDiffPlanArtifact(
        artifactByType(executed.artifacts, "contrib_update_diff_plan")
      );
      const diffResult = parsedDiff?.result;
      const changedPaths = Array.isArray(diffResult?.predictedChanges?.changedPaths) ? diffResult.predictedChanges.changedPaths : [];
      const shouldFail =
        diffResult?.isStale === true ||
        diffResult?.previewAvailable === false ||
        diffResult?.updateReady === false ||
        (changedPaths.length > 0 && typeof diffResult?.canonicalAfterJson !== "string");
      if (shouldFail) {
        ok = false;
        exitCode = 1;
        summary = "Execution failed for update_contrib_diff_plan";
        diagnostics.push({
          code: "runner.update_diff_plan_blocked",
          message:
            diffResult?.staleReason ??
            diffResult?.recommendedNextAction ??
            "Contribution update diff preview was blocked because the saved update plan is stale or does not support an exact canonical preview safely.",
          severity: "error"
        });
      }
    }

    return RunnerJobResultSchema.parse({
      jobId: `${spec.taskId}-${spec.stepType}`,
      jobRunId: spec.jobRunId,
      ok,
      status: ok ? "succeeded" : "failed",
      summary,
      exitCode,
      startedAt: executed.startedAt,
      finishedAt: executed.finishedAt,
      jobTemplateName: spec.jobTemplateName,
      logArtifact: executed.logArtifact,
      artifacts: executed.artifacts,
      diagnostics
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
