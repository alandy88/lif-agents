#!/usr/bin/env bash
# PostToolUse hook — Biome check+write for JS/JSX files
# Always exits 0 — failures are advisory, never blocking.
set -uo pipefail

# dispatch.js parses the payload and exports HOOK_FILE_PATH; no jq needed.
FILE="${HOOK_FILE_PATH:-}"

case "$FILE" in
  *.js|*.jsx) ;;
  *) exit 0 ;;
esac

if ! command -v biome > /dev/null; then
  echo "[Hook] biome not found on PATH, skipping" >&2
  exit 0
fi

if ! biome check --write "$FILE" 1>&2; then
  echo "[Hook] Biome reported issues in $FILE" >&2
fi

exit 0
