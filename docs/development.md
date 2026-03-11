# Development Guide

## Overview

This guide explains how to run and extend the repository in its current Container Apps-first, Flogo-native-expansion state.

Before implementing new Flogo-native work, read:

1. [Flogo-Native Runtime Plan](./flogo-native-runtime-plan.md)
2. [Capability Matrix](./capability-matrix.md)
3. [Architecture](./architecture.md)

## Implementation rule

For every implementation slice that changes the Flogo-native roadmap:

1. update [Flogo-Native Runtime Plan](./flogo-native-runtime-plan.md),
2. update [Capability Matrix](./capability-matrix.md),
3. update the affected operational docs,
4. then implement the code changes.

This keeps the roadmap and the checked-in implementation aligned.

## Prerequisites

- Node.js 22 or newer
- pnpm 9 or newer
- Docker
- Go toolchain if you build the helper locally
- Azure CLI if validating or deploying Azure infrastructure
- `az bicep` or Bicep support through Azure CLI

## Repository layout

### Applications

- `apps/control-plane`
- `apps/orchestrator`
- `apps/runner-worker`
- `apps/web-console`

### Shared packages

- `packages/contracts`
- `packages/flogo-graph`
- `packages/tools`
- `packages/agent`
- `packages/prompts`
- `packages/evals`

### Go helper

- `go-runtime/flogo-helper`

### Infrastructure

- `infra/local`
- `infra/azure`
- `runner-images/flogo-runner`

### Fixtures and examples

- `examples/hello-rest/flogo.json`
- `examples/broken-mappings/flogo.json`

## Environment configuration

Copy `.env.example` to `.env`.

### Important variables

#### Runtime and ports

- `PORT`
- `CONTROL_PLANE_PORT`
- `ORCHESTRATOR_PORT`
- `RUNNER_WORKER_PORT`
- `NEXT_PUBLIC_API_BASE_URL`

#### Service-to-service URLs

- `ORCHESTRATOR_BASE_URL`
- `RUNNER_WORKER_BASE_URL`
- `CONTROL_PLANE_INTERNAL_URL`

#### Internal auth

- `INTERNAL_SERVICE_TOKEN`

#### Runner settings

- `RUNNER_EXECUTION_MODE`
- `RUNNER_JOB_TEMPLATE_NAME`
- `RUNNER_BUILD_JOB_TEMPLATE_NAME`
- `RUNNER_SMOKE_JOB_TEMPLATE_NAME`
- `RUNNER_CUSTOM_CONTRIB_JOB_TEMPLATE_NAME`
- `RUNNER_EVAL_JOB_TEMPLATE_NAME`
- `RUNNER_CATALOG_JOB_TEMPLATE_NAME`
- `RUNNER_MAPPING_PREVIEW_JOB_TEMPLATE_NAME`
- `FLOGO_HELPER_BIN` if you want to point runner-worker at a prebuilt helper

#### Durable orchestration backend

- `DURABLE_BACKEND_PROVIDER`
- `DURABLE_TASK_HUB_NAME`
- `DURABLE_STORAGE_PROVIDER_TYPE`
- `DURABLE_BACKEND_CONNECTION_NAME`
- `DURABLE_TASK_SCHEDULER_ENDPOINT`
- `DURABLE_TASK_SCHEDULER_NAMESPACE`
- `DURABLE_STORAGE_CONNECTION_STRING`
- `DURABLE_STORAGE_TASKHUB_CONNECTION_NAME`

#### Storage and Azure integration

- `DATABASE_URL`
- `AZURITE_CONNECTION_STRING`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_RESOURCE_MANAGER_ENDPOINT`
- `CONTAINER_APPS_API_VERSION`

#### Model integration

- `MODEL_PROVIDER`

## Common commands

### Install dependencies

```bash
pnpm install
```

### Generate Prisma client

```bash
pnpm db:generate
```

### Build shared packages only

```bash
pnpm build:shared
```

### Typecheck the workspace

```bash
pnpm typecheck
```

Important:

- `pnpm typecheck` rebuilds shared packages first,
- shared packages are consumed through their `dist` exports,
- when you change `packages/contracts`, `packages/flogo-graph`, `packages/tools`, or `packages/agent`, use `pnpm build:shared` or `pnpm typecheck` before validating downstream apps.

### Run tests

```bash
pnpm test
```

### Build everything

```bash
pnpm build
```

### Run all apps directly

```bash
pnpm dev
```

### Run individual apps

```bash
pnpm dev:control-plane
pnpm dev:orchestrator
pnpm dev:runner-worker
pnpm dev:web
```

### Run Docker Compose stack

```bash
pnpm compose:up
pnpm compose:down
```

## Local development modes

### Workspace mode

Use `pnpm dev` when:

- you want fast iteration,
- you are working on contracts, planner logic, or service code,
- you do not need containerized execution.

### Docker Compose mode

Use `pnpm compose:up` when:

- you want Postgres and Azurite up together,
- you want a closer approximation of the local multi-app stack,
- you want to exercise environment wiring more realistically.

## Extending the codebase

## Adding a new public endpoint

1. add or extend a controller/module under `apps/control-plane/src/modules`,
2. define or extend the shared schema in `packages/contracts`,
3. keep validation at the API boundary,
4. update [API reference](./api-reference.md),
5. update the roadmap docs if the endpoint exposes a new Flogo-native capability.

## Adding a new Flogo-native capability

Use this order:

1. update [Flogo-Native Runtime Plan](./flogo-native-runtime-plan.md),
2. update [Capability Matrix](./capability-matrix.md),
3. add or extend contracts in `packages/contracts`,
4. add graph/planner logic in `packages/flogo-graph` or `packages/agent`,
5. add tool wrappers in `packages/tools`,
6. extend control-plane/orchestrator/runner-worker surfaces,
7. extend the Go helper if the capability needs Core/Flow-native execution,
8. add tests,
9. update [Architecture](./architecture.md), [API reference](./api-reference.md), and [Data model](./data-model.md).

## Extending the Go helper

Go helper source:

- `go-runtime/flogo-helper/main.go`

Current contract:

- strict JSON to stdout,
- logs/errors to stderr,
- normalized exit code behavior for runner-worker consumption.

When adding a helper command:

1. define or reuse shared contracts first,
2. add runner-worker command construction,
3. add command/result tests,
4. document the command in the roadmap docs if it is a new capability area.

## Extending orchestration

Planner logic:

- `packages/agent/src/index.ts`

Orchestrator routing:

- `apps/orchestrator/src/shared/orchestrator-http.ts`

When adding a new execution mode:

1. keep `create | update | debug | review` as the top-level public task types unless there is a compelling API reason,
2. prefer richer `inputs.mode` or typed payloads over public API churn,
3. update runner step resolution only when the runtime path actually changes.

## Extending the runner path

Runner-worker sources:

- `apps/runner-worker/src/services/runner-job.service.ts`
- `apps/runner-worker/src/services/runner-executor.service.ts`

When adding a new job kind:

1. extend `RunnerJobSpec` and related schemas if needed,
2. map job kinds to runner behavior and job templates,
3. keep structured artifacts/diagnostics rather than raw shell output,
4. update [API reference](./api-reference.md) and [Data model](./data-model.md).

## Testing strategy

Preferred order:

1. unit tests,
2. contract tests,
3. meaningful integration tests,
4. end-to-end/eval coverage when the boundary is important.

Current important test areas:

- `packages/flogo-graph/src/index.test.ts`
- control-plane service tests
- runner-worker service tests

## Known development caveats

- Shared packages are consumed from `dist`, so stale package builds can look like app-level type errors.
- `next build` and Vitest can hit environment-specific `spawn EPERM` failures in restricted Windows shells even when the code is type-correct.
- Some artifact URIs are still logical/local rather than Blob-backed.
- The Go helper currently covers only the Phase 1 catalog/descriptor/mapping-preview slice.

If the environment blocks build/test execution, validate the same commands again in CI or an unrestricted local shell before assuming the code is broken.
