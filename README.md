# flogo-agent-platform

`flogo-agent-platform` is a TypeScript monorepo for building a Flogo-native AI agent that can create, update, debug, review, diagnose, and increasingly analyze TIBCO Flogo applications with `flogo.json` as the canonical artifact.

The control-plane, orchestrator, runner-worker, web console, and Go helper are the execution and inspection surfaces for that agent, not a separate product direction.

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
- Flogo graph parsing, structural/semantic/mapping validation, contribution cataloging, governance validation, composition comparison, mapping preview, coercion suggestions, and property analysis,
- direct app-analysis APIs for graph, inventory, catalog, descriptor inspection, contribution evidence inspection, governance reporting, composition comparison, mapping preview, and app-scoped analysis artifacts,
- profile-aware property planning and deterministic mapping tests,
- flow contract inference,
- trigger binding for REST, Timer, CLI, and Channel trigger profiles,
- subflow extraction and inlining for explicit contiguous linear task selections,
- advanced control-flow synthesis for iterators, retry-on-error, and doWhile,
- analysis-only activity, trigger, and narrow action scaffolding with descriptor metadata, Go skeletons, isolated build/test proof, and durable bundle/proof artifacts,
- shared contribution validation and conservative packaging for existing Activity, Trigger, and Action bundles with durable validation/package artifacts,
- a Go helper binary for contribution inventory, contribution catalog, descriptor inspection, contribution evidence inspection, governance validation, composition comparison, mapping preview, mapping test, property planning, flow contract inference, trigger binding, subflow extraction/inlining, advanced control-flow commands, and narrow Activity/Trigger/Action scaffold/validate/package commands.

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
- `GET /v1/projects/:projectId/apps/:appId/inventory`
- `GET /v1/projects/:projectId/apps/:appId/catalog`
- `GET /v1/projects/:projectId/apps/:appId/descriptors?ref=...`
- `GET /v1/projects/:projectId/apps/:appId/contribs/evidence?ref=...`
- `GET /v1/projects/:projectId/apps/:appId/artifacts`
- `GET /v1/projects/:projectId/apps/:appId/governance`
- `GET /v1/projects/:projectId/apps/:appId/flows/contracts`
- `GET /v1/projects/:projectId/apps/:appId/properties/plan`
- `POST /v1/projects/:projectId/apps/:appId/mappings/preview`
- `POST /v1/projects/:projectId/apps/:appId/mappings/test`
- `POST /v1/projects/:projectId/apps/:appId/composition/compare`
- `POST /v1/projects/:projectId/apps/:appId/triggers/bind`
- `POST /v1/projects/:projectId/apps/:appId/flows/extract-subflow`
- `POST /v1/projects/:projectId/apps/:appId/flows/inline-subflow`
- `POST /v1/projects/:projectId/apps/:appId/flows/add-iterator`
- `POST /v1/projects/:projectId/apps/:appId/flows/add-retry-policy`
- `POST /v1/projects/:projectId/apps/:appId/flows/add-dowhile`
- `POST /v1/projects/:projectId/apps/:appId/flows/add-error-path`
- `POST /v1/projects/:projectId/apps/:appId/flows/trace`
- `POST /v1/projects/:projectId/apps/:appId/flows/replay`
- `POST /v1/projects/:projectId/apps/:appId/flows/compare-runs`
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

- Catalog, descriptor, governance, composition-compare, and mapping-preview app-analysis artifacts are Blob/Azurite-backed; broader runtime artifacts still have mixed local or logical URI behavior.
- Contribution inventory now exists as the evidence layer for catalog/governance/composition analysis and includes module-aware workspace/package discovery plus contribution-evidence confidence, but it still stops short of full `project-flogo/core` package introspection.
- Contribution inventory, catalog, governance, composition comparison, mapping preview, mapping tests, coercion suggestions, and property planning now cover the intended Phase 1 static-analysis surface.
- Phase 2 now includes flow contract inference, trigger polymorphism, subflow extraction/inlining, and advanced control-flow synthesis exposed through direct APIs and helper-backed runner/orchestration paths, including error-path templates.
- Go helper behavior is real for runtime trace capture, replay, and run comparison, flow contracts, trigger binding, subflow extraction/inlining, iterator synthesis, retry-policy synthesis, doWhile synthesis, error-path templates, inventory/catalog/descriptor/contribution-evidence/governance/composition comparison/mapping preview/mapping test/property planning, and narrow Activity/Trigger/Action scaffold/validate/package paths, but not yet for install/update flows.
- Phase 3 now includes helper-backed runtime trace capture, replay, and run comparison.
- The next roadmap target is to keep contribution authoring reviewable while moving from shared scaffold/validate/package into reviewable install/update planning.
- `next build` and Vitest can hit environment-specific `spawn EPERM` failures in restricted shells even when workspace typecheck is clean.
