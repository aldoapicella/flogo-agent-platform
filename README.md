# flogo-agent-platform

Foundation-first AI agent platform for creating, updating, debugging, and reviewing TIBCO Flogo applications.

## Workspace

- `apps/control-plane`: Fastify-based NestJS control plane and orchestration entrypoint
- `apps/runner-worker`: BullMQ worker for isolated build, run, and smoke-test execution
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
- Redis is used for BullMQ queues and short-lived stream state.
- Blob storage is Azurite locally and Azure Blob in production.
- AKS is the primary production target, with AKS Jobs running the Flogo runner image.
