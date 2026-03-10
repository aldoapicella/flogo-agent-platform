# Azure Infra

This Bicep scaffold provisions the core foundation-first MVP dependencies:

- AKS with workload identity enabled
- Azure Database for PostgreSQL Flexible Server
- Azure Cache for Redis
- Azure Blob Storage
- Azure Key Vault
- Azure Container Registry
- Log Analytics and Application Insights

Deploy with Azure CLI:

```bash
az deployment group create \
  --resource-group <rg> \
  --template-file infra/azure/main.bicep \
  --parameters @infra/azure/parameters.example.json
```
