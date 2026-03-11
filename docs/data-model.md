# Data Model

## Overview

The platform uses two complementary data models:

1. Shared runtime contracts in `packages/contracts`
2. Intended durable persistence schema in Prisma

There is also a domain-specific graph model for Flogo apps in `packages/flogo-graph`.

## Shared runtime contracts

Source:

- [packages/contracts/src/index.ts](C:/Users/aapicella/dev/flogo-agent-platform/packages/contracts/src/index.ts)

The contracts package uses Zod to define both:

- runtime validation,
- TypeScript inference.

This makes the same schemas usable in:

- the control-plane,
- the orchestrator,
- the runner-worker,
- the web console,
- tests.

## Core task contracts

### `TaskRequest`

Represents task intake.

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

Represents a broader read-model shape intended for task listings and detail views.

The current API mainly returns `TaskResult`, but the schema exists for richer read models.

## Approval contracts

### `ApprovalRequest`

Describes an approval that should be requested.

### `ApprovalDecision`

Describes the approval outcome.

Allowed approval types:

- `delete_flow`
- `change_public_contract`
- `dependency_upgrade`
- `custom_code`
- `external_endpoint_change`
- `deploy`

Allowed approval statuses:

- `pending`
- `approved`
- `rejected`

## Artifact contracts

Artifacts are represented by `ArtifactRef`.

Allowed artifact types:

- `flogo_json`
- `binary`
- `build_log`
- `runtime_log`
- `test_report`
- `patch_bundle`
- `review_report`
- `workspace_snapshot`

## Validation model

### `ValidationReport`

Contains:

- overall `ok`,
- ordered `stages`,
- human-readable `summary`,
- attached `artifacts`.

### Validation stages

The shared validation stage enum currently includes:

- `structural`
- `semantic`
- `dependency`
- `build`
- `runtime`
- `regression`

Current implementation note:

- `packages/flogo-graph` actively produces structural, semantic, and dependency-stage outputs.
- The broader stage list exists to support the intended full pipeline.

## Orchestration model

### `OrchestrationRuntimeStatus`

Allowed values:

- `pending`
- `running`
- `completed`
- `failed`
- `terminated`
- `continued_as_new`
- `unknown`

### `OrchestratorStartRequest`

Used by the control-plane to start a workflow.

Fields:

- `taskId`
- `request`
- `requiredApprovals`
- `planSummary`
- `steps`

### `OrchestratorStartResponse`

Fields:

- `orchestrationId`
- `status`
- `activeJobRuns`
- `summary`

### `OrchestratorStatus`

Fields:

- `orchestrationId`
- `taskId`
- `runtimeStatus`
- `approvalStatus`
- `activeJobRuns`
- `summary`
- `lastUpdatedAt`

## Runner model

### `RunnerJobSpec`

Represents one finite execution request.

Key fields:

- `taskId`
- `stepType`
- `snapshotUri`
- `appPath`
- `env`
- `envSecretRefs`
- `timeoutSeconds`
- `artifactOutputUri`
- `jobTemplateName`
- `jobRunId?`
- `correlationId?`
- `command`
- `containerArgs`

### `RunnerJobResult`

Fields:

- `jobId`
- `jobRunId?`
- `ok`
- `status`
- `summary`
- `exitCode`
- `startedAt?`
- `finishedAt?`
- `jobTemplateName?`
- `logArtifact?`
- `artifacts`
- `diagnostics`

### `RunnerJobStatus`

Fields:

- `jobRunId`
- `status`
- `summary`
- `spec`
- `result?`

### `ActiveJobRun`

This is the compact job projection placed onto task results.

Fields:

- `id`
- `stepType`
- `jobTemplateName`
- `status`
- `summary?`
- `startedAt?`
- `finishedAt?`

## Event model

### `TaskEvent`

Represents an item emitted to the control-plane event stream.

Fields:

- `id`
- `taskId`
- `type`
- `message`
- `timestamp`
- `payload?`

Supported event types:

- `status`
- `log`
- `artifact`
- `approval`
- `tool`

### `TaskEventPublish`

This is the internal event-publish request used by the orchestrator.

## Flogo graph model

Source:

- [packages/flogo-graph/src/index.ts](C:/Users/aapicella/dev/flogo-agent-platform/packages/flogo-graph/src/index.ts)

### `FlogoApp`

The parsed app descriptor.

Key fields:

- `name`
- `type`
- `appModel`
- `version?`
- `description?`
- `imports`
- `triggers`
- `resources`

### `FlogoAppGraph`

The enriched graph projection.

Fields:

- `app`
- `importsByAlias`
- `resourceIds`
- `taskIds`
- `diagnostics`

### Graph validations implemented today

- missing flow references in trigger handlers,
- missing activity refs,
- missing import aliases,
- invalid `$activity[...]` order based on task ordering,
- basic dependency ref formatting.

## Prisma persistence schema

Source:

- [prisma/schema.prisma](C:/Users/aapicella/dev/flogo-agent-platform/prisma/schema.prisma)

The Prisma schema models the intended durable state for:

- organizations,
- projects,
- Flogo apps,
- tasks,
- task steps,
- task events,
- tool calls,
- approvals,
- workspace snapshots,
- patches,
- build runs,
- test runs,
- artifacts,
- knowledge chunks,
- prompt versions,
- eval runs,
- app imports,
- app triggers,
- app handlers,
- app resources.

## Important persistence caveat

The Prisma schema is ahead of the live runtime integration.

Current runtime behavior:

- the control-plane stores task state in a `Map`,
- the task event stream is in-memory,
- artifacts are stored as in-memory references,
- graph lookup reads from the `examples` directory.

Intended future behavior:

- the control-plane reads and writes task state through Prisma,
- the orchestrator writes workflow state projections through internal sync routes backed by Prisma,
- the runner-worker writes build and test run records,
- Blob URIs resolve to real object storage records.

This gap matters operationally. Do not assume task history survives a process restart yet.

## Contract-to-schema drift

There is also some naming drift between the current public/runtime contracts and the Prisma schema.

Examples:

- contract task status uses `completed`, while Prisma currently uses `succeeded`
- contract approval type uses `change_public_contract`, while Prisma currently uses `public_contract_change`
- contract approval type uses `delete_flow`, while Prisma also includes `delete_resource`

This does not break the current running scaffold because Prisma is not yet the live task-state backend. It does matter for the next persistence integration pass. Before wiring the control-plane to Prisma, these enums should be normalized so the API layer, orchestrator, and database model all speak the same status and approval vocabulary.
