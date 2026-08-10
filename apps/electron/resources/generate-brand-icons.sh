#!/usr/bin/env bash
# Generate every MkAgent app icon asset from a single SVG or PNG source.
#
# Usage:
#   bun run icons:generate
#   bun run icons:generate apps/electron/resources/mkagent/mkagent-padded.png
#   ICON_MARK_SOURCE=apps/electron/resources/mark-source.png bun run icons:generate
#
# Defaults:
#   - Positional source defaults to apps/electron/resources/source.png
#   - In-app menu mark source (ICON_MARK_SOURCE or 2nd positional arg)
#     defaults to apps/electron/resources/mark-source.png. MkAgent imports
#     both canonical sources directly from Echo, while generated files retain
#     MkAgent's existing filenames and application-facing labels.
#
# PNG sources preserve their alpha channel by default. Prepare the PNG with
# the desired macOS transparent outer padding before running this script.
#
# Required tools: bun, python3 (with Pillow), magick (ImageMagick),
# rsvg-convert, sips, iconutil.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RESOURCES_DIR="$SCRIPT_DIR"
SOURCE_INPUT="${1:-$RESOURCES_DIR/source.png}"

if [[ "$SOURCE_INPUT" != /* ]]; then
  SOURCE_INPUT="$PWD/$SOURCE_INPUT"
fi

if [[ ! -f "$SOURCE_INPUT" ]]; then
  echo "Error: source image not found: $SOURCE_INPUT" >&2
  exit 1
fi

SOURCE_ASSET="$(cd "$(dirname "$SOURCE_INPUT")" && pwd)/$(basename "$SOURCE_INPUT")"
SOURCE_EXT="${SOURCE_ASSET##*.}"
SOURCE_EXT="$(printf '%s' "$SOURCE_EXT" | tr '[:upper:]' '[:lower:]')"
SOURCE_SVG=""
if [[ "$SOURCE_EXT" == "svg" ]]; then
  SOURCE_SVG="$SOURCE_ASSET"
fi

for command in rsvg-convert magick sips iconutil bun uv python3; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Error: required command not found: $command" >&2
    exit 1
  fi
done

copy_svg() {
  local target="$1"
  mkdir -p "$(dirname "$target")"
  if [[ "$SOURCE_SVG" != "$target" ]]; then
    cp "$SOURCE_SVG" "$target"
  fi
}

write_png_embedded_svg() {
  local target="$1"
  local source_png="$2"
  local title="$3"
  local size="$4"
  local png_data
  mkdir -p "$(dirname "$target")"
  png_data="$(base64 < "$source_png" | tr -d '\n')"
  cat > "$target" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 $size $size" role="img" aria-labelledby="title">
  <title id="title">$title</title>
  <image width="$size" height="$size" href="data:image/png;base64,$png_data"/>
</svg>
EOF
}

write_embedded_svg() {
  write_png_embedded_svg "$1" "$RESOURCES_DIR/source.png" "MkAgent" "1024"
}

write_embedded_svgs() {
  write_embedded_svg "$RESOURCES_DIR/icon.svg"
  write_embedded_svg "$RESOURCES_DIR/icon.icon/Assets/icon.svg"
  mkdir -p "$RESOURCES_DIR/tool-icons"
  write_embedded_svg "$RESOURCES_DIR/tool-icons/mkagent.svg"
  write_embedded_svg "$REPO_ROOT/apps/webui/src/public/favicon.svg"
}

echo "Using source image: $SOURCE_ASSET"

case "$SOURCE_EXT" in
  svg)
    copy_svg "$RESOURCES_DIR/icon.svg"
    copy_svg "$RESOURCES_DIR/icon.icon/Assets/icon.svg"
    mkdir -p "$RESOURCES_DIR/tool-icons"
    copy_svg "$RESOURCES_DIR/tool-icons/mkagent.svg"
    copy_svg "$REPO_ROOT/apps/webui/src/public/favicon.svg"
    ;;
  png)
    ;;
  *)
    echo "Error: unsupported source format .$SOURCE_EXT. Use SVG or PNG." >&2
    exit 1
    ;;
esac

# Avoid shipping a stale compiled asset catalog when the source SVG changes.
rm -f "$RESOURCES_DIR/Assets.car"

echo "Rendering source.png..."
if [[ "$SOURCE_EXT" == "svg" ]]; then
  rsvg-convert -w 1024 -h 1024 -f png "$SOURCE_ASSET" -o "$RESOURCES_DIR/source.png"
else
  # PNG source: normalize to 1024x1024 with transparent canvas if needed.
  magick "$SOURCE_ASSET" -resize 1024x1024 -background none -gravity center -extent 1024x1024 "$RESOURCES_DIR/source.png"
  write_embedded_svgs
fi

echo "Generating Electron platform icons (delegating to generate-icons.sh)..."
(
  cd "$RESOURCES_DIR"
  bash ./generate-icons.sh source.png
)

echo "Generating Windows ICO with ImageMagick..."
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
for size in 16 24 32 48 64 128 256; do
  magick "$RESOURCES_DIR/source.png" -alpha on -resize "${size}x${size}" "$TMP_DIR/icon_${size}.png"
done
magick \
  "$TMP_DIR/icon_16.png" \
  "$TMP_DIR/icon_24.png" \
  "$TMP_DIR/icon_32.png" \
  "$TMP_DIR/icon_48.png" \
  "$TMP_DIR/icon_64.png" \
  "$TMP_DIR/icon_128.png" \
  "$TMP_DIR/icon_256.png" \
  "$RESOURCES_DIR/icon.ico"

echo "Generating web icons..."
mkdir -p "$REPO_ROOT/apps/webui/src/public"
magick "$RESOURCES_DIR/source.png" -alpha on -resize 512x512 "$REPO_ROOT/apps/webui/src/public/icon-512.png"
magick "$RESOURCES_DIR/source.png" -alpha on -resize 192x192 "$REPO_ROOT/apps/webui/src/public/icon-192.png"
magick "$RESOURCES_DIR/source.png" -alpha on -resize 180x180 "$REPO_ROOT/apps/webui/src/public/apple-touch-icon.png"
magick "$RESOURCES_DIR/source.png" -alpha on -resize 16x16 "$TMP_DIR/favicon-16.png"
magick "$RESOURCES_DIR/source.png" -alpha on -resize 32x32 "$TMP_DIR/favicon-32.png"
magick "$RESOURCES_DIR/source.png" -alpha on -resize 48x48 "$TMP_DIR/favicon-48.png"
magick "$TMP_DIR/favicon-16.png" "$TMP_DIR/favicon-32.png" "$TMP_DIR/favicon-48.png" "$REPO_ROOT/apps/webui/src/public/favicon.ico"

echo "Generating renderer logo asset..."
mkdir -p "$REPO_ROOT/apps/electron/src/renderer/assets"
magick "$RESOURCES_DIR/source.png" -alpha on -resize 256x256 "$REPO_ROOT/apps/electron/src/renderer/assets/mkagent_app_icon.png"
write_png_embedded_svg "$REPO_ROOT/apps/electron/src/renderer/assets/mkagent_app_icon.svg" "$REPO_ROOT/apps/electron/src/renderer/assets/mkagent_app_icon.png" "MkAgent app icon" "256"

echo "Generating renderer mark asset..."
# MkAgent reuses Echo's standalone robot-head mark for the in-app menu.
#
# Source selection priority:
#   1. ICON_MARK_SOURCE env var
#   2. 2nd positional arg
#   3. apps/electron/resources/mark-source.png (the Echo mark)
#
# Behavior:
#   - If the mark source is a legacy full app icon (transparent padding around
#     a green rounded-rect with a robot inside), we strip the green background
#     by colour-keying then keep only the significant connected components
#     (body + eyes) and repaint them in the brand green.
#   - If the mark source is already an isolated mark (the normal Echo source),
#     background plate detected), we just trim to bbox + center on 256x256.
MARK_PNG="$REPO_ROOT/apps/electron/src/renderer/assets/mkagent_mark.png"
MARK_SVG="$REPO_ROOT/apps/electron/src/renderer/assets/mkagent_mark.svg"
MARK_SOURCE_INPUT="${ICON_MARK_SOURCE:-${2:-$RESOURCES_DIR/mark-source.png}}"
if [[ "$MARK_SOURCE_INPUT" != /* ]]; then
  MARK_SOURCE_INPUT="$PWD/$MARK_SOURCE_INPUT"
fi
if [[ ! -f "$MARK_SOURCE_INPUT" ]]; then
  echo "Error: mark source image not found: $MARK_SOURCE_INPUT" >&2
  exit 1
fi

MARK_SOURCE="$MARK_SOURCE_INPUT" MARK_TARGET="$MARK_PNG" uv run --with Pillow python3 <<'PY'
from collections import deque
from pathlib import Path
from PIL import Image
import os
import sys

source = Image.open(os.environ["MARK_SOURCE"]).convert("RGBA")
W, H = source.size
pixels = source.load()

# Step 1: drop the green icon background to transparent. Pixels where the
# green channel clearly dominates the others get keyed out; the robot's
# near-white strokes (R≈G≈B) survive.
alpha = Image.new("L", (W, H), 0)
ap = alpha.load()
keyed_count = 0
total_visible = 0
for y in range(H):
  for x in range(W):
    r, g, b, a = pixels[x, y]
    if a == 0:
      continue
    total_visible += 1
    if g >= 100 and g > r * 1.25 and g > b * 1.25:
      keyed_count += 1
    else:
      ap[x, y] = a

green_ratio = (keyed_count / total_visible) if total_visible else 0
is_full_app_icon = green_ratio > 0.30

if is_full_app_icon:
  # Step 2: connected components on what remains (the robot).
  visited = [[False] * H for _ in range(W)]
  components = []
  for sy in range(H):
    for sx in range(W):
      if visited[sx][sy] or ap[sx, sy] <= 16:
        continue
      comp = []
      q = deque([(sx, sy)])
      visited[sx][sy] = True
      while q:
        x, y = q.popleft()
        comp.append((x, y))
        for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
          if 0 <= nx < W and 0 <= ny < H and not visited[nx][ny] and ap[nx, ny] > 16:
            visited[nx][ny] = True
            q.append((nx, ny))
      components.append(comp)

  if not components:
    print("Error: no opaque pixels left after color-keying.", file=sys.stderr)
    sys.exit(1)

  components.sort(key=len, reverse=True)
  # Keep components ≥ 1% of the largest. For our source that's body (~99k)
  # + two eyes (~5.5k each); rejects 4-pixel antialiasing fragments near
  # the icon's rounded outer border.
  threshold = max(500, len(components[0]) * 0.01)
  kept = [c for c in components if len(c) >= threshold]

  # Step 3: repaint kept pixels in brand green, preserving the alpha mask.
  BRAND = (29, 164, 45)  # MkAgent brand green (#1da42d)
  mark_full = Image.new("RGBA", (W, H), (0, 0, 0, 0))
  mfp = mark_full.load()
  for comp in kept:
    for x, y in comp:
      mfp[x, y] = (*BRAND, ap[x, y])
  mark = mark_full
else:
  # Source already has a transparent background — treat it as an
  # already-isolated mark and just respect its alpha.
  mark = source

bbox = mark.getchannel("A").getbbox()
if not bbox:
  print("Error: mark is empty (no visible alpha after processing).", file=sys.stderr)
  sys.exit(1)

cropped = mark.crop(bbox)
canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
cropped.thumbnail((234, 234), Image.LANCZOS)
canvas.alpha_composite(cropped, ((256 - cropped.width) // 2, (256 - cropped.height) // 2))
Path(os.environ["MARK_TARGET"]).parent.mkdir(parents=True, exist_ok=True)
canvas.save(os.environ["MARK_TARGET"])
PY
write_png_embedded_svg "$MARK_SVG" "$MARK_PNG" "MkAgent mark" "256"

echo "Generating OAuth callback branding asset..."
magick "$RESOURCES_DIR/source.png" -alpha on -resize 128x128 "$TMP_DIR/mkagent-mark-128.png"
cat > "$TMP_DIR/update-branding.cjs" <<'EOF'
const fs = require("fs");

const path = "packages/shared/src/branding.ts";
const dataUri = process.env.BRANDING_DATA_URI;
let source = fs.readFileSync(path, "utf8");
source = source.replace(
  /export const MKAGENT_MARK_IMAGE_DATA_URI = (?:'data:image\/png;base64,[^']*'|);/,
  `export const MKAGENT_MARK_IMAGE_DATA_URI = '${dataUri}';`,
);
fs.writeFileSync(path, source);
EOF
BRANDING_DATA_URI="data:image/png;base64,$(base64 < "$TMP_DIR/mkagent-mark-128.png" | tr -d '\n')" bun "$TMP_DIR/update-branding.cjs"

echo "Copying Electron resources to dist..."
(
  cd "$REPO_ROOT"
  bun run electron:build:assets
)

echo ""
echo "Generated brand icon assets from:"
echo "  $SOURCE_ASSET"
echo "Generated in-app mark asset from:"
echo "  $MARK_SOURCE_INPUT"
