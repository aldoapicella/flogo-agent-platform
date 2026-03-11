# API Reference

## Overview

The repository exposes four API surfaces:

1. public control-plane API,
2. internal control-plane sync API,
3. orchestrator API,
4. runner-worker API.

Only the public control-plane API is intended for operators or external clients.

## Public control-plane API

Local base URL:

- `http://localhost:3001/v1`

Swagger:

- `http://localhost:3001/docs`

## Task endpoints

### `POST /v1/tasks`

Creates a task, persists it, starts orchestration, and returns the initial task result.

Request shape:

- `TaskRequest`

Important fields:

- `type`: `create | update | debug | review`
- `projectId`
- `appId?`
- `appPath?`
- `requestedBy`
- `summary`
- `repo?`
- `inputs`
- `constraints`

Important analysis-only modes:

- `inputs.mode = "catalog"`
- `inputs.mode = "mapping_preview"`
- `inputs.mode = "governance"`
- `inputs.mode = "composition_compare"`

When one of those modes is supplied, the planner avoids patch/build/smoke steps and routes the task through analysis-oriented runner steps.

Example:

```json
{
  "type": "review",
  "projectId": "demo",
  "appId": "hello-rest",
  "requestedBy": "web-console",
  "summary": "Inspect mapping behavior for the request logger",
  "inputs": {
    "mode": "mapping_preview",
    "nodeId": "log-request",
    "sampleInput": {
      "flow": {},
      "activity": {},
      "env": {},
      "property": {},
      "trigger": {}
    }
  },
  "constraints": {
    "allowDependencyChanges": false,
    "allowCustomCode": false,
    "targetEnv": "dev"
  }
}
```

Response shape:

- `TaskResult`

Key fields:

- `taskId`
- `type`
- `status`
- `summary`
- `orchestrationId`
- `approvalStatus`
- `activeJobRuns`
- `requiredApprovals`
- `nextActions`
- `artifacts`

### `GET /v1/tasks`

Returns the current task summaries.

Response shape:

- `TaskSummary[]`

Behavior:

- hidden app-analysis persistence records are excluded from this listing.

### `GET /v1/tasks/:taskId`

Returns the current `TaskResult`.

Behavior:

- if the task has an `orchestrationId`, the control-plane refreshes status from the orchestrator before returning the result.

### `GET /v1/tasks/:taskId/stream`

Streams task events using SSE.

Payload shape:

- `TaskEvent`

### `GET /v1/tasks/:taskId/events`

Alias for the SSE event stream.

Payload shape:

- `TaskEvent`

### `GET /v1/tasks/:taskId/history`

Returns persisted event history for the task.

Response shape:

- `TaskEvent[]`

### `GET /v1/tasks/:taskId/runs`

Returns persisted build and test run summaries for a task.

Response shape:

- `TaskRuns`

### `POST /v1/tasks/:taskId/approvals`

Records an approval decision and signals the orchestrator.

Request shape:

- `ApprovalDecision`

Defaults applied by the controller:

- `status` defaults to `approved`
- `type` defaults to `change_public_contract`

Example:

```json
{
  "status": "approved",
  "type": "change_public_contract",
  "rationale": "Approved for development use"
}
```

### `GET /v1/tasks/:taskId/artifacts`

Returns persisted task-scoped artifacts.

Response shape:

- `ArtifactRef[]`

## Flogo app-analysis endpoints

### `GET /v1/projects/:projectId/apps/:appId/graph`

Returns the parsed Flogo graph.

Source resolution behavior:

1. try a persisted `FlogoApp` for `projectId + appId`,
2. fall back to `examples/<appId>/flogo.json`,
3. return `404` if neither exists.

### `GET /v1/projects/:projectId/apps/:appId/catalog`

Returns the contribution catalog plus a persisted artifact reference.

Response shape:

- `ContribCatalogResponse`

Key fields:

- `catalog`
- `artifact`

Current implementation notes:

- catalog entries include descriptor source information such as `descriptor`, `registry`, or `inferred`,
- the response artifact is backed by Blob/Azurite JSON storage and Prisma metadata.

### `GET /v1/projects/:projectId/apps/:appId/descriptors?ref=...`

Returns a normalized descriptor inspection result for one contrib ref or alias.

Request query:

- `ref`

Examples:

- `#log`
- `#rest`
- `github.com/project-flogo/contrib/activity/log`

Response shape:

- `ContribDescriptorResponse`

Key fields:

- `descriptor`
- `diagnostics`
- `artifact`

Current implementation notes:

- refs are passed as a query parameter because contrib refs commonly contain `/`,
- descriptor resolution prefers discovered descriptor metadata and falls back to normalized registry or inferred metadata with diagnostics,
- the response artifact is backed by Blob/Azurite JSON storage and Prisma metadata.

### `GET /v1/projects/:projectId/apps/:appId/artifacts`

Returns app-scoped analysis artifacts currently associated with the resolved app.

Response shape:

- `ArtifactRef[]`

Current implementation note:

- app-scoped analysis artifacts are currently persisted through hidden synthetic review tasks plus Blob/Azurite-backed JSON payload storage.

### `GET /v1/projects/:projectId/apps/:appId/governance`

Returns alias, orphaned-ref, and version-governance analysis plus a persisted artifact reference.

Response shape:

- `GovernanceResponse`

Key fields:

- `report`
- `artifact`

Current implementation notes:

- governance currently checks duplicate aliases, missing imports, implicit alias use, missing flow/action refs, unused imports, and version drift heuristics,
- the report artifact is backed by Blob/Azurite JSON storage and Prisma metadata.

### `POST /v1/projects/:projectId/apps/:appId/mappings/preview`

Runs typed mapping preview for a specific node and returns the result plus a persisted artifact reference.

Request shape:

- `MappingPreviewRequest`

Important fields:

- `nodeId`
- `sampleInput`

Response shape:

- `MappingPreviewResponse`

Key fields:

- `preview`
- `propertyPlan`
- `artifact`

Current implementation notes:

- the preview artifact is backed by Blob/Azurite JSON storage and Prisma metadata,
- `propertyPlan` now includes declared properties, undefined and unused refs, recommended properties, recommended environment variables, and deployment notes.

### `POST /v1/projects/:projectId/apps/:appId/composition/compare`

Compares canonical `flogo.json` structure with the current programmatic-composition probe and returns a persisted artifact reference.

Request shape:

- `CompositionCompareRequest`

Important fields:

- `mode`
- `target`
- `resourceId?`

Response shape:

- `CompositionCompareResponse`

Key fields:

- `comparison`
- `comparison.artifact`

Current implementation notes:

- this is an analysis/probe path, not full programmatic generation,
- the comparison artifact is backed by Blob/Azurite JSON storage and Prisma metadata.

### `GET /v1/health`

Returns:

```json
{
  "ok": true,
  "service": "control-plane",
  "timestamp": "2026-03-11T00:00:00.000Z"
}
```

## Internal control-plane API

These routes are intended only for orchestrator and runner integration.

Local base URL:

- `http://localhost:3001/v1/internal`

Authentication:

- local/dev mode uses `X-Internal-Service-Token`
- production should move to managed service identity or equivalent service-to-service auth

### `POST /v1/internal/tasks/:taskId/events`

Publishes a task event into persisted task history and the SSE stream.

Request shape:

- `TaskEventPublish`

### `POST /v1/internal/tasks/:taskId/sync`

Synchronizes orchestration or runner state into the control-plane read model.

Request shape:

- `TaskStateSync`

Important fields:

- `orchestrationId`
- `status`
- `summary`
- `approvalStatus`
- `activeJobRuns`
- `artifact`
- `validationReport`
- `requiredApprovals`
- `nextActions`
- `jobRunStatus`

## Orchestrator API

The repo supports two execution shapes:

- Durable Functions routes for deployment,
- Fastify-based local development routes.

Both use the same request and response contracts.

Local base URL:

- `http://localhost:7071/api`

### `POST /api/orchestrations/tasks`

Starts an orchestration.

Request shape:

- `OrchestratorStartRequest`

Fields:

- `taskId`
- `request`
- `requiredApprovals`
- `planSummary`
- `steps`

Response shape:

- `OrchestratorStartResponse`

Fields:

- `orchestrationId`
- `status`
- `activeJobRuns`
- `summary`

### `GET /api/orchestrations/:orchestrationId`

Returns the current orchestration projection.

Response shape:

- `OrchestratorStatus`

### `POST /api/orchestrations/:orchestrationId/approvals`

Signals an approval decision into a running orchestration.

Request shape:

- `ApprovalDecision`

Workflow behavior:

- mutating workflows use build/run/smoke-oriented runner steps,
- analysis-only workflows use `catalog_contribs`, `validate_governance`, `compare_composition`, or `preview_mapping`.

## Runner-worker API

Local base URL:

- `http://localhost:3010`

### `GET /health`

Returns a lightweight service health response.

### `POST /internal/jobs/start`

Starts a runner job.

Request shape:

- `RunnerJobSpec`

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
- `analysisKind?`
- `targetNodeId?`
- `targetRef?`

Response shape:

- `RunnerJobStatus`

### `GET /internal/jobs/:jobRunId`

Returns the latest job status.

Response shape:

- `RunnerJobStatus`

Important status/result fields:

- `status`
- `summary`
- `spec`
- `azureJobExecutionName?`
- `azureJobResourceId?`
- `result?`

## Shared contract summary

The canonical contract definitions are in `packages/contracts/src/index.ts`.

The most important ones are:

- `TaskRequest`
- `TaskResult`
- `TaskSummary`
- `TaskRuns`
- `ApprovalDecision`
- `ArtifactRef`
- `TaskEvent`
- `TaskEventPublish`
- `TaskStateSync`
- `FlogoAppGraph`
- `ContribDescriptor`
- `ContribDescriptorResponse`
- `ContribCatalog`
- `ContribCatalogResponse`
- `GovernanceReport`
- `GovernanceResponse`
- `CompositionCompareRequest`
- `CompositionCompareResult`
- `CompositionCompareResponse`
- `MappingPreviewRequest`
- `MappingPreviewResult`
- `MappingPreviewResponse`
- `ValidationReport`
- `RunnerJobSpec`
- `RunnerJobResult`
- `RunnerJobStatus`
- `OrchestratorStartRequest`
- `OrchestratorStartResponse`
- `OrchestratorStatus`

## Error behavior

Current behavior:

- unknown task IDs return `404`,
- unknown app IDs return `404`,
- unknown runner job IDs return `404`,
- schema validation errors surface as framework request errors,
- orchestrator and runner integration errors currently bubble as server-side failures rather than a uniform platform error envelope.

Future hardening should add:

- correlation IDs in public error responses,
- explicit retryability hints,
- typed downstream dependency error bodies.
