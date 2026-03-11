# flogo-agent-platform

`flogo-agent-platform` is a TypeScript monorepo for creating, updating, debugging, and reviewing TIBCO Flogo applications with `flogo.json` as the canonical artifact.

The current implementation is Container Apps-first:

- Azure Container Apps runs the always-on services.
- Azure Container Apps Jobs are the intended isolated execution model for finite Flogo build, run, debug, and smoke-test steps.
- PostgreSQL is the system-of-record schema target.
- Blob storage is the artifact and workspace snapshot store.
- Key Vault and managed identity are the intended cloud secret and identity model.

## Current state

The repository is a working MVP scaffold with real code paths for:

- public task submission and task inspection,
- orchestration planning,
- approval signaling,
- internal workflow-to-control-plane synchronization,
- internal runner job start and status polling,
- shared contracts, validation logic, prompts, and eval data,
- local development with Docker Compose,
- Azure Container Apps infrastructure scaffolding.

The repository also has a few explicit implementation boundaries that are important to understand:

- The control-plane currently stores task state, events, and artifact references in memory.
- The Prisma schema is present and generated, but task persistence is not yet wired into the control-plane runtime.
- The orchestrator app includes Durable Functions definitions for deployment and a Fastify-based local shim for local development.
- The runner-worker currently provides a normalized internal job API and local process execution path; the Azure Container Apps Job bridge is scaffolded at the contract and infrastructure level rather than fully calling Azure management APIs.

## Documentation map

- [Documentation index](C:/Users/aapicella/dev/flogo-agent-platform/docs/README.md)
- [Architecture](C:/Users/aapicella/dev/flogo-agent-platform/docs/architecture.md)
- [API reference](C:/Users/aapicella/dev/flogo-agent-platform/docs/api-reference.md)
- [Data model](C:/Users/aapicella/dev/flogo-agent-platform/docs/data-model.md)
- [Development guide](C:/Users/aapicella/dev/flogo-agent-platform/docs/development.md)
- [Deployment guide](C:/Users/aapicella/dev/flogo-agent-platform/docs/deployment.md)
- [Operations guide](C:/Users/aapicella/dev/flogo-agent-platform/docs/operations.md)

## Workspace layout

- `apps/control-plane`
  - NestJS + Fastify public API.
  - Owns public REST and SSE endpoints, in-memory task read models, approvals, artifact listing, graph lookup, and internal workflow sync endpoints.
- `apps/orchestrator`
  - Durable Functions definitions plus a Fastify development host.
  - Owns long-running workflow sequencing, approval waits, runner dispatch, and synchronization back into the control-plane.
- `apps/runner-worker`
  - Internal job dispatcher and status service.
  - Normalizes finite job requests for build, run, log collection, and smoke-test generation/execution.
- `apps/web-console`
  - Next.js operator UI.
  - Provides task creation and task inspection views over the control-plane API.
- `packages/contracts`
  - Shared Zod schemas and runtime types.
- `packages/flogo-graph`
  - Flogo parsing, graph building, semantic checks, mapping validation, and diff summarization.
- `packages/tools`
  - Typed repo, Flogo, runner, test, and artifact helper implementations.
- `packages/agent`
  - Planner, lightweight policy engine, and model abstraction.
- `packages/prompts`
  - Versioned prompt catalog.
- `packages/evals`
  - Golden evaluation cases and scoring helpers.
- `infra/local`
  - Docker Compose local development environment.
- `infra/azure`
  - Azure Container Apps-first Bicep scaffold.
- `runner-images/flogo-runner`
  - Runner image scaffold for local and Azure job execution.
- `examples`
  - Example Flogo apps used for validation and testing.

## Quick start

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker Desktop or compatible Docker runtime
- Go toolchain if you extend the runner image or later add native Flogo build integration
- Azure CLI if you plan to validate or deploy the Bicep templates

### Local bootstrap

1. Copy `.env.example` to `.env`.
2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Generate Prisma client:

   ```bash
   pnpm db:generate
   ```

4. Start dependencies with Docker Compose:

   ```bash
   pnpm compose:up
   ```

5. Or run the apps directly from the workspace:

   ```bash
   pnpm dev
   ```

### Default local ports

- `3000`: web console
- `3001`: control-plane API
- `3010`: runner-worker internal job API
- `5432`: PostgreSQL
- `7071`: orchestrator development host
- `10000` / `10001`: Azurite blob and queue endpoints

## Public API

The public API is exposed by the control-plane under the `/v1` prefix.

- `POST /v1/tasks`
- `GET /v1/tasks/:taskId`
- `GET /v1/tasks/:taskId/stream`
- `GET /v1/tasks/:taskId/events`
- `POST /v1/tasks/:taskId/approvals`
- `GET /v1/tasks/:taskId/artifacts`
- `GET /v1/projects/:projectId/apps/:appId/graph`
- `GET /v1/health`

Swagger is available locally at `http://localhost:3001/docs`.

## Environment variables

The baseline variables are defined in [.env.example](C:/Users/aapicella/dev/flogo-agent-platform/.env.example):

- `DATABASE_URL`
- `PORT`
- `CONTROL_PLANE_PORT`
- `ORCHESTRATOR_PORT`
- `RUNNER_WORKER_PORT`
- `ORCHESTRATOR_BASE_URL`
- `RUNNER_WORKER_BASE_URL`
- `CONTROL_PLANE_INTERNAL_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `RUNNER_EXECUTION_MODE`
- `RUNNER_JOB_TEMPLATE_NAME`
- `DURABLE_TASK_HUB_NAME`
- `AZURITE_CONNECTION_STRING`
- `MODEL_PROVIDER`

## Testing

Run the main verification commands:

```bash
pnpm db:generate
pnpm test
pnpm build
```

## Infrastructure

### Local

- [infra/local/docker-compose.yml](C:/Users/aapicella/dev/flogo-agent-platform/infra/local/docker-compose.yml)
- [infra/local/README.md](C:/Users/aapicella/dev/flogo-agent-platform/infra/local/README.md)

### Azure

- [infra/azure/main.bicep](C:/Users/aapicella/dev/flogo-agent-platform/infra/azure/main.bicep)
- [infra/azure/parameters.example.json](C:/Users/aapicella/dev/flogo-agent-platform/infra/azure/parameters.example.json)
- [infra/azure/README.md](C:/Users/aapicella/dev/flogo-agent-platform/infra/azure/README.md)

## Known implementation gaps

- Task persistence is not yet backed by PostgreSQL at runtime.
- Artifact and workspace snapshot persistence is not yet backed by Azure Blob APIs at runtime.
- Azure Container Apps Job execution is represented by job contracts and infrastructure scaffolding; the runner-worker does not yet invoke Azure management APIs to create or poll actual ACA Job runs.
- Durable Functions is implemented in the orchestrator app, but local development uses the Fastify host rather than the full Azure Functions host.

These are current boundaries of the checked-in implementation, not hidden assumptions.
