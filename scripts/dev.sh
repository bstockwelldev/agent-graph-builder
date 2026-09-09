#!/usr/bin/env bash
# Start or stop this repo's Docker Compose stack (Git Bash / WSL / macOS / Linux).
# Usage:
#   scripts/dev.sh up
#   scripts/dev.sh up -d
#   scripts/dev.sh up --no-build
#   scripts/dev.sh down
#   scripts/dev.sh down -v
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

COMMAND="${1:-up}"
shift || true

DETACHED=false
NO_BUILD=false
VOLUMES=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d) DETACHED=true; shift ;;
    --no-build) NO_BUILD=true; shift ;;
    -v) VOLUMES=true; shift ;;
    -h|--help)
      echo "Usage: scripts/dev.sh <up|down> [-d] [--no-build] [-v]"
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not on PATH." >&2
  exit 1
fi

run_compose() {
  echo ">> docker $*  (cwd: $REPO_ROOT)"
  docker "$@"
}

case "$COMMAND" in
  down)
    args=(compose down)
    [[ "$VOLUMES" == true ]] && args+=(-v)
    run_compose "${args[@]}"
    exit 0
    ;;
  up)
    ;;
  *)
    echo "Unknown command: $COMMAND (expected up or down)" >&2
    exit 2
    ;;
esac

args=(compose up)
[[ "$NO_BUILD" == false ]] && args+=(--build)
[[ "$DETACHED" == true ]] && args+=(-d)

echo ""
echo "Agent Graph Builder (playground)"
echo "  App:  http://localhost:5173"
echo "  API:  http://localhost:8000"
echo ""

run_compose "${args[@]}"

if [[ "$DETACHED" == true ]]; then
  echo "Stack started in the background. Stop with: scripts/dev.sh down"
fi
