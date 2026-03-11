# Local Stack

The local stack is Docker-first and mirrors the Container Apps-first control plane:

- PostgreSQL for system-of-record data
- Azurite for Blob-compatible artifacts
- `control-plane` for the public REST and SSE API
- `orchestrator` for the local Durable-style workflow host contract
- `runner-worker` for local job dispatch and status polling
- `web-console` launched from the workspace

Run `pnpm compose:up` from the repo root after `pnpm install`.

For full local-development guidance, see [docs/development.md](C:/Users/aapicella/dev/flogo-agent-platform/docs/development.md) and [docs/deployment.md](C:/Users/aapicella/dev/flogo-agent-platform/docs/deployment.md).
