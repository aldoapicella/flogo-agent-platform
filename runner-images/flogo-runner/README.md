# flogo-runner

Container image used for local runner execution and Azure Container Apps Jobs.

## Included tools

- Go toolchain
- Flogo CLI
- git
- curl
- jq

## Example

```bash
docker build -t flogo-runner runner-images/flogo-runner
docker run --rm -it flogo-runner flogo version
```
