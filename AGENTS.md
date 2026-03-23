# AGENTS.md

## Purpose

This repository is building a Flogo-native AI agent for Flogo development and operations, not just a `flogo.json` editor or a generic backend platform.

The platform components in this repo exist to support that AI agent:

- analyze Flogo apps with evidence-backed static reasoning,
- diagnose runtime and mapping issues with trace/replay/compare plus static analysis,
- recommend minimal patches grounded in Flogo trigger, flow, and mapping semantics,
- and later help author and validate Flogo contributions.

Future agents working here should preserve that direction and use this file as a repo-specific operating guide.

## Core Rules

### 1. Treat `flogo.json` as canonical

Always treat `flogo.json` as the canonical stored artifact for:

- repository diffs
- user review
- task outputs
- policy review
- change summaries

Go/Core-based composition, introspection, and runtime logic are additive execution and validation paths. They do not replace `flogo.json` as the primary source of truth.

### 2. Use official Flogo references when needed

For any work involving TIBCO Flogo, always refer to the official Flogo documentation and source references when needed, especially for:

- app structure and `flogo.json`
- triggers, handlers, actions, and activities
- mappings, resolvers, and coercion behavior
- flow input/output contracts
- iterators, subflows, and control-flow patterns
- app properties and environment configuration
- Flogo Core and Flow package behavior

Preferred references:

- [Project Flogo introduction](https://tibcosoftware.github.io/flogo/introduction/)
- [Flogo Core package](https://pkg.go.dev/github.com/project-flogo/core)
- [Flogo Core data packages](https://github.com/project-flogo/core/tree/master/data)
- [Flow input/output parameters](https://tibcosoftware.github.io/flogo/development/flows/io-parameters/)
- [Project Flogo Flow repository](https://github.com/project-flogo/flow)
- [Iterator docs](https://tibcosoftware.github.io/flogo/development/flows/iterators/)
- [Mapping docs](https://tibcosoftware.github.io/flogo/development/flows/mapping/)
- [Property bag docs](https://tibcosoftware.github.io/flogo/development/flows/property-bag/)

When a Flogo behavior is ambiguous, prefer the official docs and source repos over assumptions.

### 3. Stay aligned with the Flogo-native roadmap

Before implementing new Flogo-native capabilities, read:

1. `docs/flogo-native-runtime-plan.md`
2. `docs/capability-matrix.md`
3. `docs/architecture.md`
4. `docs/api-reference.md`
5. `docs/data-model.md`

If your change affects the Flogo-native roadmap, update:

1. `docs/flogo-native-runtime-plan.md`
2. `docs/capability-matrix.md`
3. the affected operational docs
4. then the code

Do not let roadmap docs drift behind implementation.

## Repository-Specific Guidance

### Platform shape

Treat the deployables below as the execution surface for the AI agent, not as ends in themselves. Control-plane, orchestrator, runner-worker, web-console, and the Go helper should all move the repo toward a stronger Flogo development agent.

The primary deployables are:

- `apps/control-plane`
- `apps/orchestrator`
- `apps/runner-worker`
- `apps/web-console`

The Flogo-native helper path lives in:

- `go-runtime/flogo-helper`

Important shared packages:

- `packages/contracts`
- `packages/flogo-graph`
- `packages/tools`
- `packages/agent`

### Ownership boundaries

Keep the split consistent:

- TypeScript owns the control plane, orchestration, contracts, planner logic, persistence, and public APIs.
- Go owns Flogo-native helper execution inside finite runner paths.

Do not introduce a new always-on Go service unless there is a strong architectural reason and the roadmap/docs are updated accordingly.

### Current Flogo-native baseline

The repo has a completed Phase 1 foundation and has started Phase 2. Before adding new capability, understand what exists:

- flow contract inference
- trigger binding / trigger polymorphism
- subflow extraction / inlining
- iterator synthesis
- retry-on-error synthesis
- doWhile synthesis
- error-path templates
- contribution cataloging
- descriptor inspection
- governance validation
- composition comparison
- mapping preview
- deterministic mapping tests
- coercion suggestions
- profile-aware property/environment planning
- Blob/Azurite-backed app-analysis artifacts
- analysis-only orchestration modes
- direct trigger-binding mutation and validate-only planning
- direct advanced control-flow mutation and validate-only planning

Treat the Phase 1 Core/mapping foundation as implemented, the main Phase 2 design-time flow-pattern surface as implemented, and Phase 3 runtime trace capture, replay, and run comparison as implemented in mixed form with the current narrow REST-backed slices, a narrow timer runtime-startup partial slice, a narrow CLI command-entry partial slice, and a narrow Channel internal-event partial slice. The repo also now has a dedicated trigger-family-aware runtime-evidence eval suite, task-detail runtime-evidence inspection in the web console, a recommendation-oriented diagnosis loop that consumes trace/replay/compare plus static analysis evidence without auto-applying fixes, a dedicated diagnosis-focused eval/confidence-calibration layer, and a narrow Phase 4 activity/trigger/action authoring foundation that can scaffold one custom Flogo Activity, Trigger, or Action bundle, re-run shared validation/build/test proof for existing bundles, package validated bundles conservatively, emit reviewable install plans for target apps, produce exact canonical `flogo.json` diff previews for those plans, apply one approved exact contribution install diff to canonical `flogo.json`, and emit conservative installed-contribution update plans with durable `contrib_bundle` / `contrib_validation_report` / `contrib_package` / `contrib_install_plan` / `contrib_install_diff_plan` / `contrib_install_apply_result` / `contrib_update_plan` / `flogo_json` / `build_log` / `test_report` task artifacts. New Flogo-native work should generally target diagnosis hardening, operator-facing diagnosis UX, contribution authoring hardening, exact contribution update diff preview, and later review-gated contribution update/apply workflows unless the task is explicitly about hardening an existing capability.

Do not accidentally regress these while implementing later phases.

## Implementation Rules

### Prefer Flogo-native capability layers

When possible, implement features through:

- `packages/flogo-graph` for Flogo domain normalization and analysis
- `packages/tools` for capability-oriented tool wrappers
- `go-runtime/flogo-helper` for finite Flogo-native execution

Do not solve Flogo features purely with generic string manipulation if the platform already has a graph/tool/helper layer for that concern.

### Extend capabilities by phase

The intended progression is:

- Phase 1: Core-aware foundation
- Phase 2: Flow-aware design
- Phase 3: Runtime-aware debugging
- Phase 4: Extension-aware contribution authoring

Do not start a later-phase feature casually if the current work should still be finishing an earlier phase.

### Keep public APIs additive

Prefer:

- new additive endpoints
- richer `inputs.mode` values
- extended shared contracts

Avoid breaking existing task routes or replacing top-level task types unless absolutely necessary.

### Preserve analysis-only task behavior

Analysis-only modes should stop after analysis artifact publication. They should not schedule patch/build/smoke work unless the task is actually mutating behavior.

### Advanced control-flow note

The repo now supports direct synthesis for:

- iterators
- retry-on-error
- doWhile

Keep those aligned with the official Flogo iterator/control-flow semantics. If a requested loop spans multiple activity calls, prefer subflow extraction first rather than forcing a multi-task iterator into one direct mutation step.

## Validation and Testing

### Verification order

Preferred verification flow:

1. `pnpm typecheck`
2. targeted Vitest for changed packages/apps
3. `go build .` from `go-runtime/flogo-helper` if helper code changed

### Important workspace caveat

Shared packages are consumed through built `dist` exports.

That means:

- `pnpm typecheck` rebuilds shared packages first
- app-level tests may load those built outputs

Do not run `pnpm typecheck` and Vitest in parallel when validating app packages that import shared workspace packages through `dist` exports. Run them sequentially.

### Windows shell caveat

In restricted Windows shells, `next build` or Vitest can fail with `spawn EPERM` because `esbuild.exe` is blocked at process spawn time. Do not assume repo breakage until that environment issue is ruled out.

## Flogo-Specific Design Guidance

### Mappings are a first-class concern

Be especially careful with:

- `$flow`
- `$activity[...]`
- `$env`
- `$property`
- `$trigger`

Mapping/type/scope behavior is one of the highest-value areas in this repo. When adding Flogo-native logic, prefer deterministic mapping analysis over vague heuristics whenever possible.

If you touch mapping behavior, account for both:

- preview behavior
- mapping-test behavior

Those surfaces should stay aligned because the mapping-test API is intentionally built on the same static-analysis engine as preview.

### Flows are reusable units

Treat flows like reusable callable units with explicit input/output contracts, not just inline trigger bodies.

### Triggers are adapters

When reasoning about architecture or future features, prefer the model:

- trigger -> maps into flow
- flow -> does reusable work
- trigger reply/output -> maps from flow

### Contribution metadata should be evidence-backed

If contribution metadata comes from:

- descriptor files
- workspace descriptor overrides
- registry fallback
- inferred fallback

make that explicit in output, diagnostics, or evidence fields. Do not hide the difference between authoritative metadata and fallback metadata.

## Persistence and Artifact Rules

App-analysis outputs should remain durable. When extending app-analysis capabilities, prefer:

- Prisma metadata records
- Blob/Azurite-backed JSON payload storage

Do not silently fall back to ephemeral-only analysis results unless that behavior is explicitly intended and documented.

## Useful Local References

Important files to consult before extending the platform:

- `README.md`
- `docs/flogo-native-runtime-plan.md`
- `docs/capability-matrix.md`
- `docs/architecture.md`
- `docs/api-reference.md`
- `docs/data-model.md`
- `docs/development.md`
- `examples/hello-rest/flogo.json`
- `examples/broken-mappings/flogo.json`

## Practical Default Behavior For Agents

When making changes in this repo:

1. keep the AI-agent goal explicit: improve Flogo analysis, diagnosis, recommendation, or later contribution authoring rather than drifting into generic platform work
2. confirm the current phase in `docs/flogo-native-runtime-plan.md`
3. check whether the capability already exists in `docs/capability-matrix.md`
4. update docs first if the roadmap or interface meaning changes
5. implement in the appropriate layer
6. run sequential verification
7. report both what landed and what remains out of scope
