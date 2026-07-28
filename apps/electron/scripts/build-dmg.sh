#!/usr/bin/env bash
set -euo pipefail

ARCH="${1:-arm64}"
if [[ "$ARCH" != "arm64" && "$ARCH" != "x64" ]]; then
  echo "Usage: build-dmg.sh [arm64|x64]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$ROOT_DIR"
bun install --frozen-lockfile
bun run electron:build
cd apps/electron
bunx electron-builder --config electron-builder.yml --mac --"$ARCH"
