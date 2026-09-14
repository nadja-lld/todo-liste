#!/usr/bin/env bash
# Renders public/icon.svg to the PNG sizes required by the PWA manifest and iOS.
set -euo pipefail
cd "$(dirname "$0")/.."
rsvg-convert -w 192 -h 192 public/icon.svg -o public/pwa-192.png
rsvg-convert -w 512 -h 512 public/icon.svg -o public/pwa-512.png
rsvg-convert -w 180 -h 180 public/icon.svg -o public/apple-touch-icon.png
echo "Icons generated."
