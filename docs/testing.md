# Testing

## Test Layers

The project currently uses four layers of tests.

### Unit tests

Run with:

```bash
go test ./...
```

These cover:

- schema and semantic validation
- deterministic and model-backed repair logic
- release metadata parsing and updater state persistence
- explicit updater command logic against fake release metadata
- knowledge indexing and retrieval
- sandbox command shaping
- git wrapper behavior
- model provider behavior
- one-shot execution orchestration
- daemon-backed session manager behavior
- session streaming and undo behavior

### End-to-end CLI and daemon tests

The e2e suite builds the real `flogo-agent` binary and exercises the user-visible product surface through subprocesses.

Coverage includes:

- default seamless UI boot plumbing
- first-run model API key bootstrap in both TTY and non-interactive modes
- managed `flogo` bootstrap via release download and developer fallback behavior
- `.flogotest` unit-test execution
- local git repo operations
- daemon boot and health checks
- command-level model requirement checks

These tests are hermetic and do not require a real OpenAI key or a real Flogo install. They do not claim to validate actual model behavior.

### Live OpenAI conversation tests

Run with:

```bash
OPENAI_E2E=1 OPENAI_API_KEY="..." go test ./e2e -run 'TestLiveOpenAI.*' -v
```

These tests:

- use the real OpenAI Responses API
- use the real `flogo` CLI
- assert structural session behavior first
- score the finished conversation with a rubric
- are skipped by default and are not part of the default CI gate

### Integration tests

Run with:

```bash
go test -tags=integration ./internal/tools -v
```

These tests expect a real `flogo` binary and validate the wrapper behavior against the real CLI.

To enable them:

```bash
export FLOGO_INTEGRATION=1
go install github.com/project-flogo/cli/...@latest
go test -tags=integration ./internal/tools -v
```

### Benchmark tests

Run with:

```bash
go run ./cmd/flogo-agent benchmark --bench-root ./testdata/benchmarks --mode review
```

This exercises the current fixture corpus and reports outcomes plus benchmark rates as JSON. Because benchmark mode is now model-backed, it requires `OPENAI_API_KEY`.

### Advisory UI review

Run with:

```bash
flogo-agent ui-review --repo . --out-dir /tmp/flogo-agent-ui-review
```

This command:

- renders deterministic scripted TUI states into screenshots
- runs a multimodal model review over those screenshots
- writes PNG captures, per-capture metadata, review JSON, a Markdown summary, and a task list
- is advisory only and is not part of the default CI gate

## Writing New E2E Tests

E2E tests should:

- build the real CLI binary
- use an isolated temporary `--state-dir`
- prefer the default root command when testing the primary UX
- boot the daemon explicitly only when the test is about daemon lifecycle or advanced client commands
- avoid sharing SQLite state between unrelated subprocesses
- keep fake dependencies out of product-level LLM tests
- assert on user-visible output plus file, diff, or artifact effects

## CI

CI currently runs:

- `go test ./...`
- real Flogo integration tests in a separate job

Live OpenAI conversation evaluation runs in the separate pre-release workflow on tags and manual dispatch.

Release packaging is built by the separate `Release` workflow on tags and manual dispatch.
