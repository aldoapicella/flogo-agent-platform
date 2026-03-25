# Troubleshooting

## `failed to connect to daemon` or `/healthz` fails

The local daemon is not running, is listening on a different address, or was started with a different `--state-dir`.

Fix:

```bash
go run ./cmd/flogo-agent daemon --listen 127.0.0.1:7777
```

Then connect with:

```bash
go run ./cmd/flogo-agent chat --daemon-url http://127.0.0.1:7777 --repo /path/to/repo
```

## `required binary not found in PATH`

The platform found no `flogo` binary for build and test workflows.

Fix:

```bash
go install github.com/project-flogo/cli/...@latest
export PATH="$(go env GOPATH)/bin:$PATH"
```

## `database is locked (SQLITE_BUSY)`

The SQLite state is being accessed by multiple processes using the same `--state-dir`.

Current mitigations:

- WAL mode
- SQLite busy timeout
- repo-level locks in the daemon

Additional fixes:

- prefer one daemon per state root
- avoid unrelated concurrent one-shot runs against the same `--state-dir`
- use a distinct `--state-dir` in tests or local experiments

## Session stays in `waiting_approval`

That is expected in review mode when a patch has been generated but not applied.

Approve from CLI:

```bash
go run ./cmd/flogo-agent session approve <session-id>
```

Or use the `Approve` control in the TUI.

## Apply mode or approval execution ends `blocked`

This usually means one of:

- `flogo create` failed
- `flogo build` failed
- executable tests failed
- the runner could not find a built executable under `bin/`

Check:

- artifact logs under `.flogo-agent/artifacts/`
- generated workspaces under `.flogo-agent/workspaces/`
- the last report stored in the session snapshot under `.flogo-agent/sessions/<session-id>/session.json`

## Model repair does not trigger

Model-backed repair only runs when:

- deterministic repair produced no patch
- `OPENAI_API_KEY` is set

Check:

```bash
echo "$OPENAI_API_KEY"
```

## Model repair returns a review-only patch

That is expected when the model-generated candidate improves the document but does not fully clear validation or safety checks. The platform keeps those patches review-gated instead of applying them automatically.

## Isolated mode fails immediately

Verify:

- the container image exists and includes the required tooling
- the selected runtime exists
- Docker can mount the working directory

Example:

```bash
go run ./cmd/flogo-agent daemon \
  --sandbox isolated \
  --sandbox-image my-flogo-runner:latest \
  --sandbox-runtime runsc
```
