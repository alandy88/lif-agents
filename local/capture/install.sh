#!/usr/bin/env bash
#
# Register the capture helper (host.mts) as a native-messaging host for Firefox
# and Google Chrome on Linux. Renders three files, all under <dir>:
#
#   <dir>/.local/share/lif-capture/lif-capture-host            the launcher
#   <dir>/.mozilla/native-messaging-hosts/lif_capture.json
#   <dir>/.config/google-chrome/NativeMessagingHosts/lif_capture.json
#
# A browser starts the host without the shell profile, so the launcher carries
# the vault path, herdr's folder and bun's path as they resolve right now.
# Rerun this script when any of them moves.
#
# Usage: local/capture/install.sh --home <dir> --chrome-id <id>
#
#   --home       the home folder to install into. No default.
#   --chrome-id  the extension's id from chrome://extensions (32 letters, a to p).

set -euo pipefail

die() {
  echo "install.sh: $1" >&2
  echo "usage: local/capture/install.sh --home <dir> --chrome-id <id>" >&2
  exit 2
}

home=
chrome_id=
while [ $# -gt 0 ]; do
  case $1 in
    --home | --chrome-id)
      [ $# -ge 2 ] || die "$1 needs a value"
      if [ "$1" = --home ]; then home=$2; else chrome_id=$2; fi
      shift 2
      ;;
    *) die "unknown argument: $1" ;;
  esac
done

# Every refusal comes before the first write.
[ -n "$home" ] || die "--home is required"
[ -d "$home" ] || die "--home is not a directory: $home"
[ -n "$chrome_id" ] || die "--chrome-id is required"
[[ $chrome_id =~ ^[a-p]{32}$ ]] || die "--chrome-id must be 32 characters of a to p"
[ -n "${LIF_NOTES_VAULT:-}" ] || die "LIF_NOTES_VAULT is not set"
[ -d "$LIF_NOTES_VAULT" ] || die "LIF_NOTES_VAULT is not a directory: $LIF_NOTES_VAULT"
herdr=$(command -v herdr) || die "herdr is not on PATH"
bun=$(command -v bun) || die "bun is not on PATH"

home=$(cd -- "$home" && pwd -P)
vault=$(cd -- "$LIF_NOTES_VAULT" && pwd)
herdr_dir=$(cd -- "$(dirname -- "$herdr")" && pwd)
host=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/host.mts
launcher=$home/.local/share/lif-capture/lif-capture-host
firefox=$home/.mozilla/native-messaging-hosts/lif_capture.json
chrome=$home/.config/google-chrome/NativeMessagingHosts/lif_capture.json

# The values go into single-quoted sh and into JSON strings unescaped.
for value in "$home" "$vault" "$herdr_dir" "$bun" "$host"; do
  case $value in
    /*) ;;
    *) die "not an absolute path: $value" ;;
  esac
  case $value in
    *[\'\"\\]* | *$'\n'*) die "path holds a quote, backslash or newline: $value" ;;
  esac
done

# A symlink under --home must not send a write outside it.
# shortcut: checked once before the writes, not held; harden if --home is ever a folder others can write.
for target in "$launcher" "$firefox" "$chrome"; do
  case $(realpath -m -- "$target") in
    "$home"/*) ;;
    *) die "resolves outside --home: $target" ;;
  esac
done

mkdir -p "$(dirname "$launcher")" "$(dirname "$firefox")" "$(dirname "$chrome")"

cat > "$launcher" <<LAUNCHER
#!/bin/sh
# Rendered by local/capture/install.sh. Rerun it when the vault, herdr or bun moves.
export LIF_NOTES_VAULT='$vault'
export PATH='$herdr_dir'"\${PATH:+:\$PATH}"
exec '$bun' '$host' "\$@"
LAUNCHER
chmod 755 "$launcher"

cat > "$firefox" <<MANIFEST
{
  "name": "lif_capture",
  "description": "LIF browser capture helper",
  "path": "$launcher",
  "type": "stdio",
  "allowed_extensions": ["lif-capture@alandy88.github"]
}
MANIFEST

cat > "$chrome" <<MANIFEST
{
  "name": "lif_capture",
  "description": "LIF browser capture helper",
  "path": "$launcher",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$chrome_id/"]
}
MANIFEST

printf 'wrote %s\n' "$launcher" "$firefox" "$chrome"
