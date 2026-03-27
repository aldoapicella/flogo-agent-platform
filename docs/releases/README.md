# Release Notes

Each tagged release must include a matching manual summary file before the `Release` workflow runs.

Required path format:

```text
docs/releases/vX.Y.Z.md
```

That file should contain the human-curated release summary shown at the top of the published GitHub Release. The workflow appends GitHub-generated release notes after the manual summary so the final published body is hybrid:

1. curated summary
2. separator
3. generated notes

Example:

```text
docs/releases/v0.1.1.md
```
