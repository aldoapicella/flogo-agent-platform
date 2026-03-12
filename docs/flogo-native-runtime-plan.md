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
- future runtime trace and replay,
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
- trigger polymorphism.

Current status:

- planned

## Phase 3: Runtime-aware debugging

Focus:

- trace capture,
- replay,
- state diffs,
- failure localization with runtime proof.

Current status:

- planned

## Phase 4: Extension-aware contribution authoring

Focus:

- activity/trigger/action scaffolding,
- version governance,
- contrib build/test/package flows,
- install/update workflows.

Current status:

- planned

## Current Implementation Baseline

The current codebase already supports a narrow but real Phase 1 slice.

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
- `GET /v1/projects/:projectId/apps/:appId/governance`
- `GET /v1/projects/:projectId/apps/:appId/artifacts`
- `GET /v1/projects/:projectId/apps/:appId/properties/plan`
- `POST /v1/projects/:projectId/apps/:appId/composition/compare`
- `POST /v1/projects/:projectId/apps/:appId/mappings/preview`
- `POST /v1/projects/:projectId/apps/:appId/mappings/test`
- Analysis-only planner modes:
  - `inputs.mode = "inventory"`
  - `inputs.mode = "catalog"`
- `inputs.mode = "contrib_evidence"`
- `inputs.mode = "governance"`
- `inputs.mode = "composition_compare"`
- `inputs.mode = "mapping_preview"`
- `inputs.mode = "mapping_test"`
- `inputs.mode = "property_plan"`
- Runner job kinds and execution steps for inventory, catalog, contribution evidence, governance, composition comparison, and mapping preview
- Go helper commands:
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
- flow contracts and trigger profiles
- subflow extraction/inlining
- iterator/retry/doWhile synthesis
- runtime trace and replay
- contribution scaffolding and isolated contrib build/test flows
- deployment profile generation
- TensorFlow or specialized activity planning

## Implementation Tracker

Use this section as the working tracker for future implementation slices.

| Area | Scope | Status | Code reference | Next step |
| --- | --- | --- | --- | --- |
| Shared contracts | Inventory, descriptor, contribution-evidence, governance, composition, mapping-preview, mapping-test, and property-plan contracts | Partial | `packages/contracts/src/index.ts` | Extend for flow contracts and replay when Phase 2 starts |
| Graph engine | Contribution inventory, catalog, evidence inspection, alias validation, governance validation, composition comparison, mapping preview, mapping tests, coercion suggestions, property planning | Partial | `packages/flogo-graph/src/index.ts` | Deepen real Core package introspection and add flow contract inference later |
| Tool layer | Flogo core/mapping tools split | Partial | `packages/tools/src/*.ts` | Add flow/runtime/contrib tool modules |
| Planner | Analysis-only modes and Flogo-aware step selection | Partial | `packages/agent/src/index.ts` | Add flow/runtime/contrib planners |
| Control-plane APIs | Graph, inventory, catalog, descriptor inspection, contribution evidence inspection, governance, composition comparison, mapping preview, mapping test, property plan, app artifact listing | Partial | `apps/control-plane/src/modules/flogo-apps/*` | Add flow contract and replay APIs later |
| Persistence | Prisma-backed task/event/artifact state plus hidden app-analysis records and Blob-backed analysis payloads | Partial | `apps/control-plane/src/modules/agent/task-store.service.ts`, `apps/control-plane/src/modules/flogo-apps/app-analysis-storage.service.ts` | Extend Blob-backed storage beyond app-analysis artifacts |
| Runner-worker | Inventory, catalog, descriptor, contribution evidence, governance, composition comparison, mapping preview, mapping test, and property-plan execution support | Partial | `apps/runner-worker/src/services/*` | Add runtime trace and contrib job kinds |
| Go helper | Inventory, catalog, descriptor, contribution evidence, governance, composition comparison, mapping preview, mapping test, and property planning | Partial | `go-runtime/flogo-helper/main.go` | Integrate deeper Core/Flow-native logic |
| Web console | Basic task UI only | Planned | `apps/web-console` | Add catalog, mapping preview, and later replay views |
| Eval coverage | Existing create/update/debug/review baseline | Partial | `packages/evals` | Add catalog/mapping and later replay/contrib cases |

## Rules For Future Implementation Passes

When implementing a Flogo-native feature:

1. Update this plan first or as part of the same change.
2. Update [Capability Matrix](./capability-matrix.md) with phase, status, tools, and validation evidence.
3. If a public or internal interface changes, update [API reference](./api-reference.md).
4. If persistence or contracts change, update [Data model](./data-model.md).
5. If runtime behavior or service responsibilities change, update [Architecture](./architecture.md).
6. If the workflow for contributors changes, update [Development guide](./development.md).

## Recommended Next Slice

The next implementation slice after the current baseline should begin Phase 2 instead of spending more time on Phase 1 hardening.

Recommended next items:

1. Add flow contract inference so reusable flow I/O becomes explicit.
2. Add trigger polymorphism built on top of inferred flow contracts.
3. Add subflow extraction and inlining.
4. Add iterator/retry/doWhile synthesis once flow contracts and rebinding exist.
5. Keep the current mapping preview and mapping test surface static-analysis-backed until runtime/replay work begins in Phase 3.

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
