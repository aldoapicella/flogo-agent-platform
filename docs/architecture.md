# Architecture

## Overview

The platform is built as a Go monorepo with a terminal-first control plane. The core loop is:

1. load and parse `flogo.json`
2. run schema validation and semantic validation
3. attach citations from the knowledge index
4. build a deterministic repair plan
5. fall back to a model-backed repair candidate when deterministic repair cannot help
6. apply the patch in `apply` or `auto` mode, or hold it for review in `review` mode
7. build the generated app and run available tests

## Main Packages

- `cmd/flogo-agent`
  - Cobra CLI entrypoint
- `internal/session`
  - orchestration, pending review state, and session lifecycle
- `internal/flogo`
  - document parsing, schema validation, semantic validation, deterministic repair, model repair validation
- `internal/knowledge`
  - manifest loading, source ingestion, chunking, SQLite FTS retrieval
- `internal/model`
  - abstract text-generation interface and OpenAI-backed implementation
- `internal/tools`
  - Flogo CLI wrapper and forge-agnostic git wrapper
- `internal/sandbox`
  - local and isolated execution runners
- `internal/ui`
  - `tview` terminal UI
- `internal/evals`
  - benchmark runner and summary generation

## Repair Strategy

### Deterministic repairs

The deterministic repair path handles narrow, auditable cases:

- missing canonical imports
- direct missing imports referenced by activities or triggers
- `flowURI` normalization
- mapping-expression prefix repair
- simple one-to-one flow input and output key repairs
- generated task IDs

### Model-backed repairs

If deterministic repair produces no patch, the platform can request a repaired `flogo.json` from an abstract model client.

Current implementation:

- provider abstraction in `internal/model`
- OpenAI Responses API implementation
- repair prompt uses:
  - current `flogo.json`
  - validation issues
  - retrieved citations

Model candidates are never trusted blindly. The candidate is reparsed and revalidated. It is only accepted if it improves the current validation state. If the candidate is not fully clean, the patch remains review-gated.

## Validation Layers

### Schema validation

- upstream-compatible app schema
- compatibility schema for real official examples that differ from the strict core shape

### Semantic validation

- `imports` and `ref` consistency
- orphaned imports
- `flowURI` prefix and target resolution
- flow action input and output drift
- `$flow.*` expression checks
- mapping-expression checks
- flow task integrity
- flow link integrity

## Execution Model

### Local runner

- direct `os/exec`
- captures stdout and stderr to artifact files
- suitable for trusted local development

### Isolated runner

- Docker-backed wrapper
- configurable image, runtime, and network mode
- intended as the base seam for stronger sandbox policies

## Knowledge and Citations

Knowledge is stored in SQLite FTS. Sources come from `docs/sources/manifest.json` and are biased toward entries tagged `official`. Validation issues query that store and attach the top citations to the report and patch rationale.

## Repo Ops

Local repo operations are intentionally forge-agnostic:

- status
- diff
- branch creation
- commit

Remote GitHub, GitLab, and Azure DevOps operations are deferred behind that seam.
