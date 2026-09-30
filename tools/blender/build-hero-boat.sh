#!/bin/sh
# Regenerates the V20-inspired hero boat from code: the editable .blend, the runtime GLB and,
# with --render, the Blender QA views in artifacts/qa/v20-hero/.
# Usage: sh tools/blender/build-hero-boat.sh [--render] [--samples N]
# Override the Blender binary with BLENDER=/path/to/blender (Blender 5.2 LTS).
set -eu
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RENDER=""
SAMPLES="96"
while [ $# -gt 0 ]; do
  case "$1" in
    --render) RENDER="artifacts/qa/v20-hero" ;;
    --samples) SAMPLES="$2"; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
set -- --blend assets-src/blender/v20-inspired-hero.blend --glb public/assets/boats/v20-inspired-hero.glb --samples "$SAMPLES"
if [ -n "$RENDER" ]; then set -- "$@" --render "$RENDER"; fi
cd "$ROOT"
"$BLENDER" -b --factory-startup --python tools/blender/generate_v20_hero.py -- "$@"
node scripts/glb-inspect.mjs public/assets/boats/v20-inspired-hero.glb
