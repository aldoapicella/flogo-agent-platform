@description('Azure region for the deployment')
param location string = resourceGroup().location

@description('Prefix used for resource names')
param namePrefix string = 'flogo-agent'

@description('AKS node count for the system node pool')
param aksNodeCount int = 2

@description('AKS kubernetes version')
param kubernetesVersion string = '1.31'

@secure()
@description('Administrator password for the PostgreSQL flexible server')
param postgresAdminPassword string

var logAnalyticsName = '${namePrefix}-law'
var aksName = '${namePrefix}-aks'
var acrName = take(replace('${namePrefix}acr', '-', ''), 50)
var storageName = take(replace('${namePrefix}st', '-', ''), 24)
var keyVaultName = take(replace('${namePrefix}-kv', '_', '-'), 24)
var postgresServerName = '${namePrefix}-pg'
var redisName = '${namePrefix}-redis'

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

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    adminUserEnabled: false
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enabledForDeployment: false
    enabledForTemplateDeployment: true
    enableRbacAuthorization: true
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: postgresServerName
  location: location
  sku: {
    name: 'Standard_D2ds_v5'
    tier: 'GeneralPurpose'
  }
  properties: {
    version: '16'
    administratorLogin: 'flogoadmin'
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 128
    }
  }
}

resource redis 'Microsoft.Cache/redis@2024-03-01' = {
  name: redisName
  location: location
  properties: {
    sku: {
      name: 'Standard'
      family: 'C'
      capacity: 1
    }
    minimumTlsVersion: '1.2'
    redisConfiguration: {}
  }
}

resource aks 'Microsoft.ContainerService/managedClusters@2024-01-01' = {
  name: aksName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    kubernetesVersion: kubernetesVersion
    dnsPrefix: '${namePrefix}-dns'
    agentPoolProfiles: [
      {
        name: 'system'
        count: aksNodeCount
        vmSize: 'Standard_D4ds_v5'
        mode: 'System'
        osType: 'Linux'
        type: 'VirtualMachineScaleSets'
      }
      {
        name: 'runner'
        count: 1
        vmSize: 'Standard_D4ds_v5'
        mode: 'User'
        osType: 'Linux'
        type: 'VirtualMachineScaleSets'
        nodeLabels: {
          workload: 'runner'
        }
      }
    ]
    addonProfiles: {
      omsagent: {
        enabled: true
        config: {
          logAnalyticsWorkspaceResourceID: logAnalytics.id
        }
      }
    }
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
    }
  }
}

output aksClusterName string = aks.name
output containerRegistryLoginServer string = acr.properties.loginServer
output storageAccountName string = storage.name
output keyVaultName string = keyVault.name
