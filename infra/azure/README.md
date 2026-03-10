# Azure Scaffold

This folder contains an AKS-oriented infrastructure scaffold for the foundation-first MVP.

Provisioned components:

- Azure Kubernetes Service
- Azure Container Registry
- Azure Database for PostgreSQL Flexible Server
- Azure Cache for Redis
- Azure Storage account for artifacts
- Key Vault
- Log Analytics workspace
- Application Insights
- User-assigned managed identity for workload identity scenarios

Use `main.bicep` as the entry point and adjust parameters for your subscription, region, and network requirements.

