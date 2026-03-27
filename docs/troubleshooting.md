# Troubleshooting

## `failed to connect to daemon` or `/healthz` fails

The normal `flogo-agent` boot path should auto-start or reuse the local daemon. If this still happens, the daemon is either not running, is listening on a different address, or was started with a different `--state-dir`.

Debug by starting it explicitly:

```bash
go run ./cmd/flogo-agent daemon --listen 127.0.0.1:7777
```

Then connect with:

```bash
go run ./cmd/flogo-agent chat --daemon-url http://127.0.0.1:7777 --repo /path/to/repo
```

## `required binary not found in PATH`

The platform found no `flogo` binary for build and test workflows.

For normal local runs, the CLI first tries to discover:

- the managed per-user install under `$(os.UserConfigDir)/flogo-agent/bin`
- `.tools/bin/flogo` in the current working directory
- `.tools/bin/flogo` in the resolved repo root
- `$(go env GOPATH)/bin/flogo`

Fix:

```bash
flogo-agent setup flogo
```

For release installs, that command downloads the matching `flogo` asset from the same GitHub release and verifies it against the published checksum file.

Developer fallback:

```bash
go install github.com/project-flogo/cli/...@latest
export PATH="$(go env GOPATH)/bin:$PATH"
```

If `setup flogo` fails on a developer build, make sure the Go toolchain is installed and available on `PATH`.

## First-run setup does not complete

Check the full environment with:

```bash
flogo-agent doctor
```

That command reports:

- whether a model API key is configured
- whether `flogo` is available and whether it came from a managed install, a repo-local `.tools/bin`, or `PATH`
- whether a newer published release is already known from the updater cache
- whether the daemon is reachable
- whether the state directory is writable

## Startup keeps prompting for the same update

If you chose `Continue` instead of `Skip this version`, the next startup will prompt again while that same newer release is still available.

To suppress prompts for the current newer tag, choose `Skip this version`, or inspect the current updater state with:

```bash
flogo-agent doctor
flogo-agent update check
```

To apply the update explicitly:

```bash
flogo-agent update apply
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

Undo the last agent-authored patch from CLI:

```bash
go run ./cmd/flogo-agent session undo <session-id>
```

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

## The agent answers `How do I test this locally?` with generic build/test text

The current agent should no longer answer that question from the last verifier summary alone. It now has a separate inspection path for:

- trigger ports, methods, and routes from `flogo.json`
- generated workspace and executable discovery
- whether the built binary supports Flogo `-test` flags
- fallback local test steps such as startup plus `curl`

If the answer still looks generic, check:

- whether the repo actually has a `flogo.json`
- whether a generated workspace exists under `.flogo-agent/workspaces/`
- whether the last turn was an inspection turn in `.flogo-agent/sessions/<session-id>/session.json`

You can usually retrigger the grounded path by asking one of:

```bash
How do I test this locally?
What port does this run on?
What route should I hit?
```

## Model-backed planning or repair does not trigger

Model-backed turn planning, conversational responses, and repair generation require a model API key.

Check:

```bash
echo "$OPENAI_API_KEY"
```

If the variable is empty:

- launch `flogo-agent` or `flogo-agent tui` and enter the key in the first-run prompt
- or set it explicitly in the shell / `.env`
- or inspect the stored user credential file under `$(os.UserConfigDir)/flogo-agent/credentials.json`

## Model-generated patch returns as review-only

That is expected when the model-generated candidate improves the document but does not fully clear validation or safety checks. The platform keeps those patches review-gated instead of applying them automatically.

## Isolated mode fails immediately

Verify:

- the container image exists and includes the required tooling
- the selected runtime exists
- Docker can mount the working directory
- the tool does not actually require network access, because isolated mode now defaults to `--network none`

Example:

```bash
go run ./cmd/flogo-agent daemon \
  --sandbox isolated \
  --sandbox-image my-flogo-runner:latest \
  --sandbox-runtime runsc
```
