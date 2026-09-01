#!/usr/bin/env bash
#
# Install the terminal setup on macOS or WSL: WezTerm, Starship, the zsh
# profile, Herdr's config, and the selected environment's overlay.
#
# Unix counterpart to install.ps1. Windows cannot symlink files without
# Developer Mode or admin, so install.ps1 redirects with env vars instead;
# WSL and macOS symlink into $XDG_CONFIG_HOME (defaulting to ~/.config).
#
# It installs no software -- see local/install/AGENTS.md for the prerequisites
# and for the environment values it cannot invent.
#
# Idempotent: safe to re-run after a `git pull`. Anything it would replace is
# backed up to <name>.pre-lif-terminal.bak first -- the same suffix install.ps1
# uses -- with a numbered suffix if needed, and never silently overwritten.
#
# Usage: local/install/install.sh [--env <name>] [--dry-run] [--skip-shell-rc]
#
#   --env     select from local/environments/ and link its overlays to ~/.config.
#             Without it: reuse $XDG_CONFIG_HOME/lif-env, else detect WSL.
#             A first macOS install must pass --env; --host is an alias.
#   --dry-run print what would change without touching anything.
#   --skip-shell-rc  do not append the profile source line to ~/.zshrc.
#
# Environment names and overlay requirements: local/install/AGENTS.md.

set -euo pipefail

# This script lives in local/install/; everything it installs lives beside it
# under local/ -- the configs, the hosts/ templates, and environments/.
local_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
# environments/ and hosts/ used to sit at the repo root, one level further up.
# A machine installed before that move has ~/.config/lif-host.* pointing there,
# so those paths stay recognized as ours -- see is_repo_overlay_link.
pre_move_root=$(cd -- "$local_root/.." && pwd -P)
config_home=${XDG_CONFIG_HOME:-$HOME/.config}
dry_run=0
skip_rc=0
host=

# Where the resolved environment name is remembered between runs, so that a
# re-run after `git pull` needs no --env.
env_memo=$config_home/lif-env

# Deliberately does not guess on Darwin. Environments are machine identities:
# once there is more than one Mac, no OS check can tell them apart, and a wrong
# guess would install another machine's paths. "wsl" survives only because it
# is an existing environment name.
detect_host() {
    case "$(uname -s)" in
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
        --env|--host) host=${2:-}; shift 2 || { echo "$1 needs a name" >&2; exit 2; } ;;
        --env=*) host=${1#--env=}; shift ;;
        --host=*) host=${1#--host=}; shift ;;
        --dry-run) dry_run=1; shift ;;
        --skip-shell-rc) skip_rc=1; shift ;;
        -h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done

# Explicit --env wins; then whatever the last install on this machine chose;
# then detection. Reading the memo before detecting is what lets a named Mac
# re-install with no arguments.
if [ -z "$host" ] && [ -r "$env_memo" ]; then
    host=$(cat "$env_memo")
fi
[ -n "$host" ] || host=$(detect_host)
if [ -z "$host" ]; then
    echo "could not determine an environment; pass --env <name> once and it will" >&2
    echo "be remembered in $env_memo (see $local_root/environments/)" >&2
    printf 'available: ' >&2
    for d in "$local_root"/environments/*/; do [ -d "$d" ] && printf '%s ' "$(basename "$d")"; done >&2 || true
    echo >&2
    exit 2
fi
if [ ! -d "$local_root/environments/$host" ]; then
    echo "no such environment: environments/$host" >&2
    printf 'available: ' >&2
    # Portable listing: find -printf and ls -d are GNU-isms macOS does not have.
    for d in "$local_root"/environments/*/; do [ -d "$d" ] && printf '%s ' "$(basename "$d")"; done >&2 || true
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
        # Say what would be moved aside, not just what would be created: "what
        # of mine gets touched?" is the question a preview exists to answer.
        if [ -e "$link" ] && [ ! -L "$link" ]; then
            echo "  would bak  $(backup_path "$link")"
        fi
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

# Is this link one we placed -- including one placed by a version of this
# installer that predates the local/ move?
#
# The pre-move targets are migration inputs, not foreign symlinks. Read as
# foreign, link_overlay keeps them, and an already-installed machine silently
# stops picking up overlay edits: the link still points at the old location,
# and once that directory is gone it is dangling and every rerun refuses to
# repair it. The textual match on `readlink` matters for exactly that dangling
# case, because resolve_link_target cannot resolve a target that no longer exists.
is_repo_overlay_link() {
    local link=$1 target resolved

    target=$(readlink "$link") || return 1
    case "$target" in
        "$local_root/environments/"*|"$local_root/hosts/"*) return 0 ;;
        "$pre_move_root/environments/"*|"$pre_move_root/hosts/"*) return 0 ;;
    esac

    resolved=$(resolve_link_target "$link" 2>/dev/null || true)
    case "$resolved" in
        "$local_root/environments/"*|"$local_root/hosts/"*) return 0 ;;
        "$pre_move_root/environments/"*|"$pre_move_root/hosts/"*) return 0 ;;
        *) return 1 ;;
    esac
}

link_overlay() {
    local target=$1 link=$2

    if [ -L "$link" ]; then
        if ! is_repo_overlay_link "$link"; then
            echo "  keep $link (symlink outside repo environments/)"
            return
        fi
    elif [ -e "$link" ]; then
        echo "  keep $link (not a repo environment symlink)"
        return
    fi

    link "$target" "$link"
}

clear_overlay() {
    local link=$1

    if [ ! -L "$link" ]; then
        if [ -e "$link" ]; then
            echo "  keep $link (not a repo environment symlink)"
        fi
        return
    fi

    if ! is_repo_overlay_link "$link"; then
        echo "  keep $link (symlink outside repo environments/)"
        return
    fi
    if [ $dry_run -eq 1 ]; then
        echo "  would remove $link (stale environment overlay)"
    else
        rm "$link"
        echo "  clear $link (stale environment overlay)"
    fi
}

# write_file <path> <content>: install a rendered (non-symlink) file, backing up
# anything it replaces. Used where the installed copy differs from the repo copy.
write_file() {
    local path=$1 content=$2 backup

    if [ -f "$path" ] && [ ! -L "$path" ] && [ "$(cat "$path")" = "$content" ]; then
        echo "  ok   $path"
        return
    fi
    if [ $dry_run -eq 1 ]; then
        # Unlike link(), this backs up a symlink too, so test for one as well.
        if [ -e "$path" ] || [ -L "$path" ]; then
            echo "  would bak  $(backup_path "$path")"
        fi
        echo "  would write $path"
        return
    fi

    mkdir -p "$(dirname "$path")"
    if [ -e "$path" ] || [ -L "$path" ]; then
        backup=$(backup_path "$path")
        mv "$path" "$backup"
        echo "  bak  $backup"
    fi
    printf '%s\n' "$content" > "$path"
    echo "  set  $path"
}

# A managed Pi extension follows the Unix link convention, but a symlink that
# points outside this checkout is the captain's own and must not be adopted.
link_managed() {
    local target=$1 link=$2

    if [ -L "$link" ]; then
        if [ "$(readlink "$link")" = "$target" ]; then
            echo "  ok   $link"
        else
            echo "  keep $link (symlink outside this checkout)"
        fi
        return
    fi
    link "$target" "$link"
}

# Append a marked source block to a shell rc file, once. The captain curates
# their own rc: this only ever appends its own block, never rewrites the file.
wire_rc() {
    local rc=$1 line=$2 backup marker='# >>> lif-terminal >>>'

    if [ -f "$rc" ] && grep -qF "$marker" "$rc"; then
        echo "  ok   $rc"
        return
    fi
    if [ $dry_run -eq 1 ]; then
        echo "  would append lif-terminal block to $rc"
        return
    fi
    if [ -f "$rc" ]; then
        backup=$(backup_path "$rc")
        cp "$rc" "$backup"
        echo "  bak  $backup"
    fi
    mkdir -p "$(dirname "$rc")"
    {
        printf '\n%s\n' "$marker"
        printf '%s\n' "$line"
        printf '%s\n' '# <<< lif-terminal <<<'
    } >> "$rc"
    echo "  append $rc"
}

echo "Configs"
link "$local_root/wezterm/wezterm.lua" "$config_home/wezterm/wezterm.lua"
link "$local_root/starship/starship.toml" "$config_home/starship.toml"

echo "Pi extension"
link_managed "$local_root/pi/extensions/pi-status-footer.ts" "$HOME/.pi/agent/extensions/pi-status-footer.ts"

echo "Noninteractive BWS wrapper"
link_managed "$local_root/bin/lif-bws" "$HOME/.local/bin/lif-bws"

echo "Orca hub launcher"
link_managed "$local_root/bin/lif-hub" "$HOME/.local/bin/lif-hub"

echo "Environment overlay ($host)"
# wezterm.lua reads ~/.config/lif-host.lua by an absolute path built from
# wezterm.home_dir -- it does not consult XDG_CONFIG_HOME, so neither do we.
# host.ps1 is linked for a pwsh 7 install on this machine; profile.ps1 falls
# back to $HOME when USERPROFILE is unset, which is the case off Windows.
for pair in "host.lua:$HOME/.config/lif-host.lua" \
            "host.sh:$HOME/.config/lif-host.sh" \
            "host.ps1:$HOME/.config/lif-host.ps1"; do
    src=$local_root/environments/$host/${pair%%:*}
    if [ -f "$src" ]; then
        link_overlay "$src" "${pair#*:}"
    else
        echo "  skip environments/$host/${pair%%:*} (not present)"
        clear_overlay "${pair#*:}"
    fi
done

echo "Shell profile"
# The profile is linked at a fixed path and sourced from there, so ~/.zshrc
# never has to name the checkout.
link "$local_root/zsh/profile.zsh" "$HOME/.config/lif-shell.zsh"
if [ $skip_rc -eq 1 ]; then
    echo "  skip ~/.zshrc (--skip-shell-rc)"
else
    wire_rc "$HOME/.zshrc" '[ -r "$HOME/.config/lif-shell.zsh" ] && . "$HOME/.config/lif-shell.zsh"'
fi

echo "Herdr"
# default_shell is environment-owned, so the repo copy is a template. The
# overlay may set LIF_HERDR_DEFAULT_SHELL; otherwise pick a sane local default.
herdr_shell=
if [ -f "$HOME/.config/lif-host.sh" ]; then
    herdr_shell=$(. "$HOME/.config/lif-host.sh" >/dev/null 2>&1; printf '%s' "${LIF_HERDR_DEFAULT_SHELL:-}")
fi
if [ -z "$herdr_shell" ]; then
    # Panes should get the shell this profile is written for; fall back to the
    # login shell only when zsh is absent.
    herdr_shell=$(command -v zsh || true)
    [ -n "$herdr_shell" ] || herdr_shell=${SHELL:-/bin/bash}
fi
# Herdr resolves its config from $XDG_CONFIG_HOME/herdr (falling back to
# ~/.config) on unix; HERDR_CONFIG_PATH overrides it.
write_file "$config_home/herdr/config.toml" \
    "$(sed "s|@LIF_HERDR_DEFAULT_SHELL@|$herdr_shell|" "$local_root/herdr/config.toml")"

# Remember the environment so later runs need no --env. Written last, so a run
# that failed partway does not record a name it never finished installing.
echo "Environment memo"
if [ $dry_run -eq 1 ]; then
    echo "  would record $host in $env_memo"
elif [ -f "$env_memo" ] && [ "$(cat "$env_memo")" = "$host" ]; then
    echo "  ok   $env_memo ($host)"
else
    mkdir -p "$(dirname "$env_memo")"
    printf '%s\n' "$host" > "$env_memo"
    echo "  set  $env_memo ($host)"
fi

echo
echo "Done. Open a new WezTerm window, then verify the config actually loaded --"
echo "WezTerm falls back to full defaults on any error, silently:"
echo "  command -v wezterm >/dev/null || { echo 'wezterm not on PATH'; exit 1; }"
echo "  ! wezterm show-keys | grep -q Split  # exits 0 when the config loaded"
echo "  (without the guard, a missing wezterm makes the check pass silently)"
echo "  herdr config check                   # validates the herdr config"
echo "Start a new zsh to pick up the profile and the Starship prompt."
