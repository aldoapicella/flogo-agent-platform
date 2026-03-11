# flogo-agent-platform

`flogo-agent-platform` is a TypeScript monorepo for creating, updating, debugging, reviewing, and increasingly analyzing TIBCO Flogo applications with `flogo.json` as the canonical artifact.

The platform is Container Apps-first:

- Azure Container Apps hosts always-on services.
- Azure Container Apps Jobs are the production target for heavyweight finite Flogo execution.
- PostgreSQL is the operational system of record.
- Blob Storage is the target artifact and workspace store.
- Durable Functions is the orchestration model.
- A Go helper binary is the bridge into Flogo Core/Flow-native functionality.

## Current implementation shape

The repository contains four primary apps:

- `apps/control-plane`
- `apps/orchestrator`
- `apps/runner-worker`
- `apps/web-console`

and shared capability packages:

- `packages/contracts`
- `packages/flogo-graph`
- `packages/tools`
- `packages/agent`
- `packages/prompts`
- `packages/evals`

## Current feature baseline

The current repo supports:

- task submission, listing, history, run summaries, approvals, and artifact reads,
- Prisma-backed task, event, approval, build-run, test-run, and artifact persistence,
- orchestration through a dedicated orchestrator app with Durable Functions definitions and a local development host,
- runner-worker support for local process execution and Container Apps Job metadata/start-poll adapters,
- Flogo graph parsing, structural/semantic/mapping validation, contribution cataloging, mapping preview, coercion suggestions, and property analysis,
- direct app-analysis APIs for graph, catalog, mapping preview, and app-scoped analysis artifacts,
- a Go helper binary for contribution catalog, descriptor inspection, and mapping preview commands.

## Flogo-native roadmap

The main roadmap now is the Flogo-native runtime expansion. Start with:

- [Documentation index](./docs/README.md)
- [Flogo-Native Runtime Plan](./docs/flogo-native-runtime-plan.md)
- [Capability Matrix](./docs/capability-matrix.md)

Those documents are the standing reference for future Core/Flow-native implementation work.

## Workspace layout

- `apps/control-plane`
  - public NestJS + Fastify API
  - task read models
  - approvals
  - internal sync endpoints
  - direct Flogo app-analysis endpoints
- `apps/orchestrator`
  - orchestration host
  - Durable Functions definitions
  - local orchestration shim
- `apps/runner-worker`
  - internal job facade
  - local execution and Container Apps Job bridge
- `apps/web-console`
  - Next.js operator UI
- `go-runtime/flogo-helper`
  - Go CLI helper for Flogo-native catalog and mapping work
- `runner-images/flogo-runner`
  - runner image used by finite execution paths
- `examples`
  - sample Flogo apps for tests and development

## Quick start

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker
- Go toolchain if you build the helper directly
- Azure CLI if you validate or deploy Azure infrastructure

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

4. Start the local dependency stack:

   ```bash
   pnpm compose:up
   ```

5. Or run the workspace directly:

   ```bash
   pnpm dev
   ```

### Primary verification commands

```bash
pnpm typecheck
pnpm test
pnpm build
```

`pnpm typecheck` is the authoritative workspace type gate. It rebuilds shared packages first so app-level package exports stay in sync.

## Public API

The control-plane exposes `/v1` routes, including:

- `POST /v1/tasks`
- `GET /v1/tasks`
- `GET /v1/tasks/:taskId`
- `GET /v1/tasks/:taskId/stream`
- `GET /v1/tasks/:taskId/history`
- `GET /v1/tasks/:taskId/runs`
- `POST /v1/tasks/:taskId/approvals`
- `GET /v1/tasks/:taskId/artifacts`
- `GET /v1/projects/:projectId/apps/:appId/graph`
- `GET /v1/projects/:projectId/apps/:appId/catalog`
- `GET /v1/projects/:projectId/apps/:appId/artifacts`
- `POST /v1/projects/:projectId/apps/:appId/mappings/preview`
- `GET /v1/health`

Swagger is available locally at `http://localhost:3001/docs`.

## Documentation map

- [Documentation index](./docs/README.md)
- [Flogo-Native Runtime Plan](./docs/flogo-native-runtime-plan.md)
- [Capability Matrix](./docs/capability-matrix.md)
- [Architecture](./docs/architecture.md)
- [API reference](./docs/api-reference.md)
- [Data model](./docs/data-model.md)
- [Development guide](./docs/development.md)
- [Deployment guide](./docs/deployment.md)
- [Operations guide](./docs/operations.md)

## Infrastructure

### Local

- `infra/local/docker-compose.yml`
- `infra/local/README.md`

### Azure

- `infra/azure/main.bicep`
- `infra/azure/parameters.example.json`
- `infra/azure/README.md`

## Current boundaries

The repo is beyond a pure scaffold, but it is not yet the full Flogo-native runtime described in the roadmap.

Current notable gaps:

- Blob-backed artifact persistence is not yet the default runtime path; many local artifacts still use logical URIs.
- Go helper behavior is real for catalog/descriptor/mapping preview, but not yet for flow contracts, replay, or contribution scaffolding.
- Flow-aware, runtime-aware, and extension-aware capabilities are still planned phases.
- `next build` and Vitest can hit environment-specific `spawn EPERM` failures in restricted shells even when workspace typecheck is clean.
