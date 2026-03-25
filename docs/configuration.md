# Configuration

## CLI Commands

### Conversational commands

- `flogo-agent`
  - launches the default full-screen terminal client
  - auto-loads `.env`
  - auto-starts or reuses the local daemon
  - auto-resumes the latest session for the repo when possible
- `flogo-agent daemon`
  - starts the local HTTP daemon
- `flogo-agent chat`
  - creates or resumes a conversational Flogo session
- `flogo-agent tui`
  - alias for the same full-screen terminal client
- `flogo-agent session list|show|approve|reject|undo`
  - inspects or controls persisted sessions

### Compatibility and support commands

- `flogo-agent run`
  - one-shot compatibility execution
- `flogo-agent index`
  - ingests knowledge sources into SQLite
- `flogo-agent benchmark`
  - runs benchmark fixtures
- `flogo-agent repo ...`
  - local forge-agnostic git operations

## Common Flags

- `--repo`
  - target Flogo repository or fixture directory
- `--goal`
  - task description recorded in the session
- `--mode`
  - `review`, `apply`, or `auto`
- `--state-dir`
  - state root for SQLite, artifacts, generated workspaces, and sessions
- `--sources`
  - explicit path to the knowledge manifest
- `--sandbox`
  - `local` or `isolated`
- `--sandbox-image`
  - container image for isolated mode
- `--sandbox-runtime`
  - container runtime for isolated mode
- `--sandbox-network`
  - network mode for isolated mode
  - default: `none`

## Daemon and Session Flags

- `--daemon-url`
  - base URL used by `chat`, `tui`, and `session`
  - default: `http://127.0.0.1:7777`
- `--listen`
  - listen address used by `daemon`
  - default: `127.0.0.1:7777`
- `--session`
  - existing session id to resume in `chat` or `tui`
- `--message`
  - one message to send in non-interactive chat mode
- `--reason`
  - optional rejection reason for `session reject`

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

If `OPENAI_API_KEY` is unset, the platform still works, but planning and assistant responses fall back to deterministic behavior.

### Automatic dotenv loading

- `.env` in the current working directory is loaded automatically
- `.env` in the resolved repo root is then loaded automatically
- existing shell environment variables win over `.env` values

### Tooling

- `PATH`
  - must include the `flogo` binary for build and test workflows
  - for local runs, `flogo-agent` also auto-discovers `.tools/bin/flogo` in the current repo or working directory, plus `$(go env GOPATH)/bin` when available

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
- `sessions/`
  - persisted session snapshots for chat and TUI
- `benchmarks/`
  - per-fixture state when running benchmark mode

## Recommended Local Setup

```bash
export PATH="$(go env GOPATH)/bin:$PATH"
export OPENAI_API_KEY="..."
export OPENAI_MODEL="gpt-5.2"
```

If the repo already contains `.tools/bin/flogo`, you do not need to export `PATH` manually for normal local use.

Start the default UI:

```bash
go run ./cmd/flogo-agent --repo /path/to/repo
```

For explicit daemon control:

```bash
go run ./cmd/flogo-agent daemon
go run ./cmd/flogo-agent chat --repo /path/to/repo --mode review
```

## Secret Handling

- Do not hardcode API keys in source files.
- Prefer environment variables or a local secret manager.
- Rotate any key that has been exposed in logs, terminal output, or chat history.
