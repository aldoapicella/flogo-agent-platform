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
- one-shot review and apply mode
- fake Flogo build/test workflows
- `.flogotest` unit-test execution
- local git repo operations
- model-backed repair and planning through a fake OpenAI-compatible server
- daemon boot and health checks
- chat session creation
- approval flow through `session approve`

These tests are hermetic and do not require a real OpenAI key or a real Flogo install.

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

This exercises the current fixture corpus and reports outcomes plus benchmark rates as JSON.

## Writing New E2E Tests

E2E tests should:

- build the real CLI binary
- use an isolated temporary `--state-dir`
- prefer the default root command when testing the primary UX
- boot the daemon explicitly only when the test is about daemon lifecycle or advanced client commands
- avoid sharing SQLite state between unrelated subprocesses
- use fake binaries or fake HTTP servers for external dependencies unless the test is explicitly marked integration
- assert on user-visible output plus file, diff, or artifact effects

## CI

CI currently runs:

- `go test ./...`
- benchmark summary with GitHub step-summary output
- real Flogo integration tests in a separate job

The e2e suite runs as part of the normal Go test matrix.
