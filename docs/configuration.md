# Configuration

## CLI Flags

### Common flags

- `--repo`: target Flogo repository or fixture directory
- `--goal`: task description recorded in the session report
- `--mode`: `review`, `apply`, or `auto`
- `--state-dir`: state root for SQLite, artifacts, and generated workspaces
- `--sources`: explicit path to the knowledge manifest
- `--bench-root`: benchmark root for the `benchmark` command

### Sandbox flags

- `--sandbox local|isolated`
- `--sandbox-image <image>`
- `--sandbox-runtime <runtime>`
- `--sandbox-network <mode>`

`local` is the default. `isolated` requires a usable container image and container runtime on the machine.

## Environment Variables

### Model configuration

- `OPENAI_API_KEY`
  - enables the OpenAI-backed model client
- `OPENAI_BASE_URL`
  - overrides `https://api.openai.com/v1`
- `OPENAI_MODEL`
  - overrides the default model
- `OPENAI_REASONING_EFFORT`
  - overrides the Responses API reasoning effort

If `OPENAI_API_KEY` is unset, the platform uses deterministic repairs only.

### Tooling

- `PATH`
  - must include the `flogo` binary for build and test workflows

## State Layout

Default state root:

```text
.flogo-agent/
```

Typical contents:

- `knowledge.db`
  - SQLite FTS store for ingested sources
- `artifacts/`
  - stdout, stderr, and generated files from tool invocations
- `workspaces/`
  - generated build workspaces for `flogo create` and `flogo build`
- `benchmarks/`
  - per-fixture state when running benchmark mode

## Recommended Local Setup

```bash
export PATH="$(go env GOPATH)/bin:$PATH"
export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-5.2"
```

Then run:

```bash
go run ./cmd/flogo-agent run --repo /path/to/repo --mode review
```

## Secret Handling

- Do not hardcode API keys in source files.
- Prefer environment variables or a local secret manager.
- Rotate any key that has been exposed in terminal output, logs, or chat transcripts.
