#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 && -n "${RUNNER_SPEC_JSON:-}" ]]; then
  step_type="$(printf '%s' "$RUNNER_SPEC_JSON" | jq -r '.stepType')"
  app_path="$(printf '%s' "$RUNNER_SPEC_JSON" | jq -r '.appPath')"

  case "$step_type" in
    catalog_contribs)
      exec flogo-helper catalog contribs --app "$app_path"
      ;;
    inspect_descriptor)
      target_ref="$(printf '%s' "$RUNNER_SPEC_JSON" | jq -r '.targetRef // ""')"
      exec flogo-helper inspect descriptor --app "$app_path" --ref "$target_ref"
      ;;
    preview_mapping)
      target_node_id="$(printf '%s' "$RUNNER_SPEC_JSON" | jq -r '.targetNodeId // ""')"
      input_file="$(mktemp)"
      printf '%s' "$RUNNER_SPEC_JSON" | jq -c '.analysisPayload // {}' > "$input_file"
      exec flogo-helper preview mapping --app "$app_path" --node "$target_node_id" --input "$input_file"
      ;;
    build)
      exec sh -c "echo build:$app_path"
      ;;
    run)
      exec sh -c "echo run:$app_path"
      ;;
    run_smoke)
      exec sh -c "echo smoke:$app_path"
      ;;
  esac
fi

if [[ $# -eq 0 ]]; then
  echo "flogo-runner ready"
  exit 0
fi

exec "$@"
