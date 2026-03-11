# Operations Guide

## Overview

This guide covers monitoring, testing, troubleshooting, and known runtime limitations.

## Health endpoints

### Control-plane

- `GET /v1/health`

Returns:

- `ok`
- `service`
- `timestamp`

### Orchestrator local host

- `GET /health`

### Runner-worker

- `GET /health`

## Observability

The codebase and infrastructure are set up around the following observability model:

- service logs emitted by each app,
- Application Insights connection string wiring in Azure,
- Log Analytics workspace in the Bicep deployment.

Current implementation note:

- the code does not yet include a full OpenTelemetry instrumentation pass,
- but the deployment template and environment structure are already compatible with that direction.

## Task lifecycle monitoring

The most useful sources during local or early-stage operations are:

1. `GET /v1/tasks/:taskId`
2. `GET /v1/tasks/:taskId/events`
3. orchestrator status endpoint
4. runner-worker job status endpoint

### What to inspect

- `status`
- `summary`
- `approvalStatus`
- `activeJobRuns`
- `artifacts`
- event history for `approval`, `tool`, `artifact`, and `status` entries

## Testing and verification

### Unit and contract-style tests

Run:

```bash
pnpm test
```

Current test coverage includes:

- Flogo parser and validation behavior,
- runner executor behavior,
- smoke-test generation,
- control-plane orchestration submission.

### Build verification

Run:

```bash
pnpm build
```

### Prisma client generation

Run:

```bash
pnpm db:generate
```

### Bicep validation

Run:

```bash
az bicep build --file infra/azure/main.bicep
```

## Evaluation coverage

Golden eval cases live in [packages/evals/src/index.ts](C:/Users/aapicella/dev/flogo-agent-platform/packages/evals/src/index.ts).

The current eval dataset covers:

- create
- update
- debug
- review

Representative cases include:

- REST hello world,
- timer flow,
- shared logic,
- bad flow ref,
- illegal mapping scope,
- unused imports,
- missing tests,
- contract drift.

## Troubleshooting

### Task remains in `planning` or `running`

Check:

- control-plane can reach the orchestrator,
- orchestrator can reach runner-worker,
- the task has an `orchestrationId`,
- the orchestrator status endpoint returns the expected instance.

### Task remains in `awaiting_approval`

Check:

- `requiredApprovals` on the task result,
- `approvalStatus`,
- whether an approval was posted to `/v1/tasks/:taskId/approvals`.

### Job run cannot be found

Check:

- the `jobRunId` in `activeJobRuns`,
- `GET /internal/jobs/:jobRunId` on the runner-worker,
- whether the orchestrator successfully called `/internal/jobs/start`.

### Graph endpoint returns `404`

Current implementation only reads examples from `examples/<appId>/flogo.json`.

Check:

- `appId` matches an example directory,
- the file exists.

### State disappears after restart

This is expected today.

Current task state is not yet persisted through Prisma at runtime.

## Known limitations

### Persistence

- task state is in-memory
- event history is in-memory
- artifact references are in-memory

### Execution

- local runner execution uses local processes
- Container Apps Job execution is not yet a live Azure integration

### Orchestration

- local development uses a Fastify shim rather than the Azure Functions host
- the Durable Functions code path exists for deployment, but local runtime parity depends on the shim staying aligned

### Storage

- blob containers are provisioned in Azure
- artifact URIs and snapshot URIs are modeled in code
- actual artifact upload/download paths are still incomplete

## Recommended next operational milestones

1. Persist task state and events through Prisma.
2. Persist artifact and snapshot metadata through Blob storage APIs.
3. Replace the placeholder Container Apps Job executor with real Azure management calls.
4. Add explicit OpenTelemetry tracing across control-plane, orchestrator, and runner-worker.
5. Add integration tests that exercise the full local multi-service path.
