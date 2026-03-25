# Testing

## Test Layers

The project uses four layers of tests.

### Unit tests

Run with:

```bash
go test ./...
```

These cover:

- schema and semantic validation
- deterministic repair logic
- knowledge indexing and retrieval
- sandbox command shaping
- git wrapper behavior
- model provider behavior
- session orchestration

### End-to-end CLI tests

The e2e suite builds the `flogo-agent` binary and exercises the real CLI surface through subprocesses.

Coverage includes:

- review mode on invalid fixtures
- apply mode with fake Flogo build/test workflows
- `.flogotest` unit-test execution path
- local git repo operations
- model-backed repair fallback through a fake OpenAI-compatible server

These tests are hermetic and do not require a real OpenAI key or a real Flogo install.

### Integration tests

Run with:

```bash
go test -tags=integration ./internal/tools -v
```

These tests expect a real `flogo` binary and validate CLI wrapper behavior against the real tool.

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

This exercises the current fixture corpus and reports outcomes as JSON.

## Writing New E2E Tests

E2E tests should:

- build the real CLI binary
- use an isolated temporary `--state-dir`
- avoid sharing SQLite state between concurrent subprocesses
- use fake binaries or fake HTTP servers for external dependencies unless the test is explicitly marked integration
- assert on user-visible CLI output and on file/artifact results

## CI

CI currently runs:

- `go test ./...`
- benchmark summary
- real Flogo integration tests in a separate job

The e2e suite runs as part of the normal Go test matrix.
