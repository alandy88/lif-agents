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

# --- Autosuggestions ---
# Gray ghost-text hint from history, the PSReadLine PredictionSource analogue.
# zsh-only; first readable install path wins (apt, Homebrew, manual clone).
if [ -n "${ZSH_VERSION:-}" ]; then
    for _lif_zas in \
        /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh \
        /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh \
        /usr/local/share/zsh-autosuggestions/zsh-autosuggestions.zsh \
        "$HOME/.zsh/zsh-autosuggestions/zsh-autosuggestions.zsh"; do
        if [ -r "$_lif_zas" ]; then
            . "$_lif_zas"
            break
        fi
    done
    unset _lif_zas
fi

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
# survives into the selected Claude child. `claude` here is the profile's
# direct, secret-free compatibility function -- not `command claude`.
#
# The permission posture is environment-owned and per-launcher: cc resolves
# LIF_CLAUDE_PERMISSION_MODE_STANDARD, ccp resolves LIF_CLAUDE_PERMISSION_MODE_PERSONAL,
# each falling back to the shared LIF_CLAUDE_PERMISSION_MODE when its own key is
# unset or empty, then to the shared default of `--dangerously-skip-permissions`.
# A set mode passes `--permission-mode <mode>` instead. cc/ccp resolve their own
# key and pass the result into _cc_run as an argument, read at call time, so it
# follows the overlay even though the overlay is sourced before these functions
# are defined.
_cc_run() {
    local dir=$1 posture=$2; shift 2
    local -a B
    if [ -n "$posture" ]; then
        B=(--permission-mode "$posture")
    else
        B=(--dangerously-skip-permissions)
    fi
    local sub=${1:-}
    [ $# -gt 0 ] && shift
    (
        CLAUDE_CONFIG_DIR=$dir
        export CLAUDE_CONFIG_DIR
        case "$sub" in
            fable)    claude "${B[@]}" --model claude-fable-5 "$@" ;;
            opus)     claude "${B[@]}" --model claude-opus-5 --append-system-prompt-file "/home/peteryu/github/oss/fixing-smartass-opus-5/sr_opus_5_system_prompt.md" "$@" ;;
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

# --- DeepSeek harness ---
alias dsh='npx @deepseek-ai/dsh'

# --- firstmate ---
# Two shapes, picked by whether the overlay sets LIF_FIRSTMATE_HOST. Unset means
# this profile runs on the firstmate host itself and there is nothing to cross;
# set means it is a remote client and these take the same ssh bridge the pwsh
# versions do. LIF_FIRSTMATE_DIR splits the same way -- a local path on the
# host, a path *on the far side* for a client.

# Quote args for the remote shell: ssh joins them with plain spaces, so
# `fmw --session 'my work'` would otherwise reach herdr as two arguments.
_lif_shquote() {
    local a out=
    for a in "$@"; do
        out="$out '$(printf '%s' "$a" | sed "s/'/'\\\\''/g")'"
    done
    printf '%s' "$out"
}

fm() {
    _lif_need LIF_FIRSTMATE_DIR || return 1
    if [ -n "${LIF_FIRSTMATE_HOST:-}" ]; then
        ssh -t "$LIF_FIRSTMATE_HOST" \
            "cd '$LIF_FIRSTMATE_DIR' && exec ~/.local/bin/claude --dangerously-skip-permissions$(_lif_shquote "$@")"
        return
    fi
    # Subshell so the caller's cwd survives.
    ( cd "$LIF_FIRSTMATE_DIR" && claude --dangerously-skip-permissions "$@" )
}

fmsh() {
    _lif_need LIF_FIRSTMATE_DIR || return 1
    if [ -n "${LIF_FIRSTMATE_HOST:-}" ]; then
        ssh -t "$LIF_FIRSTMATE_HOST" "cd '$LIF_FIRSTMATE_DIR' && exec zsh -l"
        return
    fi
    # A cd rather than a subshell -- the point is to leave the caller there.
    cd "$LIF_FIRSTMATE_DIR"
}

# Herdr on the firstmate host. The workspace persists in the server's session
# state, so this attaches rather than building anything. The remote form needs
# -t: without a forced tty ssh runs the command non-interactively and herdr has
# nothing to attach to. It runs bare `herdr` because that account's ~/.zshenv
# puts it on PATH, which zsh reads even for the shell ssh spawns.
fmw() {
    if [ -n "${LIF_FIRSTMATE_HOST:-}" ]; then
        ssh -t "$LIF_FIRSTMATE_HOST" "exec herdr$(_lif_shquote "$@")"
        return
    fi
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
# command starts. macOS uses Keychain; Linux prefers a systemd-creds host-bound
# credential, falling back to ~/.bws/token mode 0600 where user-systemd is absent.
unset BWS_ACCESS_TOKEN
_lif_read_bws_token() {
    if [ "$(uname -s)" = Darwin ]; then
        security find-generic-password -s lif-bws-token -w 2>/dev/null
        return
    fi
    local c=$HOME/.config/bws/token.cred
    if [ -r "$c" ] && command -v systemd-creds >/dev/null 2>&1; then
        systemd-creds --user --name=bws decrypt "$c" - && return
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
    # BWS 2.1 removes its authentication token from `run` children before it
    # starts the selected shell. Do not inject shell-specific command text here.
    BWS_ACCESS_TOKEN=$token "$exe" "$@"
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
