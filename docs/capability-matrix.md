# Capability Matrix

## Purpose

This matrix tracks how Flogo Core and Flow capabilities map into platform features, tool contracts, validation rules, delivery phases, and current implementation status.

Use it together with [Flogo-Native Runtime Plan](./flogo-native-runtime-plan.md). That plan is the roadmap; this matrix is the feature-by-feature tracking grid.

## Status Legend

- `Implemented`: available in the repo today
- `Partial`: implemented in a limited or heuristic form
- `Planned`: designed but not implemented yet
- `Deferred`: intentionally postponed

## Capability Matrix

| Domain | Capability | Platform feature | Primary tools / APIs | Validation / evidence | Phase | Status | Current notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Core model engine | Contribution inventory | Inventory workspace/package/described contrib evidence for an app | `GET /v1/projects/:projectId/apps/:appId/inventory`, `inventory contribs`, `runner.inventoryContribs` | Persisted Blob-backed inventory artifact, evidence source classification, confidence scoring, helper/graph parity tests | V1 | Partial | Inventory now resolves module-aware package roots from `go.mod`, vendored trees, descriptor search roots, and package-source fallback, and exposes confidence/module/package identity, but it still stops short of full Core package introspection |
| Core model engine | Contribution catalog | Catalog installed and referenced contribs | `flogo_catalog_contribs`, `GET /v1/projects/:projectId/apps/:appId/catalog` | Alias/ref normalization, descriptor-source diagnostics, persisted Blob-backed catalog artifact | V1 | Partial | Catalog is inventory-backed and now carries stronger evidence metadata, but the underlying evidence is still not full Core package introspection |
| Core model engine | Descriptor introspection | Inspect one trigger/activity/action descriptor | `flogo_introspect_descriptor`, `GET /v1/projects/:projectId/apps/:appId/descriptors?ref=...`, Go helper `inspect descriptor` | Descriptor normalization, evidence/source diagnostics, persisted Blob-backed descriptor artifact | V1 | Implemented | Public endpoint and helper path exist; metadata can still fall back to registry or inferred sources |
| Core model engine | Contribution evidence inspection | Inspect the full evidence chain and confidence for one contrib | `GET /v1/projects/:projectId/apps/:appId/contribs/evidence?ref=...`, Go helper `evidence inspect`, `runner.inspectContribEvidence` | Persisted Blob-backed evidence artifact, confidence/source/module/package metadata | V1 | Implemented | Evidence responses are inventory-backed and expose `confidence`, `modulePath`, `goPackagePath`, and discovery reason |
| Core model engine | Alias validation | Detect missing/invalid aliases and refs | `flogo_validate_aliases`, `GET /v1/projects/:projectId/apps/:appId/governance` | Semantic diagnostics plus persisted governance artifact | V1 | Partial | Deterministic alias validation exists and is surfaced through the governance report |
| Core model engine | Orphan/version governance | Detect orphaned refs and version drift | `flogo_validate_governance`, `GET /v1/projects/:projectId/apps/:appId/governance`, Go helper `governance validate` | Orphan diagnostics, alias issues, version findings, inventory summary, persisted Blob-backed governance artifact | V1 | Partial | Governance now incorporates module-aware contribution inventory, unresolved-package reporting, fallback-contrib reporting, and weak-evidence/package-backed/descriptor-only summaries, but still lacks full package introspection |
| Core model engine | Programmatic app composition | Compare JSON authoring with Core-native composition | `flogo_compare_json_vs_programmatic`, `POST /v1/projects/:projectId/apps/:appId/composition/compare`, Go helper `compose compare` | Structural/semantic parity check, hashes, differences, persisted Blob-backed comparison artifact | V1-V2 | Partial | Comparison probe now reports whether inventory-backed evidence was used and the signature evidence level, but it is still not true Core-native programmatic composition |
| Data and mapping engine | Mapping classification | Distinguish literal/expression/object/array mappings | `flogo_validate_mappings`, `flogo_preview_mapping` | Mapping field classification and diagnostics | V1 | Partial | Implemented in `packages/flogo-graph` and Go helper |
| Data and mapping engine | Scope-aware mapping preview | Resolve `$flow`, `$activity[...]`, `$env`, `$property`, `$trigger` | `flogo_preview_mapping`, `POST /v1/projects/:projectId/apps/:appId/mappings/preview` | Preview result with unresolved-reference diagnostics | V1 | Partial | Works with sample payloads, not full runtime state |
| Data and mapping engine | Coercion suggestions | Suggest likely coercions for mismatched values | `flogo_suggest_coercions` | Deterministic warnings attached to preview/analysis | V1 | Partial | Heuristic, not schema-driven yet |
| Data and mapping engine | Property/environment planner | Suggest `$property` vs `$env` usage | `flogo_define_properties`, `flogo.planProperties` | Property usage analysis, undefined and unused refs, recommendations, deployment notes | V1 | Partial | Richer plan output exists, but it is still heuristic rather than deployment-profile-driven |
| Data and mapping engine | Runtime mapping evaluation | Evaluate mappings against real flow runtime state | future runtime trace/replay tools | Trace-backed evidence | V3 | Planned | Deferred until replay/runtime phase |
| Platform support | Analysis artifact persistence | Persist app-analysis payloads durably | `GET /catalog`, `GET /descriptors`, `GET /governance`, `POST /composition/compare`, `POST /mappings/preview`, `GET /artifacts` | Blob/Azurite-backed JSON payload plus Prisma metadata | V1 | Implemented | Catalog, descriptor, governance, composition-compare, and mapping-preview analysis artifacts now persist payloads to storage |
| Flow design engine | Flow contract inference | Infer reusable input/output signatures | future `flogo_infer_flow_contracts` | Flow contract artifact and graph validation | V2 | Planned | Not started |
| Flow design engine | Subflow extraction | Extract repeated task sequences into subflows | `flogo_extract_subflow` | Contract-preserving graph diff | V2 | Planned | Not started |
| Flow design engine | Subflow inlining | Inline reusable flows back into parent flow | `flogo_inline_subflow` | Graph diff plus contract checks | V2 | Planned | Not started |
| Flow design engine | Trigger polymorphism | Bind one flow to REST, timer, CLI, or channel | `flogo_bind_trigger` | Trigger-profile validation and mapping rebinding | V2 | Planned | Not started |
| Advanced pattern engine | Iterator synthesis | Add iterator constructs and loop plans | `flogo_add_iterator` | Graph validation and build/test proof | V2 | Planned | Not started |
| Advanced pattern engine | Retry policy synthesis | Add retry-on-error patterns | `flogo_add_retry_policy` | Control-flow validation and behavior proof | V2 | Planned | Not started |
| Advanced pattern engine | Repeat/doWhile synthesis | Add repeat-on-true or doWhile structures | `flogo_add_dowhile` | Graph validation and runtime proof | V2 | Planned | Not started |
| Advanced pattern engine | Error-path templates | Add default failure-handling branches | future `flogo_add_error_path` | Structured control-flow diff | V2 | Planned | Not started |
| Flow runtime engine | Run trace capture | Capture per-step execution evidence | `flogo_capture_run_trace` | Persisted run trace artifact | V3 | Planned | Not started |
| Flow runtime engine | Replay | Re-run flows with original or overridden inputs | `flogo_replay_run` | Replay report artifact | V3 | Planned | Not started |
| Flow runtime engine | Run comparison | Compare state/output deltas between runs | `flogo_compare_runs` | Replay diff artifact | V3 | Planned | Not started |
| Flow runtime engine | Runtime-backed debugging | Use trace/replay to prove fixes | debug workflow extension | Root cause + proof + minimal patch | V3 | Planned | Not started |
| Contribution factory | Activity scaffolding | Scaffold custom activity bundles | `flogo_scaffold_activity` | Descriptor + Go source + contrib validation | V3 | Planned | Not started |
| Contribution factory | Trigger scaffolding | Scaffold custom trigger bundles | `flogo_scaffold_trigger` | Descriptor + Go source + contrib validation | V3 | Planned | Not started |
| Contribution factory | Action scaffolding | Scaffold custom action bundles | `flogo_scaffold_action` | Descriptor + Go source + contrib validation | V3 | Planned | Not started |
| Contribution factory | Contribution validation/build/test | Validate generated contrib bundles | `flogo_validate_contrib`, contrib build/test jobs | Runner build/test evidence | V3 | Planned | Not started |
| Flogo-native testing | Mapping resolution tests | Dedicated mapping correctness tests | future `POST /v1/tests/mapping` | Golden mapping preview and diagnostic assertions | V1-V2 | Planned | Not started |
| Flogo-native testing | Flow contract tests | Contract tests for reusable flows | future `POST /v1/tests/flow` | Flow I/O assertions | V2 | Planned | Not started |
| Flogo-native testing | Replay tests | Verify behavior across replay paths | future replay APIs | Replay artifact and diff evidence | V3 | Planned | Not started |
| Deployment profiles | Deployment-profile generation | Emit runtime/deployment profiles | future profile planner output | Profile-aware validation matrix | V3 | Planned | Not started |
| Optional ML | TensorFlow inferencing planning | Plan/validate inference activity usage | future ML planner | Activity availability and artifact validation | Deferred | Deferred | Out of current roadmap scope |

## Tool Contract Targets

These are the core Flogo-native tool contracts that the platform should converge on.

### Phase 1 target tools

- `flogo_inventory_contribs`
- `flogo_catalog_contribs`
- `flogo_introspect_descriptor`
- `flogo_inspect_contrib_evidence`
- `flogo_validate_aliases`
- `flogo_validate_governance`
- `flogo_compare_json_vs_programmatic`
- `flogo_validate_mappings`
- `flogo_preview_mapping`
- `flogo_suggest_coercions`
- `flogo_define_properties`

### Phase 2 target tools

- `flogo_infer_flow_contracts`
- `flogo_extract_subflow`
- `flogo_inline_subflow`
- `flogo_bind_trigger`
- `flogo_add_iterator`
- `flogo_add_retry_policy`
- `flogo_add_dowhile`

### Phase 3 target tools

- `flogo_capture_run_trace`
- `flogo_replay_run`
- `flogo_compare_runs`

### Phase 4 target tools

- `flogo_scaffold_activity`
- `flogo_scaffold_trigger`
- `flogo_scaffold_action`
- `flogo_validate_contrib`
- `flogo_package_contrib`
- `flogo_install_contrib`
- `flogo_update_contrib`

## Validation Model By Domain

### Core model engine

Evidence should come from:

- alias/ref validation,
- descriptor normalization,
- orphan detection,
- contribution metadata proof.

### Data and mapping engine

Evidence should come from:

- mapping preview output,
- unresolved-reference diagnostics,
- coercion suggestions,
- property/env analysis.

### Flow design engine

Evidence should come from:

- flow contracts,
- graph diffs,
- preserved trigger/flow bindings,
- validation before and after transformation.

### Flow runtime engine

Evidence should come from:

- traces,
- replay artifacts,
- state deltas,
- reproducible debug proof.

### Contribution factory

Evidence should come from:

- generated descriptor bundles,
- Go build/test output,
- install/update validation.

## How To Update This Matrix

Whenever a Flogo-native feature lands:

1. update the matching row status,
2. update the notes column with the concrete code path,
3. add new rows if a capability becomes explicit,
4. keep phase assignments aligned with [Flogo-Native Runtime Plan](./flogo-native-runtime-plan.md).
