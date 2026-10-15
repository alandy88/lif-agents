#!/usr/bin/env bash
#
# Sign the extension as an unlisted add-on on addons.mozilla.org, leave the
# signed .xpi in <out> and open it in Firefox to install. Reads
# MOZILLA_JWT_ISSUER and MOZILLA_JWT from Bitwarden Secrets Manager, so `bws`,
# `jq` and `firefox` must be on PATH and BWS_ACCESS_TOKEN set.
#
# Usage: local/capture/sign-firefox.sh [out-dir]    (default: web-ext-artifacts)
#
# AMO refuses a version it has already signed: raise "version" in
# extension/manifest.json first.

set -euo pipefail

out=${1:-web-ext-artifacts}
src=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/extension

for tool in bws jq npx firefox; do
  command -v "$tool" >/dev/null || { echo "sign-firefox.sh: $tool not found on PATH" >&2; exit 1; }
done
[ -n "${BWS_ACCESS_TOKEN:-}" ] || { echo "sign-firefox.sh: BWS_ACCESS_TOKEN is not set" >&2; exit 1; }

secrets=$(bws secret list --output json)
get() {
  jq -er --arg k "$1" '.[] | select(.key == $k) | .value' <<<"$secrets" \
    || { echo "sign-firefox.sh: secret $1 not found in Bitwarden" >&2; exit 1; }
}

WEB_EXT_API_KEY=$(get MOZILLA_JWT_ISSUER)
WEB_EXT_API_SECRET=$(get MOZILLA_JWT)
export WEB_EXT_API_KEY WEB_EXT_API_SECRET

npx --yes web-ext sign --channel=unlisted --source-dir "$src" --artifacts-dir "$out"

xpi=$(realpath "$(ls -t "$out"/*.xpi | head -n 1)")
# Firefox shows its own install prompt; only the user can approve it.
firefox "$xpi" >/dev/null 2>&1 &
echo "Opened $xpi in Firefox. Click Add to install."
