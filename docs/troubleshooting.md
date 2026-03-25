# Troubleshooting

## `required binary not found in PATH`

The platform found no `flogo` binary for build and test workflows.

Fix:

```bash
go install github.com/project-flogo/cli/...@latest
export PATH="$(go env GOPATH)/bin:$PATH"
```

## `database is locked (SQLITE_BUSY)`

The SQLite knowledge store is being accessed by multiple processes using the same `--state-dir`.

Fixes:

- use a distinct `--state-dir` per concurrent run
- avoid launching multiple benchmark or CLI runs against the same state directory at the same time

## Apply mode ends `blocked`

This usually means one of:

- the `flogo` CLI could not create or build the generated app
- the generated executable tests failed
- the runner could not find a built executable in `bin/`

Check:

- artifact logs under `.flogo-agent/artifacts/`
- the generated workspace under `.flogo-agent/workspaces/`

## Model repair does not trigger

Model-backed repair only runs when:

- deterministic repair produced no patch
- `OPENAI_API_KEY` is set

Check:

```bash
echo "$OPENAI_API_KEY"
```

## Model repair returns a review-only patch

That is expected when the model-generated candidate improves the document but still does not fully clear validation. The platform keeps those patches review-gated instead of applying them automatically.

## Isolated mode fails immediately

Verify:

- the container image exists and includes the required tooling
- the selected runtime exists
- Docker can mount the working directory

Example:

```bash
go run ./cmd/flogo-agent run \
  --repo /path/to/repo \
  --sandbox isolated \
  --sandbox-image my-flogo-runner:latest \
  --sandbox-runtime runsc
```
