#!/usr/bin/env bash
set -euo pipefail

REPO="${FLOGO_AGENT_REPO:-aldoapicella/flogo-agent-platform}"
BASE_URL="${FLOGO_AGENT_BASE_URL:-https://github.com/${REPO}/releases/latest/download}"
INSTALL_DIR="${FLOGO_AGENT_INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="flogo-agent"

detect_os() {
  case "$(uname -s)" in
    Linux) echo "linux" ;;
    Darwin) echo "darwin" ;;
    *) echo "unsupported operating system: $(uname -s)" >&2; exit 1 ;;
  esac
}

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    arm64|aarch64) echo "arm64" ;;
    *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac
}

verify_checksum() {
  local checksum_file="$1"
  local asset="$2"
  local asset_path="$3"
  local filtered="$TMP_DIR/${asset}.sha256"

  grep "  ${asset}\$" "$checksum_file" > "$filtered"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$TMP_DIR" && sha256sum -c "$(basename "$filtered")")
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    local expected
    expected="$(awk '{print $1}' "$filtered")"
    local actual
    actual="$(shasum -a 256 "$asset_path" | awk '{print $1}')"
    [[ "$expected" == "$actual" ]] || {
      echo "checksum mismatch for ${asset}" >&2
      exit 1
    }
    return
  fi
  echo "warning: neither sha256sum nor shasum is available; skipping checksum verification" >&2
}

OS_NAME="$(detect_os)"
ARCH_NAME="$(detect_arch)"
ASSET_NAME="${BINARY_NAME}_${OS_NAME}_${ARCH_NAME}.tar.gz"
CHECKSUM_NAME="flogo-agent_checksums.txt"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL "${BASE_URL}/${ASSET_NAME}" -o "$TMP_DIR/$ASSET_NAME"
curl -fsSL "${BASE_URL}/${CHECKSUM_NAME}" -o "$TMP_DIR/$CHECKSUM_NAME"

verify_checksum "$TMP_DIR/$CHECKSUM_NAME" "$ASSET_NAME" "$TMP_DIR/$ASSET_NAME"

mkdir -p "$INSTALL_DIR"
tar -C "$TMP_DIR" -xzf "$TMP_DIR/$ASSET_NAME" "$BINARY_NAME"
install -m 0755 "$TMP_DIR/$BINARY_NAME" "$INSTALL_DIR/$BINARY_NAME"

echo "Installed ${BINARY_NAME} to ${INSTALL_DIR}/${BINARY_NAME}"
if ! command -v "$BINARY_NAME" >/dev/null 2>&1 || [[ "$(command -v "$BINARY_NAME")" != "${INSTALL_DIR}/${BINARY_NAME}" ]]; then
  echo
  echo "Add ${INSTALL_DIR} to your PATH if needed:"
  echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
fi
echo
echo "Next step:"
echo "  ${BINARY_NAME}"
