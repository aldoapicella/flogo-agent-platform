# API Reference

## Overview

This repository exposes three API layers:

1. Public control-plane API
2. Internal control-plane sync API
3. Internal orchestrator and runner-worker APIs

Only the control-plane public API is intended for external clients.

## Public control-plane API

Base URL in local development:

- `http://localhost:3001/v1`

Swagger UI in local development:

- `http://localhost:3001/docs`

### `POST /v1/tasks`

Creates a task, plans it, starts an orchestration, and returns the initial `TaskResult`.

Request shape:

- `TaskRequest`

Important fields:

- `type`: `create | update | debug | review`
- `projectId`: logical project identifier
- `appId`: optional app identifier
- `appPath`: optional path to `flogo.json`
- `requestedBy`: caller name
- `summary`: natural language description
- `repo`: optional repo target
- `inputs`: arbitrary task-specific inputs
- `constraints`: runtime and approval constraints

Example:

```json
{
  "type": "create",
  "projectId": "demo-project",
  "appPath": "examples/hello-rest/flogo.json",
  "requestedBy": "web-console",
  "summary": "Create a REST hello world app"
}
```

Response shape:

- `TaskResult`

Important response fields:

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

### `GET /v1/tasks/:taskId`

Returns the current `TaskResult`.

Behavior:

- the control-plane asks the orchestrator for the latest orchestration status when `orchestrationId` exists,
- then merges the result into the control-plane read model before returning.

### `GET /v1/tasks/:taskId/stream`

Streams task events using SSE.

Event payload shape:

- `TaskEvent`

### `GET /v1/tasks/:taskId/events`

Alias for `/v1/tasks/:taskId/stream`.

### `POST /v1/tasks/:taskId/approvals`

Records an approval decision and signals the orchestrator.

Request shape:

- `ApprovalDecision`

Defaults currently applied by the controller:

- `status` defaults to `approved` if missing
- `type` defaults to `change_public_contract` if missing

Example:

```json
{
  "status": "approved",
  "type": "change_public_contract",
  "rationale": "Approved for development use"
}
```

### `GET /v1/tasks/:taskId/artifacts`

Returns the current artifact list from the control-plane read model.

Response shape:

- `ArtifactRef[]`

### `GET /v1/projects/:projectId/apps/:appId/graph`

Returns a parsed Flogo graph for examples currently located under `examples/<appId>/flogo.json`.

Current implementation note:

- `projectId` is part of the route but is not used by the current example-backed lookup.

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

These routes are used by the orchestrator and are not intended for external clients.

Base URL in local development:

- `http://localhost:3001/v1/internal`

### `POST /v1/internal/tasks/:taskId/events`

Publishes a task event into the control-plane event stream.

Request shape:

- `TaskEventPublish`

Fields:

- `taskId`
- `type`
- `message`
- `payload`

### `POST /v1/internal/tasks/:taskId/sync`

Synchronizes orchestration state into the control-plane task result.

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

## Orchestrator API

There are two execution shapes:

- Azure Functions + Durable Functions routes in deployment
- Fastify development routes locally

Both shapes use the same route patterns and shared contracts.

Base URL in local development:

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

Returns the current orchestration view.

Response shape:

- `OrchestratorStatus`

Fields:

- `orchestrationId`
- `taskId`
- `runtimeStatus`
- `approvalStatus`
- `activeJobRuns`
- `summary`
- `lastUpdatedAt`

### `POST /api/orchestrations/:orchestrationId/approvals`

Signals an approval decision into a running orchestration.

Request shape:

- `ApprovalDecision`

Behavior:

- in the local host, this updates in-memory orchestration state and resumes the pipeline when approved,
- in the Durable Functions host, this raises the `approval-decision` external event.

## Runner-worker API

Base URL in local development:

- `http://localhost:3010`

### `GET /health`

Returns a lightweight service health object.

### `POST /internal/jobs/start`

Starts a runner job.

Request shape:

- `RunnerJobSpec`

Important fields:

- `taskId`
- `stepType`
- `snapshotUri`
- `appPath`
- `env`
- `envSecretRefs`
- `timeoutSeconds`
- `artifactOutputUri`
- `jobTemplateName`
- `jobRunId`
- `correlationId`
- `command`
- `containerArgs`

Response shape:

- `RunnerJobStatus`

### `GET /internal/jobs/:jobRunId`

Returns the latest job status.

Response shape:

- `RunnerJobStatus`

## Shared contract summary

The canonical schemas are defined in [packages/contracts/src/index.ts](C:/Users/aapicella/dev/flogo-agent-platform/packages/contracts/src/index.ts).

The most important ones are:

- `TaskRequest`
- `TaskResult`
- `TaskSummary`
- `ApprovalDecision`
- `ArtifactRef`
- `TaskEvent`
- `TaskStateSync`
- `FlogoAppGraph`
- `ValidationReport`
- `RunnerJobSpec`
- `RunnerJobResult`
- `RunnerJobStatus`
- `SmokeTestSpec`
- `OrchestratorStartRequest`
- `OrchestratorStartResponse`
- `OrchestratorStatus`

## SSE event model

The control-plane SSE stream emits `TaskEvent` objects wrapped as `MessageEvent.data`.

Current event categories:

- `status`
- `log`
- `artifact`
- `approval`
- `tool`

Example SSE payload:

```json
{
  "id": "5f1f1f5d-6f72-40e8-8d43-c89e95f97aa1",
  "taskId": "0d5f5cde-d5b6-4eb4-a4b2-c0f14d26da56",
  "type": "status",
  "message": "Workflow completed successfully",
  "timestamp": "2026-03-11T00:00:00.000Z",
  "payload": {
    "status": "completed"
  }
}
```

## Error behavior

Current error handling is intentionally simple:

- unknown task IDs return `404`,
- unknown job IDs return `404`,
- schema validation failures surface as framework-level request errors,
- orchestrator client failures currently throw server-side errors rather than being mapped into a custom platform error envelope.

This is sufficient for the current scaffold, but a later production pass should introduce:

- standardized API error bodies,
- correlation IDs,
- retryability hints,
- explicit downstream dependency error classes.
