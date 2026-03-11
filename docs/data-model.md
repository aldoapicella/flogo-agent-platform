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

- `mode = "catalog"` for analysis-only contribution catalog work
- `mode = "mapping_preview"` for analysis-only mapping preview work

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
- `contrib_catalog`
- `mapping_preview`
- `flow_contract`
- `run_trace`
- `replay_report`
- `contrib_bundle`

## Flogo-native contracts

### Contribution catalog contracts

Important schemas:

- `ContribDescriptor`
- `ContribCatalog`
- `ContribCatalogResponse`

These describe:

- ref and alias,
- contrib type,
- settings,
- inputs,
- outputs,
- examples,
- compatibility notes,
- response artifact references.

### Mapping contracts

Important schemas:

- `MappingPreviewRequest`
- `MappingPreviewResult`
- `MappingPreviewResponse`

These describe:

- target node,
- field-level classification,
- references used,
- resolved preview values,
- diagnostics,
- coercion suggestions,
- property-analysis output,
- response artifact references.

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
- typed mapping preview classification,
- unresolved-reference diagnostics,
- coercion suggestion heuristics,
- app property analysis.

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
- app-level mapping preview artifact history,
- artifact lookup by resolved `FlogoApp`,

without adding a second artifact storage model yet.

## Artifact URI behavior

Current runtime behavior is mixed:

- persisted metadata is stored in PostgreSQL,
- many local artifacts still use logical or local URIs,
- Blob/Azurite is the target backend but not yet the default artifact implementation for every path.

This matters for operators:

- task and analysis history survive restart,
- artifact metadata survives restart,
- artifact payload location may still be logical rather than object-storage-backed.

## App resolution model

The app-analysis services resolve apps in this order:

1. persisted `FlogoApp` record for `projectId + appId`,
2. example fallback at `examples/<appId>/flogo.json`,
3. `404` if neither exists.

Example fallback can auto-register a local `FlogoApp` record when Prisma is available.

## Known model gaps

The current model is still ahead of the implementation roadmap in several places.

Examples:

- `flow_contract`, `run_trace`, `replay_report`, and `contrib_bundle` are defined as artifact kinds, but the runtime features that produce them are not implemented yet.
- graph projections in Prisma exist, but the current runtime does not fully maintain them.
- task persistence is live, but workspace snapshots and blob-backed artifact content are still planned work.

These are intentional roadmap placeholders, not accidental drift.
