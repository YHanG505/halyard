#!/bin/sh
# Export all macOS icon sizes from the glass artwork in assets/icon-dark-master.png
# and assets/icon-light-master.png.
# Requires the macOS sips and iconutil utilities.
set -eu
DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

sips -z 1024 1024 "$DIR/assets/icon-dark-master.png" --out "$DIR/assets/icon-dark.png" >/dev/null
sips -z 1024 1024 "$DIR/assets/icon-light-master.png" --out "$DIR/assets/icon-light.png" >/dev/null
cp "$DIR/assets/icon-light.png" "$DIR/assets/icon.png"

mkdir -p "$WORK/AppIcon.iconset"
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" "$DIR/assets/icon.png" --out "$WORK/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z "$d" "$d" "$DIR/assets/icon.png" --out "$WORK/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$WORK/AppIcon.iconset" -o "$DIR/assets/icon.icns"
echo "generated $DIR/assets/icon.png and icon.icns"
