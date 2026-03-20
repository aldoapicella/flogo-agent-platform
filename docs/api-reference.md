# API Reference

## Overview

The repository exposes four API surfaces:

1. public control-plane API,
2. internal control-plane sync API,
3. orchestrator API,
4. runner-worker API.

Only the public control-plane API is intended for operators or external clients.

## Public control-plane API

Local base URL:

- `http://localhost:3001/v1`

Swagger:

- `http://localhost:3001/docs`

## Task endpoints

### `POST /v1/tasks`

Creates a task, persists it, starts orchestration, and returns the initial task result.

Request shape:

- `TaskRequest`

Important fields:

- `type`: `create | update | debug | review`
- `projectId`
- `appId?`
- `appPath?`
- `requestedBy`
- `summary`
- `repo?`
- `inputs`
- `constraints`

Important analysis-only modes:

- `inputs.mode = "inventory"`
- `inputs.mode = "catalog"`
- `inputs.mode = "contrib_evidence"`
- `inputs.mode = "flow_contracts"`
- `inputs.mode = "trigger_binding_plan"`
- `inputs.mode = "subflow_extraction_plan"`
- `inputs.mode = "subflow_inlining_plan"`
- `inputs.mode = "iterator_plan"`
- `inputs.mode = "retry_policy_plan"`
- `inputs.mode = "dowhile_plan"`
- `inputs.mode = "error_path_plan"`
- `inputs.mode = "run_trace_plan"`
- `inputs.mode = "run_trace"`
- `inputs.mode = "replay_plan"`
- `inputs.mode = "replay"`
- `inputs.mode = "run_comparison_plan"`
- `inputs.mode = "run_comparison"`
- `inputs.mode = "mapping_preview"`
- `inputs.mode = "mapping_test"`
- `inputs.mode = "property_plan"`
- `inputs.mode = "governance"`
- `inputs.mode = "composition_compare"`

When one of those modes is supplied, the planner avoids patch/build/smoke steps and routes the task through analysis-oriented runner steps.

Example:

```json
{
  "type": "review",
  "projectId": "demo",
  "appId": "hello-rest",
  "requestedBy": "web-console",
  "summary": "Inspect mapping behavior for the request logger",
  "inputs": {
    "mode": "mapping_preview",
    "nodeId": "log-request",
    "sampleInput": {
      "flow": {},
      "activity": {},
      "env": {},
      "property": {},
      "trigger": {}
    }
  },
  "constraints": {
    "allowDependencyChanges": false,
    "allowCustomCode": false,
    "targetEnv": "dev"
  }
}
```

Response shape:

- `TaskResult`

Key fields:

- `taskId`
- `type`
- `status`
- `summary`
- `orchestrationId`
- `approvalStatus`
- `activeJobRuns`
- `requiredApprovals`
- `nextActions`
- `artifacts`

### `GET /v1/tasks`

Returns the current task summaries.

Response shape:

- `TaskSummary[]`

Behavior:

- hidden app-analysis persistence records are excluded from this listing.

### `GET /v1/tasks/:taskId`

Returns the current `TaskResult`.

Behavior:

- if the task has an `orchestrationId`, the control-plane refreshes status from the orchestrator before returning the result.

### `GET /v1/tasks/:taskId/stream`

Streams task events using SSE.

Payload shape:

- `TaskEvent`

### `GET /v1/tasks/:taskId/events`

Alias for the SSE event stream.

Payload shape:

- `TaskEvent`

### `GET /v1/tasks/:taskId/history`

Returns persisted event history for the task.

Response shape:

- `TaskEvent[]`

### `GET /v1/tasks/:taskId/runs`

Returns persisted build and test run summaries for a task.

Response shape:

- `TaskRuns`

### `POST /v1/tasks/:taskId/approvals`

Records an approval decision and signals the orchestrator.

Request shape:

- `ApprovalDecision`

Defaults applied by the controller:

- `status` defaults to `approved`
- `type` defaults to `change_public_contract`

Example:

```json
{
  "status": "approved",
  "type": "change_public_contract",
  "rationale": "Approved for development use"
}
```

### `GET /v1/tasks/:taskId/artifacts`

Returns persisted task-scoped artifacts.

Response shape:

- `ArtifactRef[]`

## Flogo app-analysis endpoints

### `GET /v1/projects/:projectId/apps/:appId/graph`

Returns the parsed Flogo graph.

Source resolution behavior:

1. try a persisted `FlogoApp` for `projectId + appId`,
2. fall back to `examples/<appId>/flogo.json`,
3. return `404` if neither exists.

### `GET /v1/projects/:projectId/apps/:appId/inventory`

Returns the normalized contribution inventory plus a persisted artifact reference.

Response shape:

- `ContributionInventoryResponse`

Key fields:

- `inventory`
- `artifact`

Current implementation notes:

- inventory entries expose source evidence such as `app_descriptor`, `workspace_descriptor`, `package_descriptor`, `package_source`, `registry`, `inferred`, and `flow_resource`,
- when an app lives under a `go.mod` workspace or vendored package tree, inventory resolution prefers module-aware package roots before falling back to registry or inferred metadata,
- the response artifact is backed by Blob/Azurite JSON storage and Prisma metadata,
- the inventory is the evidence layer used by catalog, governance, and composition-comparison analysis.

### `GET /v1/projects/:projectId/apps/:appId/catalog`

Returns the contribution catalog plus a persisted artifact reference.

Response shape:

- `ContribCatalogResponse`

Key fields:

- `catalog`
- `artifact`

Current implementation notes:

- catalog entries include descriptor source information such as `descriptor`, `registry`, or `inferred`,
- the response artifact is backed by Blob/Azurite JSON storage and Prisma metadata.

### `GET /v1/projects/:projectId/apps/:appId/flows/contracts`

Returns inferred flow contracts for the app, plus a persisted artifact reference.

Optional query:

- `flowId`

Response shape:

- `FlowContractsResponse`

Key fields:

- `contracts.appName`
- `contracts.contracts[]`
- `artifact`

Current implementation notes:

- inference is metadata-first and uses `resources[].data.metadata.input/output` as the primary source of truth,
- handler `action.ref` usage and handler input/output mappings are used to enrich usage and fill missing contract hints,
- the response artifact is backed by Blob/Azurite JSON storage and Prisma metadata,
- analysis-only tasks can request the same capability with `inputs.mode = "flow_contracts"` without scheduling patch/build/smoke steps.

### `POST /v1/projects/:projectId/apps/:appId/flows/trace`

Captures a runtime trace for one flow using helper-backed execution, or validates trace feasibility without execution.

Request shape:

- `RunTraceRequest`

Important fields:

- `flowId`
- `sampleInput`
- `capture`
- `validateOnly`

Response shape:

- `RunTraceResponse`
- `trace.evidenceKind? = "runtime_backed" | "simulated_fallback"`

Important behavior:

- `validateOnly = true` persists a `run_trace_plan` artifact and does not execute the flow
- `validateOnly = false` executes the flow through the helper path and persists a `run_trace` artifact
- persisted `run_trace` artifacts mirror the same provenance as `artifact.metadata.traceEvidenceKind`
- unknown flows return `404`
- missing required inputs return `422`
- analysis-only tasks can request `inputs.mode = "run_trace_plan"`
- execution-oriented non-mutating tasks can request `inputs.mode = "run_trace"`

Current implementation notes:

- direct trace capture now first attempts a narrow [Project Flogo](https://tibcosoftware.github.io/flogo/introduction/) [Core](https://pkg.go.dev/github.com/project-flogo/core) / [Flow](https://github.com/project-flogo/flow) runtime path for simple same-flow `#log` activity traces through the helper's in-process independent-action execution,
- for eligible REST-bound flows, trace can also start one narrow runtime-backed REST trigger slice through the official Flogo REST trigger and capture request, mapped flow input/output, and reply evidence in `runtimeEvidence.restTriggerRuntime`,
- for timer-bound flows in the narrow timer slice, trace can also capture `runtimeEvidence.timerTriggerRuntime` with timer settings, mapped flow input/output, and observed tick evidence when the helper can see them,
- for eligible CLI-bound flows, trace can also start one narrow runtime-backed CLI trigger slice through the official Flogo CLI trigger and capture trigger settings, command identity, args, flags, mapped flow input, and reply/stdout evidence in `runtimeEvidence.cliTriggerRuntime`,
- for eligible Channel-bound flows, trace can also start one narrow runtime-backed Channel trigger slice through the official Flogo Channel trigger and capture channel name, sent data, mapped flow input/output, and evidence metadata in `runtimeEvidence.channelTriggerRuntime`,
- that runtime-backed slice now attaches the Flow `flow/state.Recorder` seam and returns recorder-backed `runtimeEvidence.flowStart`, `runtimeEvidence.flowDone`, `runtimeEvidence.snapshots`, `runtimeEvidence.steps`, and task lifecycle events,
- the supported slice now projects that recorder/task-event evidence into `runtimeEvidence.normalizedSteps`, including per-step task identity, declared mappings, resolved inputs and produced outputs when observable, flow state before/after, state deltas, and explicit unavailable-field markers when the runtime path cannot observe a requested field,
- the REST trigger runtime slice is intentionally narrow: static paths only, supported methods limited to `POST`, `PUT`, and `PATCH`, explicit request/reply mappings, and the same helper-supported compiled activity allowlist used by the direct-flow runtime slice,
- the CLI trigger runtime slice is intentionally narrow: one supported command-entry handler, official CLI trigger argument/flag parsing, supported flag descriptors, explicit args/flags mappings, and the same helper-supported compiled activity allowlist used by the direct-flow runtime slice,
- unsupported trace topologies fall back to `trace.evidenceKind = "simulated_fallback"` instead of failing outright,
- the runtime-backed trace surface remains narrow and does not widen engine coverage beyond the current supported direct-flow, REST, timer, CLI, and Channel slices,
- the helper returns structured step snapshots, summary status, and diagnostics only through JSON stdout,
- current runtime trace is additive runtime evidence and does not replace static mapping preview or mapping tests.

### `POST /v1/projects/:projectId/apps/:appId/flows/replay`

Re-executes one flow using either an explicit base input or the stored input from a prior `run_trace` artifact, plus optional overrides.

Request shape:

- `ReplayRequest`

Important fields:

- `flowId`
- `traceArtifactId?`
- `baseInput?`
- `overrides?`
- `capture?`
- `validateOnly`

Response shape:

- `ReplayResponse`

Important behavior:

- exactly one of `traceArtifactId` or `baseInput` must be provided
- override merging uses deep object merge with replace semantics for arrays and scalar/null overrides
- `validateOnly = true` persists a `replay_plan` artifact and does not execute the flow
- `validateOnly = false` executes replay through the helper path and persists a `replay_report` artifact
- unknown flows return `404`
- missing or unreadable `run_trace` artifacts return `404`
- replay input that cannot satisfy the inferred flow contract returns `422`
- analysis-only tasks can request `inputs.mode = "replay_plan"`
- execution-oriented non-mutating tasks can request `inputs.mode = "replay"`

Current implementation notes:

- replay now first attempts the same narrow runtime-backed helper path as direct trace after computing the effective input,
- for eligible REST-bound flows, replay can now re-run the same narrow runtime-backed REST trigger slice and capture request, mapped flow input/output, reply evidence, and normalized step evidence in the nested trace,
- for the narrow timer slice, replay preserves `runtimeEvidence.timerTriggerRuntime` and comparison metadata so timer startup evidence can flow through nested trace artifacts,
- for the narrow CLI slice, replay can also re-run the same runtime-backed CLI trigger slice and preserve command identity, args, flags, mapped flow input, reply/stdout evidence, and normalized step evidence in the nested trace,
- for the narrow Channel slice, replay can also re-run the same runtime-backed Channel trigger slice and preserve channel name, sent data, mapped flow input/output, and normalized step evidence in the nested trace,
- replay from `traceArtifactId` loads the stored `run_trace` payload and uses `trace.summary.input` as the base input,
- successful replay returns structured replay metadata plus a nested trace payload,
- failed task execution still returns a structured replay response when the helper can serialize the failure.
- successful narrow runtime-backed replay is labeled separately through `result.runtimeEvidence.runtimeMode` values such as `independent_action_replay`, `rest_trigger_replay`, `cli_trigger_replay`, `timer_trigger_replay`, and `channel_trigger_replay`,
- the supported slices preserve the same `runtimeEvidence.normalizedSteps` structure in the nested trace when replay succeeds,
- replay remains simulated/helper-backed for unsupported shapes, the REST-backed slice stays scoped to the same narrow static-path request/reply contract as REST trace, and the CLI-backed slice stays scoped to the same narrow supported command-entry contract as CLI trace.

### `POST /v1/projects/:projectId/apps/:appId/flows/compare-runs`

Compares two previously captured runtime executions using stored `run_trace` and `replay_report` artifacts.

Request shape:

- `RunComparisonRequest`

Important fields:

- `leftArtifactId`
- `rightArtifactId`
- `compare?`
- `validateOnly`

Response shape:

- `RunComparisonResponse`

Important behavior:

- both artifacts must exist and belong to the resolved app context
- comparable artifact kinds are limited to `run_trace` and `replay_report`
- step pairing is by `taskId`, not array index
- `validateOnly = true` persists a `run_comparison_plan` artifact and does not compute the full persisted diff payload
- `validateOnly = false` computes and persists a `run_comparison` artifact
- analysis-only tasks can request `inputs.mode = "run_comparison_plan"`
- non-mutating comparison tasks can request `inputs.mode = "run_comparison"`

Current implementation notes:

- replay artifacts are normalized through their nested runtime trace when present and otherwise through replay summary plus top-level runtime evidence,
- when both artifacts provide `runtimeEvidence.normalizedSteps`, comparison prefers that normalized runtime evidence and returns `result.comparisonBasis = "normalized_runtime_evidence"`,
- that preference is limited to the current supported slice and does not imply a live engine tap beyond persisted artifacts,
- when normalized runtime evidence is unavailable, comparison falls back to recorder-backed inputs/outputs/step counts when possible and otherwise to the replay summary payload,
- when both artifacts are REST runtime-backed, comparison can prefer a REST envelope basis and diff request method/path/query/headers/body/path params, mapped flow input, and reply status/body/headers/cookies,
- when both artifacts carry timer runtime evidence, comparison can prefer `timer_runtime_startup` and surface timer settings, flow input, flow output, and tick diffs in `result.timerComparison`,
- when both artifacts carry Channel runtime evidence, comparison can prefer `channel_runtime_boundary` and surface channel name, sent data, mapped flow input, and mapped flow output diffs in `result.channelComparison`,
- comparison preserves REST runtime metadata from stored artifacts when present, preserves CLI runtime metadata from stored artifacts when present, but it remains artifact-backed and only performs REST envelope diffing when both sides are REST runtime-backed,
- cross-flow comparison is allowed and returns a warning diagnostic instead of a hard failure,
- array values are compared as whole values in this slice,
- comparison artifacts capture summary-level diffs, task-level diffs, and diagnostic changes.

### `POST /v1/projects/:projectId/apps/:appId/triggers/bind`

Plans or applies a trigger binding for an existing flow.

Request shape:

- `TriggerBindingRequest`

Important fields:

- `flowId`
- `profile`
- `validateOnly`
- `replaceExisting`
- `handlerName?`
- `triggerId?`

Supported trigger profiles in the current slice:

- `rest`
- `timer`
- `cli`
- `channel` now has one narrow runtime-backed slice for the internal-event boundary, but broader channel topologies remain unsupported in this phase

Response shape:

- `TriggerBindingResponse`

Important behavior:

- `validateOnly = true` persists a `trigger_binding_plan` artifact and does not mutate `flogo.json`
- `validateOnly = false` applies the binding directly to the resolved app file and persists a `trigger_binding_result` artifact
- duplicate matching bindings return `409` unless `replaceExisting = true`
- unsupported contract/profile pairings return `422`
- analysis-only tasks can request the planning path with `inputs.mode = "trigger_binding_plan"` without scheduling patch/build/smoke steps

Current implementation notes:

- `handlerName` and `triggerId` default to generated values when omitted
- REST bindings auto-map common request and reply fields based on the flow contract
- Timer bindings are limited to flows with zero required inputs in this slice
- CLI bindings are supported for design-time binding and now have one narrow runtime-backed command-entry slice; Channel bindings are supported for design-time binding and now have one narrow runtime-backed internal-event slice
- `triggerName`, `requestMappingMode`, `replyMappingMode`, and `runMode` are deprecated compatibility fields and are ignored by the current binder

### `POST /v1/projects/:projectId/apps/:appId/flows/extract-subflow`

Plans or applies extraction of an explicit contiguous linear task sequence into a new subflow.

Request shape:

- `SubflowExtractionRequest`

Important fields:

- `flowId`
- `taskIds`
- `newFlowId?`
- `newFlowName?`
- `validateOnly`
- `replaceExisting`

Response shape:

- `SubflowExtractionResponse`

Important behavior:

- `validateOnly = true` persists a `subflow_extraction_plan` artifact and does not mutate `flogo.json`
- `validateOnly = false` applies the extraction directly to the resolved app file and persists a `subflow_extraction_result` artifact
- duplicate generated target flow IDs return `409` unless `replaceExisting = true`
- invalid selections or unsupported linked/branching flow shapes return `422`

Current implementation notes:

- this slice supports only explicit contiguous linear task selections,
- extraction derives subflow inputs from parent-flow values consumed inside the selected region,
- extraction derives subflow outputs from values produced in the selected region and consumed later,
- the parent flow is rewritten by replacing the selected region with one synthetic subflow invocation task.

### `POST /v1/projects/:projectId/apps/:appId/flows/inline-subflow`

Plans or applies inlining of a same-app subflow invocation back into its parent flow.

Request shape:

- `SubflowInliningRequest`

Important fields:

- `parentFlowId`
- `invocationTaskId`
- `validateOnly`
- `removeExtractedFlowIfUnused`

Response shape:

- `SubflowInliningResponse`

Important behavior:

- `validateOnly = true` persists a `subflow_inlining_plan` artifact and does not mutate `flogo.json`
- `validateOnly = false` applies the inlining directly to the resolved app file and persists a `subflow_inlining_result` artifact
- unknown invocation tasks return `404`
- unsupported linked/branching flow shapes return `422`

Current implementation notes:

- this slice supports only invocation tasks that point to same-app flow resources,
- generated inlined task IDs are prefixed deterministically with the invocation task ID,
- `removeExtractedFlowIfUnused = true` removes the extracted flow only when no remaining references exist.

### `POST /v1/projects/:projectId/apps/:appId/flows/add-iterator`

Plans or applies iterator synthesis for one existing activity-backed or subflow invocation task.

Request shape:

- `IteratorSynthesisRequest`

Important fields:

- `flowId`
- `taskId`
- `iterateExpr`
- `accumulate?`
- `validateOnly`
- `replaceExisting`

Response shape:

- `IteratorSynthesisResponse`

Important behavior:

- `validateOnly = true` persists an `iterator_plan` artifact and does not mutate `flogo.json`
- `validateOnly = false` applies iterator synthesis directly to the resolved app file and persists an `iterator_result` artifact
- conflicting existing iterator state returns `409` unless `replaceExisting = true`
- missing flow/task returns `404`
- incompatible task shapes or invalid iterate expressions return `422`

Current implementation notes:

- iterator synthesis supports plain activity-backed tasks and same-app subflow invocation tasks,
- the synthesized task uses `type = "iterator"` and writes `settings.iterate`,
- `accumulate` is included only when provided,
- this slice does not synthesize one iterator across multiple tasks; multi-task iteration should use subflow extraction first.

### `POST /v1/projects/:projectId/apps/:appId/flows/add-retry-policy`

Plans or applies retry-on-error synthesis for one existing activity-backed, iterator, doWhile, or subflow invocation task.

Request shape:

- `RetryPolicyRequest`

Important fields:

- `flowId`
- `taskId`
- `count`
- `intervalMs`
- `validateOnly`
- `replaceExisting`

Response shape:

- `RetryPolicyResponse`

Important behavior:

- `validateOnly = true` persists a `retry_policy_plan` artifact and does not mutate `flogo.json`
- `validateOnly = false` applies retry-policy synthesis directly to the resolved app file and persists a `retry_policy_result` artifact
- conflicting existing retry policy returns `409` unless `replaceExisting = true`
- missing flow/task returns `404`
- invalid retry configuration or incompatible task shapes return `422`

Current implementation notes:

- retry synthesis writes `settings.retryOnError = { count, interval }`,
- retry can coexist with iterator and doWhile in this slice,
- the current slice supports simple retry only; advanced backoff strategies are out of scope.

### `POST /v1/projects/:projectId/apps/:appId/flows/add-dowhile`

Plans or applies doWhile synthesis for one existing activity-backed or subflow invocation task.

Request shape:

- `DoWhileSynthesisRequest`

Important fields:

- `flowId`
- `taskId`
- `condition`
- `delayMs?`
- `accumulate?`
- `validateOnly`
- `replaceExisting`

Response shape:

- `DoWhileSynthesisResponse`

Important behavior:

- `validateOnly = true` persists a `dowhile_plan` artifact and does not mutate `flogo.json`
- `validateOnly = false` applies doWhile synthesis directly to the resolved app file and persists a `dowhile_result` artifact
- conflicting existing doWhile state returns `409` unless `replaceExisting = true`
- missing flow/task returns `404`
- invalid conditions or incompatible task shapes return `422`

Current implementation notes:

- doWhile synthesis supports plain activity-backed tasks and same-app subflow invocation tasks,
- the synthesized task uses `type = "doWhile"` and writes `settings.condition`,
- `delay` and `accumulate` are included only when provided,
- iterator and doWhile are mutually exclusive in this slice.

### `POST /v1/projects/:projectId/apps/:appId/flows/add-error-path`

Plans or applies a generated failure branch for one existing task in one flow.

Request shape:

- `ErrorPathTemplateRequest`

Important fields:

- `flowId`
- `taskId`
- `template`
  - `log_and_continue`
  - `log_and_stop`
- `validateOnly`
- `replaceExisting`
- `logMessage?`
- `generatedTaskPrefix?`

Response shape:

- `ErrorPathTemplateResponse`

Important behavior:

- `validateOnly = true` persists an `error_path_plan` artifact and does not mutate `flogo.json`
- `validateOnly = false` applies the generated error path directly to the resolved app file and persists an `error_path_result` artifact
- conflicting previously generated error paths return `409` unless `replaceExisting = true`
- missing flow/task returns `404`
- unsupported branching flows, incompatible task shapes, or invalid template/shape combinations return `422`

Current implementation notes:

- the current slice supports only `log_and_continue` and `log_and_stop`,
- the graph rewrite materializes typed linear links when the target flow has no links,
- success and failure branches use canonical expression links based on `$activity[taskId].error`,
- generated failure tasks use `#log` and reuse or add the log import as needed,
- this slice supports only empty-link or simple linear-link flows and rejects arbitrary existing branching graphs.

### `GET /v1/projects/:projectId/apps/:appId/descriptors?ref=...`

Returns a normalized descriptor inspection result for one contrib ref or alias.

Request query:

- `ref`

Examples:

- `#log`
- `#rest`
- `github.com/project-flogo/contrib/activity/log`

Response shape:

- `ContribDescriptorResponse`

Key fields:

- `descriptor`
- `diagnostics`
- `artifact`

Current implementation notes:

- refs are passed as a query parameter because contrib refs commonly contain `/`,
- descriptor resolution prefers discovered descriptor metadata and falls back to normalized registry or inferred metadata with diagnostics,
- the response artifact is backed by Blob/Azurite JSON storage and Prisma metadata.

### `GET /v1/projects/:projectId/apps/:appId/contribs/evidence?ref=...`

Returns the normalized evidence view for one contribution ref or alias.

Request query:

- `ref`

Response shape:

- `ContribEvidenceResponse`

Key fields:

- `evidence`
- `artifact`

Current implementation notes:

- refs are passed as a query parameter because contrib refs commonly contain `/`,
- the evidence response is inventory-backed and exposes source, confidence, descriptor path, package root, module path, and Go package path when available,
- this route is the most explicit way to inspect whether a contrib is package-backed, descriptor-backed, registry-backed, or inferred,
- the response artifact is backed by Blob/Azurite JSON storage and Prisma metadata.

### `GET /v1/projects/:projectId/apps/:appId/artifacts`

Returns app-scoped analysis artifacts currently associated with the resolved app.

Response shape:

- `ArtifactRef[]`

Current implementation note:

- app-scoped analysis artifacts are currently persisted through hidden synthetic review tasks plus Blob/Azurite-backed JSON payload storage.

### `GET /v1/projects/:projectId/apps/:appId/governance`

Returns alias, orphaned-ref, and version-governance analysis plus a persisted artifact reference.

Response shape:

- `GovernanceResponse`

Key fields:

- `report`
- `artifact`

Current implementation notes:

- governance currently checks duplicate aliases, missing imports, implicit alias use, missing flow/action refs, unused imports, and version drift heuristics,
- governance now reports unresolved packages, fallback contribs, weak-evidence contribs, package-backed contribs, and descriptor-only contribs,
- governance also returns categorized fields such as `unusedImports`, `missingImports`, `aliasRefMismatches`, `weakSignatureContribs`, `duplicateAliases`, and `conflictingVersions`,
- the report artifact is backed by Blob/Azurite JSON storage and Prisma metadata.

### `GET /v1/projects/:projectId/apps/:appId/properties/plan?profile=...`

Returns the property/environment planning result plus a persisted artifact reference.

Response shape:

- `PropertyPlanResponse`

Important query parameter:

- `profile`
  - `rest_service`
  - `timer_job`
  - `cli_tool`
  - `channel_worker`
  - `serverless`
  - `edge_binary`

Current implementation notes:

- the planner now separates `recommendedSecretEnv` and `recommendedPlainEnv`,
- planning is profile-aware, but it still stops short of generating deployment manifests,
- the response artifact is backed by Blob/Azurite JSON storage and Prisma metadata.

### `POST /v1/projects/:projectId/apps/:appId/mappings/preview`

Runs typed mapping preview for a specific node and returns the result plus a persisted artifact reference.

Request shape:

- `MappingPreviewRequest`

Important fields:

- `nodeId`
- `sampleInput`

Response shape:

- `MappingPreviewResponse`

Key fields:

- `preview`
- `propertyPlan`
- `artifact`

Current implementation notes:

- the preview artifact is backed by Blob/Azurite JSON storage and Prisma metadata,
- the preview now includes `paths`, `resolvedValues`, `scopeDiagnostics`, and `coercionDiagnostics`,
- `propertyPlan` now includes declared properties, undefined and unused refs, recommended properties, recommended environment variables, profile-specific notes, and deployment notes.

### `POST /v1/projects/:projectId/apps/:appId/mappings/test`

Runs a deterministic mapping-resolution test for one node.

Request shape:

- `MappingTestSpec`

Important fields:

- `nodeId`
- `sampleInput`
- `expectedOutput`
- `strict`

Response shape:

- `MappingTestResponse`

Current implementation notes:

- the test uses the same static mapping-analysis engine as preview, not runtime trace/replay,
- unknown node IDs return a failing test result with diagnostics rather than a `404`,
- the response artifact is backed by Blob/Azurite JSON storage and Prisma metadata.

### `POST /v1/projects/:projectId/apps/:appId/composition/compare`

Compares canonical `flogo.json` structure with the current programmatic-composition probe and returns a persisted artifact reference.

Request shape:

- `CompositionCompareRequest`

Important fields:

- `mode`
- `target`
- `resourceId?`

Response shape:

- `CompositionCompareResponse`

Key fields:

- `comparison`
- `comparison.artifact`

Current implementation notes:

- this is an analysis/probe path, not full programmatic generation,
- the comparison result includes `comparisonBasis`, `signatureEvidenceLevel`, and the inventory refs used during the probe,
- the comparison artifact is backed by Blob/Azurite JSON storage and Prisma metadata.

### `GET /v1/health`

Returns:

```json
{
  "ok": true,
  "service": "control-plane",
  "timestamp": "2026-03-11T00:00:00.000Z"
}
```

## Internal control-plane API

These routes are intended only for orchestrator and runner integration.

Local base URL:

- `http://localhost:3001/v1/internal`

Authentication:

- local/dev mode uses `X-Internal-Service-Token`
- production should move to managed service identity or equivalent service-to-service auth

### `POST /v1/internal/tasks/:taskId/events`

Publishes a task event into persisted task history and the SSE stream.

Request shape:

- `TaskEventPublish`

### `POST /v1/internal/tasks/:taskId/sync`

Synchronizes orchestration or runner state into the control-plane read model.

Request shape:

- `TaskStateSync`

Important fields:

- `orchestrationId`
- `status`
- `summary`
- `approvalStatus`
- `activeJobRuns`
- `artifact`
- `validationReport`
- `requiredApprovals`
- `nextActions`
- `jobRunStatus`

## Orchestrator API

The repo supports two execution shapes:

- Durable Functions routes for deployment,
- Fastify-based local development routes.

Both use the same request and response contracts.

Local base URL:

- `http://localhost:7071/api`

### `POST /api/orchestrations/tasks`

Starts an orchestration.

Request shape:

- `OrchestratorStartRequest`

Fields:

- `taskId`
- `request`
- `requiredApprovals`
- `planSummary`
- `steps`

Response shape:

- `OrchestratorStartResponse`

Fields:

- `orchestrationId`
- `status`
- `activeJobRuns`
- `summary`

### `GET /api/orchestrations/:orchestrationId`

Returns the current orchestration projection.

Response shape:

- `OrchestratorStatus`

### `POST /api/orchestrations/:orchestrationId/approvals`

Signals an approval decision into a running orchestration.

Request shape:

- `ApprovalDecision`

Workflow behavior:

- mutating workflows use build/run/smoke-oriented runner steps,
- analysis-only workflows use `inventory_contribs`, `catalog_contribs`, `inspect_contrib_evidence`, `validate_governance`, `compare_composition`, `preview_mapping`, `infer_flow_contracts`, `extract_subflow`, `inline_subflow`, `add_iterator`, `add_retry_policy`, `add_dowhile`, or `add_error_path`.
- analysis-only workflows also support `test_mapping` and `plan_properties`.

## Runner-worker API

Local base URL:

- `http://localhost:3010`

### `GET /health`

Returns a lightweight service health response.

### `POST /internal/jobs/start`

Starts a runner job.

Request shape:

- `RunnerJobSpec`

Important fields:

- `taskId`
- `jobKind`
- `stepType`
- `snapshotUri`
- `appPath`
- `env`
- `envSecretRefs`
- `timeoutSeconds`
- `artifactOutputUri`
- `workspaceBlobPrefix?`
- `artifactBlobPrefix?`
- `jobTemplateName`
- `jobRunId?`
- `correlationId?`
- `command`
- `containerArgs`
- `analysisPayload?`
- `analysisKind?`
- `targetNodeId?`
- `targetRef?`

Response shape:

- `RunnerJobStatus`

### `GET /internal/jobs/:jobRunId`

Returns the latest job status.

Response shape:

- `RunnerJobStatus`

Important status/result fields:

- `status`
- `summary`
- `spec`
- `azureJobExecutionName?`
- `azureJobResourceId?`
- `result?`

## Shared contract summary

The canonical contract definitions are in `packages/contracts/src/index.ts`.

The most important ones are:

- `TaskRequest`
- `TaskResult`
- `TaskSummary`
- `TaskRuns`
- `ApprovalDecision`
- `ArtifactRef`
- `TaskEvent`
- `TaskEventPublish`
- `TaskStateSync`
- `FlogoAppGraph`
- `ContribDescriptor`
- `ContribDescriptorResponse`
- `ContribCatalog`
- `ContribCatalogResponse`
- `GovernanceReport`
- `GovernanceResponse`
- `CompositionCompareRequest`
- `CompositionCompareResult`
- `CompositionCompareResponse`
- `MappingPreviewRequest`
- `MappingPreviewResult`
- `MappingPreviewResponse`
- `PropertyPlanResponse`
- `MappingTestSpec`
- `MappingTestResult`
- `MappingTestResponse`
- `SubflowExtractionRequest`
- `SubflowExtractionResponse`
- `SubflowInliningRequest`
- `SubflowInliningResponse`
- `ValidationReport`
- `RunnerJobSpec`
- `RunnerJobResult`
- `RunnerJobStatus`
- `OrchestratorStartRequest`
- `OrchestratorStartResponse`
- `OrchestratorStatus`

## Error behavior

Current behavior:

- unknown task IDs return `404`,
- unknown app IDs return `404`,
- unknown runner job IDs return `404`,
- schema validation errors surface as framework request errors,
- orchestrator and runner integration errors currently bubble as server-side failures rather than a uniform platform error envelope.

Future hardening should add:

- correlation IDs in public error responses,
- explicit retryability hints,
- typed downstream dependency error bodies.
