# Flogo-Native Runtime Plan

## Purpose

This document is the standing implementation reference for the Flogo-native runtime expansion.

Use it as the canonical roadmap when extending the platform beyond `flogo.json` editing into a runtime-aware, Core/Flow-aware engineering system.

Every implementation slice that touches Flogo-native capability work should update:

1. this document,
2. [Capability Matrix](./capability-matrix.md),
3. any affected operational docs such as [Architecture](./architecture.md), [API reference](./api-reference.md), and [Data model](./data-model.md).

## Problem Statement

The platform should stop behaving like a generic JSON editor with a build loop and instead become a Flogo-native engineering runtime.

The reason is structural:

- `project-flogo/core` exposes application, contribution, engine, and data/mapping concepts.
- `project-flogo/flow` exposes definition-time, execution-time, and test-time concepts.
- Flogo apps are not only static descriptors. They are executable event-driven systems with triggers, handlers, actions, activities, mappings, reusable flows, and runtime state.

That means the platform must understand Flogo at three levels:

- definition-time,
- execution-time,
- test-time.

## Core Decisions

### Canonical artifact

`flogo.json` remains the canonical stored artifact for:

- repository diffs,
- user review,
- task outputs,
- policy review,
- change summaries.

The Go/Core path is additive. It is used for validation, introspection, synthesis, testing, and runtime-aware analysis.

### Runtime split

TypeScript owns the control plane:

- public API,
- orchestration,
- task and artifact read models,
- approvals,
- policy,
- operator UX,
- eval management.

Go owns Flogo-native helper execution inside isolated runner paths:

- contribution introspection,
- descriptor handling,
- mapping preview execution,
- future run comparison,
- future contrib scaffolding.

### Platform shape

The architectural baseline remains:

- `apps/control-plane`
- `apps/orchestrator`
- `apps/runner-worker`
- `apps/web-console`

with a finite helper/runtime path under:

- `go-runtime/flogo-helper`

and runner images under:

- `runner-images/*`

## Capability Domains

The Flogo-native expansion is organized into six capability domains.

### 1. Core model engine

The platform must understand:

- app structure,
- imports and aliases,
- triggers, handlers, and actions,
- resources and flows,
- properties,
- channels,
- contribution metadata,
- install, update, list, and orphan detection.

### 2. Data and mapping engine

The platform must treat mappings as a first-class subsystem.

It needs:

- literal, expression, object, and array mapping classification,
- scope-aware validation for `$flow`, `$activity[...]`, `$env`, `$property`, and `$trigger`,
- coercion suggestions,
- mapping previews against sample payloads,
- property and environment planning.

### 3. Flow design engine

The platform must treat flows as reusable callable units, not just inline handler bodies.

It needs:

- flow signature inference,
- flow extraction/inlining,
- reusable flow planning,
- trigger rebinding after flow refactors.

### 4. Flow runtime engine

The platform must expose execution-time behavior.

It needs:

- execution snapshots,
- step traces,
- state inspection,
- replay,
- side-by-side run comparison,
- proof-oriented debugging.

### 5. Contribution factory

The platform must scaffold and validate custom contributions, not only consume existing ones.

It needs:

- activity scaffolding,
- trigger scaffolding,
- action scaffolding,
- descriptor generation,
- versioning and validation,
- isolated build/test workflows.

### 6. Advanced pattern engine

The platform must understand non-trivial flow structures.

It needs:

- iterators,
- accumulators,
- retry-on-error,
- repeat/doWhile,
- conditional/error-path templates,
- property-aware and trigger-aware planning.

## Delivery Phases

## Phase 1: Core-aware foundation

Focus:

- contribution catalog,
- descriptor parsing,
- mapping/coercion validation,
- property/environment planning.

Current status:

- implemented

Implemented in repo:

- contribution inventory contracts, graph logic, public endpoint, runner step, and Blob/Azurite-backed persisted artifact,
- module-aware package discovery for contribution inventory using `go.mod` workspaces, vendored package trees, descriptor search roots, and package-source fallback,
- Go module cache-aware package discovery for contribution inventory and descriptor resolution, including discovered package version evidence,
- contribution catalog generation in `packages/flogo-graph`,
- descriptor introspection contracts,
- public descriptor inspection endpoint,
- governance validation contracts and public endpoint,
- composition comparison contracts and public endpoint,
- typed mapping preview contracts,
- descriptor-aware and heuristic coercion suggestions,
- richer property and environment planning,
- deployment-profile-aware property planning exposed through a direct property-plan API,
- deterministic mapping-resolution tests exposed through a direct mapping-test API,
- direct app-analysis APIs for graph, inventory, catalog, artifact listing, and mapping preview,
- direct app-analysis APIs for governance and composition comparison,
- direct app-analysis API for descriptor inspection,
- direct app-analysis API for contribution evidence inspection,
- direct app-analysis APIs for property planning and mapping tests,
- app-scoped analysis artifact persistence using Prisma-backed hidden analysis tasks,
- Blob/Azurite-backed JSON payload storage for inventory, catalog, descriptor, contribution-evidence, governance, composition-compare, mapping-preview, property-plan, and mapping-test artifacts,
- structured contribution-evidence fields in inventory, catalog, descriptor, governance, and composition-comparison results,
- Go helper skeleton with real command paths for inventory, catalog, descriptor inspection, contribution evidence inspection, governance validation, composition comparison, mapping preview, mapping test, and property planning,
- runner-worker support for `inventory_contribs`, `catalog_contribs`, `inspect_descriptor`, `inspect_contrib_evidence`, `validate_governance`, `compare_composition`, `preview_mapping`, `test_mapping`, and `plan_properties`,
- planner support for analysis-only task modes including inventory, contribution evidence, governance, composition comparison, mapping preview, mapping test, and property planning.

Phase 1 outcome:

- the Core-aware foundation is now implemented as an evidence-backed static analysis layer,
- contribution inventory and catalog use workspace, vendored, and module-cache package discovery before registry or inferred fallback,
- governance is inventory-backed and categorizes alias, orphan, version, and evidence-quality findings,
- mapping preview, mapping tests, coercion suggestions, and property planning are implemented as static-analysis capabilities,
- runtime-backed mapping evaluation remains a Phase 3 concern, not a missing Phase 1 requirement.

## Phase 2: Flow-aware design

Focus:

- flow contract inference,
- subflow extraction/inlining,
- iterator/retry/doWhile synthesis,
- trigger polymorphism,
- error-path templates.

Current status:

- in progress

Implemented in repo:

- helper-backed runtime trace capture exposed through direct APIs, persisted `run_trace_plan` / `run_trace` artifacts, and analysis-only orchestration support,
- helper-backed replay exposed through direct APIs, persisted `replay_plan` / `replay_report` artifacts, and analysis/execution orchestration support,
- helper-backed run comparison exposed through direct APIs, persisted `run_comparison_plan` / `run_comparison` artifacts, and analysis/execution orchestration support,
- replay from either explicit base input or a previously stored `run_trace` artifact input,
- deep override merging for replay inputs with deterministic preflight validation in `packages/flogo-graph`,
- helper/runtime parity for replay request handling, structured failed-replay summaries, persisted replay artifacts, and task-id-paired run-comparison diffs across `run_trace` and `replay_report` payloads.

Implemented in repo:

- flow contract inference exposed through direct app-analysis APIs, helper-backed analysis commands, persisted `flow_contract` artifacts, and analysis-only orchestration support,
- trigger polymorphism for REST, Timer, CLI, and Channel profiles through direct trigger-binding APIs, helper-backed planning, runner/orchestrator support, and persisted `trigger_binding_plan` / `trigger_binding_result` artifacts,
- subflow extraction and inlining for explicit contiguous linear task selections through direct flow-refactor APIs, helper-backed planning, runner/orchestrator support, and persisted `subflow_extraction_plan` / `subflow_extraction_result` / `subflow_inlining_plan` / `subflow_inlining_result` artifacts,
- iterator synthesis through direct control-flow APIs, helper-backed planning, runner/orchestrator support, and persisted `iterator_plan` / `iterator_result` artifacts,
- retry-on-error synthesis through direct control-flow APIs, helper-backed planning, runner/orchestrator support, and persisted `retry_policy_plan` / `retry_policy_result` artifacts,
- doWhile synthesis through direct control-flow APIs, helper-backed planning, runner/orchestrator support, and persisted `dowhile_plan` / `dowhile_result` artifacts,
- error-path templates through direct control-flow APIs, typed-link graph rewrites, helper-backed planning, runner/orchestrator support, and persisted `error_path_plan` / `error_path_result` artifacts,
- deterministic profile-aware auto-mapping for REST request/reply defaults, CLI args/flags defaults, Channel data mapping, and zero-required-input enforcement for Timer flows in this slice.

## Phase 3: Runtime-aware debugging

Focus:

- trace capture,
- replay,
- state diffs,
- failure localization with runtime proof.

Current status:

- in progress

## Phase 4: Extension-aware contribution authoring

Focus:

- activity/trigger/action scaffolding,
- version governance,
- contrib build/test/package flows,
- install/update workflows.

Current status:

- planned

## Current Implementation Baseline

The current codebase has a completed Phase 1 foundation and active Phase 2 support for flow contract inference, trigger polymorphism, subflow extraction/inlining, and advanced control-flow synthesis.

### Implemented now

- Shared Flogo-native contracts:
  - `ContribDescriptor`
  - `ContribCatalog`
  - `MappingPreviewRequest`
  - `MappingPreviewResult`
- Graph-level Flogo app normalization and analysis in `packages/flogo-graph`
- Direct control-plane APIs:
  - `GET /v1/projects/:projectId/apps/:appId/graph`
  - `GET /v1/projects/:projectId/apps/:appId/inventory`
  - `GET /v1/projects/:projectId/apps/:appId/catalog`
  - `GET /v1/projects/:projectId/apps/:appId/descriptors?ref=...`
- `GET /v1/projects/:projectId/apps/:appId/contribs/evidence?ref=...`
- `GET /v1/projects/:projectId/apps/:appId/flows/contracts`
- `POST /v1/projects/:projectId/apps/:appId/flows/trace`
- `POST /v1/projects/:projectId/apps/:appId/flows/replay`
- `POST /v1/projects/:projectId/apps/:appId/flows/compare-runs`
- `POST /v1/projects/:projectId/apps/:appId/flows/extract-subflow`
- `POST /v1/projects/:projectId/apps/:appId/flows/inline-subflow`
- `POST /v1/projects/:projectId/apps/:appId/flows/add-iterator`
- `POST /v1/projects/:projectId/apps/:appId/flows/add-retry-policy`
- `POST /v1/projects/:projectId/apps/:appId/flows/add-dowhile`
- `POST /v1/projects/:projectId/apps/:appId/flows/add-error-path`
- `GET /v1/projects/:projectId/apps/:appId/governance`
- `GET /v1/projects/:projectId/apps/:appId/artifacts`
- `GET /v1/projects/:projectId/apps/:appId/properties/plan`
- `POST /v1/projects/:projectId/apps/:appId/composition/compare`
- `POST /v1/projects/:projectId/apps/:appId/mappings/preview`
- `POST /v1/projects/:projectId/apps/:appId/mappings/test`
- `POST /v1/projects/:projectId/apps/:appId/triggers/bind`
- Analysis-only planner modes:
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
- `inputs.mode = "governance"`
- `inputs.mode = "composition_compare"`
- `inputs.mode = "mapping_preview"`
- `inputs.mode = "mapping_test"`
- `inputs.mode = "property_plan"`
- Runner job kinds and execution steps for flow contracts, runtime trace capture, replay, run comparison, trigger binding, subflow extraction/inlining, iterator/retry/doWhile/error-path synthesis, inventory, catalog, contribution evidence, governance, composition comparison, and mapping preview
- Go helper commands:
  - `flows contracts`
  - `triggers bind`
  - `flows extract-subflow`
  - `flows inline-subflow`
  - `flows add-iterator`
  - `flows add-retry-policy`
  - `flows add-dowhile`
- `flows add-error-path`
- `flows trace`
- `flows replay`
- `flows compare-runs`
- `inventory contribs`
  - `catalog contribs`
  - `inspect descriptor`
- `evidence inspect`
- `governance validate`
- `compose compare`
- `preview mapping`
- `mapping test`
- `properties plan`

### Not implemented yet

- Core-native programmatic app composition
- contribution scaffolding and isolated contrib build/test flows
- deployment profile generation
- TensorFlow or specialized activity planning

## Implementation Tracker

Use this section as the working tracker for future implementation slices.

| Area | Scope | Status | Code reference | Next step |
| --- | --- | --- | --- | --- |
| Shared contracts | Inventory, descriptor, contribution-evidence, governance, composition, mapping-preview, mapping-test, property-plan, flow-contract, trigger-binding, subflow-refactor, advanced control-flow, run-trace, replay, and run-comparison contracts | Partial | `packages/contracts/src/index.ts` | Add contribution-authoring contracts |
| Graph engine | Contribution inventory, catalog, evidence inspection, alias validation, governance validation, composition comparison, mapping preview, mapping tests, coercion suggestions, property planning, flow contract inference, trigger-binding planning/application, subflow extraction/inlining, iterator/retry/doWhile/error-path synthesis, run-trace preflight validation, replay preflight validation, and run-comparison diffing | Partial | `packages/flogo-graph/src/index.ts` | Add runtime-backed debugging evidence layers on top of trace/replay/comparison |
| Tool layer | Flogo core/mapping tools split plus flow-contract, trigger-binding, subflow-refactor, advanced control-flow dispatch, runtime trace dispatch, replay dispatch, and run-comparison dispatch | Partial | `packages/tools/src/*.ts` | Add contribution-authoring tool modules |
| Planner | Analysis-only modes, runtime trace/replay/run-comparison planning-execution routing, and Flogo-aware step selection | Partial | `packages/agent/src/index.ts` | Add runtime-backed debugging planning |
| Control-plane APIs | Graph, inventory, catalog, descriptor inspection, contribution evidence inspection, flow contracts, runtime trace, replay, run comparison, trigger binding, subflow extraction/inlining, iterator/retry/doWhile/error-path synthesis, governance, composition comparison, mapping preview, mapping test, property plan, app artifact listing | Partial | `apps/control-plane/src/modules/flogo-apps/*` | Add contribution-authoring APIs later |
| Persistence | Prisma-backed task/event/artifact state plus hidden app-analysis records and Blob-backed analysis payloads | Partial | `apps/control-plane/src/modules/agent/task-store.service.ts`, `apps/control-plane/src/modules/flogo-apps/app-analysis-storage.service.ts` | Extend Blob-backed storage beyond app-analysis artifacts |
| Runner-worker | Flow-contract, runtime trace, replay, run comparison, trigger-binding, subflow extraction/inlining, iterator/retry/doWhile/error-path synthesis, inventory, catalog, descriptor, contribution evidence, governance, composition comparison, mapping preview, mapping test, and property-plan execution support | Partial | `apps/runner-worker/src/services/*` | Add contribution-authoring job kinds |
| Go helper | Flow-contract, runtime trace, replay, run comparison, trigger-binding, subflow extraction/inlining, iterator/retry/doWhile/error-path synthesis, inventory, catalog, descriptor, contribution evidence, governance, composition comparison, mapping preview, mapping test, and property planning | Partial | `go-runtime/flogo-helper/main.go` | Integrate deeper Flow runtime hooks and later runtime-backed debugging behavior |
| Web console | Basic task UI only | Planned | `apps/web-console` | Add catalog, mapping preview, and later replay views |
| Eval coverage | Existing create/update/debug/review baseline | Partial | `packages/evals` | Add runtime trace, replay, run-comparison, and contribution-authoring cases |

## Rules For Future Implementation Passes

When implementing a Flogo-native feature:

1. Update this plan first or as part of the same change.
2. Update [Capability Matrix](./capability-matrix.md) with phase, status, tools, and validation evidence.
3. If a public or internal interface changes, update [API reference](./api-reference.md).
4. If persistence or contracts change, update [Data model](./data-model.md).
5. If runtime behavior or service responsibilities change, update [Architecture](./architecture.md).
6. If the workflow for contributors changes, update [Development guide](./development.md).

## Recommended Next Slice

The next implementation slice after the current baseline should continue Phase 3 now that runtime trace capture, replay, and run comparison are in place.

Recommended next items:

1. Add replay-driven debugging on top of captured traces, replay output, and run-comparison evidence.
2. Keep the current mapping preview and mapping test surface static-analysis-backed until runtime-backed debugging needs to feed back into mapping diagnostics.
3. Add contribution scaffolding once Phase 3 runtime evidence is in place.

## Source References

- [Project Flogo introduction](https://tibcosoftware.github.io/flogo/introduction/)
- [Flogo Core package](https://pkg.go.dev/github.com/project-flogo/core)
- [Flogo Core data packages](https://github.com/project-flogo/core/tree/master/data)
- [Flow input/output parameters](https://tibcosoftware.github.io/flogo/development/flows/io-parameters/)
- [Project Flogo Flow repository](https://github.com/project-flogo/flow)
- [Iterator docs](https://tibcosoftware.github.io/flogo/development/flows/iterators/)
- [Mapping docs](https://tibcosoftware.github.io/flogo/development/flows/mapping/)
- [Property bag docs](https://tibcosoftware.github.io/flogo/development/flows/property-bag/)
- [TensorFlow inferencing docs](https://tibcosoftware.github.io/flogo/development/flows/tensorflow/inferencing-tf/)
