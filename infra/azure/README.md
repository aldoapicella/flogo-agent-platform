# Azure Scaffold

This folder contains an Azure Container Apps-first infrastructure scaffold for the platform.

Provisioned components:

- Azure Container Apps managed environment
- Azure Container Apps for `control-plane`, `orchestrator`, `runner-worker`, and `web-console`
- Azure Container Apps Job template for the Flogo runner
- Azure Container Registry
- Azure Database for PostgreSQL Flexible Server
- Azure Storage account for artifacts
- Key Vault
- Log Analytics workspace
- Application Insights
- System-assigned managed identities on each app and job with `AcrPull` role assignments

Use `main.bicep` as the entry point and adjust parameters for your subscription, region, image tags, and network requirements.
