# Flogo Agent Platform

Terminal-first tooling for validating, repairing, building, and testing TIBCO Flogo applications with official-source grounding.

## Status

The platform is currently a working prototype with:

- `flogo.json` schema validation and semantic validation
- deterministic repair planning for common Flogo defects
- model-backed repair fallback through an abstract provider interface
- terminal CLI and TUI workflows
- local git repo operations
- local and isolated sandbox runner profiles
- benchmark, unit, integration, and end-to-end test coverage

It is not yet a fully reliable production system for every Flogo app shape or every enterprise workflow.

## Capabilities

- Validate `flogo.json` against embedded upstream-compatible schemas
- Detect semantic issues in imports, `ref` usage, `flowURI`, mappings, flow I/O, task activity refs, and flow links
- Generate reviewable unified diffs for safe repairs
- Fall back to a model-generated `flogo.json` repair when rule-based repair cannot help
- Build Flogo projects through the `flogo` CLI
- Run executable-level flow tests and `.flogotest`-based unit tests
- Attach citations from official Flogo docs and repos to validation and repair output
- Run local git status, diff, branch, and commit operations without assuming a specific forge

## Quick Start

### Prerequisites

- Go 1.25
- `git`
- optional: `flogo` CLI for build and test workflows
- optional: `docker` plus a compatible runtime for isolated execution
- optional: `OPENAI_API_KEY` for model-backed repair fallback

### Install the Flogo CLI

```bash
go install github.com/project-flogo/cli/...@latest
export PATH="$(go env GOPATH)/bin:$PATH"
```

### Run a review-only repair pass

```bash
go run ./cmd/flogo-agent run \
  --repo ./testdata/benchmarks/invalid-mapping \
  --goal "repair benchmark fixture" \
  --mode review
```

### Apply repairs automatically

```bash
go run ./cmd/flogo-agent run \
  --repo /path/to/flogo-repo \
  --goal "repair and verify" \
  --mode apply
```

### Launch the terminal UI

```bash
go run ./cmd/flogo-agent tui --repo /path/to/flogo-repo
```

## CLI Commands

- `flogo-agent run`: run one non-interactive validation, repair, and verification session
- `flogo-agent tui`: launch the terminal UI
- `flogo-agent index`: ingest knowledge sources into SQLite
- `flogo-agent benchmark`: run benchmark fixtures and print a JSON summary
- `flogo-agent repo status`: run `git status --short`
- `flogo-agent repo diff [--staged]`: run `git diff`
- `flogo-agent repo branch <name> [--checkout]`: create a local branch
- `flogo-agent repo commit -m <message>`: stage and commit all local changes

## Configuration

### Command flags

- `--repo`: target repository
- `--goal`: task description recorded in the session
- `--mode`: `review`, `apply`, or `auto`
- `--state-dir`: artifact and knowledge state directory
- `--sources`: override the knowledge manifest
- `--sandbox`: `local` or `isolated`
- `--sandbox-image`: container image for isolated mode
- `--sandbox-runtime`: container runtime for isolated mode
- `--sandbox-network`: container network mode for isolated mode

### Model environment variables

- `OPENAI_API_KEY`: enables the OpenAI-backed model client
- `OPENAI_BASE_URL`: override the OpenAI API base URL
- `OPENAI_MODEL`: override the default model
- `OPENAI_REASONING_EFFORT`: override the reasoning effort sent to the Responses API

If `OPENAI_API_KEY` is not set, the platform still works, but only deterministic repairs are available.

## Documentation

- [Architecture](./docs/architecture.md)
- [Configuration](./docs/configuration.md)
- [Testing](./docs/testing.md)
- [Troubleshooting](./docs/troubleshooting.md)
- [Research Report](./docs/research-report.md)

## Official Flogo Sources

The platform is explicitly grounded in:

- https://tibcosoftware.github.io/flogo/development/apps/app-configuration/
- https://tibcosoftware.github.io/flogo/development/flows/io-parameters/
- https://tibcosoftware.github.io/flogo/labs/flogo-cli/
- https://tibcosoftware.github.io/flogo/labs/helloworld/
- https://github.com/project-flogo/core
- https://github.com/project-flogo/flow

The enforced source-of-truth policy is in [AGENTS.md](./AGENTS.md).

## Verification

```bash
go test ./...
go build ./cmd/flogo-agent
go test -tags=integration ./internal/tools
```
