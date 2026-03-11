# flogo-agent-platform

Foundation-first AI agent platform for creating, updating, debugging, and reviewing TIBCO Flogo applications.

## Workspace

- `apps/control-plane`: Fastify-based NestJS control plane and public API
- `apps/orchestrator`: Node-based workflow host with Durable Functions definitions and a local orchestration shim
- `apps/runner-worker`: internal job dispatcher and status service for isolated build, run, and smoke-test execution
- `apps/web-console`: Next.js operator console
- `packages/contracts`: shared Zod contracts
- `packages/flogo-graph`: Flogo parser and validators
- `packages/tools`: typed repo, flogo, runner, test, and artifact tools
- `packages/agent`: orchestrator, builder, debugger, reviewer, and policy modules
- `packages/prompts`: versioned prompt templates
- `packages/evals`: golden tasks and scoring harness

## Local development

1. Copy `.env.example` to `.env`.
2. Run `pnpm install`.
3. Run `pnpm db:generate`.
4. Start dependencies with `pnpm compose:up` or run `pnpm dev`.

## Architecture

- `flogo.json` is the canonical application artifact.
- PostgreSQL is the system of record.
- Blob storage is Azurite locally and Azure Blob in production.
- Azure Container Apps hosts the always-on services.
- Azure Container Apps Jobs host the isolated Flogo runner executions.
- Managed identity and Key Vault are the default secret and identity model.
