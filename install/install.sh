#!/usr/bin/env bash
#
# Point WezTerm and Starship at this repo's configs, and select a host overlay.
#
# Unix counterpart to install.ps1. Windows cannot symlink files without
# Developer Mode or admin, so install.ps1 redirects with env vars instead;
# WSL and macOS symlink into ~/.config directly.
#
# Idempotent: safe to re-run after a `git pull`. Anything it would replace is
# backed up to <name>.pre-lif-terminal.bak first -- the same suffix install.ps1
# uses -- with a numbered suffix if needed, and never silently overwritten.
#
# Usage: install/install.sh [--host <name>] [--dry-run]
#
#   --host    host overlay to select from hosts/ (default: detected -- "mac"
#             on Darwin, "wsl" under WSL). Symlinks hosts/<name>/host.lua to
#             ~/.config/lif-host.lua, which wezterm.lua reads.
#   --dry-run print what would change without touching anything.

set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
config_home=${XDG_CONFIG_HOME:-$HOME/.config}
dry_run=0
host=

detect_host() {
    case "$(uname -s)" in
        Darwin) echo mac ;;
        Linux)
            # WSL reports "microsoft" in the kernel release on both WSL1 and WSL2.
            if grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
                echo wsl
            fi
            ;;
    esac
}

while [ $# -gt 0 ]; do
    case "$1" in
        --host) host=${2:-}; shift 2 || { echo "--host needs a name" >&2; exit 2; } ;;
        --host=*) host=${1#--host=}; shift ;;
        --dry-run) dry_run=1; shift ;;
        -h|--help) sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done

[ -n "$host" ] || host=$(detect_host)
if [ -z "$host" ]; then
    echo "could not detect a host; pass --host <name> (see $repo/hosts/)" >&2
    exit 2
fi
if [ ! -d "$repo/hosts/$host" ]; then
    echo "no such host overlay: hosts/$host" >&2
    printf 'available: ' >&2
    # Portable listing: find -printf and ls -d are GNU-isms macOS does not have.
    for d in "$repo"/hosts/*/; do [ -d "$d" ] && printf '%s ' "$(basename "$d")"; done >&2 || true
    echo >&2
    exit 2
fi

backup_path() {
    local path=$1 candidate index

    candidate=$path.pre-lif-terminal.bak
    if [ ! -e "$candidate" ] && [ ! -L "$candidate" ]; then
        echo "$candidate"
        return
    fi

    index=1
    candidate=$path.pre-lif-terminal.$index.bak
    while [ -e "$candidate" ] || [ -L "$candidate" ]; do
        index=$((index + 1))
        candidate=$path.pre-lif-terminal.$index.bak
    done
    echo "$candidate"
}

# link <target> <link-path>
link() {
    local target=$1 link=$2 backup

    if [ -L "$link" ] && [ "$(readlink "$link")" = "$target" ]; then
        echo "  ok   $link"
        return
    fi
    if [ $dry_run -eq 1 ]; then
        echo "  would link $link -> $target"
        return
    fi

    mkdir -p "$(dirname "$link")"
    # -e is false for a broken symlink, so test -L too, or the stale link stays.
    if [ -e "$link" ] || [ -L "$link" ]; then
        if [ -L "$link" ]; then
            rm "$link"          # our own or another symlink: nothing to preserve
        else
            backup=$(backup_path "$link")
            mv "$link" "$backup"
            echo "  bak  $backup"
        fi
    fi
    ln -s "$target" "$link"
    echo "  set  $link -> $target"
}

resolve_link_target() {
    local link=$1 target target_dir

    target=$(readlink "$link") || return 1
    target_dir=$(dirname "$target")
    case "$target" in
        /*) ;;
        *) target_dir=$(dirname "$link")/$target_dir ;;
    esac
    (cd "$target_dir" 2>/dev/null && printf '%s/%s\n' "$(pwd -P)" "$(basename "$target")")
}

clear_overlay() {
    local link=$1 target

    if [ ! -L "$link" ]; then
        if [ -e "$link" ]; then
            echo "  keep $link (not a repo host symlink)"
        fi
        return
    fi

    target=$(resolve_link_target "$link" 2>/dev/null || true)
    case "$target" in
        "$repo/hosts/"*)
            if [ $dry_run -eq 1 ]; then
                echo "  would remove $link (stale host overlay)"
            else
                rm "$link"
                echo "  clear $link (stale host overlay)"
            fi
            ;;
        *) echo "  keep $link (symlink outside repo hosts/)" ;;
    esac
}

echo "Configs"
link "$repo/local/wezterm/wezterm.lua" "$config_home/wezterm/wezterm.lua"
link "$repo/local/starship/starship.toml" "$config_home/starship.toml"

echo "Host overlay ($host)"
# wezterm.lua reads ~/.config/lif-host.lua by an absolute path built from
# wezterm.home_dir -- it does not consult XDG_CONFIG_HOME, so neither do we.
for pair in "host.lua:$HOME/.config/lif-host.lua" "host.ps1:$HOME/.config/lif-host.ps1"; do
    src=$repo/hosts/$host/${pair%%:*}
    if [ -f "$src" ]; then
        link "$src" "${pair#*:}"
    else
        echo "  skip hosts/$host/${pair%%:*} (not present)"
        clear_overlay "${pair#*:}"
    fi
done

echo
echo "Done. Open a new WezTerm window, then verify the config actually loaded --"
echo "WezTerm falls back to full defaults on any error, silently:"
echo "  wezterm show-keys | grep -c Split    # 0 = loaded, 6 = defaults"
