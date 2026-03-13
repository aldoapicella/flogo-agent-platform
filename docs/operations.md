# Operations Guide

## Overview

This guide covers monitoring, verification, troubleshooting, and current runtime limits.

Read this together with:

- [Architecture](./architecture.md)
- [API reference](./api-reference.md)
- [Flogo-Native Runtime Plan](./flogo-native-runtime-plan.md)

## Health endpoints

### Control-plane

- `GET /v1/health`

### Orchestrator local host

- `GET /health`

### Runner-worker

- `GET /health`

## Operational inspection workflow

For a running task, the main operator inspection path is:

1. `GET /v1/tasks/:taskId`
2. `GET /v1/tasks/:taskId/history`
3. `GET /v1/tasks/:taskId/runs`
4. `GET /v1/tasks/:taskId/artifacts`
5. orchestrator status endpoint
6. runner-worker job status endpoint

### Key fields to inspect

- `status`
- `summary`
- `approvalStatus`
- `activeJobRuns`
- `requiredApprovals`
- persisted event history
- build/test run summaries
- published artifacts

## App-analysis inspection workflow

For graph/catalog/mapping-preview work:

1. `GET /v1/projects/:projectId/apps/:appId/graph`
2. `GET /v1/projects/:projectId/apps/:appId/catalog`
3. `POST /v1/projects/:projectId/apps/:appId/mappings/preview`
4. `GET /v1/projects/:projectId/apps/:appId/artifacts`

Use this to inspect:

- contribution inventory,
- mapping diagnostics,
- property planning output,
- persisted app-analysis artifacts.

## Observability

The infrastructure is wired for:

- service logs,
- Log Analytics,
- Application Insights.

Current implementation status:

- infrastructure and env wiring are in place,
- the codebase still needs a full OpenTelemetry pass for end-to-end correlated traces.

## Verification commands

### Primary workspace verification

```bash
pnpm typecheck
```

### Tests

```bash
pnpm test
```

### Build

```bash
pnpm build
```

### Prisma client generation

```bash
pnpm db:generate
```

### Azure Bicep validation

```bash
az bicep build --file infra/azure/main.bicep
```

## Known environment caveat

In restricted Windows shells, `next build` and Vitest can fail with `spawn EPERM` even when the code is otherwise valid.

If that happens:

1. trust `pnpm typecheck` as the primary correctness gate for the workspace,
2. rerun `pnpm build` or the targeted test suite in CI or an unrestricted local shell,
3. do not assume the failure is a code regression until it reproduces outside the restricted environment.

## Troubleshooting

### Task remains in `planning` or `running`

Check:

- the control-plane created an `orchestrationId`,
- the orchestrator status endpoint returns the instance,
- the runner-worker received and stored the job run,
- `GET /v1/tasks/:taskId/history` shows status/tool events,
- `GET /v1/tasks/:taskId/runs` shows expected build/test projections.

### Task remains in `awaiting_approval`

Check:

- `requiredApprovals`,
- `approvalStatus`,
- whether an approval was posted to `POST /v1/tasks/:taskId/approvals`,
- whether the orchestrator instance consumed the approval signal.

### Runner job cannot be found

Check:

- `activeJobRuns` on the task result,
- `GET /internal/jobs/:jobRunId` on runner-worker,
- runner-worker logs,
- whether the orchestrator created the expected step type and job kind.

### Graph or catalog endpoint returns `404`

Check app resolution order:

1. matching `FlogoApp` record for the `projectId + appId`,
2. fallback example file under `examples/<appId>/flogo.json`.

If neither exists, the `404` is expected.

### Artifacts exist but the URI is not Blob-backed

This can still happen.

Current behavior:

- artifact metadata is persisted,
- some URIs are still logical/local,
- blob-backed storage remains an ongoing implementation area.

### Container Apps Job execution does not complete in production mode

Check:

- `RUNNER_EXECUTION_MODE=container-apps-job`,
- Azure subscription and resource group env vars,
- managed identity/token acquisition path,
- job template names,
- runner-worker start/poll responses,
- ARM/API permissions.

## Current limitations

### Flogo-native capability depth

- contribution catalog and mapping preview are implemented,
- deeper Core-native composition is not yet implemented,
- flow contracts, runtime trace capture, replay, and run comparison are now implemented; contribution scaffolding is still a roadmap item.

### Storage

- task/event/run/artifact metadata is persisted,
- blob-backed payload storage is still incomplete in some flows.

### Orchestration

- Durable Functions definitions exist for deployment,
- local development still uses the Fastify orchestration host.

### UI

- operator UI is intentionally thin and does not yet expose dedicated catalog/mapping/runtime-trace/replay dashboards.

## Recommended next operational milestones

1. Add OpenTelemetry trace propagation across control-plane, orchestrator, and runner-worker.
2. Move more artifact payloads to Blob/Azurite-backed storage.
3. Add replay-driven debugging on top of persisted trace/replay/run-comparison artifacts.
4. Add UI views for app catalog, mapping preview, runtime trace, and later replay/comparison/contrib workflows.
5. Expand eval coverage for catalog/mapping-specific workflows.
