# Data Model

## Overview

The platform has three related data layers:

1. shared runtime contracts in `packages/contracts`,
2. persistent operational state in Prisma/PostgreSQL,
3. a domain-specific Flogo graph model in `packages/flogo-graph`.

The roadmap for expanding these layers is tracked in:

- [Flogo-Native Runtime Plan](./flogo-native-runtime-plan.md)
- [Capability Matrix](./capability-matrix.md)

## Shared runtime contracts

Source:

- `packages/contracts/src/index.ts`

The contracts package uses Zod so the same schema definitions drive:

- API validation,
- TypeScript inference,
- orchestrator payloads,
- runner payloads,
- tests,
- UI integration.

## Task contracts

### `TaskRequest`

Represents public task intake.

Key fields:

- `taskId?`
- `type`
- `projectId`
- `appId?`
- `appPath?`
- `requestedBy`
- `summary`
- `repo?`
- `inputs`
- `constraints`

Important current `inputs` conventions:

- `mode = "inventory"` for analysis-only contribution inventory work
- `mode = "catalog"` for analysis-only contribution catalog work
- `mode = "contrib_evidence"` for analysis-only contribution evidence inspection
- `mode = "mapping_preview"` for analysis-only mapping preview work
- `mode = "mapping_test"` for analysis-only mapping-resolution tests
- `mode = "property_plan"` for analysis-only property/environment planning
- `mode = "trigger_binding_plan"` for analysis-only trigger-binding planning
- `mode = "subflow_extraction_plan"` for analysis-only subflow extraction planning
- `mode = "subflow_inlining_plan"` for analysis-only subflow inlining planning
- `mode = "iterator_plan"` for analysis-only iterator planning
- `mode = "retry_policy_plan"` for analysis-only retry-policy planning
- `mode = "dowhile_plan"` for analysis-only doWhile planning
- `mode = "error_path_plan"` for analysis-only error-path planning
- `mode = "run_trace_plan"` for analysis-only runtime trace preflight
- `mode = "run_trace"` for helper-backed runtime trace execution
- `mode = "replay_plan"` for analysis-only replay preflight
- `mode = "replay"` for helper-backed replay execution
- `mode = "run_comparison_plan"` for analysis-only run-comparison preflight
- `mode = "run_comparison"` for helper-backed run comparison execution
- `mode = "diagnosis"` for analysis-only diagnosis planning and recommendation
- `mode = "activity_scaffold"` for analysis-only Flogo Activity bundle scaffolding
- `mode = "governance"` for analysis-only alias/orphan/version validation
- `mode = "composition_compare"` for analysis-only JSON vs programmatic comparison

### `TaskResult`

Represents the current outward-facing task state.

Key fields:

- `taskId`
- `type`
- `status`
- `summary`
- `orchestrationId?`
- `approvalStatus?`
- `activeJobRuns`
- `rootCause?`
- `validationReport?`
- `artifacts`
- `requiredApprovals`
- `nextActions`

### `TaskSummary`

Represents the list/detail read model for task listings.

Key fields:

- `id`
- `type`
- `state`
- `projectId`
- `appId?`
- `appPath?`
- `prompt`
- `planSummary?`
- `approvalStatus?`
- `orchestrationId?`
- `activeJobRuns`
- `createdAt`
- `updatedAt`

### `TaskRuns`

Represents persisted execution summaries.

Key fields:

- `taskId`
- `buildRuns`
- `testRuns`

## Approval contracts

### Approval types

Current approval types are:

- `delete_flow`
- `delete_resource`
- `change_public_contract`
- `dependency_upgrade`
- `custom_code`
- `external_endpoint_change`
- `deploy`

### Approval status

- `pending`
- `approved`
- `rejected`

## Artifact contracts

Artifacts are represented by `ArtifactRef`.

Current artifact kinds:

- `flogo_json`
- `binary`
- `build_log`
- `runtime_log`
- `test_report`
- `patch_bundle`
- `review_report`
- `workspace_snapshot`
- `contrib_inventory`
- `contrib_catalog`
- `contrib_evidence`
- `governance_report`
- `composition_compare`
- `mapping_preview`
- `mapping_test`
- `property_plan`
- `flow_contract`
- `trigger_binding_plan`
- `trigger_binding_result`
- `subflow_extraction_plan`
- `subflow_extraction_result`
- `subflow_inlining_plan`
- `subflow_inlining_result`
- `iterator_plan`
- `iterator_result`
- `retry_policy_plan`
- `retry_policy_result`
- `dowhile_plan`
- `dowhile_result`
- `error_path_plan`
- `error_path_result`
- `run_trace_plan`
- `run_trace`
- `replay_plan`
- `replay_report`
- `run_comparison_plan`
- `run_comparison`
- `diagnosis_report`
- `contrib_bundle`

## Flogo-native contracts

### Contribution catalog contracts

Important schemas:

- `ContributionInventory`
- `ContributionInventoryResponse`
- `ContribDescriptor`
- `ContribDescriptorResponse`
- `ContribEvidenceDetail`
- `ContribEvidenceResponse`
- `ContribCatalog`
- `ContribCatalogResponse`

These describe:

- inventory-backed contribution evidence,
- ref and alias,
- evidence source and resolved-ref metadata,
- evidence confidence, module path, Go package path, and discovery reason,
- contrib type,
- descriptor source and diagnostics,
- settings,
- inputs,
- outputs,
- examples,
- compatibility notes,
- response artifact references.

### Activity scaffold contracts

Important schemas:

- `ActivityScaffoldRequest`
- `ActivityScaffoldBundle`
- `ActivityScaffoldResult`
- `ActivityScaffoldResponse`
- `ContribGeneratedFile`
- `ContribProofStep`

These describe:

- one scaffold request for a custom Flogo Activity,
- generated descriptor metadata and file summaries,
- generated Go implementation, metadata, module, test, and readme files,
- isolated `go test` and `go build` proof results,
- persisted contribution bundle artifacts without auto-installing the bundle into an app.

### Mapping contracts

Important schemas:

- `MappingPreviewRequest`
- `MappingPreviewResult`
- `MappingPreviewResponse`

These describe:

- target node,
- field-level classification,
- mapping paths,
- resolved value maps,
- scope diagnostics,
- coercion diagnostics,
- references used,
- resolved preview values,
- diagnostics,
- coercion suggestions,
- richer property/environment planning output,
- response artifact references.

### Mapping test contracts

Important schemas:

- `MappingTestSpec`
- `MappingTestResult`
- `MappingTestResponse`

These describe:

- target node,
- sample input,
- expected output,
- strict vs non-strict comparison,
- deterministic expected-vs-actual diff output,
- diagnostics,
- response artifact references.

### Governance contracts

Important schemas:

- `GovernanceReport`
- `GovernanceResponse`
- `AliasIssue`
- `OrphanedRef`
- `VersionFinding`

These describe:

- alias and import issues,
- orphaned trigger/activity/action/flow refs,
- version findings,
- inventory summary, unresolved packages, and fallback contribs,
- weak-evidence, package-backed, and descriptor-only contrib summaries,
- normalized diagnostics,
- response artifact references.

### Composition comparison contracts

Important schemas:

- `CompositionCompareRequest`
- `CompositionCompareResult`
- `CompositionCompareResponse`
- `CompositionDifference`

These describe:

- comparison target and mode,
- canonical and programmatic hashes,
- comparison basis and signature evidence level,
- machine-readable differences,
- diagnostics,
- response artifact references.

### Property planning contracts

Property planning is exposed both through `MappingPreviewResponse.propertyPlan` and the dedicated `PropertyPlanResponse`.

Current property-plan output includes:

- `declaredProperties`
- `propertyRefs`
- `envRefs`
- `undefinedPropertyRefs`
- `unusedProperties`
- `recommendedProperties`
- `recommendedEnv`
- `recommendedSecretEnv`
- `recommendedPlainEnv`
- `deploymentProfile`
- `profileSpecificNotes`
- `deploymentNotes`
- `diagnostics`

### Flow design contracts

Important schemas:

- `FlowContract`
- `FlowContracts`
- `FlowContractsResponse`
- `TriggerBindingRequest`
- `TriggerBindingResponse`
- `SubflowExtractionRequest`
- `SubflowExtractionPlan`
- `SubflowExtractionResult`
- `SubflowExtractionResponse`
- `SubflowInliningRequest`
- `SubflowInliningPlan`
- `SubflowInliningResult`
- `SubflowInliningResponse`
- `IteratorSynthesisRequest`
- `IteratorSynthesisPlan`
- `IteratorSynthesisResult`
- `IteratorSynthesisResponse`
- `RetryPolicyRequest`
- `RetryPolicyPlan`
- `RetryPolicyResult`
- `RetryPolicyResponse`
- `DoWhileSynthesisRequest`
- `DoWhileSynthesisPlan`
- `DoWhileSynthesisResult`
- `DoWhileSynthesisResponse`

These describe:

- metadata-first reusable flow I/O inference,
- trigger-profile-aware flow rebinding,
- validate-only and mutating trigger-binding plans/results,
- explicit contiguous task-sequence extraction into new subflows,
- validate-only and mutating subflow extraction plans/results,
- same-app subflow invocation inlining,
- validate-only and mutating iterator synthesis plans/results,
- validate-only and mutating retry-policy plans/results,
- validate-only and mutating doWhile synthesis plans/results,
- validate-only and mutating error-path template plans/results,
- deterministic inline task ID generation and optional unused-flow cleanup,
- response artifact references for each design-time flow refactor step.

### Runtime trace contracts

Important schemas:

- `RunTraceCaptureOptions`
- `RunTraceRequest`
- `RunTraceTaskStep`
- `RunTraceSummary`
- `RunTrace`
- `RunTraceResponse`

These describe:

- validate-only preflight for runtime trace capture,
- task-level execution steps in runtime order,
- shallow task input/output snapshots,
- optional flow-state and activity-state capture,
- optional normalized recorder-backed step evidence in `RunTrace.runtimeEvidence.normalizedSteps` for the supported runtime-backed slice, with raw recorder output retained in `RunTrace.runtimeEvidence.steps`,
- optional `RunTrace.evidenceKind` provenance so runtime-backed traces and simulated fallbacks remain distinguishable in stored artifacts,
- optional `RunTrace.runtimeEvidence.restTriggerRuntime` request, mapped flow input/output, reply, and mapping evidence for the supported REST trigger runtime slice,
- optional `RunTrace.runtimeEvidence.timerTriggerRuntime` timer settings, mapped flow input/output, and tick evidence for the supported timer runtime slice,
- optional `RunTrace.runtimeEvidence.cliTriggerRuntime` trigger settings, command identity, args, flags, mapped flow input/output, and reply/stdout evidence for the supported CLI trigger runtime slice,
- optional `RunTrace.runtimeEvidence.channelTriggerRuntime` channel name, sent data, mapped flow input/output, and evidence metadata for the supported Channel trigger runtime slice,
- failed-trace summaries with structured diagnostics,
- response artifact references for `run_trace_plan` and `run_trace`.

### Replay contracts

Important schemas:

- `ReplayRequest`
- `ReplaySummary`
- `ReplayResult`
- `ReplayResponse`

These describe:

- validate-only replay feasibility checks,
- replay from either explicit base input or stored `run_trace` input,
- deep-merged override application,
- nested runtime-trace output for successful replay execution,
- the same normalized runtime step evidence can be carried through the nested trace on the supported direct-flow slice, the supported REST slice, the supported CLI slice, and the supported timer slice,
- replay artifacts can now carry a live REST trigger request/reply envelope in `RunTrace.runtimeEvidence.restTriggerRuntime` for the supported REST slice,
- replay artifacts can also carry `RunTrace.runtimeEvidence.timerTriggerRuntime` for the supported timer slice, preserving timer settings and observed tick evidence through the nested trace,
- replay artifacts can also carry `RunTrace.runtimeEvidence.cliTriggerRuntime` for the supported CLI slice, preserving trigger settings, command identity, args/flags, and reply/stdout evidence through the nested trace,
- replay artifacts can also carry `RunTrace.runtimeEvidence.channelTriggerRuntime` for the supported Channel slice, preserving channel name, sent data, mapped flow input/output, and evidence metadata through the nested trace,
- structured failed-replay summaries with diagnostics,
- response artifact references for `replay_plan` and `replay_report`.

### Run comparison contracts

Important schemas:

- `RunComparisonOptions`
- `RunComparisonRequest`
- `RunComparisonArtifactRef`
- `RunComparisonValueDiff`
- `RunComparisonStepDiff`
- `RunComparisonSummaryDiff`
- `RunComparisonResult`
- `RunComparisonResponse`

These describe:

- validate-only comparison feasibility checks,
- comparison of stored `run_trace` and `replay_report` artifacts,
- comparison basis selection that can prefer normalized runtime evidence on the supported slice and fall back to recorder-backed evidence otherwise,
- comparison can also prefer a REST envelope basis when both artifacts are REST runtime-backed and then diff request method/path/query/headers/body/path params, mapped flow input, and reply status/body/headers/cookies,
- comparison can also prefer `timer_runtime_startup` when both artifacts carry timer runtime evidence and then diff timer settings, mapped flow input/output, and observed tick evidence,
- comparison can also prefer `channel_runtime_boundary` when both artifacts carry Channel runtime evidence and then diff channel name, sent data, mapped flow input, and mapped flow output,
- REST runtime metadata is preserved on comparison inputs when present, but dedicated request/reply diffing only applies when both sides are REST runtime-backed,
- CLI runtime metadata is preserved on comparison inputs when present, but CLI-backed runs still compare through the existing normalized or recorder-backed bases rather than a dedicated CLI envelope diff in this slice,
- timer runtime metadata is preserved on comparison inputs when present, but dedicated timer startup diffing only applies when both sides are timer runtime-backed,
- Channel runtime metadata is preserved on comparison inputs when present, but dedicated channel boundary diffing only applies when both sides are Channel runtime-backed,
- summary-level status/input/output/error/step-count diffs,
- task-level diffs paired by `taskId`,
- nested value diffs for task inputs, outputs, flow state, and activity state,
- response artifact references for `run_comparison_plan` and `run_comparison`.

## Orchestration contracts

### `OrchestratorStartRequest`

Used by the control-plane to start orchestration.

Fields:

- `taskId`
- `request`
- `requiredApprovals`
- `planSummary`
- `steps`

### `OrchestratorStatus`

Fields:

- `orchestrationId`
- `taskId`
- `runtimeStatus`
- `approvalStatus`
- `activeJobRuns`
- `summary`
- `lastUpdatedAt`

## Runner contracts

### `RunnerJobSpec`

Represents one finite execution request.

Important fields:

- `taskId`
- `jobKind`
- `stepType`
- `snapshotUri`
- `appPath`
- `env`
- `envSecretRefs`
- `timeoutSeconds`
- `artifactOutputUri`
- `workspaceBlobPrefix?`
- `artifactBlobPrefix?`
- `jobTemplateName`
- `jobRunId?`
- `correlationId?`
- `command`
- `containerArgs`
- `analysisKind?`
- `analysisPayload?`
- `targetNodeId?`
- `targetRef?`

### `RunnerJobResult`

Important fields:

- `jobId`
- `jobRunId?`
- `ok`
- `status`
- `summary`
- `exitCode`
- `startedAt?`
- `finishedAt?`
- `jobTemplateName?`
- `azureJobExecutionName?`
- `azureJobResourceId?`
- `logArtifact?`
- `artifacts`
- `diagnostics`

### `RunnerJobStatus`

Important fields:

- `jobRunId`
- `status`
- `summary`
- `spec`
- `azureJobExecutionName?`
- `azureJobResourceId?`
- `result?`

## Event model

### `TaskEvent`

Represents persisted event history and SSE event payloads.

Fields:

- `id`
- `taskId`
- `type`
- `message`
- `timestamp`
- `payload?`

Supported event types today:

- `status`
- `log`
- `artifact`
- `approval`
- `tool`

## Flogo graph model

Source:

- `packages/flogo-graph/src/index.ts`

The graph package normalizes and analyzes Flogo apps.

Key runtime concepts include:

- `FlogoApp`
- `FlogoAppGraph`
- imports by alias,
- resource IDs,
- task IDs,
- diagnostics,
- contribution catalog entries,
- mapping preview results,
- property analysis results.

### Implemented graph behaviors

Current graph-level logic includes:

- structural normalization of example and legacy-shaped Flogo documents,
- alias and flow-ref validation,
- activity-ref presence validation,
- mapping-order validation for `$activity[...]`,
- contribution catalog generation,
- governance validation for aliases, orphaned refs, and version drift,
- programmatic-composition comparison probes,
- typed mapping preview classification,
- deterministic mapping-resolution tests,
- unresolved-reference diagnostics,
- coercion suggestion heuristics,
- descriptor-source-aware contribution introspection,
- richer app property and environment planning,
- deployment-profile-aware property planning,
- flow-contract inference,
- trigger-binding planning and application,
- subflow extraction and inlining for explicit contiguous linear task selections,
- iterator synthesis,
- retry-on-error synthesis,
- doWhile synthesis.

## Prisma persistence schema

Source:

- `prisma/schema.prisma`

### Persisted models currently used at runtime

- `Organization`
- `Project`
- `FlogoApp`
- `Task`
- `TaskStep`
- `TaskEvent`
- `Approval`
- `Artifact`
- `BuildRun`
- `TestRun`

### Persisted models defined for the broader roadmap

- `ToolCall`
- `WorkspaceSnapshot`
- `Patch`
- `KnowledgeChunk`
- `PromptVersion`
- `EvalRun`
- `AppImport`
- `AppTrigger`
- `AppHandler`
- `AppResource`

## Current persistence behavior

The control-plane now persists task lifecycle data through Prisma.

That includes:

- task records,
- task status updates,
- persisted event history,
- approval records,
- task artifacts,
- build/test run summaries.

### App-scoped analysis persistence

Direct app-analysis endpoints currently persist analysis output by creating hidden synthetic task records.

Current implementation detail:

- hidden analysis tasks use `requestedBy = "system:app-analysis"`
- app-scoped artifacts are attached to those hidden tasks
- task listing APIs exclude those records from normal operator task lists

This allows:

- app-level catalog artifact history,
- app-level descriptor artifact history,
- app-level governance artifact history,
- app-level composition-comparison artifact history,
- app-level mapping preview artifact history,
- app-level property-plan artifact history,
- app-level mapping-test artifact history,
- artifact lookup by resolved `FlogoApp`,

without adding a second artifact storage model yet.

## Artifact URI behavior

Current runtime behavior is mixed:

- persisted metadata is stored in PostgreSQL,
- inventory, catalog, descriptor, contribution-evidence, governance, composition-compare, mapping-preview, property-plan, and mapping-test payloads are stored as Blob/Azurite-backed JSON objects,
- many broader task artifacts still use logical or local URIs.

This matters for operators:

- task and analysis history survive restart,
- artifact metadata survives restart,
- app-analysis payloads are object-storage-backed,
- broader runtime artifact payload locations may still be logical rather than object-storage-backed.

## App resolution model

The app-analysis services resolve apps in this order:

1. persisted `FlogoApp` record for `projectId + appId`,
2. example fallback at `examples/<appId>/flogo.json`,
3. `404` if neither exists.

Example fallback can auto-register a local `FlogoApp` record when Prisma is available.

## Known model gaps

The current model is still ahead of the implementation roadmap in several places.

Examples:

- `flow_contract` is now produced by the flow-contract inference slice.
- `trigger_binding_plan` and `trigger_binding_result` are now produced by the trigger-binding slice.
- `subflow_extraction_plan`, `subflow_extraction_result`, `subflow_inlining_plan`, and `subflow_inlining_result` are now produced by the subflow-refactor slice.
- `iterator_plan`, `iterator_result`, `retry_policy_plan`, `retry_policy_result`, `dowhile_plan`, `dowhile_result`, `error_path_plan`, and `error_path_result` are now produced by the advanced control-flow synthesis slice.
- `run_trace_plan` and `run_trace` are now produced by the direct/runtime helper-backed trace capture path, with `run_trace` artifacts carrying `trace.evidenceKind`, `trace.runtimeEvidence`, and matching artifact metadata for the narrow recorder-backed direct-flow, REST runtime, and timer runtime slices.
- `replay_plan` and `replay_report` are now produced by the direct/helper-backed replay path; replay is runtime-backed on the same narrow supported direct-flow slice plus the narrow REST, timer, CLI, and Channel runtime slices, and otherwise remains simulated fallback, with `result.runtimeEvidence` making that distinction explicit.
- `run_comparison_plan` and `run_comparison` are now produced from stored `run_trace` and `replay_report` artifacts, preferring recorder-backed runtime evidence and normalized step evidence when available, preferring REST envelope comparison or timer startup comparison when the matching artifacts carry those runtime slices, and falling back to nested-trace or summary-only replay payloads otherwise.
- `diagnosis_report` is now produced by the analysis-only diagnosis loop; it summarizes problem category, subtype, supporting evidence references, recommended next action, recommended patch, confidence, and evidence quality while linking back to any nested trace, replay, or comparison artifacts used during the proof path, and its confidence payload is now explicitly calibrated against runtime-backed vs mixed vs artifact-backed vs simulated fallback evidence plus contract-inference-only cases.
- `contrib_bundle` remains a defined artifact kind whose producing feature is not implemented yet.
- graph projections in Prisma exist, but the current runtime does not fully maintain them.
- task persistence is live, but workspace snapshots and blob-backed artifact content are still planned work.
- task persistence is live, app-analysis payload storage is live, but workspace snapshots and broader blob-backed artifact content are still planned work.

These are intentional roadmap placeholders, not accidental drift.
