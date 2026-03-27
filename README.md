# Flogo Agent Platform

Conversational terminal agent for TIBCO Flogo apps. The product is intentionally Flogo-specific: it inspects Flogo repos, repairs `flogo.json` and related flow resources, runs Flogo build and test workflows, and explains non-trivial changes with citations from official Flogo sources.

## Status

The current product is a working daemon-backed prototype with:

- persistent local sessions
- one-command chat-first TUI boot via `flogo-agent`
- chat CLI and TUI clients over the same daemon API
- review-gated patch approval flow
- live session snapshot streaming into the TUI
- undo for agent-authored file changes inside a session
- schema and semantic validation for `flogo.json`
- model-backed planning, repair, and conversational responses
- deterministic validation, safety checks, and execution
- Flogo build, flow test, and `.flogotest` unit-test execution
- local git repo operations
- local and isolated sandbox profiles
- unit, runtime, integration, and end-to-end coverage

It is not yet a fully complete Claude/Codex-style Flogo agent. The current roadmap is in [What’s Missing](./docs/what-is-missing.md).

## Product Loop

From the user perspective, the loop is:

1. run `flogo-agent` in a Flogo repo
2. let the client auto-load `.env`, load any stored user credential, prompt for a model API key on first run when needed, auto-start or reuse the local daemon, and resume the latest repo session
3. chat with the agent about a Flogo repo
4. let the agent inspect, validate, propose repairs, build, and test
5. approve, reject, or undo agent-authored patches in review mode
6. resume the same session later with transcript, plan, diff, and artifacts preserved

## Quick Start

### Prerequisites

- `git`
- optional: `docker` plus a compatible runtime for isolated execution
- optional: pre-set `OPENAI_API_KEY` if you do not want the app to prompt on first run

### Install from the latest GitHub release

macOS and Linux:

```bash
curl -fsSL https://github.com/aldoapicella/flogo-agent-platform/releases/latest/download/install.sh | bash
```

Windows PowerShell:

```powershell
irm https://github.com/aldoapicella/flogo-agent-platform/releases/latest/download/install.ps1 | iex
```

That installs `flogo-agent` into a user-local bin directory. On first launch the app:

- prompts for a model API key if needed
- downloads a managed per-user `flogo` CLI from the same release if needed
- checks the latest published release and prompts before applying an update when a newer version exists
- starts the terminal UI

### Developer install from source

If you want the source-based path instead:

```bash
go install github.com/aldoapicella/flogo-agent-platform/cmd/flogo-agent@latest
```

### Install the Flogo CLI manually

```bash
go install github.com/project-flogo/cli/...@latest
export PATH="$(go env GOPATH)/bin:$PATH"
```

That manual path is mainly for developers. For normal release installs, `flogo-agent` downloads and manages the `flogo` binary itself. If the repo contains `.tools/bin/flogo`, `flogo-agent` also discovers that automatically for local runs, benchmarks, and daemon sessions.

### Launch the default terminal UI

```bash
flogo-agent --repo /path/to/flogo-repo
```

That command auto-loads `.env` from the current repo or working directory, auto-starts or reuses the local daemon, resumes the most recent session for the repo when possible, and falls back to an embedded first-party canonical-source manifest when you are not running inside this source checkout.

If no model API key is available from the shell, `.env`, or stored user config, the app prompts for it on first launch and stores it in your user config for future runs.

For local development from this repo, you can still run:

```bash
go run ./cmd/flogo-agent --repo ./testdata/benchmarks/invalid-mapping
```

### Open the chat CLI directly

```bash
go run ./cmd/flogo-agent chat \
  --repo ./testdata/benchmarks/invalid-mapping \
  --goal "repair and verify this Flogo app" \
  --mode review
```

### Send a single chat turn non-interactively

```bash
go run ./cmd/flogo-agent chat \
  --repo ./testdata/benchmarks/invalid-mapping \
  --goal "repair and verify this Flogo app" \
  --mode review \
  --message "repair and verify the app"
```

### Launch the TUI

```bash
go run ./cmd/flogo-agent tui --repo /path/to/flogo-repo
```

### Start the daemon explicitly

```bash
go run ./cmd/flogo-agent daemon
```

### Use the compatibility one-shot command

```bash
go run ./cmd/flogo-agent run \
  --repo ./testdata/benchmarks/invalid-mapping \
  --goal "repair benchmark fixture" \
  --mode review
```

## CLI Commands

- `flogo-agent`: launch the full-screen terminal client, auto-managing the local daemon
- `flogo-agent daemon`: run the local session daemon explicitly
- `flogo-agent chat`: create or resume a conversational Flogo session
- `flogo-agent tui`: alias for the same full-screen terminal client
- `flogo-agent session list|show|approve|reject|undo`: inspect or control persisted sessions
- `flogo-agent run`: one-shot compatibility flow over the Flogo execution pipeline
- `flogo-agent index`: ingest official sources into SQLite
- `flogo-agent benchmark`: run benchmark fixtures and print a JSON summary
- `flogo-agent doctor`: check local install prerequisites and environment
- `flogo-agent setup`: bootstrap model key and managed `flogo` CLI
- `flogo-agent setup flogo`: install or repair the managed `flogo` CLI
- `flogo-agent ui-review`: capture scripted TUI screenshots and run an advisory multimodal UI review
- `flogo-agent update check|apply`: inspect or apply published updates
- `flogo-agent repo status|diff|branch|commit`: local forge-agnostic git operations

## Configuration

### Common flags

- `--repo`: target Flogo repository
- `--goal`: task description recorded in the session
- `--mode`: `review`, `apply`, or `auto`
- `--state-dir`: state root for knowledge, artifacts, workspaces, and sessions
- `--sources`: explicit path to the source manifest
- `--daemon-url`: local daemon URL for `chat`, `tui`, and `session`
- `--listen`: daemon listen address for `daemon`
- `--session`: existing session id to resume
- `--message`: single message to send in chat mode
- `--sandbox`: `local` or `isolated`
- `--sandbox-image`: container image for isolated mode
- `--sandbox-runtime`: container runtime for isolated mode
- `--sandbox-network`: network mode for isolated mode

### Model environment variables

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `OPENAI_EVAL_MODEL`
- `OPENAI_REASONING_EFFORT`

`OPENAI_API_KEY` is required for agent workflows such as `flogo-agent`, `tui`, `daemon`, `run`, and `benchmark`. The only model-free CLI surface is `repo`.

### Managed tooling

- a stored model key is kept under `$(os.UserConfigDir)/flogo-agent/credentials.json`
- a managed `flogo` install is kept under `$(os.UserConfigDir)/flogo-agent/bin/`
- updater state is kept under `$(os.UserConfigDir)/flogo-agent/updater.json`
- `flogo-agent doctor` shows whether the current install is ready and where `flogo` came from: managed, repo-local, or `PATH`

### Auto-update

Released builds check GitHub Releases on startup. If a newer stable release exists, the app shows the published hybrid release notes and lets you:

- update now
- skip that exact release version
- continue without updating for the current run

`flogo-agent update check` prints the latest known release, and `flogo-agent update apply` installs it immediately.

## Documentation

- [Architecture](./docs/architecture.md)
- [Canonical Reference Corpus](./docs/sources/canonical-reference-corpus.md)
- [Configuration](./docs/configuration.md)
- [Testing](./docs/testing.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [What’s Missing](./docs/what-is-missing.md)
- [Release Notes](./docs/releases/README.md)
- [Research Report](./docs/research-report.md)

## Official Flogo Sources

The indexed source-of-truth corpus is first-party only and is defined in [Canonical Reference Corpus](./docs/sources/canonical-reference-corpus.md). The runtime manifest in [docs/sources/manifest.json](./docs/sources/manifest.json) mirrors that corpus and excludes non-canonical local material such as the research report.

The enforced source-of-truth policy is in [AGENTS.md](./AGENTS.md).

## Verification

```bash
go test ./...
go build ./cmd/flogo-agent
go test -tags=integration ./internal/tools
```

Optional live OpenAI conversation smoke:

```bash
OPENAI_E2E=1 OPENAI_API_KEY="..." go test ./e2e -run 'TestLiveOpenAI.*' -v
```

Optional advisory TUI review:

```bash
flogo-agent ui-review --repo . --out-dir /tmp/flogo-agent-ui-review
```
