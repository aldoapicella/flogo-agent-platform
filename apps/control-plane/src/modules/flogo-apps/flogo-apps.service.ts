import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ArtifactRefSchema,
  CompositionCompareRequestSchema,
  CompositionCompareResponseSchema,
  ContribEvidenceResponseSchema,
  ContribDescriptorResponseSchema,
  ContribCatalogResponseSchema,
  ContributionInventoryResponseSchema,
  DeploymentProfileSchema,
  DoWhileSynthesisRequestSchema,
  DoWhileSynthesisResponseSchema,
  ErrorPathTemplateRequestSchema,
  ErrorPathTemplateResponseSchema,
  FlowContractsResponseSchema,
  GovernanceResponseSchema,
  IteratorSynthesisRequestSchema,
  IteratorSynthesisResponseSchema,
  ReplayRequestSchema,
  ReplayResponseSchema,
  RunComparisonRequestSchema,
  RunComparisonResponseSchema,
  type RestEnvelopeComparison,
  type RestReplayEvidence,
  RunTraceRequestSchema,
  RunTraceResponseSchema,
  MappingPreviewRequestSchema,
  MappingPreviewResponseSchema,
  MappingTestResponseSchema,
  MappingTestSpecSchema,
  PropertyPlanResponseSchema,
  RetryPolicyRequestSchema,
  RetryPolicyResponseSchema,
  RuntimeEvidenceSchema,
  type NormalizedRuntimeStepEvidence,
  type RunComparisonBasis,
  type RunTrace,
  type RuntimeEvidence,
  SubflowExtractionRequestSchema,
  SubflowExtractionResponseSchema,
  SubflowInliningRequestSchema,
  SubflowInliningResponseSchema,
  TriggerBindingRequestSchema,
  TriggerBindingResponseSchema
} from "@flogo-agent/contracts";
import {
  analyzePropertyUsage,
  applyDoWhileSynthesis,
  applyErrorPathTemplate,
  applyIteratorSynthesis,
  applyRetryPolicy,
  applySubflowExtraction,
  applySubflowInlining,
  applyTriggerBinding,
  buildAppGraph,
  buildContributionInventory,
  buildContribCatalog,
  compareJsonVsProgrammatic,
  inferFlowContracts,
  inspectContribEvidence,
  inspectContribDescriptor,
  parseFlogoAppDocument,
  planReplay,
  planRunComparison,
  planRunTrace,
  planSubflowExtraction,
  planSubflowInlining,
  planTriggerBinding,
  previewMapping,
  runMappingTest,
  serializeFlogoAppDocument,
  ControlFlowSynthesisError,
  ErrorPathTemplateError,
  compareRuns,
  ReplayError,
  RunComparisonError,
  SubflowOperationError,
  planDoWhileSynthesis,
  planErrorPathTemplate,
  planIteratorSynthesis,
  planRetryPolicy,
  suggestCoercions,
  TriggerBindingError,
  validateGovernance
} from "@flogo-agent/flogo-graph";

import { AppAnalysisStorageService } from "./app-analysis-storage.service.js";
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
  constructor(
    private readonly storage: AppAnalysisStorageService,
    private readonly prisma?: PrismaService
  ) {}

  async getGraph(projectId: string, appId: string) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    return buildAppGraph(resolved.content);
  }

  async getInventory(projectId: string, appId: string) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const inventory = buildContributionInventory(resolved.content, { appPath: resolved.appPath });
    const artifact = await this.persistArtifact(
      resolved,
      "contrib_inventory",
      `${appId}-contrib-inventory.json`,
      {
        analysisType: "inventory",
        appId,
        sourceType: resolved.sourceType
      },
      {
        inventory
      }
    );

    return ContributionInventoryResponseSchema.parse({
      inventory,
      artifact
    });
  }

  async getCatalog(projectId: string, appId: string) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const catalog = buildContribCatalog(resolved.content, { appPath: resolved.appPath });
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

  async getFlowContracts(projectId: string, appId: string, flowId?: string) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const contracts = inferFlowContracts(resolved.content);
    const selectedContracts = flowId
      ? contracts.contracts.filter((contract) => contract.flowId === flowId)
      : contracts.contracts;

    if (flowId && selectedContracts.length === 0) {
      return undefined;
    }

    const responseContracts = FlowContractsResponseSchema.parse({
      contracts: {
        ...contracts,
        contracts: selectedContracts
      }
    }).contracts;
    const artifact = await this.persistArtifact(
      resolved,
      "flow_contract",
      `${appId}${flowId ? `-${this.sanitizeArtifactName(flowId)}` : ""}-flow-contracts.json`,
      {
        analysisType: "flow_contracts",
        appId,
        flowId,
        sourceType: resolved.sourceType
      },
      {
        contracts: responseContracts
      }
    );

    return FlowContractsResponseSchema.parse({
      contracts: responseContracts,
      artifact
    });
  }

  async traceFlow(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = RunTraceRequestSchema.parse(payload);
    if (request.validateOnly) {
      const response = planRunTrace(resolved.content, request);
      const artifact = await this.persistArtifact(
        resolved,
        "run_trace_plan",
        `${appId}-${this.sanitizeArtifactName(request.flowId)}-run-trace-plan.json`,
        {
          analysisType: "run_trace_plan",
          appId,
          flowId: request.flowId,
          sourceType: resolved.sourceType
        },
        {
          validation: response.validation
        }
      );

      return RunTraceResponseSchema.parse({
        ...response,
        artifact
      });
    }

    planRunTrace(resolved.content, request);
    const response = await this.executeRunTraceWithHelper(resolved.appPath, request);
    const runtimeEvidence = this.normalizeRuntimeEvidence(
      response.trace?.runtimeEvidence,
      response.trace?.evidenceKind,
      response.trace?.steps
    );
    const comparisonBasisPreference = this.getComparisonBasisPreference(
      runtimeEvidence,
      response.trace?.evidenceKind
    );
    const trace = response.trace
      ? {
          ...response.trace,
          comparisonBasisPreference,
          runtimeEvidence: runtimeEvidence ?? response.trace.runtimeEvidence
        }
      : response.trace;
    const artifact = await this.persistArtifact(
      resolved,
      "run_trace",
      `${appId}-${this.sanitizeArtifactName(request.flowId)}-run-trace.json`,
      {
        analysisType: "run_trace",
        appId,
        flowId: request.flowId,
        traceEvidenceKind: trace?.evidenceKind ?? runtimeEvidence?.kind,
        traceComparisonBasisPreference: trace?.comparisonBasisPreference ?? comparisonBasisPreference,
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
        ...this.restTriggerRuntimeMetadata("trace", trace?.runtimeEvidence ?? runtimeEvidence),
        ...this.cliTriggerRuntimeMetadata("trace", trace?.runtimeEvidence ?? runtimeEvidence),
        ...this.timerTriggerRuntimeMetadata("trace", trace?.runtimeEvidence ?? runtimeEvidence),
        ...this.channelTriggerRuntimeMetadata("trace", trace?.runtimeEvidence ?? runtimeEvidence),
        sourceType: resolved.sourceType
      },
      {
        trace,
        validation: response.validation
      }
    );

    return RunTraceResponseSchema.parse({
      ...response,
      trace,
      artifact
    });
  }

  async replayFlow(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = ReplayRequestSchema.parse(payload);
    const baseInput = await this.resolveReplayBaseInput(resolved, request);
    const effectiveRequest = ReplayRequestSchema.parse({
      ...request,
      traceArtifactId: undefined,
      baseInput
    });

    if (request.validateOnly) {
      const response = planReplay(resolved.content, effectiveRequest);
      if (request.traceArtifactId) {
        response.result.summary.inputSource = "trace_artifact";
      }
      const artifact = await this.persistArtifact(
        resolved,
        "replay_plan",
        `${appId}-${this.sanitizeArtifactName(request.flowId)}-replay-plan.json`,
        {
          analysisType: "replay_plan",
          appId,
          flowId: request.flowId,
          sourceType: resolved.sourceType
        },
        {
          result: response.result
        }
      );

      return ReplayResponseSchema.parse({
        ...response,
        artifact
      });
    }

    planReplay(resolved.content, effectiveRequest);
    const response = await this.executeReplayWithHelper(resolved.appPath, effectiveRequest);
    if (request.traceArtifactId) {
      response.result.summary.inputSource = "trace_artifact";
    }
    const runtimeEvidence = this.normalizeRuntimeEvidence(
      response.result.runtimeEvidence ?? response.result.trace?.runtimeEvidence,
      response.result.trace?.evidenceKind,
      response.result.trace?.steps
    );
    const comparisonBasisPreference = this.getComparisonBasisPreference(
      runtimeEvidence,
      response.result.trace?.evidenceKind
    );
    const restReplay = response.result.restReplay ?? this.buildRestReplayEvidence(runtimeEvidence);
    const resultTrace = response.result.trace
      ? {
          ...response.result.trace,
          comparisonBasisPreference,
          runtimeEvidence: runtimeEvidence ?? response.result.trace.runtimeEvidence
        }
      : response.result.trace;
    const result = {
      ...response.result,
      comparisonBasisPreference,
      restReplay,
      trace: resultTrace,
      runtimeEvidence: runtimeEvidence ?? response.result.runtimeEvidence
    };
    const artifact = await this.persistArtifact(
      resolved,
      "replay_report",
      `${appId}-${this.sanitizeArtifactName(request.flowId)}-replay-report.json`,
      {
        analysisType: "replay",
        appId,
        flowId: request.flowId,
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
        ...this.restReplayMetadata(result.restReplay),
        ...(this.buildTimerReplayEvidence(result.runtimeEvidence) ?? {}),
        ...this.restTriggerRuntimeMetadata("replay", result.runtimeEvidence),
        ...this.cliTriggerRuntimeMetadata("replay", result.runtimeEvidence),
        ...this.timerTriggerRuntimeMetadata("replay", result.runtimeEvidence),
        ...this.channelTriggerRuntimeMetadata("replay", result.runtimeEvidence),
        ...(this.buildChannelReplayEvidence(result.runtimeEvidence) ?? {}),
        sourceType: resolved.sourceType
      },
      {
        result
      }
    );

    return ReplayResponseSchema.parse({
      ...response,
      result,
      artifact
    });
  }

  async compareRuns(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = RunComparisonRequestSchema.parse(payload);
    const artifacts = await this.resolveRunComparisonArtifacts(resolved, request);

    if (request.validateOnly) {
      const response = planRunComparison(request, artifacts.left, artifacts.right);
      const artifact = await this.persistArtifact(
        resolved,
        "run_comparison_plan",
        `${appId}-${this.sanitizeArtifactName(request.leftArtifactId)}-${this.sanitizeArtifactName(request.rightArtifactId)}-run-comparison-plan.json`,
        {
          analysisType: "run_comparison_plan",
          appId,
          sourceType: resolved.sourceType
        },
        {
          validation: response.validation
        }
      );

      return RunComparisonResponseSchema.parse({
        ...response,
        artifact
      });
    }

    const response = compareRuns(request, artifacts.left, artifacts.right);
    const artifact = await this.persistArtifact(
      resolved,
      "run_comparison",
      `${appId}-${this.sanitizeArtifactName(request.leftArtifactId)}-${this.sanitizeArtifactName(request.rightArtifactId)}-run-comparison.json`,
      {
        analysisType: "run_comparison",
        appId,
        comparisonBasis: response.result?.comparisonBasis,
        leftComparisonBasisPreference: response.result?.left.comparisonBasisPreference,
        rightComparisonBasisPreference: response.result?.right.comparisonBasisPreference,
        leftEvidenceKind: response.result?.left.evidenceKind,
        rightEvidenceKind: response.result?.right.evidenceKind,
        leftNormalizedStepEvidence: response.result?.left.normalizedStepEvidence,
        rightNormalizedStepEvidence: response.result?.right.normalizedStepEvidence,
        leftRestTriggerRuntimeEvidence: response.result?.left.restTriggerRuntimeEvidence,
        rightRestTriggerRuntimeEvidence: response.result?.right.restTriggerRuntimeEvidence,
        leftRestTriggerRuntimeKind: response.result?.left.restTriggerRuntimeKind,
        rightRestTriggerRuntimeKind: response.result?.right.restTriggerRuntimeKind,
        leftCLITriggerRuntimeEvidence: response.result?.left.cliTriggerRuntimeEvidence,
        rightCLITriggerRuntimeEvidence: response.result?.right.cliTriggerRuntimeEvidence,
        leftCLITriggerRuntimeKind: response.result?.left.cliTriggerRuntimeKind,
        rightCLITriggerRuntimeKind: response.result?.right.cliTriggerRuntimeKind,
        leftTimerTriggerRuntimeEvidence: response.result?.left.timerTriggerRuntimeEvidence,
        rightTimerTriggerRuntimeEvidence: response.result?.right.timerTriggerRuntimeEvidence,
        leftTimerTriggerRuntimeKind: response.result?.left.timerTriggerRuntimeKind,
        rightTimerTriggerRuntimeKind: response.result?.right.timerTriggerRuntimeKind,
        leftChannelTriggerRuntimeEvidence: response.result?.left.channelTriggerRuntimeEvidence,
        rightChannelTriggerRuntimeEvidence: response.result?.right.channelTriggerRuntimeEvidence,
        leftChannelTriggerRuntimeKind: response.result?.left.channelTriggerRuntimeKind,
        rightChannelTriggerRuntimeKind: response.result?.right.channelTriggerRuntimeKind,
        leftChannelTriggerRuntimeChannel: response.result?.left.channelTriggerRuntimeChannel,
        rightChannelTriggerRuntimeChannel: response.result?.right.channelTriggerRuntimeChannel,
        ...this.restComparisonMetadata(response.result?.restComparison),
        ...this.channelComparisonMetadata(response.result?.channelComparison),
        ...this.timerComparisonMetadata(response.result?.timerComparison),
        sourceType: resolved.sourceType
      },
      {
        result: response.result
      }
    );

    return RunComparisonResponseSchema.parse({
      ...response,
      artifact
    });
  }

  async bindTrigger(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = TriggerBindingRequestSchema.parse(payload);

    try {
      const response = request.validateOnly
        ? planTriggerBinding(resolved.content, request)
        : applyTriggerBinding(resolved.content, request);

      const nextApp = response.result.app;
      if (!nextApp) {
        return TriggerBindingResponseSchema.parse(response);
      }

      if (!request.validateOnly) {
        await fs.writeFile(resolved.appPath, serializeFlogoAppDocument(nextApp, resolved.content), "utf8");
      }

      const artifact = await this.persistArtifact(
        resolved,
        request.validateOnly ? "trigger_binding_plan" : "trigger_binding_result",
        `${appId}-${this.sanitizeArtifactName(request.flowId)}-${request.profile.kind}-trigger-binding.json`,
        {
          analysisType: request.validateOnly ? "trigger_binding_plan" : "trigger_binding_result",
          appId,
          flowId: request.flowId,
          profileKind: request.profile.kind,
          sourceType: resolved.sourceType
        },
        {
          result: response.result
        }
      );

      return TriggerBindingResponseSchema.parse({
        result: {
          ...response.result,
          artifact
        }
      });
    } catch (error) {
      if (error instanceof TriggerBindingError) {
        throw error;
      }
      throw error;
    }
  }

  async extractSubflow(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = SubflowExtractionRequestSchema.parse(payload);
    try {
      const response = request.validateOnly
        ? planSubflowExtraction(resolved.content, request)
        : applySubflowExtraction(resolved.content, request);

      const nextApp = response.result.app;
      if (!nextApp) {
        return SubflowExtractionResponseSchema.parse(response);
      }

      if (!request.validateOnly) {
        await fs.writeFile(resolved.appPath, serializeFlogoAppDocument(nextApp, resolved.content), "utf8");
      }

      const artifact = await this.persistArtifact(
        resolved,
        request.validateOnly ? "subflow_extraction_plan" : "subflow_extraction_result",
        `${appId}-${this.sanitizeArtifactName(request.flowId)}-subflow-extraction.json`,
        {
          analysisType: request.validateOnly ? "subflow_extraction_plan" : "subflow_extraction_result",
          appId,
          flowId: request.flowId,
          sourceType: resolved.sourceType
        },
        {
          result: response.result
        }
      );

      return SubflowExtractionResponseSchema.parse({
        result: {
          ...response.result,
          artifact
        }
      });
    } catch (error) {
      if (error instanceof SubflowOperationError) {
        throw error;
      }
      throw error;
    }
  }

  async inlineSubflow(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = SubflowInliningRequestSchema.parse(payload);
    try {
      const response = request.validateOnly
        ? planSubflowInlining(resolved.content, request)
        : applySubflowInlining(resolved.content, request);

      const nextApp = response.result.app;
      if (!nextApp) {
        return SubflowInliningResponseSchema.parse(response);
      }

      if (!request.validateOnly) {
        await fs.writeFile(resolved.appPath, serializeFlogoAppDocument(nextApp, resolved.content), "utf8");
      }

      const artifact = await this.persistArtifact(
        resolved,
        request.validateOnly ? "subflow_inlining_plan" : "subflow_inlining_result",
        `${appId}-${this.sanitizeArtifactName(request.parentFlowId)}-subflow-inlining.json`,
        {
          analysisType: request.validateOnly ? "subflow_inlining_plan" : "subflow_inlining_result",
          appId,
          parentFlowId: request.parentFlowId,
          invocationTaskId: request.invocationTaskId,
          sourceType: resolved.sourceType
        },
        {
          result: response.result
        }
      );

      return SubflowInliningResponseSchema.parse({
        result: {
          ...response.result,
          artifact
        }
      });
    } catch (error) {
      if (error instanceof SubflowOperationError) {
        throw error;
      }
      throw error;
    }
  }

  async addIterator(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = IteratorSynthesisRequestSchema.parse(payload);
    try {
      const response = request.validateOnly
        ? planIteratorSynthesis(resolved.content, request)
        : applyIteratorSynthesis(resolved.content, request);

      const nextApp = response.result.app;
      if (!nextApp) {
        return IteratorSynthesisResponseSchema.parse(response);
      }

      if (!request.validateOnly) {
        await fs.writeFile(resolved.appPath, serializeFlogoAppDocument(nextApp, resolved.content), "utf8");
      }

      const artifact = await this.persistArtifact(
        resolved,
        request.validateOnly ? "iterator_plan" : "iterator_result",
        `${appId}-${this.sanitizeArtifactName(request.flowId)}-${this.sanitizeArtifactName(request.taskId)}-iterator.json`,
        {
          analysisType: request.validateOnly ? "iterator_plan" : "iterator_result",
          appId,
          flowId: request.flowId,
          taskId: request.taskId,
          sourceType: resolved.sourceType
        },
        {
          result: response.result
        }
      );

      return IteratorSynthesisResponseSchema.parse({
        result: {
          ...response.result,
          artifact
        }
      });
    } catch (error) {
      if (error instanceof ControlFlowSynthesisError) {
        throw error;
      }
      throw error;
    }
  }

  async addRetryPolicy(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = RetryPolicyRequestSchema.parse(payload);
    try {
      const response = request.validateOnly ? planRetryPolicy(resolved.content, request) : applyRetryPolicy(resolved.content, request);

      const nextApp = response.result.app;
      if (!nextApp) {
        return RetryPolicyResponseSchema.parse(response);
      }

      if (!request.validateOnly) {
        await fs.writeFile(resolved.appPath, serializeFlogoAppDocument(nextApp, resolved.content), "utf8");
      }

      const artifact = await this.persistArtifact(
        resolved,
        request.validateOnly ? "retry_policy_plan" : "retry_policy_result",
        `${appId}-${this.sanitizeArtifactName(request.flowId)}-${this.sanitizeArtifactName(request.taskId)}-retry-policy.json`,
        {
          analysisType: request.validateOnly ? "retry_policy_plan" : "retry_policy_result",
          appId,
          flowId: request.flowId,
          taskId: request.taskId,
          sourceType: resolved.sourceType
        },
        {
          result: response.result
        }
      );

      return RetryPolicyResponseSchema.parse({
        result: {
          ...response.result,
          artifact
        }
      });
    } catch (error) {
      if (error instanceof ControlFlowSynthesisError) {
        throw error;
      }
      throw error;
    }
  }

  async addDoWhile(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = DoWhileSynthesisRequestSchema.parse(payload);
    try {
      const response = request.validateOnly ? planDoWhileSynthesis(resolved.content, request) : applyDoWhileSynthesis(resolved.content, request);

      const nextApp = response.result.app;
      if (!nextApp) {
        return DoWhileSynthesisResponseSchema.parse(response);
      }

      if (!request.validateOnly) {
        await fs.writeFile(resolved.appPath, serializeFlogoAppDocument(nextApp, resolved.content), "utf8");
      }

      const artifact = await this.persistArtifact(
        resolved,
        request.validateOnly ? "dowhile_plan" : "dowhile_result",
        `${appId}-${this.sanitizeArtifactName(request.flowId)}-${this.sanitizeArtifactName(request.taskId)}-dowhile.json`,
        {
          analysisType: request.validateOnly ? "dowhile_plan" : "dowhile_result",
          appId,
          flowId: request.flowId,
          taskId: request.taskId,
          sourceType: resolved.sourceType
        },
        {
          result: response.result
        }
      );

      return DoWhileSynthesisResponseSchema.parse({
        result: {
          ...response.result,
          artifact
        }
      });
    } catch (error) {
      if (error instanceof ControlFlowSynthesisError) {
        throw error;
      }
      throw error;
    }
  }

  async addErrorPath(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = ErrorPathTemplateRequestSchema.parse(payload);
    try {
      const response = request.validateOnly
        ? planErrorPathTemplate(resolved.content, request)
        : applyErrorPathTemplate(resolved.content, request);

      const nextApp = response.result.app;
      if (!nextApp) {
        return ErrorPathTemplateResponseSchema.parse(response);
      }

      if (!request.validateOnly) {
        await fs.writeFile(resolved.appPath, serializeFlogoAppDocument(nextApp, resolved.content), "utf8");
      }

      const artifact = await this.persistArtifact(
        resolved,
        request.validateOnly ? "error_path_plan" : "error_path_result",
        `${appId}-${this.sanitizeArtifactName(request.flowId)}-${this.sanitizeArtifactName(request.taskId)}-error-path.json`,
        {
          analysisType: request.validateOnly ? "error_path_plan" : "error_path_result",
          appId,
          flowId: request.flowId,
          taskId: request.taskId,
          template: request.template,
          sourceType: resolved.sourceType
        },
        {
          result: response.result
        }
      );

      return ErrorPathTemplateResponseSchema.parse({
        result: {
          ...response.result,
          artifact
        }
      });
    } catch (error) {
      if (error instanceof ErrorPathTemplateError) {
        throw error;
      }
      throw error;
    }
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

  async getDescriptor(projectId: string, appId: string, refOrAlias: string) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const descriptorResponse = inspectContribDescriptor(resolved.content, refOrAlias, { appPath: resolved.appPath });
    if (!descriptorResponse) {
      return undefined;
    }

    const artifact = await this.persistArtifact(
      resolved,
      "descriptor",
      `${appId}-${this.sanitizeArtifactName(refOrAlias)}-descriptor.json`,
      {
        analysisType: "descriptor",
        appId,
        refOrAlias,
        sourceType: resolved.sourceType
      },
      {
        descriptor: descriptorResponse.descriptor,
        diagnostics: descriptorResponse.diagnostics
      }
    );

    return ContribDescriptorResponseSchema.parse({
      ...descriptorResponse,
      artifact
    });
  }

  async getContribEvidence(projectId: string, appId: string, refOrAlias: string) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const evidence = inspectContribEvidence(resolved.content, refOrAlias, { appPath: resolved.appPath });
    if (!evidence) {
      return undefined;
    }

    const artifact = await this.persistArtifact(
      resolved,
      "contrib_evidence",
      `${appId}-${this.sanitizeArtifactName(refOrAlias)}-contrib-evidence.json`,
      {
        analysisType: "contrib_evidence",
        appId,
        refOrAlias,
        sourceType: resolved.sourceType,
        evidenceLevel: evidence.confidence
      },
      {
        evidence
      }
    );

    return ContribEvidenceResponseSchema.parse({
      evidence,
      artifact
    });
  }

  async getGovernance(projectId: string, appId: string) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const report = validateGovernance(resolved.content, { appPath: resolved.appPath });
    const artifact = await this.persistArtifact(
      resolved,
      "governance_report",
      `${appId}-governance-report.json`,
      {
        analysisType: "governance",
        appId,
        sourceType: resolved.sourceType
      },
      {
        report
      }
    );

    return GovernanceResponseSchema.parse({
      report,
      artifact
    });
  }

  async getPropertyPlan(projectId: string, appId: string, profileInput?: string) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const profile = DeploymentProfileSchema.parse(profileInput ?? "rest_service");
    const propertyPlan = analyzePropertyUsage(resolved.content, profile);
    const artifact = await this.persistArtifact(
      resolved,
      "property_plan",
      `${appId}-property-plan.json`,
      {
        analysisType: "property_plan",
        appId,
        profile,
        sourceType: resolved.sourceType
      },
      { propertyPlan }
    );

    return PropertyPlanResponseSchema.parse({
      propertyPlan,
      artifact
    });
  }

  async compareComposition(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = CompositionCompareRequestSchema.parse(payload ?? {});
    const comparison = compareJsonVsProgrammatic(resolved.content, request);
    const artifact = await this.persistArtifact(
      resolved,
      "composition_compare",
      `${appId}-composition-compare.json`,
      {
        analysisType: "composition_compare",
        appId,
        sourceType: resolved.sourceType,
        target: request.target,
        resourceId: request.resourceId
      },
      {
        comparison
      }
    );

    return CompositionCompareResponseSchema.parse({
      comparison: {
        ...comparison,
        artifact
      }
    });
  }

  async previewMapping(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = MappingPreviewRequestSchema.parse(payload);
    const preview = previewMapping(resolved.content, request.nodeId, request.sampleInput);
    const propertyPlan = analyzePropertyUsage(resolved.content);
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
        preview,
        propertyPlan
      }
    );

    return MappingPreviewResponseSchema.parse({
      preview,
      propertyPlan,
      artifact
    });
  }

  async testMapping(projectId: string, appId: string, payload: unknown) {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      return undefined;
    }

    const request = MappingTestSpecSchema.parse(payload);
    const result = runMappingTest(
      resolved.content,
      request.nodeId,
      request.sampleInput,
      request.expectedOutput,
      request.strict
    );
    const propertyPlan = analyzePropertyUsage(resolved.content);
    const artifact = await this.persistArtifact(
      resolved,
      "mapping_test",
      `${appId}-${request.nodeId}-mapping-test.json`,
      {
        analysisType: "mapping_test",
        appId,
        nodeId: request.nodeId,
        strict: request.strict,
        sourceType: resolved.sourceType
      },
      {
        result,
        propertyPlan
      }
    );

    return MappingTestResponseSchema.parse({
      result: {
        ...result,
        artifact
      },
      propertyPlan
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
    type:
      | "contrib_inventory"
      | "contrib_catalog"
      | "contrib_evidence"
      | "flow_contract"
      | "trigger_binding_plan"
      | "trigger_binding_result"
      | "subflow_extraction_plan"
      | "subflow_extraction_result"
      | "subflow_inlining_plan"
      | "subflow_inlining_result"
      | "iterator_plan"
      | "iterator_result"
      | "retry_policy_plan"
      | "retry_policy_result"
      | "dowhile_plan"
      | "dowhile_result"
      | "error_path_plan"
      | "error_path_result"
      | "run_trace_plan"
      | "run_trace"
      | "replay_plan"
      | "replay_report"
      | "run_comparison_plan"
      | "run_comparison"
      | "mapping_preview"
      | "mapping_test"
      | "property_plan"
      | "descriptor"
      | "governance_report"
      | "composition_compare",
    name: string,
    metadata: Record<string, unknown>,
    payload: Record<string, unknown>
  ) {
    const artifactId = randomUUID();
    const stored = await this.storage.storeJsonArtifact({
      projectId: resolved.projectId,
      appId: resolved.recordId ?? resolved.requestedAppId,
      artifactId,
      kind: type,
      payload
    });
    if (!this.prisma) {
      return ArtifactRefSchema.parse({
        id: artifactId,
        type: type === "descriptor" ? "contrib_catalog" : type,
        name,
        uri: stored.uri,
        metadata: {
          ...metadata,
          blobPath: stored.blobPath,
          contentType: stored.contentType,
          producer: "control-plane.app-analysis"
        }
      });
    }

    const prisma = this.prisma as any;
    const taskId = randomUUID();
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
      type: type === "descriptor" ? "contrib_catalog" : type,
      name,
      uri: stored.uri,
      metadata: {
        ...metadata,
        blobPath: stored.blobPath,
        contentType: stored.contentType,
        producer: "control-plane.app-analysis"
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

  async prepareRunComparisonTaskInputs(
    projectId: string,
    appId: string,
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const resolved = await this.resolveApp(projectId, appId);
    if (!resolved) {
      throw new RunComparisonError(`Unknown app ${appId}`, 404, [
        {
          code: "flogo.run_comparison.app_not_found",
          message: `Unable to locate app "${appId}" for run comparison.`,
          severity: "error",
          path: appId
        }
      ]);
    }

    const request = RunComparisonRequestSchema.parse(inputs);
    const artifacts = await this.resolveRunComparisonArtifacts(resolved, request);
    return {
      ...inputs,
      leftArtifact: artifacts.left,
      rightArtifact: artifacts.right
    };
  }

  async resolveTaskAppPath(projectId: string, appId: string): Promise<string | undefined> {
    const resolved = await this.resolveApp(projectId, appId);
    return resolved?.appPath;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  private normalizeRuntimeEvidenceSteps(
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

  private getComparisonBasisPreference(
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

  private normalizeRuntimeEvidence(
    runtimeEvidence: unknown,
    evidenceKind?: unknown,
    traceSteps: RunTrace["steps"] = []
  ): RuntimeEvidence | undefined {
    const runtimeEvidenceRecord = this.isRecord(runtimeEvidence) ? runtimeEvidence : undefined;
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

    const normalizedSteps = this.normalizeRuntimeEvidenceSteps(traceSteps, baseRuntimeEvidence);
    return RuntimeEvidenceSchema.parse({
      ...baseRuntimeEvidence,
      kind,
      runtimeMode:
        baseRuntimeEvidence?.runtimeMode ?? (kind === "runtime_backed" ? "independent_action" : undefined),
      normalizedSteps: normalizedSteps.length > 0 ? normalizedSteps : baseRuntimeEvidence?.normalizedSteps
    });
  }

  private restTriggerRuntimeMetadata(prefix: "trace" | "replay", runtimeEvidence?: RuntimeEvidence) {
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

  private channelTriggerRuntimeMetadata(prefix: "trace" | "replay", runtimeEvidence?: RuntimeEvidence) {
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

  private cliTriggerRuntimeMetadata(prefix: "trace" | "replay", runtimeEvidence?: RuntimeEvidence) {
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

  private timerTriggerRuntimeMetadata(prefix: "trace" | "replay", runtimeEvidence?: RuntimeEvidence) {
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

  private buildChannelReplayEvidence(runtimeEvidence?: RuntimeEvidence) {
    const channelTriggerRuntime = runtimeEvidence?.channelTriggerRuntime;
    if (!channelTriggerRuntime) {
      return undefined;
    }

    return {
      channelReplay: {
        comparisonBasis: "channel_runtime_boundary",
        runtimeMode: runtimeEvidence?.runtimeMode,
        channelObserved: Boolean(channelTriggerRuntime.handler?.channel),
        dataObserved: channelTriggerRuntime.data !== undefined,
        flowInputObserved: Boolean(channelTriggerRuntime.flowInput && Object.keys(channelTriggerRuntime.flowInput).length > 0),
        flowOutputObserved: Boolean(channelTriggerRuntime.flowOutput && Object.keys(channelTriggerRuntime.flowOutput).length > 0),
        unsupportedFields: Array.from(new Set(channelTriggerRuntime.unavailableFields ?? [])),
        diagnostics: [...(channelTriggerRuntime.diagnostics ?? [])]
      }
    };
  }

  private buildRestReplayEvidence(runtimeEvidence?: RuntimeEvidence): RestReplayEvidence | undefined {
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

  private buildTimerReplayEvidence(runtimeEvidence?: RuntimeEvidence) {
    const timerTriggerRuntime = runtimeEvidence?.timerTriggerRuntime;
    if (!timerTriggerRuntime) {
      return undefined;
    }

    return {
      comparisonBasis: "timer_runtime_startup",
      runtimeMode: runtimeEvidence?.runtimeMode,
      settingsObserved: Boolean(timerTriggerRuntime.settings),
      flowInputObserved: Boolean(timerTriggerRuntime.flowInput && Object.keys(timerTriggerRuntime.flowInput).length > 0),
      flowOutputObserved: Boolean(timerTriggerRuntime.flowOutput && Object.keys(timerTriggerRuntime.flowOutput).length > 0),
      tickObserved: Boolean(timerTriggerRuntime.tick),
      unsupportedFields: Array.from(new Set(timerTriggerRuntime.unavailableFields ?? [])),
      diagnostics: [...(timerTriggerRuntime.diagnostics ?? [])]
    };
  }

  private restReplayMetadata(restReplay?: RestReplayEvidence) {
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

  private restComparisonMetadata(restComparison?: RestEnvelopeComparison) {
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

  private timerComparisonMetadata(timerComparison?: {
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

  private channelComparisonMetadata(channelComparison?: {
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

  private buildStableAppId(projectId: string, appId: string): string {
    const normalized = `${projectId}-${appId}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    return `flogo-app-${normalized}`.slice(0, 120);
  }

  private sanitizeArtifactName(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  }

  private async resolveRunComparisonArtifacts(
    resolved: ResolvedApp,
    request: ReturnType<typeof RunComparisonRequestSchema.parse>
  ) {
    const left = await this.resolveComparableArtifact(resolved, request.leftArtifactId, "left");
    const right = await this.resolveComparableArtifact(resolved, request.rightArtifactId, "right");

    return { left, right };
  }

  private async resolveComparableArtifact(
    resolved: ResolvedApp,
    artifactId: string,
    side: "left" | "right"
  ): Promise<{
    artifactId: string;
    kind: "run_trace" | "replay_report";
    payload: Record<string, unknown>;
  }> {
    if (!this.prisma || !resolved.recordId) {
      throw new RunComparisonError(`Artifact ${artifactId} was not found`, 404, [
        {
          code: `flogo.run_comparison.${side}_artifact_not_found`,
          message: `Comparable runtime artifact "${artifactId}" was not found for app "${resolved.requestedAppId}".`,
          severity: "error",
          path: artifactId
        }
      ]);
    }

    const prisma = this.prisma as any;
    const broadRecord = (await prisma.artifact.findFirst({
      where: {
        id: artifactId,
        task: {
          requestedBy: appAnalysisRequestedBy
        }
      }
    })) as DbArtifact | null;

    if (!broadRecord) {
      throw new RunComparisonError(`Artifact ${artifactId} was not found`, 404, [
        {
          code: `flogo.run_comparison.${side}_artifact_not_found`,
          message: `Comparable runtime artifact "${artifactId}" was not found for app "${resolved.requestedAppId}".`,
          severity: "error",
          path: artifactId
        }
      ]);
    }

    if (broadRecord.kind !== "run_trace" && broadRecord.kind !== "replay_report") {
      throw new RunComparisonError(`Artifact ${artifactId} is not a comparable runtime artifact`, 422, [
        {
          code: "flogo.run_comparison.invalid_artifact_kind",
          message: `Artifact "${artifactId}" has kind "${broadRecord.kind}" and cannot be used for run comparison.`,
          severity: "error",
          path: artifactId
        }
      ]);
    }

    const scopedRecord = (await prisma.artifact.findFirst({
      where: {
        id: artifactId,
        kind: broadRecord.kind,
        task: {
          flogoAppId: resolved.recordId,
          requestedBy: appAnalysisRequestedBy
        }
      }
    })) as DbArtifact | null;

    if (!scopedRecord) {
      throw new RunComparisonError(`Artifact ${artifactId} belongs to a different app context`, 422, [
        {
          code: "flogo.run_comparison.app_mismatch",
          message: `Artifact "${artifactId}" does not belong to app "${resolved.requestedAppId}".`,
          severity: "error",
          path: artifactId
        }
      ]);
    }

    const metadata =
      scopedRecord.metadata && typeof scopedRecord.metadata === "object"
        ? (scopedRecord.metadata as Record<string, unknown>)
        : {};
    const blobPath = typeof metadata.blobPath === "string" ? metadata.blobPath : undefined;
    if (!blobPath) {
      throw new RunComparisonError(`Artifact ${artifactId} is missing its storage location`, 422, [
        {
          code: "flogo.run_comparison.artifact_missing_blob_path",
          message: `Artifact "${artifactId}" does not include a blobPath.`,
          severity: "error",
          path: artifactId
        }
      ]);
    }

    const payload = await this.storage.loadJsonArtifact(blobPath);
    return {
      artifactId,
      kind: broadRecord.kind,
      payload
    };
  }

  private async resolveReplayBaseInput(
    resolved: ResolvedApp,
    request: ReturnType<typeof ReplayRequestSchema.parse>
  ): Promise<Record<string, unknown>> {
    if (request.baseInput) {
      return request.baseInput;
    }

    if (!request.traceArtifactId) {
      throw new ReplayError(`Replay request is missing a base input source for flow ${request.flowId}`, 422, [
        {
          code: "flogo.replay.missing_input_source",
          message: "Replay requires either traceArtifactId or baseInput",
          severity: "error"
        }
      ]);
    }

    if (!this.prisma || !resolved.recordId) {
      throw new ReplayError(`Trace artifact ${request.traceArtifactId} was not found`, 404, [
        {
          code: "flogo.replay.trace_artifact_not_found",
          message: `Run-trace artifact "${request.traceArtifactId}" was not found for app "${resolved.requestedAppId}"`,
          severity: "error",
          path: request.traceArtifactId
        }
      ]);
    }

    const prisma = this.prisma as any;
    const artifactRecord = (await prisma.artifact.findFirst({
      where: {
        id: request.traceArtifactId,
        kind: "run_trace",
        task: {
          flogoAppId: resolved.recordId,
          requestedBy: appAnalysisRequestedBy
        }
      }
    })) as DbArtifact | null;

    if (!artifactRecord) {
      throw new ReplayError(`Trace artifact ${request.traceArtifactId} was not found`, 404, [
        {
          code: "flogo.replay.trace_artifact_not_found",
          message: `Run-trace artifact "${request.traceArtifactId}" was not found for app "${resolved.requestedAppId}"`,
          severity: "error",
          path: request.traceArtifactId
        }
      ]);
    }

    const metadata =
      artifactRecord.metadata && typeof artifactRecord.metadata === "object"
        ? (artifactRecord.metadata as Record<string, unknown>)
        : {};
    const blobPath = typeof metadata.blobPath === "string" ? metadata.blobPath : undefined;
    if (!blobPath) {
      throw new ReplayError(`Trace artifact ${request.traceArtifactId} is missing its storage location`, 422, [
        {
          code: "flogo.replay.trace_artifact_missing_blob_path",
          message: `Run-trace artifact "${request.traceArtifactId}" does not include a blobPath`,
          severity: "error",
          path: request.traceArtifactId
        }
      ]);
    }

    const payload = await this.storage.loadJsonArtifact(blobPath);
    const trace = payload.trace;
    if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
      throw new ReplayError(`Trace artifact ${request.traceArtifactId} does not contain replayable trace data`, 422, [
        {
          code: "flogo.replay.trace_artifact_missing_trace",
          message: `Run-trace artifact "${request.traceArtifactId}" does not contain a trace payload`,
          severity: "error",
          path: request.traceArtifactId
        }
      ]);
    }

    const summary = (trace as Record<string, unknown>).summary;
    const input =
      summary && typeof summary === "object" && !Array.isArray(summary)
        ? (summary as Record<string, unknown>).input
        : undefined;
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new ReplayError(`Trace artifact ${request.traceArtifactId} does not contain replayable input`, 422, [
        {
          code: "flogo.replay.trace_artifact_missing_input",
          message: `Run-trace artifact "${request.traceArtifactId}" does not contain a replayable summary.input payload`,
          severity: "error",
          path: request.traceArtifactId
        }
      ]);
    }

    return input as Record<string, unknown>;
  }

  private async executeRunTraceWithHelper(
    appPath: string,
    request: ReturnType<typeof RunTraceRequestSchema.parse>
  ) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-run-trace-"));
    const requestPath = path.join(tempDir, "run-trace-request.json");
    await fs.writeFile(requestPath, JSON.stringify(request, null, 2), "utf8");

    const helperBin = process.env.FLOGO_HELPER_BIN;
    const command = helperBin
      ? [helperBin, "flows", "trace", "--app", appPath, "--request", requestPath]
      : ["go", "run", "./go-runtime/flogo-helper", "flows", "trace", "--app", appPath, "--request", requestPath];

    try {
      const [binary, ...args] = command;
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn(binary, args, {
          cwd: process.cwd(),
          stdio: ["ignore", "pipe", "pipe"],
          shell: process.platform === "win32"
        });

        let out = "";
        let err = "";

        child.stdout.on("data", (chunk) => {
          out += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
          err += chunk.toString();
        });

        child.on("close", (code) => {
          if (code === 0) {
            resolve(out);
            return;
          }
          reject(new Error(err.trim() || out.trim() || `Run-trace helper exited with code ${code ?? 1}`));
        });

        child.on("error", reject);
      });

      return RunTraceResponseSchema.parse(JSON.parse(stdout));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  private async executeReplayWithHelper(
    appPath: string,
    request: ReturnType<typeof ReplayRequestSchema.parse>
  ) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "flogo-replay-"));
    const requestPath = path.join(tempDir, "replay-request.json");
    await fs.writeFile(requestPath, JSON.stringify(request, null, 2), "utf8");

    const helperBin = process.env.FLOGO_HELPER_BIN;
    const command = helperBin
      ? [helperBin, "flows", "replay", "--app", appPath, "--request", requestPath]
      : ["go", "run", "./go-runtime/flogo-helper", "flows", "replay", "--app", appPath, "--request", requestPath];

    try {
      const [binary, ...args] = command;
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn(binary, args, {
          cwd: process.cwd(),
          stdio: ["ignore", "pipe", "pipe"],
          shell: process.platform === "win32"
        });

        let out = "";
        let err = "";

        child.stdout.on("data", (chunk) => {
          out += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
          err += chunk.toString();
        });

        child.on("close", (code) => {
          if (code === 0) {
            resolve(out);
            return;
          }
          reject(new Error(err.trim() || out.trim() || `Replay helper exited with code ${code ?? 1}`));
        });

        child.on("error", reject);
      });

      return ReplayResponseSchema.parse(JSON.parse(stdout));
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}
