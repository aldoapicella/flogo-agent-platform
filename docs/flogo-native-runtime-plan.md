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

- implemented with current limitations

Implemented in repo:

- flow contract inference exposed through direct app-analysis APIs, helper-backed analysis commands, persisted `flow_contract` artifacts, and analysis-only orchestration support,
- trigger polymorphism for REST, Timer, CLI, and Channel profiles through direct trigger-binding APIs, helper-backed planning, runner/orchestrator support, and persisted `trigger_binding_plan` / `trigger_binding_result` artifacts,
- subflow extraction and inlining for explicit contiguous linear task selections through direct flow-refactor APIs, helper-backed planning, runner/orchestrator support, and persisted `subflow_extraction_plan` / `subflow_extraction_result` / `subflow_inlining_plan` / `subflow_inlining_result` artifacts,
- iterator synthesis through direct control-flow APIs, helper-backed planning, runner/orchestrator support, and persisted `iterator_plan` / `iterator_result` artifacts,
- retry-on-error synthesis through direct control-flow APIs, helper-backed planning, runner/orchestrator support, and persisted `retry_policy_plan` / `retry_policy_result` artifacts,
- doWhile synthesis through direct control-flow APIs, helper-backed planning, runner/orchestrator support, and persisted `dowhile_plan` / `dowhile_result` artifacts,
- error-path templates through direct control-flow APIs, typed-link graph rewrites, helper-backed planning, runner/orchestrator support, and persisted `error_path_plan` / `error_path_result` artifacts,
- deterministic profile-aware auto-mapping for REST request/reply defaults, CLI args/flags defaults, Channel data mapping, and zero-required-input enforcement for Timer flows in this slice.

Current limitations:

- subflow extraction and inlining are currently limited to explicit contiguous linear selections and same-app linear invocations,
- trigger polymorphism is currently limited to REST, Timer, CLI, and Channel profiles,
- iterator, retry, doWhile, and error-path synthesis currently rely on deterministic templates rather than open-ended flow rewriting,
- complex multi-task loop refactors should still be normalized into a subflow first rather than forced into a single direct mutation step.

## Phase 3: Runtime-aware debugging

Focus:

- trace capture,
- replay,
- state diffs,
- failure localization with runtime proof.

Current status:

- implemented in mixed form: direct trace capture now has a narrow runtime-backed helper path with recorder-backed evidence on one supported same-flow scenario, REST trace/replay share one narrow live trigger-backed slice, timer startup has a narrow partial slice, CLI trace/replay share one narrow command-entry slice, Channel trace/replay share one narrow internal-event slice, run comparison prefers richer runtime artifacts, REST envelope evidence, timer startup evidence, or Channel boundary evidence when both sides provide them while preserving fallback behavior elsewhere, and the agent can now run a recommendation-oriented diagnosis loop over that evidence without applying fixes automatically.

Implemented in repo:

- helper-backed runtime trace capture exposed through direct APIs, persisted `run_trace_plan` / `run_trace` artifacts, and analysis-only orchestration support,
- direct `flows trace` now attempts a narrow [Project Flogo](https://tibcosoftware.github.io/flogo/introduction/) [Core](https://pkg.go.dev/github.com/project-flogo/core) / [Flow](https://github.com/project-flogo/flow) runtime path for simple same-flow `#log` activity traces by executing a flow through the helper's in-process independent-action path, official flow/task runtime events, and the official Flow state recorder interface,
- REST `flows trace` now starts the official REST trigger for one narrow supported slice, captures request, mapped flow input/output, recorder-backed evidence, normalized per-step evidence, and reply metadata, and persists it in `runtimeEvidence.restTriggerRuntime`,
- CLI `flows trace` now starts one narrow supported command-entry slice through the official Flogo CLI trigger, captures command identity, args, flags, mapped flow input, recorder-backed evidence, normalized per-step evidence, and CLI reply metadata, and persists it in `runtimeEvidence.cliTriggerRuntime`,
- timer runtime startup is now captured for one narrow timer-bound slice, persisting `runtimeEvidence.timerTriggerRuntime` with settings, mapped flow input/output, and observed tick evidence when the helper can see them,
- helper-backed replay exposed through direct APIs, persisted `replay_plan` / `replay_report` artifacts, and analysis/execution orchestration support,
- helper-backed run comparison exposed through direct APIs, persisted `run_comparison_plan` / `run_comparison` artifacts, and analysis/execution orchestration support,
- replay from either explicit base input or a previously stored `run_trace` artifact input,
- deep override merging for replay inputs with deterministic preflight validation in `packages/flogo-graph`,
- narrow runtime-backed replay for the same supported direct-flow slice as runtime-backed trace, plus one narrow REST-backed replay slice and one narrow CLI-backed replay slice, with replay evidence labeled separately through `result.runtimeEvidence.runtimeMode` values,
- helper/runtime parity for replay request handling, structured failed-replay summaries, persisted replay artifacts, and task-id-paired run-comparison diffs across `run_trace` and `replay_report` payloads,
- run comparison preference for normalized runtime artifacts when both sides provide them, REST envelope comparison when both artifacts are REST runtime-backed, timer startup comparison when both artifacts carry timer runtime evidence, additive comparison-basis metadata, and fallback to recorder-backed or summary/nested-trace artifacts when they do not.

Current limitations:

- the runtime-backed trace slice is intentionally narrow: it currently covers the helper's supported direct-flow slice plus one narrow REST trigger-driven slice, one narrow CLI command-entry slice, and one narrow Channel internal-event slice, and it still does not provide broad runtime parity across trigger profiles or flow shapes yet,
- the runtime-backed replay slice is intentionally narrow: it currently covers the helper's supported direct-flow slice plus one narrow REST trigger-driven slice, one narrow CLI command-entry slice, and one narrow Channel internal-event slice, and it still does not provide broad runtime parity across trigger profiles or flow shapes yet,
- the timer runtime-backed slice is intentionally narrow: it currently covers one timer-bound same-flow startup scenario, and it still does not provide broad runtime parity across trigger profiles or flow shapes yet,
- the Channel runtime-backed slice is intentionally narrow: it currently covers one named internal engine channel and does not yet generalize to broader channel topologies or multi-channel workflows,
- the current runtime-backed path uses official Flow/Core execution plus flow/task runtime events and recorder-backed flow start/done, snapshots, and steps, and the supported slice now projects that into normalized per-step evidence with resolved inputs/outputs when observable plus explicit unavailable-field markers when not,
- unsupported trace topologies fall back to `trace.evidenceKind = "simulated_fallback"` rather than failing outright,
- replay is runtime-backed for that same supported direct-flow slice and the supported REST, timer, CLI, and Channel slices, and falls back to simulated/helper-backed replay elsewhere,
- run comparison still works from persisted artifacts rather than a live engine tap; it now prefers normalized runtime evidence when available, can compare REST request/reply envelopes when both artifacts are REST runtime-backed, can compare timer startup evidence when both artifacts carry timer runtime evidence, can compare Channel boundary evidence when both artifacts carry Channel runtime evidence, falls back to recorder-backed evidence next, and still falls back to nested trace or replay-summary payloads for unsupported slices.

## Phase 3.4: REST trigger startup boundary

Focus:

- REST trigger-driven runtime startup,
- request-to-flow mapping evidence,
- flow-to-reply mapping evidence.

Current status:

- partially implemented: direct trace now has one narrow real REST trigger runtime-backed slice in addition to the existing direct-flow slice, REST replay is live for the same narrow supported REST slice, and broader trigger runtime coverage remains later work

Implemented in repo:

- REST trigger binding and profile planning with deterministic request/reply mapping defaults,
- trigger plan/result artifacts for REST, Timer, CLI, and Channel profiles,
- helper-backed REST trigger binding validation and mutation support,
- direct `flows trace` can now start one supported REST trigger through the official Flogo REST trigger runtime, send an actual HTTP request, and capture request, mapped flow input/output, recorder-backed flow evidence, normalized per-step evidence, and reply metadata in `runtimeEvidence.restTriggerRuntime`,
- direct `flows replay` can now re-run the same supported REST slice through the official REST trigger runtime and preserve the same request, mapped flow input/output, and reply evidence in the nested trace.

Current limitations:

- the REST trigger runtime slice is intentionally narrow: static paths only, supported methods limited to `POST`, `PUT`, and `PATCH`, explicit request/reply mappings, and the same helper-supported compiled activity allowlist used by the direct-flow runtime slice,
- unsupported REST shapes fall back to the direct-flow runtime slice when eligible and otherwise to `trace.evidenceKind = "simulated_fallback"`,
- compare remains artifact-backed; it can only diff REST request/reply envelopes when both artifacts are REST runtime-backed, and otherwise falls back to normalized runtime or recorder-backed comparison.

## Phase 3.5: REST replay and REST envelope comparison

Focus:

- replay the same supported REST trigger slice through the live REST boundary,
- compare REST request and reply envelopes only when both artifacts are REST runtime-backed,
- keep the same fallback behavior for unsupported shapes.

Current status:

- partially implemented: supported REST replay is now live for the same narrow REST trigger slice, and compare-runs can prefer REST envelope comparison when both artifacts are REST runtime-backed.

Implemented in repo:

- REST replay captures request envelope evidence, mapped flow input, recorder-backed flow evidence, normalized per-step evidence, flow output, and reply envelope evidence for the same narrow REST slice used by trace,
- compare-runs can compare request method/path/query/headers/body/path params, mapped flow input, and reply status/body/headers/cookies when both artifacts are REST runtime-backed,
- comparison basis metadata now distinguishes REST envelope comparison from the existing normalized-runtime and recorder-backed comparison modes.

Current limitations:

- REST replay is still intentionally narrow and limited to the same static-path `POST`/`PUT`/`PATCH` slice used by REST trace,
- REST envelope comparison only applies when both artifacts are REST runtime-backed; mixed or unsupported artifacts still use the existing artifact-backed fallback paths,
- other trigger profiles remain unsupported or simulated in the runtime-debugging path.

## Phase 3.6: Timer runtime startup

Focus:

- timer trigger startup,
- timer settings and tick evidence,
- timer-aware replay and comparison.

Current status:

- partially implemented: direct trace, replay, and compare-runs now carry a narrow timer runtime-backed slice for timer-bound same-flow startup, recording `runtimeEvidence.timerTriggerRuntime` when the helper can observe timer settings, mapped flow input/output, and the first tick; compare-runs uses `timer_runtime_startup` when both artifacts carry timer runtime evidence.

Implemented in repo:

- direct `flows trace` can capture timer startup evidence in `runtimeEvidence.timerTriggerRuntime` for the narrow supported slice and persists the corresponding artifact metadata,
- direct `flows replay` preserves the same timer runtime evidence through nested traces,
- direct `flows compare-runs` prefers `timer_runtime_startup` when both artifacts are timer runtime-backed and surfaces `timerComparison` diffs for settings, flow input, flow output, and tick evidence,
- the shared control-plane and runner metadata now record timer runtime evidence presence, kind, run mode, timing settings, and observed tick state.

Current limitations:

- this slice is intentionally narrow and does not cover CLI or Channel trigger profiles,
- timer support still does not imply broader live engine parity beyond the supported same-flow startup slice,
- unsupported timer shapes still fall back to the existing direct-flow/runtime or simulated paths.

## Phase 3.7: CLI runtime startup

Focus:

- CLI trigger startup,
- command/args/flags evidence,
- narrow CLI-backed replay.

Current status:

- partially implemented: direct trace and replay now carry one narrow CLI runtime-backed slice for command-entry startup, recording `runtimeEvidence.cliTriggerRuntime` when the helper can observe command identity, args, flags, mapped flow input, and CLI reply evidence.

Implemented in repo:

- direct `flows trace` can capture CLI command-entry evidence in `runtimeEvidence.cliTriggerRuntime` for the narrow supported slice and persists the corresponding artifact metadata,
- direct `flows replay` preserves the same CLI runtime evidence through nested traces for that same narrow supported slice,
- the shared control-plane and runner metadata now record CLI runtime evidence presence, kind, command identity, `singleCmd`, args/flags presence, mapped flow input/output presence, and CLI reply presence.

Current limitations:

- this slice is intentionally narrow and only covers one command-entry scenario through the helper-supported CLI trigger path,
- CLI comparison remains on the existing normalized-runtime or recorder-backed comparison bases rather than a dedicated CLI envelope basis,
- the helper-supported CLI slice still does not generalize to every command parsing or reply shape,
- unsupported CLI shapes still fall back to the existing direct-flow/runtime or simulated paths.

## Phase 3.8: Channel runtime startup

Focus:

- Channel trigger startup,
- channel/data evidence,
- narrow Channel-backed replay.

Current status:

- partially implemented: direct trace and replay now carry one narrow Channel runtime-backed slice for internal-event startup, recording `runtimeEvidence.channelTriggerRuntime` when the helper can observe the named channel, sent data, mapped flow input, and flow output evidence.

Implemented in repo:

- direct `flows trace` can capture Channel boundary evidence in `runtimeEvidence.channelTriggerRuntime` for one supported named engine channel slice and persists the corresponding artifact metadata,
- direct `flows replay` preserves the same Channel runtime evidence through nested traces for that same narrow supported slice,
- the shared control-plane and runner metadata now record Channel runtime evidence presence, kind, channel name, sent-data presence, mapped flow input/output presence, and Channel comparison basis metadata when both sides are Channel-backed.

Current limitations:

- this slice is intentionally narrow and only covers one named internal engine channel through the helper-supported Channel trigger path,
- Channel comparison remains on the helper-supported `channel_runtime_boundary` basis rather than a broader channel envelope comparison,
- unsupported Channel shapes still fall back to the existing direct-flow/runtime or simulated paths.

## Phase 3.9: Runtime-evidence eval suite

Focus:

- dedicated runtime-evidence eval coverage,
- trigger-family-aware regression checks,
- fallback and comparison-basis assertions for the current runtime slices.

Current status:

- implemented in repo: the eval package now carries a dedicated runtime-evidence corpus for the existing direct-flow, REST, timer, CLI, and Channel runtime slices plus representative unsupported-shape fallbacks, with machine-readable expectations for evidence kind, runtime mode, replay behavior, normalized step availability, and comparison-basis preference.

## Phase 3.10: Web-console runtime-evidence UX

Focus:

- expose runtime evidence, fallback, and comparison basis on task detail pages,
- render trigger-family-specific runtime summaries without inventing unavailable data,
- keep the UI faithful to the current narrow backend slices.

Current status:

- implemented in repo: the web console task detail page now surfaces runtime evidence kind, runtime mode, fallback reason, normalized steps, compare basis, and trigger-specific panels for the supported REST, timer, CLI, and Channel slices while preserving honest unavailable-field handling.

## Phase 3.11: Agent diagnosis loop v1

Focus:

- choose the narrowest useful proof path across validation, mapping, contracts, trace, replay, and compare,
- summarize runtime/static evidence into a structured diagnosis,
- recommend a minimal patch with explicit confidence and evidence quality,
- stay recommendation-only rather than auto-fixing repository code.

Current status:

- partially implemented: analysis-only tasks can now request `inputs.mode = "diagnosis"` to run a typed diagnosis planner over validation, mapping preview/test, flow-contract analysis, trigger-binding analysis, trace, replay, and compare on the current supported slices,
- the runner persists a `diagnosis_report` artifact with problem category, subtype, supporting evidence references, recommended next action, recommended patch, confidence, evidence quality, and related artifact IDs,
- the task-detail UI now renders a diagnosis summary from that artifact, and the eval package now carries a dedicated diagnosis-focused corpus plus confidence-band calibration checks for direct-flow, REST, timer, CLI, and Channel diagnosis cases,
- the diagnosis surface remains summary-first rather than a full operator workbench.

Current limitations:

- the diagnosis loop is additive and recommendation-oriented only; it does not auto-apply patches or replace existing mutation flows,
- confidence is intentionally calibrated down when the proof path lands on simulated fallback, artifact-backed-only comparison, mixed evidence, contract-only inference, or insufficient runtime evidence,
- diagnosis quality is still bounded by the current narrow runtime-backed slices and the available static evidence for each trigger family.

## Phase 3.12: Diagnosis evals and confidence calibration

Focus:

- add a diagnosis-specific eval corpus for the current trigger families,
- verify stable problem categories, evidence quality, confidence bands, and recommendation shape,
- make confidence conservative when the proof path is mixed, simulated, artifact-backed-only, or unsupported.

Current status:

- implemented in repo: `packages/evals` now carries dedicated diagnosis cases for direct-flow, REST, timer, CLI, and Channel, including representative unsupported-shape fallback coverage,
- `packages/flogo-graph` now calibrates diagnosis confidence against runtime-backed vs mixed vs artifact-backed vs simulated evidence, fallback detection, and contract-inference-only proofs,
- targeted graph/planner/runner/web-console tests now assert stable diagnosis payload shape, confidence boundaries, and fallback-aware caveats.

## Phase 3.2: Recorder-backed evidence foundation

Focus:

- attach a `flow/state.Recorder` implementation to the existing helper runtime path,
- capture recorder-backed snapshots and steps on the same supported runtime-backed slice,
- add a narrow real replay path for that same slice,
- keep simulated fallback for unsupported shapes and preserve comparison fallback behavior.

Current status:

- partially implemented: recorder-backed trace evidence now covers the supported direct-flow slice plus the narrow REST trigger trace and replay slices, while narrow runtime-backed replay and recorder-aware comparison preference remain landed for the supported direct-flow slice; broader replay/runtime parity remains later work

References:

- [Recorder interface](https://github.com/project-flogo/flow/blob/v1.6.24/state/recorder.go)
- [Core API](https://github.com/project-flogo/core/blob/v1.6.17/api/api.go)
- [Flow action/runtime](https://github.com/project-flogo/flow/blob/v1.6.24/action.go)

## Phase 3.3: Normalized runtime step evidence

Focus:

- normalize recorder-backed `flowStart`, `flowDone`, `snapshots`, and `steps` evidence into `runtimeEvidence.normalizedSteps` for the currently supported runtime-backed slices,
- prefer normalized runtime artifacts when compare-runs can use them on both sides, and prefer REST request/reply envelope comparison when both sides are REST runtime-backed,
- keep the same fallback behavior for unsupported shapes and replay summaries without recorder-backed trace data.

Current status:

- partially implemented: the supported runtime-backed slices now preserve normalized per-step evidence in `runtimeEvidence.normalizedSteps` and compare-runs prefers that evidence when both artifacts provide it, but the helper still does not provide broad runtime coverage across trigger families

References:

- [Recorder interface](https://github.com/project-flogo/flow/blob/v1.6.24/state/recorder.go)
- [Core package](https://pkg.go.dev/github.com/project-flogo/core)
- [Flow repository](https://github.com/project-flogo/flow)

## Phase 4: Extension-aware contribution authoring

Focus:

- activity/trigger/action scaffolding,
- version governance,
- contrib build/test/package flows,
- install/update workflows.

Current status:

- partially implemented in three narrow scaffold slices plus six shared authoring-generalization slices: custom Activity scaffolding, custom Trigger scaffolding, and a narrower custom Action scaffolding slice now exist as analysis-oriented task modes that generate descriptor metadata plus Go/module/test/readme files, shared `validate_contrib` / `package_contrib` task modes can now re-run proof and package one existing scaffold bundle reviewably, `install_contrib_plan` can now analyze one existing bundle/package against one target app reviewably, `install_contrib_diff_plan` can now materialize the exact canonical `flogo.json` preview for one existing install plan without mutating the target app, `install_contrib_apply` can now consume that exact diff preview review-gated and write the saved canonical mutation to one target app, and `update_contrib_plan` can now analyze one existing installed contribution conservatively without mutating the target app,
- the resulting `contrib_bundle`, `contrib_validation_report`, `contrib_package`, `contrib_install_plan`, `contrib_install_diff_plan`, `contrib_install_apply_result`, `contrib_update_plan`, `flogo_json`, `build_log`, and `test_report` artifacts are now persisted through the control-plane task pipeline and uploaded through the Blob/Azurite storage seam used for app-analysis payloads,
- `install_contrib_plan` is now implemented as an analysis-only Phase 4.5 slice that inspects one existing bundle/package against one target app and emits a reviewable predicted install without mutating `flogo.json`,
- `install_contrib_diff_plan` is now implemented as an analysis-only Phase 4.6 slice that consumes one prior install plan, validates that the target app still matches the planning basis, and emits the exact canonical diff preview without mutating `flogo.json`,
- `install_contrib_apply` is now implemented as the narrow Phase 4.7 review-gated install/apply slice that consumes one prior exact diff preview, revalidates drift, writes the exact saved canonical mutation to `flogo.json`, and persists both an apply-result artifact and the resulting canonical app output,
- `update_contrib_plan` is now implemented as the narrow Phase 4.8 analysis-only slice that inspects one existing bundle/package against one target app, detects an already installed contribution match conservatively, and emits a reviewable update plan without mutating `flogo.json`,
- exact update diff/apply flows and automatic install/update into apps remain later work.

## Current Implementation Baseline

The current codebase has a completed Phase 1 foundation, an implemented Phase 2 design surface with the limitations noted above, a partially runtime-backed Phase 3 runtime-evidence surface with a landed Phase 3.2 recorder-backed/narrow-replay foundation on one supported slice, and a narrow Phase 4 Activity/Trigger/Action authoring foundation plus shared validate/package/install-plan/install-diff-plan/install-apply/update-plan groundwork rather than only placeholders.

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
Analysis-only planner modes:
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
- `inputs.mode = "activity_scaffold"`
- `inputs.mode = "action_scaffold"`
- `inputs.mode = "trigger_scaffold"`
- `inputs.mode = "validate_contrib"`
- `inputs.mode = "package_contrib"`
- `inputs.mode = "install_contrib_plan"`
- `inputs.mode = "install_contrib_diff_plan"`
- `inputs.mode = "update_contrib_plan"`
Review-gated mutating planner modes:
- `inputs.mode = "install_contrib_apply"`
Runner job kinds and execution steps for flow contracts, runtime trace capture, replay, run comparison, diagnosis, trigger binding, subflow extraction/inlining, iterator/retry/doWhile/error-path synthesis, inventory, catalog, contribution evidence, governance, composition comparison, mapping preview, and narrow Activity/Action/Trigger scaffold/validate/package/install-plan/install-diff-plan/install-apply/update-plan authoring
Go helper commands:
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
- `contrib scaffold-activity`
- `contrib scaffold-action`
- `contrib scaffold-trigger`
- `contrib validate`
- `contrib package`
- `contrib install-plan`
- `contrib install-diff-plan`
- `contrib install-apply`
- `contrib update-plan`

### Not implemented yet

- Core-native programmatic app composition
- broader contribution update/apply flows beyond the new Activity/Trigger/Action scaffold plus shared validate/package/install-plan/install-diff-plan/install-apply foundation
- deployment profile generation
- TensorFlow or specialized activity planning

## Implementation Tracker

Use this section as the working tracker for future implementation slices.

| Area | Scope | Status | Code reference | Next step |
| --- | --- | --- | --- | --- |
| Shared contracts | Inventory, descriptor, contribution-evidence, governance, composition, mapping-preview, mapping-test, property-plan, flow-contract, trigger-binding, subflow-refactor, advanced control-flow, run-trace, replay, run-comparison, diagnosis, and shared activity/action/trigger-authoring plus install-planning/diff-planning/apply contracts | Partial | `packages/contracts/src/index.ts` | Extend into explicit update/apply contracts later |
| Graph engine | Contribution inventory, catalog, evidence inspection, alias validation, governance validation, composition comparison, mapping preview, mapping tests, coercion suggestions, property planning, flow contract inference, trigger-binding planning/application, subflow extraction/inlining, iterator/retry/doWhile/error-path synthesis, run-trace/replay preflight validation, run-comparison diffing, and diagnosis report classification | Partial | `packages/flogo-graph/src/index.ts` | Deepen diagnosis-specific evidence ranking and classification coverage |
| Tool layer | Flogo core/mapping tools split plus flow-contract, trigger-binding, subflow-refactor, advanced control-flow dispatch, runtime trace dispatch, replay dispatch, run-comparison dispatch, diagnosis dispatch, and shared contribution scaffold/validate/package/install-plan/install-diff-plan/install-apply dispatch | Partial | `packages/tools/src/*.ts` | Add update/apply authoring tool modules later |
| Planner | Analysis-only modes, runtime trace/replay/run-comparison/diagnosis planning-execution routing, Flogo-aware step selection, and narrow activity/action/trigger scaffold plus shared validate/package/install-plan/install-diff-plan/install-apply authoring routes | Partial | `packages/agent/src/index.ts` | Expand authoring heuristics beyond the current scaffold families later |
| Control-plane APIs | Graph, inventory, catalog, descriptor inspection, contribution evidence inspection, flow contracts, runtime trace, replay, run comparison, trigger binding, subflow extraction/inlining, iterator/retry/doWhile/error-path synthesis, governance, composition comparison, mapping preview, mapping test, property plan, activity/action/trigger scaffold tasks, shared contribution validate/package/install-plan/install-diff-plan/install-apply tasks, app artifact listing | Partial | `apps/control-plane/src/modules/flogo-apps/*` | Add dedicated contribution-authoring APIs later if needed |
| Persistence | Prisma-backed task/event/artifact state plus hidden app-analysis records, Blob-backed analysis payloads, and Blob-backed contribution authoring bundle/validation/package/install-plan/install-diff-plan/install-apply payloads | Partial | `apps/control-plane/src/modules/agent/task-store.service.ts`, `apps/control-plane/src/modules/flogo-apps/app-analysis-storage.service.ts` | Extend Blob-backed storage to broader runtime/task artifacts beyond the current analysis and contribution-authoring slices |
| Runner-worker | Flow-contract, runtime trace, replay, run comparison, trigger-binding, subflow extraction/inlining, iterator/retry/doWhile/error-path synthesis, inventory, catalog, descriptor, contribution evidence, governance, composition comparison, mapping preview, mapping test, property-plan, diagnosis, and shared contribution scaffold/validate/package/install-plan/install-diff-plan/install-apply execution support | Partial | `apps/runner-worker/src/services/*` | Add update/apply authoring job kinds later |
| Go helper | Flow-contract, runtime trace, replay, run comparison, trigger-binding, subflow extraction/inlining, iterator/retry/doWhile/error-path synthesis, inventory, catalog, descriptor, contribution evidence, governance, composition comparison, mapping preview, mapping test, property planning, and shared Activity/Action/Trigger scaffold/validate/package/install-plan/install-diff-plan/install-apply execution | Partial | `go-runtime/flogo-helper/main.go` | Expand contribution authoring into reviewable update/apply workflows later |
| Web console | Task detail runtime-evidence inspection plus diagnosis-summary rendering for trace, replay, compare, diagnosis, and contribution authoring/install-plan artifacts | Partial | `apps/web-console` | Add richer compare workflows and a deeper diagnosis workbench |
| Eval coverage | Existing create/update/debug/review baseline plus dedicated runtime-evidence and diagnosis-confidence suites for the current real runtime slices and targeted Activity/Action/Trigger scaffold coverage | Partial | `packages/evals` | Add broader UI-facing workflow evals and later package/install authoring cases |

## Rules For Future Implementation Passes

When implementing a Flogo-native feature:

1. Update this plan first or as part of the same change.
2. Update [Capability Matrix](./capability-matrix.md) with phase, status, tools, and validation evidence.
3. If a public or internal interface changes, update [API reference](./api-reference.md).
4. If persistence or contracts change, update [Data model](./data-model.md).
5. If runtime behavior or service responsibilities change, update [Architecture](./architecture.md).
6. If the workflow for contributors changes, update [Development guide](./development.md).

## Recommended Next Slice

The next implementation slice after the current baseline should keep contribution authoring reviewable while moving from review-gated install/apply into explicit update/apply planning and later review-gated update workflows on top of the existing scaffold/validate/package/install-plan/install-diff-plan/install-apply lifecycle.

Recommended next items:

1. Add review-gated update/apply planning workflows that consume the existing install/apply artifacts without hiding the predicted canonical `flogo.json` mutations.
2. Keep update/apply additive and approval-oriented, and keep autonomous install/update behavior deferred until contribution artifacts, validation proof, and review workflows are broader and more explicit.
3. Add later authoring UX and update/apply previews only after the shared contribution lifecycle, install planning, exact diff preview, and review-gated install/apply remain stable.

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
