# zsh equivalent of pwsh/profile.ps1, for macOS and WSL.
#
# Installed by install/install.sh: linked to ~/.config/lif-shell.zsh and sourced
# from ~/.zshrc by a marked block. Sourced, never executed.
#
# Written to run under bash too (no zsh-only syntax) so a bash login on WSL can
# source the same file; only the `starship init` line differs per shell.
#
# Where a mechanism in profile.ps1 is Windows-only, the equivalent here is
# native rather than a literal port: `fm`/`fmsh`/`fmw` shell out to wsl.exe from
# Windows, but on macOS and WSL the target is local, so they just run it. The
# BWS token comes from the OS keystore instead of DPAPI (see the bottom).

# --- Prompt ---
if command -v starship >/dev/null 2>&1; then
    if [ -n "${ZSH_VERSION:-}" ]; then
        eval "$(starship init zsh)"
    elif [ -n "${BASH_VERSION:-}" ]; then
        eval "$(starship init bash)"
    fi
fi
# No transient prompt: Enable-TransientPrompt is a PSReadLine feature with no
# starship-supported zsh counterpart. Past prompts stay full in scrollback.

# --- Environment overlay: per-machine paths and ids, kept out of this repo ---
# Sets LIF_* variables. Absent overlay -> nothing set; the consumers below warn
# on their own key rather than running with a wrong path.
# See environments/README.md and local/hosts/lif-host.sh.example.
if [ -r "$HOME/.config/lif-host.sh" ]; then
    . "$HOME/.config/lif-host.sh"
fi
if [ -n "${LIF_BWS_PROJECT_ID:-}" ]; then
    LIF_STUDIO_BWS_PROJECT=$LIF_BWS_PROJECT_ID
    export LIF_STUDIO_BWS_PROJECT
else
    unset LIF_STUDIO_BWS_PROJECT
fi

# _lif_need VAR... -> 0 if all are set, else warn once and return 1.
_lif_need() {
    local missing= v
    for v in "$@"; do
        eval "[ -n \"\${$v:-}\" ]" || missing="$missing $v"
    done
    [ -z "$missing" ] && return 0
    printf 'lif: environment overlay does not define%s (see environments/README.md)\n' "$missing" >&2
    return 1
}

# --- Claude Code ---
cc() {
    local sub=${1:-}
    [ $# -gt 0 ] && shift
    case "$sub" in
        resume)   claude --dangerously-skip-permissions --resume "$@" ;;
        remote)   claude --dangerously-skip-permissions remote-control --spawn worktree "$@" ;;
        w)        if [ $# -gt 0 ]; then claude --dangerously-skip-permissions --worktree "$1"
                  else claude --dangerously-skip-permissions --worktree; fi ;;
        sonnet)   claude --dangerously-skip-permissions --model claude-sonnet-4-6 "$@" ;;
        opus)     claude --dangerously-skip-permissions --model 'claude-opus-4-6[1m]' "$@" ;;
        opus45)   claude --dangerously-skip-permissions --model claude-opus-4-5-20251101 "$@" ;;
        bare)     claude --dangerously-skip-permissions --bare --print "$@" ;;
        print)    claude --dangerously-skip-permissions -p "$@" ;;
        designer) claude --dangerously-skip-permissions --agent designer-genz "$@" ;;
        '')       claude --dangerously-skip-permissions ;;
        *)        claude --dangerously-skip-permissions "$sub" "$@" ;;
    esac
}

_img() {
    local slash=$1 path=$2
    shift 2
    if [ $# -gt 0 ]; then cc print "$slash $path $*"; else cc print "$slash $path"; fi
}
ccc() { [ $# -ge 1 ] || { echo "Usage: ccc <path> [extra args...]"; return 1; }; _img '/image clean' "$@"; }
ccp() { [ $# -ge 1 ] || { echo "Usage: ccp <path> [extra args...]"; return 1; }; _img '/image preview' "$@"; }
ccm() { [ $# -ge 1 ] || { echo "Usage: ccm <dir> [extra args...]"; return 1; }; _img '/image-matcher' "$@"; }

# --- firstmate ---
# The pwsh versions cross a wsl.exe bridge because firstmate lives in WSL. Here
# it is local, so there is no bridge: run it, in a subshell so the caller's cwd
# survives.
fm() {
    _lif_need LIF_FIRSTMATE_DIR || return 1
    ( cd "$LIF_FIRSTMATE_DIR" && claude --dangerously-skip-permissions "$@" )
}

# `fmsh` on Windows opens a login shell in the firstmate home; here that home is
# already reachable, so it is a cd -- and must not be a subshell.
fmsh() {
    _lif_need LIF_FIRSTMATE_DIR || return 1
    cd "$LIF_FIRSTMATE_DIR"
}

# Herdr with a Claude pane up in the firstmate directory. Same launcher script
# the Windows `fmw` reaches through wsl.exe, run directly.
fmw() {
    _lif_need LIF_HERDR_PATH || return 1
    "$LIF_HERDR_PATH" "$@"
}

lif()      { _lif_need LIF_STUDIO_DIR   && cd "$LIF_STUDIO_DIR"; }
notes()    { _lif_need LIF_NOTES_DIR    && cd "$LIF_NOTES_DIR"; }
imagehub() { _lif_need LIF_IMAGEHUB_DIR && cd "$LIF_IMAGEHUB_DIR"; }

# Herdr handles multiplexing; no wrapper function is needed here.

# --- BWS access token ---
# DPAPI has no unix counterpart, so the token comes from the OS keystore:
#   macOS  - Keychain, the platform's own at-rest store. Seed it once with
#            security add-generic-password -a "$USER" -s lif-bws-token -w
#   Linux  - ~/.bws/token, mode 0600. Weaker than DPAPI (no machine binding,
#            plaintext at rest); refused outright if group/other can read it.
#            Harden with full-disk encryption, or point BWS_ACCESS_TOKEN at a
#            password manager yourself before this file is sourced.
_lif_load_bws_token() {
    [ -n "${BWS_ACCESS_TOKEN:-}" ] && return 0
    if [ "$(uname -s)" = Darwin ]; then
        BWS_ACCESS_TOKEN=$(security find-generic-password -s lif-bws-token -w 2>/dev/null) || return 1
    else
        local f=$HOME/.bws/token
        [ -r "$f" ] || return 1
        if [ -n "$(find "$f" -perm /077 2>/dev/null || find "$f" -perm +077 2>/dev/null)" ]; then
            printf 'lif: %s is readable by group/other; chmod 600 it (token not loaded)\n' "$f" >&2
            return 1
        fi
        BWS_ACCESS_TOKEN=$(cat "$f") || return 1
    fi
    [ -n "$BWS_ACCESS_TOKEN" ] || { unset BWS_ACCESS_TOKEN; return 1; }
    export BWS_ACCESS_TOKEN
}
_lif_load_bws_token || true

# --- ADR-0020: launch Claude Code wrapped in `bws run` (memory-only secrets) ---
# Shadows the claude binary so every launch path (cc, bare `claude`) gets
# process-scoped secrets. Skipped when secrets are already injected (child of a
# wrapped process). bws run passes one command string to sh, so args are quoted.
_lif_claude_bin() {
    if [ -n "${ZSH_VERSION:-}" ]; then whence -p claude; else type -P claude; fi
}
claude() {
    local exe
    exe=$(_lif_claude_bin) || exe=
    if [ -z "$exe" ]; then
        echo 'claude not found on PATH' >&2
        return 127
    fi
    if [ -n "${BWS_ACCESS_TOKEN:-}" ] && [ -n "${LIF_STUDIO_BWS_PROJECT:-}" ] && [ -z "${GH_TOKEN:-}" ]; then
        # Strip CLAUDE_CODE_OAUTH_TOKEN: it's for the headless .sandcastle agent;
        # if present it overrides Claude Code's interactive claude.ai login
        # (breaks Remote Control / model access). Other secrets stay injected.
        local cmd a
        cmd="unset CLAUDE_CODE_OAUTH_TOKEN; $(printf '%q' "$exe")"
        for a in "$@"; do cmd="$cmd $(printf '%q' "$a")"; done
        bws run --project-id "$LIF_STUDIO_BWS_PROJECT" -- "$cmd"
    else
        "$exe" "$@"
    fi
}
