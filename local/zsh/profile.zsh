# zsh equivalent of pwsh/profile.ps1, for macOS and WSL.
#
# Installed by install/install.sh: linked to ~/.config/lif-shell.zsh and sourced
# from ~/.zshrc by a marked block. Sourced, never executed.
#
# Written to run under bash too (no zsh-only syntax) so a bash login on WSL can
# source the same file; only the `starship init` and completion lines differ.
#
# This file owns everything portable across machines. Anything true of one
# machine only -- a checkout path, a work token, a platform-specific PATH entry
# -- belongs in the environment overlay instead. See environments/README.md.
#
# Where a mechanism in profile.ps1 is Windows-only, the equivalent here is
# native rather than a literal port: `fm`/`fmsh`/`fmw` ssh to the firstmate host
# from Windows, but this profile runs on that host, so they just run it. The
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

# --- Editor ---
if command -v nvim >/dev/null 2>&1; then
    EDITOR=nvim
    VISUAL=nvim
    export EDITOR VISUAL
    alias vim='nvim'
    alias vi='nvim'
fi

# --- Python ---
# Only alias when there is no bare `python`, so a venv that provides one is not
# shadowed by the system python3.
if ! command -v python >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
    alias python=python3
fi
if ! command -v pip >/dev/null 2>&1 && command -v pip3 >/dev/null 2>&1; then
    alias pip=pip3
fi

# --- PATH ---
# Prepended, and guarded so re-sourcing this file does not stack duplicates.
case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) PATH="$HOME/.local/bin:$PATH"; export PATH ;;
esac

if [ -d "$HOME/.bun" ]; then
    BUN_INSTALL="$HOME/.bun"
    export BUN_INSTALL
    case ":$PATH:" in
        *":$BUN_INSTALL/bin:"*) ;;
        *) PATH="$BUN_INSTALL/bin:$PATH"; export PATH ;;
    esac
    [ -s "$BUN_INSTALL/_bun" ] && . "$BUN_INSTALL/_bun"
fi

# --- Herdr ---
# Herdr is the multiplexer; this is the tmux-shaped front door onto it.
#   tm            attach to the default persistent session (creating it)
#   tm work       attach to "work", creating it if missing
#   tm ls         list sessions
#   tm kill work  stop "work"
tm() {
    case "${1:-}" in
        "")     herdr ;;
        ls)     herdr session list ;;
        kill)   herdr session stop "$2" ;;
        *)      herdr --session "$1" ;;
    esac
}

# --- Claude Code ---
# One dispatcher, two config directories:
#   cc  [word] [args...]   CLAUDE_CONFIG_DIR=~/.claude    (standard)
#   ccp [word] [args...]   CLAUDE_CONFIG_DIR=~/.claude-p  (personal)
#   ccr / ccpr             the same two, resuming
# The optional first word is either a model (fable|opus|opus1m|opus45|sonnet|
# haiku) or an action (resume|remote|w|bare|print|designer); anything else is
# passed straight through. CLAUDE_CONFIG_DIR is exported in a subshell so it is
# deterministic even when the surrounding shell already exports one, and so it
# survives into the `bws run` child that the claude wrapper at the bottom
# spawns. `claude` here is that wrapper, deliberately -- not `command claude`.
#
# The permission posture is environment-owned and per-launcher: cc resolves
# LIF_CLAUDE_PERMISSION_MODE_STANDARD, ccp resolves LIF_CLAUDE_PERMISSION_MODE_PERSONAL,
# each falling back to the shared LIF_CLAUDE_PERMISSION_MODE, then the restricted
# Claude `default` mode. Explicit `bypassPermissions` remains available through
# those same keys; an unset configuration is never unrestricted.
_cc_run() {
    local dir=$1 posture=${2:-default}; shift 2
    local -a B=(--permission-mode "$posture")
    local sub=${1:-}
    [ $# -gt 0 ] && shift
    (
        CLAUDE_CONFIG_DIR=$dir
        export CLAUDE_CONFIG_DIR
        case "$sub" in
            fable)    claude "${B[@]}" --model claude-fable-5 "$@" ;;
            opus)     claude "${B[@]}" --model claude-opus-5 "$@" ;;
            opus1m)   claude "${B[@]}" --model 'claude-opus-5[1m]' "$@" ;;
            opus45)   claude "${B[@]}" --model claude-opus-4-5-20251101 "$@" ;;
            sonnet)   claude "${B[@]}" --model claude-sonnet-5 "$@" ;;
            haiku)    claude "${B[@]}" --model claude-haiku-4-5 "$@" ;;
            resume)   claude "${B[@]}" --resume "$@" ;;
            remote)   claude "${B[@]}" remote-control --spawn worktree "$@" ;;
            w)        if [ $# -gt 0 ]; then claude "${B[@]}" --worktree "$1"
                      else claude "${B[@]}" --worktree; fi ;;
            bare)     claude "${B[@]}" --bare --print "$@" ;;
            print)    claude "${B[@]}" -p "$@" ;;
            designer) claude "${B[@]}" --agent designer-genz "$@" ;;
            '')       claude "${B[@]}" ;;
            *)        claude "${B[@]}" "$sub" "$@" ;;
        esac
    )
}
cc()   { _cc_run "$HOME/.claude"   "${LIF_CLAUDE_PERMISSION_MODE_STANDARD:-${LIF_CLAUDE_PERMISSION_MODE:-}}" "$@"; }
ccp()  { _cc_run "$HOME/.claude-p" "${LIF_CLAUDE_PERMISSION_MODE_PERSONAL:-${LIF_CLAUDE_PERMISSION_MODE:-}}" "$@"; }
ccr()  { cc  resume "$@"; }
ccpr() { ccp resume "$@"; }

# --- firstmate ---
# The pwsh versions cross an ssh bridge because firstmate lives on another host.
# Here it is local, so there is no bridge: run it, in a subshell so the caller's
# cwd survives.
#
# There is deliberately no ssh path on this side. Only the firstmate host sets
# LIF_FIRSTMATE_DIR, and it is the machine this profile runs on; a unix client
# that is not that host leaves the key unset and _lif_need warns, which is the
# documented outcome for a value the captain does not have. Add the bridge here
# when a second unix machine actually needs to reach firstmate, not before.
fm() {
    _lif_need LIF_FIRSTMATE_DIR || return 1
    local posture=${LIF_CLAUDE_PERMISSION_MODE_FIRSTMATE:-${LIF_CLAUDE_PERMISSION_MODE:-default}}
    ( cd "$LIF_FIRSTMATE_DIR" && claude --permission-mode "$posture" "$@" )
}

# `fmsh` on Windows opens a login shell in the firstmate home; here that home is
# already reachable, so it is a cd -- and must not be a subshell.
fmsh() {
    _lif_need LIF_FIRSTMATE_DIR || return 1
    cd "$LIF_FIRSTMATE_DIR"
}

# Herdr on the firstmate host. The workspace persists in the server's session
# state, so this attaches rather than building anything; the Windows `fmw` runs
# this same binary over ssh.
fmw() {
    _lif_need LIF_HERDR_PATH || return 1
    "$LIF_HERDR_PATH" "$@"
}

# Directory shortcuts. `github` deliberately shadows GitHub Desktop's `github`
# launcher on PATH, which is what the alias it replaces did too.
lif()      { _lif_need LIF_STUDIO_DIR   && cd "$LIF_STUDIO_DIR"; }
notes()    { _lif_need LIF_NOTES_DIR    && cd "$LIF_NOTES_DIR"; }
imagehub() { _lif_need LIF_IMAGEHUB_DIR && cd "$LIF_IMAGEHUB_DIR"; }
github()   { _lif_need LIF_GITHUB_DIR   && cd "$LIF_GITHUB_DIR"; }

# --- BWS access token ---
# The token is loaded from its at-rest store only inside each `bws` invocation.
# It is never exported by shell startup, and `bws run` removes it before its
# command starts. macOS uses Keychain; Linux/WSL requires ~/.bws/token mode 0600.
unset BWS_ACCESS_TOKEN
_lif_read_bws_token() {
    if [ "$(uname -s)" = Darwin ]; then
        security find-generic-password -s lif-bws-token -w 2>/dev/null
        return
    fi
    local f=$HOME/.bws/token
    [ -r "$f" ] || return 1
    if [ -n "$(find "$f" -perm /077 2>/dev/null || find "$f" -perm +077 2>/dev/null)" ]; then
        printf 'lif: %s is readable by group/other; chmod 600 it (token not loaded)\n' "$f" >&2
        return 1
    fi
    cat "$f"
}
_lif_bws_bin() {
    if [ -n "${ZSH_VERSION:-}" ]; then whence -p bws; else type -P bws; fi
}
bws() {
    local exe token
    exe=$(_lif_bws_bin) || { echo 'bws not found on PATH' >&2; return 127; }
    token=$(_lif_read_bws_token) || { echo 'lif: BWS access token is not configured' >&2; return 1; }
    [ -n "$token" ] || return 1
    if [ "${1:-}" = run ]; then
        local -a argv=("$@")
        local i
        for ((i=1; i <= ${#argv[@]}; i++)); do
            if [ "${argv[$i]}" = -- ] && [ $i -lt ${#argv[@]} ]; then
                argv[$((i + 1))]="unset BWS_ACCESS_TOKEN; ${argv[$((i + 1))]}"
                break
            fi
        done
        BWS_ACCESS_TOKEN=$token "$exe" "${argv[@]}"
    else
        BWS_ACCESS_TOKEN=$token "$exe" "$@"
    fi
}

# Claude is direct and secret-free by default. This explicitly named legacy
# path injects the configured whole BWS project for tasks that truly need it.
# Prefer a narrower direct `bws run` selection when the installed CLI offers it.
_lif_claude_bin() {
    if [ -n "${ZSH_VERSION:-}" ]; then whence -p claude; else type -P claude; fi
}
claude() {
    local exe
    exe=$(_lif_claude_bin) || { echo 'claude not found on PATH' >&2; return 127; }
    "$exe" "$@"
}
claude-bws() {
    _lif_need LIF_STUDIO_BWS_PROJECT || return 1
    local exe cmd a
    exe=$(_lif_claude_bin) || { echo 'claude not found on PATH' >&2; return 127; }
    cmd="unset BWS_ACCESS_TOKEN CLAUDE_CODE_OAUTH_TOKEN; $(printf '%q' "$exe")"
    for a in "$@"; do cmd="$cmd $(printf '%q' "$a")"; done
    bws run --project-id "$LIF_STUDIO_BWS_PROJECT" -- "$cmd"
}

# --- Completions ---
# Last, so anything above that adds to fpath is picked up. zsh only: bash's
# completion system is initialised by its own /etc profile scripts.
if [ -n "${ZSH_VERSION:-}" ]; then
    [ -d "$HOME/.docker/completions" ] && fpath=("$HOME/.docker/completions" $fpath)
    [ -d /opt/homebrew/share/zsh/site-functions ] && fpath=(/opt/homebrew/share/zsh/site-functions $fpath)
    autoload -Uz compinit
    compinit
fi
