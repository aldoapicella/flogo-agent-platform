# Documentation Index

This directory contains the current platform documentation for `flogo-agent-platform`.

The most important documents are now the Flogo-native runtime planning documents. They are the standing reference for future Core/Flow-native implementation work.

## Core reference documents

- [Flogo-Native Runtime Plan](./flogo-native-runtime-plan.md)
- [Capability Matrix](./capability-matrix.md)

## Architecture and runtime documents

- [Architecture](./architecture.md)
- [API reference](./api-reference.md)
- [Data model](./data-model.md)
- [Development guide](./development.md)
- [Deployment guide](./deployment.md)
- [Operations guide](./operations.md)

## Recommended reading order

1. Start with [Flogo-Native Runtime Plan](./flogo-native-runtime-plan.md).
2. Use [Capability Matrix](./capability-matrix.md) to understand feature status and phase ownership.
3. Read [Architecture](./architecture.md) for the current service/runtime shape.
4. Read [Data model](./data-model.md) for contracts, Prisma state, and artifact behavior.
5. Read [API reference](./api-reference.md) if you are integrating with the platform.
6. Read [Development guide](./development.md) before implementing changes.

## Update rule

When code and docs change together:

1. update the relevant operational doc,
2. update [Flogo-Native Runtime Plan](./flogo-native-runtime-plan.md),
3. update [Capability Matrix](./capability-matrix.md).

## Source of truth

When documentation and code diverge, code is authoritative. The most important implementation entrypoints are:

- `apps/control-plane/src/main.ts`
- `apps/control-plane/src/modules/agent/orchestration.service.ts`
- `apps/control-plane/src/modules/agent/task-store.service.ts`
- `apps/control-plane/src/modules/flogo-apps/flogo-apps.service.ts`
- `apps/orchestrator/src/functions/task-orchestration.ts`
- `apps/orchestrator/src/dev-server.ts`
- `apps/runner-worker/src/index.ts`
- `apps/runner-worker/src/services/runner-job.service.ts`
- `apps/runner-worker/src/services/runner-executor.service.ts`
- `packages/contracts/src/index.ts`
- `packages/flogo-graph/src/index.ts`
- `packages/agent/src/index.ts`
- `go-runtime/flogo-helper/main.go`
- `prisma/schema.prisma`
