# flogo-agent-platform

Foundation-first AI agent platform scaffold for creating, updating, debugging, and reviewing TIBCO Flogo applications.

## Workspace

- `apps/control-plane`: modular monolith API and orchestration loop
- `apps/runner-worker`: BullMQ-based execution worker
- `apps/web-console`: Next.js operator console
- `packages/*`: shared contracts, agent logic, tool surface, prompts, and evals
- `infra/*`: local Docker Compose and AKS-oriented Azure scaffolding
- `runner-images/flogo-runner`: shared Flogo execution image

## Quick start

1. `pnpm install`
2. `pnpm db:generate`
3. `pnpm build`
4. `pnpm test`
5. `pnpm compose:up`
