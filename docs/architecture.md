# Architecture

## Overview

The platform is now a daemon-backed, terminal-first Flogo agent. The product is not a generic repo agent. Every prompt, tool, validator, and workflow is optimized for Flogo app work.

The top-level loop is:

1. create or resume a persisted session
2. receive a user message in CLI or TUI
3. ask the model for a structured Flogo turn plan
4. inspect `flogo.json` and Flogo resources
5. validate and retrieve official citations
6. produce a model-backed repair proposal, guarded by deterministic validation and safety checks
7. in review mode, hold the patch for approval
8. after approval or in apply mode, write the patch, build, and run available tests
9. stream session snapshots back into the clients while persisting transcript, plan, events, diff, artifacts, and final report

## Main Packages

- `cmd/flogo-agent`
  - CLI client and daemon entrypoint
- `internal/runtime`
  - session manager, persistence, HTTP daemon API, client library, repo locking
- `internal/agentloop`
  - Flogo-native conversational coordinator
- `internal/session`
  - one-shot execution core reused by the conversational loop
- `internal/flogo`
  - document parsing, schema validation, semantic validation, deterministic repair, model repair validation
- `internal/knowledge`
  - source manifest loading, ingestion, chunking, SQLite FTS retrieval
- `internal/model`
  - provider-abstracted model interface and OpenAI implementation
- `internal/tools`
  - Flogo CLI wrapper and local git wrapper
- `internal/sandbox`
  - local and isolated command runners
- `internal/ui`
  - TUI client for live sessions
- `internal/evals`
  - benchmark runner and summary generation

## Runtime Model

### Session manager

The daemon keeps a persisted snapshot per session with:

- repo path and task goal
- session mode and approval policy
- transcript
- structured plan
- timeline events
- pending approval state
- undo stack for agent-authored writes
- last execution report

Sessions are saved under `.flogo-agent/sessions/<session-id>/session.json`.

### Daemon API

The daemon exposes a local HTTP interface:

- `GET /healthz`
- `GET /sessions`
- `POST /sessions`
- `GET /sessions/{id}`
- `POST /sessions/{id}/messages`
- `GET /sessions/{id}/events`
- `POST /sessions/{id}/approve`
- `POST /sessions/{id}/reject`
- `POST /sessions/{id}/undo`

Both `chat` and `tui` use that API instead of calling orchestration directly. The default `flogo-agent` boot path auto-starts or reuses the local daemon and then attaches the TUI to the active session.

### Repo locking

The runtime keeps one mutex per repo path so concurrent sessions do not write the same Flogo workspace at the same time.

## Agent Loop

The conversational loop is intentionally narrow and Flogo-native.

Current supported intents and actions:

- inspect the app and explain issues
- repair and verify
- build and test
- show plan
- show diff
- approve pending patch
- reject pending patch
- show current status

The coordinator is stateful at the session level, persists structured turn plans and step results, and still delegates actual validation and build/test work to the existing execution pipeline.

## Repair Strategy

### Deterministic validation and repair guardrails

The deterministic layer handles narrow, auditable cases and validates any model-generated candidate:

- missing canonical imports
- direct missing imports referenced by activities or triggers
- `flowURI` normalization
- mapping-expression prefix repair
- simple flow input and output key repairs
- generated task IDs

### Model-backed planning and repairs

The model is the primary reasoning layer for turn planning, assistant responses, and broader repair generation.

Current implementation:

- provider abstraction in `internal/model`
- OpenAI Responses API implementation
- structured turn planning in `internal/agentloop`
- repair prompt uses:
  - current `flogo.json`
  - validation issues
  - retrieved citations

Model candidates are reparsed and revalidated before use. They are only accepted if they improve validation, and they remain review-gated unless they become fully clean and safe.

## Validation Layers

### Schema validation

- upstream-compatible app schema
- compatibility schema for real official examples that differ from the strict core shape

### Semantic validation

- imports and refs
- orphaned imports
- `flowURI` resolution
- flow input/output drift
- mapping syntax and `$flow.*` checks
- flow task integrity
- flow link integrity
- activity ref coverage

## Execution Model

### Local runner

- direct `os/exec`
- artifact capture for stdout and stderr
- best for trusted local development

### Isolated runner

- Docker-backed wrapper
- configurable image, runtime, and network mode
- hardened defaults:
  - `--network none`
  - read-only root filesystem
  - tmpfs-backed `/tmp`
  - dropped Linux capabilities
  - `no-new-privileges`
  - PID limit

## Knowledge and Citations

Knowledge is stored in SQLite FTS. First-party canonical sources are indexed from an explicit manifest when provided, from `docs/sources/manifest.json` when running inside the source repo, or from an embedded default manifest when the installed binary is running elsewhere. The canonical corpus is documented in `docs/sources/canonical-reference-corpus.md`, and retrieval is intentionally grounded in those first-party docs, repos, labs, and trigger/activity references rather than local research notes. Validation issues and repairs attach top citations into reports and chat responses.

## Repo Ops

Local repo operations are intentionally forge-agnostic:

- status
- diff
- branch creation
- commit

Remote forge APIs remain deferred behind that seam.
