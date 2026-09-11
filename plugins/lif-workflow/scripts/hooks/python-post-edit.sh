#!/usr/bin/env bash
# PostToolUse hook — Ruff lint+format, Pyright typecheck, print() detection
# Runs sequentially: ruff fix → ruff format → pyright → print check
# Always exits 0 — failures are advisory, never blocking.
set -uo pipefail

INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

case "$FILE" in
  *.py) ;;
  *) exit 0 ;;
esac

# --- Ruff lint + format ---
if command -v ruff >/dev/null 2>&1; then
  if ! ruff check --fix "$FILE" 1>&2; then
    echo "[Hook] Ruff check reported issues in $FILE" >&2
  fi
  if ! ruff format "$FILE" 1>&2; then
    echo "[Hook] Ruff format reported issues in $FILE" >&2
  fi
else
  echo "[Hook] ruff not found on PATH (run lif-cli dev bootstrap), skipping" >&2
fi

# --- Pyright typecheck ---
if command -v pyright >/dev/null 2>&1; then
  if ! pyright "$FILE" 1>&2; then
    echo "[Hook] Pyright found type errors in $FILE" >&2
  fi
else
  echo "[Hook] pyright not found on PATH, skipping" >&2
fi

# --- Print statement detection ---
if [ -f "$FILE" ]; then
  COUNT=$(grep -cE '\bprint\(' "$FILE" 2>/dev/null || true)
  if [ "$COUNT" -gt 0 ] 2>/dev/null; then
    jq -n --arg ctx "Warning: $COUNT print() statement(s) found in $FILE — prefer logging module" \
      '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
  fi
fi

exit 0
