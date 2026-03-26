#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${DIST_DIR:-$ROOT_DIR/dist}"
VERSION="${VERSION:-dev}"
FLOGO_CLI_DIR="${FLOGO_CLI_DIR:-$(go list -m -f '{{.Dir}}' github.com/project-flogo/cli@latest)}"

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

build_target() {
  local goos="$1"
  local goarch="$2"
  local binary_name="$3"
  local build_mode="$4"
  local extension=""
  local archive_name="${binary_name}_${goos}_${goarch}"
  local stage_dir="$DIST_DIR/${archive_name}"

  if [[ "$goos" == "windows" ]]; then
    extension=".exe"
  fi

  mkdir -p "$stage_dir"
  if [[ "$build_mode" == "agent" ]]; then
    GOOS="$goos" GOARCH="$goarch" \
      go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" \
        -o "$stage_dir/${binary_name}${extension}" ./cmd/flogo-agent
  else
    (
      cd "$FLOGO_CLI_DIR"
      GOOS="$goos" GOARCH="$goarch" \
        go build -trimpath -o "$stage_dir/${binary_name}${extension}" ./cmd/flogo
    )
  fi

  if [[ "$goos" == "windows" ]]; then
    (
      cd "$stage_dir"
      zip -q -9 "$DIST_DIR/${archive_name}.zip" "${binary_name}${extension}"
    )
  else
    tar -C "$stage_dir" -czf "$DIST_DIR/${archive_name}.tar.gz" "${binary_name}${extension}"
  fi

  rm -rf "$stage_dir"
}

build_target darwin amd64 flogo-agent agent
build_target darwin arm64 flogo-agent agent
build_target linux amd64 flogo-agent agent
build_target linux arm64 flogo-agent agent
build_target windows amd64 flogo-agent agent

build_target darwin amd64 flogo tool
build_target darwin arm64 flogo tool
build_target linux amd64 flogo tool
build_target linux arm64 flogo tool
build_target windows amd64 flogo tool

(
  cd "$DIST_DIR"
  sha256sum \
    flogo-agent_darwin_amd64.tar.gz \
    flogo-agent_darwin_arm64.tar.gz \
    flogo-agent_linux_amd64.tar.gz \
    flogo-agent_linux_arm64.tar.gz \
    flogo-agent_windows_amd64.zip \
    flogo_darwin_amd64.tar.gz \
    flogo_darwin_arm64.tar.gz \
    flogo_linux_amd64.tar.gz \
    flogo_linux_arm64.tar.gz \
    flogo_windows_amd64.zip \
    > flogo-agent_checksums.txt
)
