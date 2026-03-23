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
- `contrib scaffold-activity`
- `contrib scaffold-action`
- `contrib scaffold-trigger`
- `contrib validate`
- `contrib package`
- `contrib install-plan`
- `contrib install-diff-plan`
- `contrib install-apply`
- `contrib update-plan`

The helper is no longer just a scaffold entrypoint. It is the current Go-side execution surface for inventory/catalog/descriptor/evidence/governance/composition/mapping/property analysis, Phase 2 flow mutation planning/application, Phase 3 runtime evidence capture, and the current narrow Phase 4 contribution lifecycle.

`flows trace` now first attempts narrow [Project Flogo](https://tibcosoftware.github.io/flogo/introduction/) [Core](https://pkg.go.dev/github.com/project-flogo/core) / [Flow](https://github.com/project-flogo/flow) runtime-backed execution paths for the supported slices: the original direct-flow same-flow `#log` activity scenario, one REST trigger-driven slice that starts the official REST trigger, sends an actual HTTP request, and captures request, mapped flow input/output, and reply evidence in `runtimeEvidence.restTriggerRuntime`, one narrow timer startup slice that captures timer settings and observed tick evidence in `runtimeEvidence.timerTriggerRuntime`, one narrow CLI command-entry slice that starts the official CLI trigger and captures command identity, args, flags, mapped flow input, and reply/stdout evidence in `runtimeEvidence.cliTriggerRuntime`, and one narrow Channel internal-event slice that starts the official Channel trigger and captures channel name, sent data, mapped flow input/output, and evidence metadata in `runtimeEvidence.channelTriggerRuntime`. Successful traces are marked with `trace.evidenceKind = "runtime_backed"` and include recorder-backed `runtimeEvidence.flowStart`, `runtimeEvidence.flowDone`, `runtimeEvidence.snapshots`, `runtimeEvidence.steps`, task lifecycle events, and normalized per-step evidence in `runtimeEvidence.normalizedSteps` through the official Flow state recorder interface ([Recorder](https://github.com/project-flogo/flow/blob/v1.6.24/state/recorder.go)). Unsupported traces fall back to `trace.evidenceKind = "simulated_fallback"`.

`flows replay` now attempts the narrow runtime-backed direct-flow path, the supported REST trigger slice, the narrow timer startup slice, the supported CLI command-entry slice, and the narrow Channel internal-event slice, labeling successful runtime-backed replay through `result.runtimeEvidence` on the returned artifact. `flows compare-runs` remains artifact-backed, but it now prefers normalized runtime artifacts when both compared runs provide `runtimeEvidence.normalizedSteps`, prefers REST envelope comparison when both compared runs are REST runtime-backed, prefers `timer_runtime_startup` when both compared runs are timer runtime-backed, prefers `channel_runtime_boundary` when both compared runs are Channel runtime-backed, otherwise falls back to recorder-backed nested trace or replay-summary data, and preserves REST, timer, CLI, and Channel runtime metadata from stored artifacts when present. The current runtime-backed surface still does not provide broad runtime parity across subflows, iterators, retry/doWhile, or trigger profiles beyond the narrow REST, timer, CLI, and Channel slices.

Contribution authoring now includes narrow `contrib scaffold-activity`, `contrib scaffold-action`, `contrib scaffold-trigger`, `contrib validate`, `contrib package`, `contrib install-plan`, `contrib install-diff-plan`, `contrib install-apply`, and `contrib update-plan` commands. The scaffold commands generate reviewable bundles in temporary workspaces; `validate` and `package` rerun isolated proof for existing bundles; `install-plan` predicts how one contribution would be introduced into one target app; `install-diff-plan` materializes the exact canonical `flogo.json` preview for that plan; `install-apply` revalidates the saved diff fingerprint before writing that exact canonical mutation to the resolved target app; and `update-plan` detects an already installed contribution conservatively before any later update diff/apply workflow. Exact update diff/apply, broader install automation, and publish/distribution behavior are still deferred.
