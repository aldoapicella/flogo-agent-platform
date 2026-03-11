# Deployment Guide

## Overview

The repository is designed around two deployment targets:

1. local Docker Compose
2. Azure Container Apps

The Azure deployment is Container Apps-first. AKS is not the default target in the current implementation.

## Local deployment

Source files:

- [infra/local/docker-compose.yml](C:/Users/aapicella/dev/flogo-agent-platform/infra/local/docker-compose.yml)
- [infra/local/README.md](C:/Users/aapicella/dev/flogo-agent-platform/infra/local/README.md)

### Local services

- `postgres`
- `azurite`
- `runner-worker`
- `orchestrator`
- `control-plane`
- `web-console`

### Start local deployment

```bash
pnpm compose:up
```

### Stop local deployment

```bash
pnpm compose:down
```

### Local environment behavior

- `control-plane` points at `orchestrator` through `ORCHESTRATOR_BASE_URL`
- `orchestrator` points at `runner-worker` and back at the control-plane internal API
- `runner-worker` uses `local-process` execution mode by default
- Azurite is available for future blob integration work

## Azure deployment

Source files:

- [infra/azure/main.bicep](C:/Users/aapicella/dev/flogo-agent-platform/infra/azure/main.bicep)
- [infra/azure/parameters.example.json](C:/Users/aapicella/dev/flogo-agent-platform/infra/azure/parameters.example.json)
- [infra/azure/README.md](C:/Users/aapicella/dev/flogo-agent-platform/infra/azure/README.md)

## Azure resources provisioned

### Monitoring

- Log Analytics workspace
- Application Insights

### Registry and storage

- Azure Container Registry
- Azure Storage account
- Blob containers:
  - `artifacts`
  - `workspace-snapshots`

### Secrets and identity

- Key Vault
- system-assigned identities on each Container App and Job
- `AcrPull` role assignments for pulling images from ACR

### Database

- Azure Database for PostgreSQL Flexible Server
- `flogoagent` database

### Compute

- Azure Container Apps managed environment
- Container Apps:
  - control-plane
  - orchestrator
  - runner-worker
  - web-console
- Container Apps Job:
  - `flogo-runner`

## Bicep parameters

### Required

- `postgresAdminPassword`

### Optional with defaults

- `location`
- `namePrefix`
- `postgresAdminUsername`
- `controlPlaneImage`
- `orchestratorImage`
- `runnerWorkerImage`
- `webConsoleImage`
- `runnerJobImage`

## Example parameter file flow

1. Copy [infra/azure/parameters.example.json](C:/Users/aapicella/dev/flogo-agent-platform/infra/azure/parameters.example.json).
2. Replace image names with your ACR image tags.
3. Replace `postgresAdminPassword`.
4. Deploy the Bicep template.

## Validate the Bicep template

```bash
az bicep build --file infra/azure/main.bicep
```

## Deploy the Bicep template

Example:

```bash
az deployment group create \
  --resource-group <resource-group> \
  --template-file infra/azure/main.bicep \
  --parameters @infra/azure/parameters.example.json
```

## Image publishing expectations

The deployment template assumes images are already built and published to ACR.

At minimum you need images for:

- control-plane
- orchestrator
- runner-worker
- web-console
- flogo-runner

## Container Apps configuration model

### Control-plane

- public ingress enabled
- listens on port `3001`
- configured with:
  - `ORCHESTRATOR_BASE_URL`
  - `DATABASE_URL`
  - `AZURITE_CONNECTION_STRING` placeholder-style storage config
  - `KEY_VAULT_NAME`
  - `APPLICATIONINSIGHTS_CONNECTION_STRING`

### Orchestrator

- internal ingress only
- listens on port `7071`
- configured with:
  - `RUNNER_WORKER_BASE_URL`
  - `CONTROL_PLANE_INTERNAL_URL`
  - `DURABLE_TASK_HUB_NAME`
  - `APPLICATIONINSIGHTS_CONNECTION_STRING`

### Runner-worker

- internal ingress only
- listens on port `3010`
- configured with:
  - `RUNNER_EXECUTION_MODE=container-apps-job`
  - `RUNNER_JOB_TEMPLATE_NAME`
  - `APPLICATIONINSIGHTS_CONNECTION_STRING`

### Web console

- public ingress enabled
- listens on port `3000`
- configured with:
  - `NEXT_PUBLIC_API_BASE_URL`
  - `APPLICATIONINSIGHTS_CONNECTION_STRING`

### Flogo runner job

- manual trigger type
- one replica completion target
- intended to receive runtime job payloads from the runner-worker/orchestrator path

## Managed identity model

Current template behavior:

- each app and job gets a system-assigned identity
- each identity receives `AcrPull` against the container registry

Intended future behavior:

- read secrets from Key Vault using managed identity,
- access blob storage without connection-string style fallbacks,
- optionally use additional RBAC assignments for storage and database integrations.

## Deployment caveats

- The control-plane runtime still uses in-memory task state.
- Blob storage and Postgres are provisioned but not yet fully integrated into the live request path.
- The runner-worker does not yet invoke Azure management APIs to launch real ACA Job executions.
- The orchestrator app contains Durable Functions definitions, but the repo’s default local path uses the Fastify host.

These caveats do not invalidate the deployment template. They define what is scaffolded versus what is fully runtime-backed today.
