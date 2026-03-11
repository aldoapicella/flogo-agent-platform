# flogo-helper

`flogo-helper` is the Go-side bridge for Flogo-native capability work that should live closer to `project-flogo/core` and `project-flogo/flow` than the TypeScript control-plane.

The current scaffold exposes JSON-speaking command shells for:

- `catalog contribs`
- `inspect descriptor --ref <ref>`
- `preview mapping --node <nodeId>`

This binary is intentionally minimal in the current increment. It exists so runner images, job specs, and future Core/Flow-native integrations can target a stable helper entrypoint.
