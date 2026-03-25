# AGENTS.md

## Flogo Source-Of-Truth Policy

When changing anything related to Flogo app structure, validation, mappings, flow I/O, CLI behavior, examples, or generated `flogo.json`, always check the official references first and ground decisions in them.

Required references:
- https://tibcosoftware.github.io/flogo/development/apps/app-configuration/
- https://tibcosoftware.github.io/flogo/development/flows/io-parameters/
- https://tibcosoftware.github.io/flogo/labs/flogo-cli/
- https://tibcosoftware.github.io/flogo/labs/helloworld/
- https://github.com/project-flogo/core
- https://github.com/project-flogo/flow

## Working Rules

- Treat official docs and official/maintainer GitHub repos as primary sources.
- Prefer upstream schema, upstream examples, and documented CLI behavior over local assumptions.
- If official sources disagree, call out the mismatch explicitly in code comments, tests, or the final report rather than silently picking one.
- Keep `docs/sources/manifest.json` aligned with the required official references and any concrete upstream files used for validation or examples.
- When adding or changing semantic validation, add tests using real-world descriptor shapes from official examples where possible.
