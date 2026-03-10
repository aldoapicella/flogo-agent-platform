targetScope = 'resourceGroup'

@description('Prefix used for Azure resource names.')
param namePrefix string = 'flogoagent'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Admin username for PostgreSQL Flexible Server.')
param postgresAdminUsername string = 'flogoadmin'

@secure()
@description('Admin password for PostgreSQL Flexible Server.')
param postgresAdminPassword string

@description('AKS node count.')
param aksNodeCount int = 2

var logAnalyticsName = '${namePrefix}-logs'
var acrName = toLower(replace('${namePrefix}acr', '-', ''))
var clusterName = '${namePrefix}-aks'
var storageAccountName = toLower(take(replace('${namePrefix}blob', '-', ''), 24))
var keyVaultName = '${namePrefix}-kv'
var redisName = '${namePrefix}-redis'
var postgresName = '${namePrefix}-pg'

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-appi'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enabledForDeployment: false
    enabledForTemplateDeployment: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
  }
}

resource redis 'Microsoft.Cache/redis@2024-03-01' = {
  name: redisName
  location: location
  properties: {
    enableNonSslPort: false
    minimumTlsVersion: '1.2'
  }
  sku: {
    name: 'Basic'
    family: 'C'
    capacity: 0
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: postgresName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: postgresAdminUsername
    administratorLoginPassword: postgresAdminPassword
    version: '16'
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

resource aks 'Microsoft.ContainerService/managedClusters@2024-09-01' = {
  name: clusterName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: '${namePrefix}-dns'
    kubernetesVersion: '1.31'
    enableRBAC: true
    oidcIssuerProfile: {
      enabled: true
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
    }
    agentPoolProfiles: [
      {
        name: 'systempool'
        count: aksNodeCount
        vmSize: 'Standard_D4ds_v5'
        mode: 'System'
        osType: 'Linux'
        type: 'VirtualMachineScaleSets'
      }
      {
        name: 'runnerpool'
        count: 1
        vmSize: 'Standard_D4ds_v5'
        mode: 'User'
        osType: 'Linux'
        type: 'VirtualMachineScaleSets'
        taints: [
          'workload=runner:NoSchedule'
        ]
      }
    ]
  }
}

output aksClusterName string = aks.name
output postgresHost string = postgres.properties.fullyQualifiedDomainName
output redisHost string = redis.properties.hostName
output blobEndpoint string = storage.properties.primaryEndpoints.blob
output keyVaultUri string = keyVault.properties.vaultUri
output applicationInsightsConnectionString string = appInsights.properties.ConnectionString
