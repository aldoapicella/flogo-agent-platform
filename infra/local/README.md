# Local Stack

The local stack is Docker-first and mirrors the foundation-first MVP:

- PostgreSQL for system-of-record data
- Redis for BullMQ queues and stream cursors
- Azurite for Blob-compatible artifacts
- `control-plane`, `runner-worker`, and `web-console` launched from the workspace

Run `pnpm compose:up` from the repo root after `pnpm install`.
