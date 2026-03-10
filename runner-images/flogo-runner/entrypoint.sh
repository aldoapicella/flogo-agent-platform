#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "flogo-runner ready"
  exit 0
fi

exec "$@"

