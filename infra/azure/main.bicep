@description('Azure region for the deployment')
param location string = resourceGroup().location

@description('Prefix used for resource names')
@minLength(5)
param namePrefix string = 'flogo-agent'

@description('Administrator username for the PostgreSQL flexible server')
param postgresAdminUsername string = 'flogoadmin'

@secure()
@description('Administrator password for the PostgreSQL flexible server')
param postgresAdminPassword string

@description('Container image for the control-plane app')
param controlPlaneImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Container image for the orchestrator app')
param orchestratorImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Container image for the runner-worker app')
param runnerWorkerImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Container image for the web-console app')
param webConsoleImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Container image for the flogo runner job template')
param runnerJobImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Container image for the smoke test runner job template')
param smokeRunnerJobImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Container image for the custom contrib runner job template')
param customContribRunnerJobImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Container image for the eval runner job template')
param evalRunnerJobImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Durable backend provider profile')
@allowed([
  'dts'
  'azure_storage'
])
param durableBackendProvider string = 'dts'

@description('Internal shared token used for local-style service-to-service auth fallback')
@secure()
param internalServiceToken string = ''

@secure()
@description('Connection string or endpoint profile used by the Durable Task Scheduler backend')
param durableTaskSchedulerConnection string = ''

var logAnalyticsName = '${namePrefix}-law'
var managedEnvironmentName = '${namePrefix}-aca-env'
var normalizedNamePrefix = replace(namePrefix, '-', '')
var acrName = take('${normalizedNamePrefix}flogoagentacr', 50)
var storageName = take('${normalizedNamePrefix}flogoagentst', 24)
var keyVaultName = take(replace('${namePrefix}-kv', '_', '-'), 24)
var postgresServerName = '${namePrefix}-pg'
var postgresDatabaseName = 'flogoagent'
var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'
var durableStorageProviderType = durableBackendProvider == 'dts' ? 'azureManaged' : 'azureStorage'
var durableBackendConnectionName = durableBackendProvider == 'dts' ? 'DurableTaskScheduler' : 'AzureWebJobsStorage'

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

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
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
    allowBlobPublicAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource artifactContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'artifacts'
  properties: {
    publicAccess: 'None'
  }
}

resource workspaceContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'workspace-snapshots'
  properties: {
    publicAccess: 'None'
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
    publicNetworkAccess: 'Enabled'
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
    administratorLogin: postgresAdminUsername
    administratorLoginPassword: postgresAdminPassword
    storage: {
      storageSizeGB: 128
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
  }
}

resource postgresDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgres
  name: postgresDatabaseName
}

resource managedEnvironment 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: managedEnvironmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource runnerWorkerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-runner-worker'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      ingress: {
        external: false
        targetPort: 3010
        transport: 'auto'
      }
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'runner-worker'
          image: runnerWorkerImage
          env: [
            {
              name: 'RUNNER_WORKER_PORT'
              value: '3010'
            }
            {
              name: 'RUNNER_EXECUTION_MODE'
              value: 'container-apps-job'
            }
            {
              name: 'RUNNER_BUILD_JOB_TEMPLATE_NAME'
              value: '${namePrefix}-flogo-build-job'
            }
            {
              name: 'RUNNER_SMOKE_JOB_TEMPLATE_NAME'
              value: '${namePrefix}-flogo-test-job'
            }
            {
              name: 'RUNNER_CUSTOM_CONTRIB_JOB_TEMPLATE_NAME'
              value: '${namePrefix}-flogo-custom-contrib-job'
            }
            {
              name: 'RUNNER_EVAL_JOB_TEMPLATE_NAME'
              value: '${namePrefix}-flogo-eval-job'
            }
            {
              name: 'RUNNER_JOB_TEMPLATE_NAME'
              value: '${namePrefix}-flogo-build-job'
            }
            {
              name: 'INTERNAL_SERVICE_TOKEN'
              value: internalServiceToken
            }
            {
              name: 'AZURE_SUBSCRIPTION_ID'
              value: subscription().subscriptionId
            }
            {
              name: 'AZURE_RESOURCE_GROUP'
              value: resourceGroup().name
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
      }
    }
  }
}

resource orchestratorApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-orchestrator'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      ingress: {
        external: false
        targetPort: 7071
        transport: 'auto'
      }
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'orchestrator'
          image: orchestratorImage
          env: [
            {
              name: 'ORCHESTRATOR_PORT'
              value: '7071'
            }
            {
              name: 'RUNNER_WORKER_BASE_URL'
              value: 'https://${runnerWorkerApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'CONTROL_PLANE_INTERNAL_URL'
              value: 'https://${namePrefix}-control-plane.${managedEnvironment.properties.defaultDomain}/v1'
            }
            {
              name: 'INTERNAL_SERVICE_TOKEN'
              value: internalServiceToken
            }
            {
              name: 'DURABLE_BACKEND_PROVIDER'
              value: durableBackendProvider
            }
            {
              name: 'DURABLE_TASK_HUB_NAME'
              value: 'flogoAgent'
            }
            {
              name: 'DURABLE_STORAGE_PROVIDER_TYPE'
              value: durableStorageProviderType
            }
            {
              name: 'DURABLE_BACKEND_CONNECTION_NAME'
              value: durableBackendConnectionName
            }
            {
              name: 'AzureWebJobsStorage'
              value: storageConnectionString
            }
            {
              name: 'DurableTaskScheduler'
              value: durableTaskSchedulerConnection
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
    }
  }
}

resource controlPlaneApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-control-plane'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3001
        transport: 'auto'
      }
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'control-plane'
          image: controlPlaneImage
          env: [
            {
              name: 'CONTROL_PLANE_PORT'
              value: '3001'
            }
            {
              name: 'ORCHESTRATOR_BASE_URL'
              value: 'https://${orchestratorApp.properties.configuration.ingress.fqdn}/api'
            }
            {
              name: 'DATABASE_URL'
              value: 'postgresql://${postgresAdminUsername}:${postgresAdminPassword}@${postgres.name}.postgres.database.azure.com:5432/${postgresDatabaseName}?sslmode=require'
            }
            {
              name: 'AZURE_STORAGE_CONNECTION_STRING'
              value: storageConnectionString
            }
            {
              name: 'KEY_VAULT_NAME'
              value: keyVault.name
            }
            {
              name: 'INTERNAL_SERVICE_TOKEN'
              value: internalServiceToken
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
          ]
          resources: {
            cpu: json('0.75')
            memory: '1.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 4
      }
    }
  }
}

resource webConsoleApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-web-console'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnvironment.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
      }
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'web-console'
          image: webConsoleImage
          env: [
            {
              name: 'NEXT_PUBLIC_API_BASE_URL'
              value: 'https://${controlPlaneApp.properties.configuration.ingress.fqdn}'
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
    }
  }
}

resource flogoBuildJob 'Microsoft.App/jobs@2024-03-01' = {
  name: '${namePrefix}-flogo-build-job'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: managedEnvironment.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'flogo-runner'
          image: runnerJobImage
          env: [
            {
              name: 'AZURE_STORAGE_ACCOUNT'
              value: storage.name
            }
            {
              name: 'AZURE_STORAGE_CONNECTION_STRING'
              value: storageConnectionString
            }
            {
              name: 'BLOB_CONTAINER_ARTIFACTS'
              value: artifactContainer.name
            }
            {
              name: 'BLOB_CONTAINER_WORKSPACES'
              value: workspaceContainer.name
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
          ]
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
        }
      ]
    }
  }
}

resource flogoSmokeJob 'Microsoft.App/jobs@2024-03-01' = {
  name: '${namePrefix}-flogo-test-job'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: managedEnvironment.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'flogo-runner'
          image: smokeRunnerJobImage
          env: [
            {
              name: 'AZURE_STORAGE_CONNECTION_STRING'
              value: storageConnectionString
            }
            {
              name: 'BLOB_CONTAINER_ARTIFACTS'
              value: artifactContainer.name
            }
            {
              name: 'BLOB_CONTAINER_WORKSPACES'
              value: workspaceContainer.name
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
          ]
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
        }
      ]
    }
  }
}

resource flogoCustomContribJob 'Microsoft.App/jobs@2024-03-01' = {
  name: '${namePrefix}-flogo-custom-contrib-job'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: managedEnvironment.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'flogo-runner'
          image: customContribRunnerJobImage
          env: [
            {
              name: 'AZURE_STORAGE_CONNECTION_STRING'
              value: storageConnectionString
            }
            {
              name: 'BLOB_CONTAINER_ARTIFACTS'
              value: artifactContainer.name
            }
            {
              name: 'BLOB_CONTAINER_WORKSPACES'
              value: workspaceContainer.name
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
          ]
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
        }
      ]
    }
  }
}

resource flogoEvalJob 'Microsoft.App/jobs@2024-03-01' = {
  name: '${namePrefix}-flogo-eval-job'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: managedEnvironment.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'flogo-runner'
          image: evalRunnerJobImage
          env: [
            {
              name: 'AZURE_STORAGE_CONNECTION_STRING'
              value: storageConnectionString
            }
            {
              name: 'BLOB_CONTAINER_ARTIFACTS'
              value: artifactContainer.name
            }
            {
              name: 'BLOB_CONTAINER_WORKSPACES'
              value: workspaceContainer.name
            }
            {
              name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
              value: appInsights.properties.ConnectionString
            }
          ]
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
        }
      ]
    }
  }
}

resource acrPullControlPlane 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(controlPlaneApp.id, 'acrPull')
  scope: containerRegistry
  properties: {
    principalId: controlPlaneApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource acrPullOrchestrator 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(orchestratorApp.id, 'acrPull')
  scope: containerRegistry
  properties: {
    principalId: orchestratorApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource acrPullRunnerWorker 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(runnerWorkerApp.id, 'acrPull')
  scope: containerRegistry
  properties: {
    principalId: runnerWorkerApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource acrPullWebConsole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(webConsoleApp.id, 'acrPull')
  scope: containerRegistry
  properties: {
    principalId: webConsoleApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource acrPullRunnerJob 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(flogoBuildJob.id, 'acrPull')
  scope: containerRegistry
  properties: {
    principalId: flogoBuildJob.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource acrPullSmokeJob 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(flogoSmokeJob.id, 'acrPull')
  scope: containerRegistry
  properties: {
    principalId: flogoSmokeJob.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource acrPullCustomContribJob 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(flogoCustomContribJob.id, 'acrPull')
  scope: containerRegistry
  properties: {
    principalId: flogoCustomContribJob.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

resource acrPullEvalJob 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(flogoEvalJob.id, 'acrPull')
  scope: containerRegistry
  properties: {
    principalId: flogoEvalJob.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  }
}

output containerAppsEnvironmentName string = managedEnvironment.name
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
output controlPlaneUrl string = 'https://${controlPlaneApp.properties.configuration.ingress.fqdn}'
output webConsoleUrl string = 'https://${webConsoleApp.properties.configuration.ingress.fqdn}'
output buildRunnerJobName string = flogoBuildJob.name
output smokeRunnerJobName string = flogoSmokeJob.name
output customContribRunnerJobName string = flogoCustomContribJob.name
output evalRunnerJobName string = flogoEvalJob.name
output storageAccountName string = storage.name
output keyVaultName string = keyVault.name
