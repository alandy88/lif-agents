#!/usr/bin/env bash
# Consolidated PreToolUse guard for Read|Edit|Write|MultiEdit
# Checks: sensitive files, git internals, lockfiles
set -uo pipefail

INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name')

case "$TOOL" in
  Read|Edit|Write|MultiEdit)
    FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
    # Secret files — always prompt regardless of tool
    case "$FILE" in
      *.env|*.env.*)
        case "$FILE" in *.example) exit 0 ;; esac
        echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Sensitive file"}}'; exit 0 ;;
      *_rsa|*.pem|*.key|credentials.json|*/credentials.json|secrets.*|*/secrets.*)
        echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Sensitive file"}}'; exit 0 ;;
    esac
    # Git internals and lockfiles — prompt on write operations only (noise on Read)
    if [ "$TOOL" != "Read" ]; then
      case "$FILE" in
        .git/*|*/.git/*)
          echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Git internal file"}}'; exit 0 ;;
        uv.lock|*/uv.lock|bun.lock|*/bun.lock|poetry.lock|*/poetry.lock|pnpm-lock.yaml|*/pnpm-lock.yaml|package-lock.json|*/package-lock.json)
          echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Lock file"}}'; exit 0 ;;
      esac
    fi
    ;;
esac

exit 0
