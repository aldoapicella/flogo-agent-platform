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
| Core model engine | Contribution inventory | Inventory workspace/package/described contrib evidence for an app | `GET /v1/projects/:projectId/apps/:appId/inventory`, `inventory contribs`, `runner.inventoryContribs` | Persisted Blob-backed inventory artifact, evidence source classification, confidence scoring, helper/graph parity tests | V1 | Implemented | Inventory now resolves workspace modules, vendored trees, descriptor search roots, and Go module cache packages, and carries confidence/module/package/version evidence |
| Core model engine | Contribution catalog | Catalog installed and referenced contribs | `flogo_catalog_contribs`, `GET /v1/projects/:projectId/apps/:appId/catalog` | Alias/ref normalization, descriptor-source diagnostics, persisted Blob-backed catalog artifact | V1 | Implemented | Catalog is inventory-backed and exposes stronger descriptor/package evidence instead of opaque refs |
| Core model engine | Descriptor introspection | Inspect one trigger/activity/action descriptor | `flogo_introspect_descriptor`, `GET /v1/projects/:projectId/apps/:appId/descriptors?ref=...`, Go helper `inspect descriptor` | Descriptor normalization, evidence/source diagnostics, persisted Blob-backed descriptor artifact | V1 | Implemented | Public endpoint and helper path exist; metadata can still fall back to registry or inferred sources |
| Core model engine | Contribution evidence inspection | Inspect the full evidence chain and confidence for one contrib | `GET /v1/projects/:projectId/apps/:appId/contribs/evidence?ref=...`, Go helper `evidence inspect`, `runner.inspectContribEvidence` | Persisted Blob-backed evidence artifact, confidence/source/module/package metadata | V1 | Implemented | Evidence responses are inventory-backed and expose `confidence`, `modulePath`, `goPackagePath`, and discovery reason |
| Core model engine | Alias validation | Detect missing/invalid aliases and refs | `flogo_validate_aliases`, `GET /v1/projects/:projectId/apps/:appId/governance` | Semantic diagnostics plus persisted governance artifact | V1 | Implemented | Deterministic alias validation is inventory-backed and surfaced through categorized governance findings |
| Core model engine | Orphan/version governance | Detect orphaned refs and version drift | `flogo_validate_governance`, `GET /v1/projects/:projectId/apps/:appId/governance`, Go helper `governance validate` | Orphan diagnostics, alias issues, version findings, inventory summary, persisted Blob-backed governance artifact | V1 | Implemented | Governance is inventory-backed, version-aware, and now reflects package/version evidence quality as part of the result |
| Core model engine | Programmatic app composition | Compare JSON authoring with Core-native composition | `flogo_compare_json_vs_programmatic`, `POST /v1/projects/:projectId/apps/:appId/composition/compare`, Go helper `compose compare` | Structural/semantic parity check, hashes, differences, persisted Blob-backed comparison artifact | V1-V2 | Implemented | Implemented as a Core-oriented composition comparison probe with signature evidence level and coverage reporting; full generation remains a later concern |
| Data and mapping engine | Mapping classification | Distinguish literal/expression/object/array mappings | `flogo_validate_mappings`, `flogo_preview_mapping` | Mapping field classification, resolved path output, and diagnostics | V1 | Implemented | Mapping preview now returns structured field kinds, path metadata, and resolved values in both TS and helper paths |
| Data and mapping engine | Scope-aware mapping preview | Resolve `$flow`, `$activity[...]`, `$env`, `$property`, `$trigger` | `flogo_preview_mapping`, `POST /v1/projects/:projectId/apps/:appId/mappings/preview` | Preview result with unresolved-reference diagnostics, scope diagnostics, and coercion diagnostics | V1 | Implemented | Static mapping preview resolves all supported resolver scopes and emits deterministic scope diagnostics; runtime-backed mapping evaluation is tracked separately in Phase 3 |
| Data and mapping engine | Coercion suggestions | Suggest likely coercions for mismatched values | `flogo_suggest_coercions` | Deterministic warnings attached to preview/analysis | V1 | Implemented | Suggestions now combine descriptor-aware expected-type checks with heuristic numeric/boolean hints in both direct and helper-backed paths |
| Data and mapping engine | Property/environment planner | Suggest `$property` vs `$env` usage | `flogo_define_properties`, `flogo_plan_properties`, `GET /v1/projects/:projectId/apps/:appId/properties/plan` | Property usage analysis, undefined and unused refs, deployment profile recommendations, secret/plain env split | V1 | Implemented | Deployment-profile-aware planning and secret/plain env separation are now available through both direct analysis and helper-backed execution |
| Data and mapping engine | Runtime mapping evaluation | Evaluate mappings against real flow runtime state | future runtime trace/replay tools | Trace-backed evidence | V3 | Planned | Deferred until replay/runtime phase |
| Platform support | Analysis artifact persistence | Persist app-analysis payloads durably | `GET /catalog`, `GET /descriptors`, `GET /governance`, `GET /properties/plan`, `POST /composition/compare`, `POST /mappings/preview`, `POST /mappings/test`, `GET /artifacts` | Blob/Azurite-backed JSON payload plus Prisma metadata | V1 | Implemented | Inventory, catalog, descriptor, contribution-evidence, governance, composition-compare, mapping-preview, mapping-test, property-plan, flow-contract, Phase 2 plan/result artifacts, and run-trace/replay/run-comparison artifacts now persist payloads to storage |
| Flow design engine | Flow contract inference | Infer reusable input/output signatures | `flogo_infer_flow_contracts`, `GET /v1/projects/:projectId/apps/:appId/flows/contracts`, helper `flows contracts` | Flow-contract artifact, handler-usage analysis, helper/graph parity tests | V2 | Implemented | Implemented as metadata-first static analysis with handler and mapping inference, persisted `flow_contract` artifacts, and analysis-only orchestration support |
| Flow design engine | Subflow extraction | Extract repeated task sequences into subflows | `flogo_extract_subflow`, `POST /v1/projects/:projectId/apps/:appId/flows/extract-subflow`, helper `flows extract-subflow` | Contract-preserving graph diff, validate-only plan artifacts, persisted extraction result artifacts, helper/graph/runner tests | V2 | Implemented | Implemented for explicit contiguous linear task selections only, with deterministic contract derivation, validate-only planning, direct mutation support, and persisted `subflow_extraction_plan` / `subflow_extraction_result` artifacts |
| Flow design engine | Subflow inlining | Inline reusable flows back into parent flow | `flogo_inline_subflow`, `POST /v1/projects/:projectId/apps/:appId/flows/inline-subflow`, helper `flows inline-subflow` | Graph diff plus contract checks, validate-only plan artifacts, persisted inlining result artifacts, helper/graph/runner tests | V2 | Implemented | Implemented for same-app linear subflow invocations only, with deterministic task ID prefixing, optional unused-flow cleanup, validate-only planning, and persisted `subflow_inlining_plan` / `subflow_inlining_result` artifacts |
| Flow design engine | Trigger polymorphism | Bind one flow to REST, timer, CLI, or channel | `flogo_bind_trigger`, `POST /v1/projects/:projectId/apps/:appId/triggers/bind`, helper `triggers bind` | Trigger-profile validation, auto-generated handler mappings, persisted plan/result artifacts, helper/graph/runner tests | V2 | Implemented | Implemented for REST, Timer, CLI, and Channel profiles with validate-only planning, direct mutation support, and deterministic auto-mapping; current runtime-backed support is now available for REST, Timer, and one narrow CLI slice, Channel remains deferred, and richer timer/channel input support remains a later refinement |
| Advanced pattern engine | Iterator synthesis | Add iterator constructs and loop plans | `flogo_add_iterator`, `POST /v1/projects/:projectId/apps/:appId/flows/add-iterator`, helper `flows add-iterator` | Graph validation, validate-only plan artifacts, persisted result artifacts, helper/graph/runner tests | V2 | Implemented | Implemented for single activity-backed and same-app subflow invocation tasks, with deterministic iterate/accumulate synthesis and conflict handling |
| Advanced pattern engine | Retry policy synthesis | Add retry-on-error patterns | `flogo_add_retry_policy`, `POST /v1/projects/:projectId/apps/:appId/flows/add-retry-policy`, helper `flows add-retry-policy` | Control-flow validation, validate-only plan artifacts, persisted result artifacts, helper/graph/runner tests | V2 | Implemented | Implemented as `settings.retryOnError` synthesis for plain, iterator, doWhile, and subflow invocation tasks with replaceExisting semantics |
| Advanced pattern engine | Repeat/doWhile synthesis | Add repeat-on-true or doWhile structures | `flogo_add_dowhile`, `POST /v1/projects/:projectId/apps/:appId/flows/add-dowhile`, helper `flows add-dowhile` | Graph validation, validate-only plan artifacts, persisted result artifacts, helper/graph/runner tests | V2 | Implemented | Implemented for plain activity-backed and same-app subflow invocation tasks with deterministic condition/delay/accumulate synthesis and iterator compatibility checks |
| Advanced pattern engine | Error-path templates | Add default failure-handling branches | `flogo_add_error_path`, `POST /v1/projects/:projectId/apps/:appId/flows/add-error-path`, helper `flows add-error-path` | Typed-link graph validation, validate-only plan artifacts, persisted result artifacts, helper/graph/runner tests | V2 | Implemented | Implemented for single-task `log_and_continue` and `log_and_stop` templates on supported linear flows with generated `#log` tasks, typed expression/dependency links, and replaceExisting semantics |
| Flow runtime engine | Run trace capture | Capture per-step execution evidence | `flogo_capture_run_trace`, `POST /v1/projects/:projectId/apps/:appId/flows/trace`, helper `flows trace` | Persisted `run_trace_plan` / `run_trace` artifacts, helper/graph/runner tests | V3 | Partial | Direct trace capture now has four narrow runtime-backed helper slices: the original direct-flow independent-action path, one REST trigger-driven path for supported static REST handlers, one CLI command-entry slice, and one timer runtime-startup partial slice for timer-bound flows. All supported slices persist `trace.evidenceKind = "runtime_backed"` / `artifact.metadata.traceEvidenceKind`, recorder-backed `flowStart` / `flowDone` / `snapshots` / `steps`, task events, and normalized per-step evidence in `runtimeEvidence.normalizedSteps` where observable; unsupported shapes still fall back to simulation |
| Flow runtime engine | Replay | Re-run flows with original or overridden inputs | `flogo_replay_run`, `POST /v1/projects/:projectId/apps/:appId/flows/replay`, helper `flows replay` | Persisted `replay_plan` / `replay_report` artifacts, helper/graph/runner tests | V3 | Partial | Replay now uses the same narrow runtime-backed direct-flow slice as direct trace when the flow shape is eligible, plus the supported REST trigger slice when the replay artifact is REST-backed, the supported CLI command-entry slice when the replay artifact is CLI-backed, and the narrow timer startup partial slice when timer evidence is present, with explicit base input or stored `run_trace` input, deep override merge, validate-only planning, and persisted replay artifacts; the supported slices keep the same normalized per-step runtime evidence in the nested trace, and unsupported shapes remain helper-generated simulated fallback |
| Flow runtime engine | Normalized runtime step evidence | Normalize recorder-backed step evidence for compare-runs | `flogo_capture_run_trace`, `flogo_replay_run`, `flogo_compare_runs` | `runtimeEvidence.normalizedSteps`, recorder-backed flow inputs/outputs, normalized-runtime comparison basis | V3 | Partial | Available on the narrow runtime-backed direct-flow slice plus the supported REST trigger trace slice. Compare-runs now prefers `normalized_runtime_evidence` when both artifacts provide normalized step evidence, and otherwise falls back to recorder-backed, nested-trace, or replay-summary payloads |
| Flow runtime engine | REST replay | Re-run one narrow REST trigger slice through the live REST boundary | `flogo_replay_run`, `POST /v1/projects/:projectId/apps/:appId/flows/replay`, helper `flows replay` | `runtimeEvidence.restTriggerRuntime`, mapped flow inputs/outputs, recorder-backed trace artifacts | V3 | Partial | Implemented for the same narrow REST slice as trace only: static-path `POST`/`PUT`/`PATCH` handlers with explicit request/reply mappings; unsupported REST shapes still fall back to direct-flow runtime or simulation |
| Flow runtime engine | REST envelope comparison | Compare REST request/reply envelopes when both runs are REST runtime-backed | `flogo_compare_runs`, `POST /v1/projects/:projectId/apps/:appId/flows/compare-runs`, helper `flows compare-runs` | request envelope, mapped flow input, reply envelope, comparison-basis metadata | V3 | Partial | Comparison remains artifact-backed and only prefers REST envelope comparison when both artifacts carry REST runtime-backed evidence; otherwise it falls back to normalized runtime, recorder-backed, nested-trace, or replay-summary payloads |
| Flow runtime engine | Timer runtime startup | Capture timer-trigger startup evidence and compare it directly | `flogo_capture_run_trace`, `flogo_replay_run`, `flogo_compare_runs`, `POST /v1/projects/:projectId/apps/:appId/flows/trace`, helper `flows trace` | `runtimeEvidence.timerTriggerRuntime`, timer settings, mapped flow input/output, observed tick evidence, `timer_runtime_startup` comparison basis | V3 | Partial | Implemented only as a narrow timer-bound same-flow slice; it records `runtimeEvidence.timerTriggerRuntime` with `kind`, `settings`, mapped flow I/O, and observed tick evidence when available, and compare-runs can prefer `timer_runtime_startup` when both artifacts are timer runtime-backed. Channel remains deferred |
| Flow runtime engine | Run comparison | Compare state/output deltas between runs | `flogo_compare_runs`, `POST /v1/projects/:projectId/apps/:appId/flows/compare-runs`, helper `flows compare-runs` | Persisted `run_comparison_plan` / `run_comparison` artifacts, helper/graph/runner tests | V3 | Partial | Comparison remains artifact-backed across stored `run_trace` and `replay_report` payloads with task-id pairing, summary/step/state diffs, and Blob-backed artifacts, and it now prefers normalized runtime evidence when both artifacts provide it, exposing the selected comparison basis plus normalized per-step inputs, outputs, and state deltas where observable; REST envelope comparison is preferred only when both artifacts are REST runtime-backed, and timer runtime startup comparison is preferred when both artifacts carry timer runtime evidence |
| Flow runtime engine | Runtime-backed debugging | Use trace/replay to prove fixes | debug workflow extension | Root cause + proof + minimal patch | V3 | Partial | Narrow runtime-backed proof now exists for the supported direct-flow slice plus one REST trigger-driven slice, one CLI command-entry slice, and a narrow timer runtime-startup partial slice, but broad debugging parity, trigger-profile coverage beyond those slices, replay from every live trigger boundary, and generalized runtime state capture remain later work |
| Flow runtime engine | REST trigger runtime startup | Start a real REST trigger and capture request/reply evidence | `flogo_capture_run_trace`, `POST /v1/projects/:projectId/apps/:appId/flows/trace`, helper `flows trace` | Runtime-backed `restTriggerRuntime` request/reply evidence, mapped flow inputs/outputs, recorder-backed trace artifacts | V3 | Partial | Implemented for one narrow REST slice only: static-path `POST`/`PUT`/`PATCH` handlers with explicit request/reply mappings targeting the helper-supported same-flow runtime slice. Replay uses the same narrow REST slice, and other trigger profiles and unsupported REST shapes still fall back to direct-flow runtime or simulation |
| Flow runtime engine | CLI trigger runtime startup | Start a real CLI trigger command and capture command/reply evidence | `flogo_capture_run_trace`, `flogo_replay_run`, `POST /v1/projects/:projectId/apps/:appId/flows/trace`, helper `flows trace` | Runtime-backed `cliTriggerRuntime` command/args/flags evidence, mapped flow input, reply/stdout evidence, recorder-backed trace artifacts | V3 | Partial | Implemented for one narrow CLI slice only: one supported command-entry handler with official CLI trigger parsing, supported flag descriptors, explicit args/flags mappings, and recorded reply/stdout evidence. Replay uses the same narrow CLI slice, and unsupported CLI shapes still fall back to direct-flow runtime or simulation |
| Contribution factory | Activity scaffolding | Scaffold custom activity bundles | `flogo_scaffold_activity` | Descriptor + Go source + contrib validation | V4 | Planned | Placeholder only; not implemented beyond roadmap text |
| Contribution factory | Trigger scaffolding | Scaffold custom trigger bundles | `flogo_scaffold_trigger` | Descriptor + Go source + contrib validation | V4 | Planned | Placeholder only; not implemented beyond roadmap text |
| Contribution factory | Action scaffolding | Scaffold custom action bundles | `flogo_scaffold_action` | Descriptor + Go source + contrib validation | V4 | Planned | Placeholder only; not implemented beyond roadmap text |
| Contribution factory | Contribution validation/build/test | Validate generated contrib bundles | `flogo_validate_contrib`, contrib build/test jobs | Runner build/test evidence | V4 | Planned | Placeholder only; no end-to-end contrib validation/build/test flow yet |
| Flogo-native testing | Mapping resolution tests | Dedicated mapping correctness tests | `POST /v1/projects/:projectId/apps/:appId/mappings/test`, helper `mapping test` | Deterministic pass/fail result, expected-vs-actual diff, persisted Blob-backed test artifact | V1 | Implemented | Uses the same static mapping engine as preview and adds a first-class mapping test artifact |
| Flogo-native testing | Flow contract tests | Contract tests for reusable flows | future `POST /v1/tests/flow` | Flow I/O assertions | V2 | Planned | Not started |
| Flogo-native testing | Replay tests | Verify behavior across replay paths | `POST /v1/projects/:projectId/apps/:appId/flows/replay`, helper `flows replay` | Replay plan/report artifacts and targeted helper/graph/runner tests | V3 | Implemented | Replay behavior is covered through focused graph preflight, control-plane replay, and runner/helper regression tests and now feeds the run-comparison slice |
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
- `flogo_plan_properties`
- `flogo_test_mapping`

### Phase 2 target tools

- `flogo_infer_flow_contracts`
- `flogo_bind_trigger`
- `flogo_extract_subflow`
- `flogo_inline_subflow`
- `flogo_add_iterator`
- `flogo_add_retry_policy`
- `flogo_add_dowhile`
- `flogo_add_error_path`

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
