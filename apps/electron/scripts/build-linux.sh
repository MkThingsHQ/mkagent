#!/usr/bin/env bash
set -euo pipefail

ARCH="${1:-x64}"
if [[ "$ARCH" != "x64" ]]; then
  echo "Usage: build-linux.sh [x64]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

cd "$ROOT_DIR"
bun install --frozen-lockfile
bun run electron:build
cd apps/electron
bunx electron-builder --config electron-builder.yml --linux --x64
