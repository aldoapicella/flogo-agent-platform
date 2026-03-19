# flogo-helper

`flogo-helper` is the Go-side bridge for Flogo-native capability work that should live closer to `project-flogo/core` and `project-flogo/flow` than the TypeScript control-plane.

The current scaffold exposes JSON-speaking command shells for:

- `catalog contribs`
- `inspect descriptor --ref <ref>`
- `evidence inspect --ref <ref>`
- `preview mapping --node <nodeId>`
- `mapping test`
- `properties plan`
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

The helper is no longer just a scaffold entrypoint. It is the current Go-side execution surface for inventory/catalog/descriptor/evidence/governance/composition/mapping/property analysis, Phase 2 flow mutation planning/application, and Phase 3 runtime evidence capture.

`flows trace` now first attempts narrow [Project Flogo](https://tibcosoftware.github.io/flogo/introduction/) [Core](https://pkg.go.dev/github.com/project-flogo/core) / [Flow](https://github.com/project-flogo/flow) runtime-backed execution paths for the supported slices: the original direct-flow same-flow `#log` activity scenario, one REST trigger-driven slice that starts the official REST trigger, sends an actual HTTP request, and captures request, mapped flow input/output, and reply evidence in `runtimeEvidence.restTriggerRuntime`, one narrow timer startup slice that captures timer settings and observed tick evidence in `runtimeEvidence.timerTriggerRuntime`, and one narrow CLI command-entry slice that starts the official CLI trigger and captures command identity, args, flags, mapped flow input, and reply/stdout evidence in `runtimeEvidence.cliTriggerRuntime`. Successful traces are marked with `trace.evidenceKind = "runtime_backed"` and include recorder-backed `runtimeEvidence.flowStart`, `runtimeEvidence.flowDone`, `runtimeEvidence.snapshots`, `runtimeEvidence.steps`, task lifecycle events, and normalized per-step evidence in `runtimeEvidence.normalizedSteps` through the official Flow state recorder interface ([Recorder](https://github.com/project-flogo/flow/blob/v1.6.24/state/recorder.go)). Unsupported traces fall back to `trace.evidenceKind = "simulated_fallback"`.

`flows replay` now attempts the narrow runtime-backed direct-flow path, the supported REST trigger slice, the narrow timer startup slice, and the supported CLI command-entry slice, labeling successful runtime-backed replay through `result.runtimeEvidence` on the returned artifact. `flows compare-runs` remains artifact-backed, but it now prefers normalized runtime artifacts when both compared runs provide `runtimeEvidence.normalizedSteps`, prefers REST envelope comparison when both compared runs are REST runtime-backed, prefers `timer_runtime_startup` when both compared runs are timer runtime-backed, otherwise falls back to recorder-backed nested trace or replay-summary data, and preserves REST, timer, and CLI runtime metadata from stored artifacts when present. The current runtime-backed surface still does not provide broad runtime parity across subflows, iterators, retry/doWhile, or trigger profiles beyond the narrow REST, timer, and CLI slices; Channel remains deferred.
