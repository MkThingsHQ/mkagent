#!/usr/bin/env bash
set -euo pipefail

ARCH="${1:-arm64}"
if [[ "$ARCH" != "arm64" && "$ARCH" != "x64" ]]; then
  echo "Usage: build-dmg.sh [arm64|x64]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ELECTRON_DIR="$ROOT_DIR/apps/electron"
BUN_VERSION="bun-v1.3.9"
UV_VERSION="0.10.6"

cd "$ROOT_DIR"
bun install --frozen-lockfile

rm -rf "$ELECTRON_DIR/vendor/bun"
mkdir -p "$ELECTRON_DIR/vendor/bun"
BUN_DOWNLOAD="bun-darwin-$([ "$ARCH" = "arm64" ] && echo "aarch64" || echo "x64")"
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT
curl -fSL "https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/${BUN_DOWNLOAD}.zip" -o "$TEMP_DIR/${BUN_DOWNLOAD}.zip"
curl -fSL "https://github.com/oven-sh/bun/releases/download/${BUN_VERSION}/SHASUMS256.txt" -o "$TEMP_DIR/SHASUMS256.txt"
(
  cd "$TEMP_DIR"
  grep "${BUN_DOWNLOAD}.zip" SHASUMS256.txt | shasum -a 256 -c -
)
unzip -oq "$TEMP_DIR/${BUN_DOWNLOAD}.zip" -d "$TEMP_DIR"
cp "$TEMP_DIR/${BUN_DOWNLOAD}/bun" "$ELECTRON_DIR/vendor/bun/"
chmod +x "$ELECTRON_DIR/vendor/bun/bun"

if [ "$ARCH" = "arm64" ]; then
  UV_DOWNLOAD="uv-aarch64-apple-darwin.tar.gz"
else
  UV_DOWNLOAD="uv-x86_64-apple-darwin.tar.gz"
fi
UV_DIR="$ELECTRON_DIR/resources/bin/darwin-${ARCH}"
UV_TEMP_DIR="$TEMP_DIR/uv"
mkdir -p "$UV_DIR" "$UV_TEMP_DIR"
curl -fsSL --retry 3 --retry-delay 2 "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${UV_DOWNLOAD}" -o "$UV_TEMP_DIR/$UV_DOWNLOAD"
curl -fsSL --retry 3 --retry-delay 2 "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${UV_DOWNLOAD}.sha256" -o "$UV_TEMP_DIR/${UV_DOWNLOAD}.sha256"
(
  cd "$UV_TEMP_DIR"
  shasum -a 256 -c "${UV_DOWNLOAD}.sha256"
)
tar -xzf "$UV_TEMP_DIR/$UV_DOWNLOAD" -C "$UV_TEMP_DIR"
UV_SOURCE=$(find "$UV_TEMP_DIR" -type f -name uv -print -quit)
cp "$UV_SOURCE" "$UV_DIR/uv"
chmod +x "$UV_DIR/uv"

MKAGENT_TARGET_PLATFORM=darwin MKAGENT_TARGET_ARCH="$ARCH" bun run electron:build
cd "$ELECTRON_DIR"
bunx electron-builder --config electron-builder.yml --mac --"$ARCH"
