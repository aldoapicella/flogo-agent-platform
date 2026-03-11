# Documentation Index

This directory contains the full project documentation for the current Container Apps-first implementation of `flogo-agent-platform`.

## Documents

- [Architecture](C:/Users/aapicella/dev/flogo-agent-platform/docs/architecture.md)
- [API reference](C:/Users/aapicella/dev/flogo-agent-platform/docs/api-reference.md)
- [Data model](C:/Users/aapicella/dev/flogo-agent-platform/docs/data-model.md)
- [Development guide](C:/Users/aapicella/dev/flogo-agent-platform/docs/development.md)
- [Deployment guide](C:/Users/aapicella/dev/flogo-agent-platform/docs/deployment.md)
- [Operations guide](C:/Users/aapicella/dev/flogo-agent-platform/docs/operations.md)

## Recommended reading order

1. Start with [Architecture](C:/Users/aapicella/dev/flogo-agent-platform/docs/architecture.md).
2. Read [Development guide](C:/Users/aapicella/dev/flogo-agent-platform/docs/development.md) if you need to run or modify the repo.
3. Read [API reference](C:/Users/aapicella/dev/flogo-agent-platform/docs/api-reference.md) if you are integrating with the platform.
4. Read [Deployment guide](C:/Users/aapicella/dev/flogo-agent-platform/docs/deployment.md) if you are deploying to Azure.
5. Use [Operations guide](C:/Users/aapicella/dev/flogo-agent-platform/docs/operations.md) for runtime support and validation tasks.

## Source of truth

When documentation and code diverge, code is authoritative. The primary implementation entrypoints are:

- [apps/control-plane/src/main.ts](C:/Users/aapicella/dev/flogo-agent-platform/apps/control-plane/src/main.ts)
- [apps/control-plane/src/modules/agent/orchestration.service.ts](C:/Users/aapicella/dev/flogo-agent-platform/apps/control-plane/src/modules/agent/orchestration.service.ts)
- [apps/orchestrator/src/functions/task-orchestration.ts](C:/Users/aapicella/dev/flogo-agent-platform/apps/orchestrator/src/functions/task-orchestration.ts)
- [apps/orchestrator/src/dev-server.ts](C:/Users/aapicella/dev/flogo-agent-platform/apps/orchestrator/src/dev-server.ts)
- [apps/runner-worker/src/index.ts](C:/Users/aapicella/dev/flogo-agent-platform/apps/runner-worker/src/index.ts)
- [packages/contracts/src/index.ts](C:/Users/aapicella/dev/flogo-agent-platform/packages/contracts/src/index.ts)
- [packages/flogo-graph/src/index.ts](C:/Users/aapicella/dev/flogo-agent-platform/packages/flogo-graph/src/index.ts)
- [prisma/schema.prisma](C:/Users/aapicella/dev/flogo-agent-platform/prisma/schema.prisma)
