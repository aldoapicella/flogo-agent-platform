# Development Guide

## Overview

This guide explains how to run, inspect, and extend the current repository.

## Prerequisites

- Node.js 22 or newer
- pnpm 9 or newer
- Docker
- Azure CLI if validating Bicep
- Bicep CLI or `az bicep`

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

### Infrastructure

- `infra/local`
- `infra/azure`
- `runner-images/flogo-runner`

### Fixtures and examples

- `examples/hello-rest/flogo.json`
- `examples/broken-mappings/flogo.json`

## Environment configuration

Copy [.env.example](C:/Users/aapicella/dev/flogo-agent-platform/.env.example) to `.env`.

### Variables

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

#### Runner settings

- `RUNNER_EXECUTION_MODE`
- `RUNNER_JOB_TEMPLATE_NAME`

#### Storage and orchestration

- `DATABASE_URL`
- `DURABLE_TASK_HUB_NAME`
- `AZURITE_CONNECTION_STRING`

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

### Run the Docker Compose stack

```bash
pnpm compose:up
pnpm compose:down
```

## Local development modes

### Workspace mode

Use `pnpm dev` when:

- you want fast code iteration,
- you are debugging service logic,
- you do not need container isolation.

### Docker Compose mode

Use `pnpm compose:up` when:

- you want a closer approximation of the local stack,
- you want Postgres and Azurite started consistently,
- you want the apps launched inside containerized Node environments.

## Service startup order

In Docker Compose, the effective startup order is:

1. `postgres`
2. `azurite`
3. `runner-worker`
4. `orchestrator`
5. `control-plane`
6. `web-console`

## Extending the codebase

### Adding a new public API endpoint

1. Add the controller or extend an existing module under `apps/control-plane/src/modules`.
2. Reuse or extend Zod contracts in `packages/contracts`.
3. Keep the external payload shape validated at the API boundary.
4. Update [docs/api-reference.md](C:/Users/aapicella/dev/flogo-agent-platform/docs/api-reference.md).

### Adding a new orchestration step

1. Extend `workflowRunnerSteps` in [apps/orchestrator/src/shared/orchestrator-http.ts](C:/Users/aapicella/dev/flogo-agent-platform/apps/orchestrator/src/shared/orchestrator-http.ts) if the step belongs in the normalized execution pipeline.
2. Extend `RunnerStepTypeSchema` in [packages/contracts/src/index.ts](C:/Users/aapicella/dev/flogo-agent-platform/packages/contracts/src/index.ts).
3. Update runner-worker execution logic if the step requires special handling.
4. Update tests and docs.

### Adding a new shared contract

1. Define the schema in `packages/contracts/src/index.ts`.
2. Export both the schema and the inferred type.
3. Rebuild the workspace so downstream packages get updated declarations.

### Extending Flogo validation

Add validation logic to [packages/flogo-graph/src/index.ts](C:/Users/aapicella/dev/flogo-agent-platform/packages/flogo-graph/src/index.ts).

Recommended pattern:

1. produce deterministic diagnostics,
2. group them into stage results,
3. keep validation logic free of HTTP or framework dependencies,
4. add tests in `packages/flogo-graph/src/index.test.ts`.

### Extending the planner or policy logic

Planner and policy live in [packages/agent/src/index.ts](C:/Users/aapicella/dev/flogo-agent-platform/packages/agent/src/index.ts).

Recommended pattern:

1. add or refine plan steps,
2. keep approval logic explicit and deterministic,
3. avoid binding planning logic directly to a concrete LLM provider.

### Extending prompts

Prompts live in [packages/prompts/src/index.ts](C:/Users/aapicella/dev/flogo-agent-platform/packages/prompts/src/index.ts).

Recommended pattern:

1. bump the `version`,
2. keep `evalId` aligned with the prompt revision,
3. update or add eval coverage in `packages/evals`.

## Testing strategy in development

Current tests cover:

- control-plane orchestration submission behavior,
- runner execution defaults,
- smoke-test generation,
- Flogo parsing and validation.

When adding behavior, prefer:

- unit tests first,
- contract tests second,
- integration tests only where the boundary is meaningful.

## Local debugging tips

### Control-plane

- inspect Swagger at `/docs`
- hit `/v1/health`
- submit a task with `/v1/tasks`

### Orchestrator

- hit `http://localhost:7071/health`
- inspect the returned orchestration status through `/api/orchestrations/:id`

### Runner-worker

- hit `http://localhost:3010/health`
- start a job manually through `/internal/jobs/start`

### Web console

- open `http://localhost:3000`

## Known development caveats

- Do not rely on task persistence across process restarts.
- Do not assume the Azure Functions runtime is active locally unless you explicitly host it outside the default `pnpm dev` path.
- Do not assume job artifacts are persisted to blob storage yet; many URIs are still logical placeholders.
