# Configuration

## CLI Commands

### Conversational commands

- `flogo-agent`
  - launches the default full-screen terminal client
  - auto-loads `.env`
  - auto-starts or reuses the local daemon
  - auto-resumes the latest session for the repo when possible
  - uses an embedded default official-source manifest when no local manifest is available
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
- `flogo-agent doctor`
  - checks model key, `flogo`, daemon reachability, and writable state
- `flogo-agent update check|apply`
  - checks for or applies the latest published release
- `flogo-agent setup`
  - bootstraps the local install
- `flogo-agent setup flogo`
  - installs or repairs the managed `flogo` CLI
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
  - required for agent workflows
- `OPENAI_BASE_URL`
  - overrides `https://api.openai.com/v1`
- `OPENAI_MODEL`
  - overrides the default model
- `OPENAI_EVAL_MODEL`
  - optional evaluator model for live conversation grading
- `OPENAI_REASONING_EFFORT`
  - overrides the Responses API reasoning effort

If `OPENAI_API_KEY` is unset, interactive agent startup prompts for a model API key on first run and stores it in user config. Non-interactive model-required commands prompt only when attached to a TTY; otherwise they fail clearly. The only model-free CLI surface is `repo`.

### Automatic dotenv loading

- `.env` in the current working directory is loaded automatically
- `.env` in the resolved repo root is then loaded automatically
- stored user credentials are loaded after `.env` when `OPENAI_API_KEY` is still unset
- existing shell environment variables win over `.env` values

### Stored user credentials

- first-run credential bootstrap stores the key under the user config directory
- path: `$(os.UserConfigDir)/flogo-agent/credentials.json`
- the stored file is outside the repo and is reused on future launches

### Managed Flogo CLI

- if no `flogo` binary is found, interactive startup now offers to install a managed per-user copy from the current product release
- managed path: `$(os.UserConfigDir)/flogo-agent/bin/flogo`
- managed install metadata: `$(os.UserConfigDir)/flogo-agent/tools/flogo.json`
- `setup flogo` repairs or reinstalls that managed copy
- released binaries download the matching `flogo_<os>_<arch>` asset and verify it against the release checksum file
- developer builds without a release version fall back to `go install github.com/project-flogo/cli/...@latest`, so Go must be available on `PATH`

### Startup updater

- released binaries check the latest stable GitHub Release on startup
- if a newer version exists, interactive startup prompts with the published release notes
- the updater state is stored at `$(os.UserConfigDir)/flogo-agent/updater.json`
- `Skip this version` suppresses prompts for that exact tag until a newer release appears
- non-interactive commands never block on update prompts; they print a notice and continue

### Tooling

- `PATH`
  - must include the `flogo` binary for build and test workflows unless the managed copy has been installed
  - for local runs, `flogo-agent` auto-discovers the managed user copy, `.tools/bin/flogo` in the current repo or working directory, plus `$(go env GOPATH)/bin` when available

## State Layout

Default state root:

```text
.flogo-agent/
```

Typical contents:

- `knowledge.db`
  - SQLite FTS store for ingested sources
- `daemon.log`
  - local daemon startup log when the UI auto-starts a daemon
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
curl -fsSL https://github.com/aldoapicella/flogo-agent-platform/releases/latest/download/install.sh | bash
export OPENAI_MODEL="gpt-5.2"
export OPENAI_EVAL_MODEL="gpt-5.2"
```

Then run:

```bash
flogo-agent setup
```

You can also check the currently installed release and apply an update explicitly:

```bash
flogo-agent update check
flogo-agent update apply
```

If the repo already contains `.tools/bin/flogo`, you do not need a managed `flogo` install for normal local use.

Developer install from source remains available:

```bash
go install github.com/aldoapicella/flogo-agent-platform/cmd/flogo-agent@latest
```

Start the default UI:

```bash
flogo-agent --repo /path/to/repo
```

For local development from this checkout:

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
