#!/usr/bin/env bash
# Deprecated: use scripts/dev.sh instead.
set -euo pipefail
echo "spin-up.sh is deprecated; use: scripts/dev.sh ..." >&2
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARGS=()
DETACHED=false
DOWN=false
NO_BUILD=false
VOLUMES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--detached) DETACHED=true; shift ;;
    --down) DOWN=true; shift ;;
    --no-build) NO_BUILD=true; shift ;;
    -v|--volumes) VOLUMES=true; shift ;;
    *) shift ;;
  esac
done

if [[ "$DOWN" == true ]]; then
  ARGS+=(down)
  [[ "$VOLUMES" == true ]] && ARGS+=(-v)
else
  ARGS+=(up)
  [[ "$DETACHED" == true ]] && ARGS+=(-d)
  [[ "$NO_BUILD" == true ]] && ARGS+=(--no-build)
fi

exec bash "$SCRIPT_DIR/dev.sh" "${ARGS[@]}"
