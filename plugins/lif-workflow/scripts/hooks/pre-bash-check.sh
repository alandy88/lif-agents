#!/usr/bin/env bash
# PreToolUse guard for Bash — destructive/risky git commands only
set -uo pipefail

# dispatch.js parses the payload and exports HOOK_COMMAND; no jq needed.
CMD="${HOOK_COMMAND:-}"
[ -n "$CMD" ] || exit 0

ask() {
  echo "{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"$1\"}}"
  exit 0
}

# Quoted spans that contain whitespace are prose (`echo '(git commit --no-verify)'`)
# and are blanked so they are never read as an executed command. Quoted spans
# without whitespace are single arguments (`git commit '--no-verify'`,
# `git 'reset' --hard`), so only their quote characters are dropped and the word
# stays in the scan. Then split into command segments so each is judged on its
# own (`cd x && git push --force`, `a --force-with-lease && b --force`).
SCAN=$(printf '%s' "$CMD" | sed -E "s/'[^']*[[:space:]][^']*'/ /g; s/\"[^\"]*[[:space:]][^\"]*\"/ /g; s/['\"]//g")

GITSEGS=()
while IFS= read -r SEG; do
  SEG="${SEG#"${SEG%%[![:space:]]*}"}"   # ltrim
  case "$SEG" in git\ *|git) GITSEGS+=("$SEG") ;; esac
done < <(printf '%s\n' "$SCAN" | tr ';&|()' '\n\n\n\n\n')

[ ${#GITSEGS[@]} -gt 0 ] || exit 0

# Bypass flags — checked first so a block always wins over a prompt
for SEG in "${GITSEGS[@]}"; do
  case "$SEG" in
    *--no-verify*|*--no-gpg-sign*)
      echo "BLOCKED: Do not bypass git hooks" >&2; exit 2 ;;
  esac
done

for SEG in "${GITSEGS[@]}"; do
  # Destructive
  case "$SEG" in
    *"git clean"*-f*|*"git checkout -- ."*|*"git reset --hard"*|*"git branch -D"*|*"git branch -d"*)
      ask "Destructive git command" ;;
  esac
  # --force-with-lease is the safe form — don't prompt on it (this segment only)
  case "$SEG" in
    *"push"*--force-with-lease*) continue ;;
    *"push"*" --force"*|*"push"*" -f "*|*"push"*" -f")
      ask "Force push" ;;
  esac
done

exit 0
