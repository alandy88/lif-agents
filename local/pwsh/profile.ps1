Invoke-Expression (&starship init powershell)

# --- Environment overlay: per-machine paths and ids, kept out of this repo ---
# Sets $LifHost. Absent overlay -> empty table; path consumers below guard on
# their own key and warn rather than erroring. See hosts/lif-host.ps1.example.
# USERPROFILE is Windows-only, so fall back to HOME -- that is where install.sh
# links the overlay when pwsh 7 runs on macOS or WSL.
$__lifHostHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
$__lifHostOverlay = Join-Path $__lifHostHome '.config/lif-host.ps1'
$LifHost = @{}
# try/catch because a *syntax* error in the overlay makes the dot-source throw
# a terminating parse error, which would otherwise abort the rest of this file.
if (Test-Path $__lifHostOverlay) {
    try { . $__lifHostOverlay }
    catch {
        $LifHost = @{}
        Write-Warning "lif-host overlay failed to load: $_"
    }
}
if ($LifHost -isnot [hashtable]) { $LifHost = @{} }
if (-not $LifHost.BwsProjectId) {
    Remove-Item Env:LIF_STUDIO_BWS_PROJECT -ErrorAction SilentlyContinue
}
Remove-Variable __lifHostOverlay, __lifHostHome -ErrorAction SilentlyContinue

# Returns the overlay values for $Keys, or $null after warning if any is unset.
function Get-LifHostValue {
    param([string[]]$Keys)
    $missing = $Keys | Where-Object { -not $LifHost[$_] }
    if ($missing) {
        Write-Warning "lif-host overlay does not define '$($missing -join "', '")' (see hosts/lif-host.ps1.example)"
        return $null
    }
    $Keys | ForEach-Object { $LifHost[$_] }
}

# Transient prompt: collapse past prompts to a minimal character in scrollback
function Invoke-Starship-TransientFunction { &starship module character }
Enable-TransientPrompt

# --- Herdr ---
# Herdr is the multiplexer; this is the tmux-shaped front door onto it. Mirrors
# `tm` in zsh/profile.zsh -- keep the two in step.
#   tm            attach to the default persistent session (creating it)
#   tm work       attach to "work", creating it if missing
#   tm ls         list sessions
#   tm kill work  stop "work"
function tm {
    $sub = if ($args.Count -gt 0) { $args[0] } else { '' }
    switch -Exact ($sub) {
        ''      { herdr }
        'ls'    { herdr session list }
        'kill'  { herdr session stop $args[1] }
        default { herdr --session $sub }
    }
}

# --- Claude Code ---
# One dispatcher, two config directories. Mirrors _cc_run in zsh/profile.zsh.
#   cc  [word] [args...]   CLAUDE_CONFIG_DIR=~\.claude    (standard)
#   ccp [word] [args...]   CLAUDE_CONFIG_DIR=~\.claude-p  (personal)
#   ccr / ccpr             the same two, resuming
# The optional first word is either a model (fable|opus|opus1m|opus45|sonnet|
# haiku) or an action (resume|remote|w|bare|print|designer); anything else is
# passed straight through. CLAUDE_CONFIG_DIR is set for the call and restored
# afterwards, so it is deterministic even when the session already exports one.
# `claude` here is the direct, secret-free function at the bottom.
#
# The permission posture is environment-owned and per-launcher: cc resolves
# ClaudePermissionModeStandard, ccp resolves ClaudePermissionModePersonal, each
# falling back to the shared ClaudePermissionMode when its own key is unset or
# empty, then to the shared default of `--dangerously-skip-permissions`. A set
# mode passes `--permission-mode <mode>` instead. cc/ccp resolve their own key
# and pass the result into Invoke-LifClaude as an argument, read at call time,
# so it follows the overlay even though the overlay is loaded before these
# functions are defined.
function Invoke-LifClaude {
    param([string]$ConfigDir, [string]$PermissionMode, [string[]]$Argv)

    $base = @(if ($PermissionMode) {
        @('--permission-mode', $PermissionMode)
    } else {
        @('--dangerously-skip-permissions')
    })
    $sub  = if ($Argv.Count -gt 0) { $Argv[0] } else { '' }
    # @(...) is load-bearing: a single-element slice unwraps to a scalar string,
    # and splatting a scalar string explodes it one character per argument.
    $rest = @(if ($Argv.Count -gt 1) { $Argv[1..($Argv.Count - 1)] } else { @() })

    $had  = Test-Path Env:CLAUDE_CONFIG_DIR
    $prev = if ($had) { $env:CLAUDE_CONFIG_DIR } else { $null }
    $env:CLAUDE_CONFIG_DIR = $ConfigDir
    try {
        switch -Exact ($sub) {
            'fable'    { claude @base --model claude-fable-5 @rest }
            'opus'     { claude @base --model claude-opus-5 @rest }
            'opus1m'   { claude @base --model 'claude-opus-5[1m]' @rest }
            'opus45'   { claude @base --model claude-opus-4-5-20251101 @rest }
            'sonnet'   { claude @base --model claude-sonnet-5 @rest }
            'haiku'    { claude @base --model claude-haiku-4-5 @rest }
            'resume'   { claude @base --resume @rest }
            'remote'   { claude @base remote-control --spawn worktree @rest }
            'w'        { if ($rest.Count -gt 0) { claude @base --worktree $rest[0] } else { claude @base --worktree } }
            'bare'     { claude @base --bare --print @rest }
            'print'    { claude @base -p @rest }
            'designer' { claude @base --agent designer-genz @rest }
            ''         { claude @base }
            default    { claude @base @Argv }
        }
    } finally {
        if ($had) { $env:CLAUDE_CONFIG_DIR = $prev }
        else { Remove-Item Env:CLAUDE_CONFIG_DIR -ErrorAction SilentlyContinue }
    }
}
function cc {
    $mode = if ($LifHost.ClaudePermissionModeStandard) { $LifHost.ClaudePermissionModeStandard } else { $LifHost.ClaudePermissionMode }
    Invoke-LifClaude (Join-Path $HOME '.claude') $mode $args
}
function ccp {
    $mode = if ($LifHost.ClaudePermissionModePersonal) { $LifHost.ClaudePermissionModePersonal } else { $LifHost.ClaudePermissionMode }
    Invoke-LifClaude (Join-Path $HOME '.claude-p') $mode $args
}
function ccr  { cc  resume @args }
function ccpr { ccp resume @args }

# --- firstmate (remote host) ---
# Launches Claude Code on the firstmate host at its firstmate dir. ssh joins its
# trailing args with plain spaces before the remote shell sees them, so args are
# single-quoted and spliced into one command string instead of passed through.
function fm {
    if (-not ($v = Get-LifHostValue FirstmateHost, FirstmateDir)) { return }
    $q = ($args | ForEach-Object { "'" + ("$_" -replace "'", "'\''") + "'" }) -join ' '
    ssh -t $v[0] "cd '$($v[1])' && exec ~/.local/bin/claude --dangerously-skip-permissions $q"
}

# Shell in the firstmate home, for bin/ scripts, bootstrap, herdr, treehouse.
function fmsh {
    if (-not ($v = Get-LifHostValue FirstmateHost, FirstmateDir)) { return }
    ssh -t $v[0] "cd '$($v[1])' && exec zsh -l"
}

# Attach to Herdr on the firstmate host. -t is required: without a forced tty
# ssh runs the command non-interactively and herdr has nothing to attach to.
# HerdrPath is absolute because a non-login ssh command skips the shell rc that
# puts it on PATH. Args are quoted for the same reason as `fm` above -- ssh
# joins them with plain spaces, so `fmw --session 'my work'` would otherwise
# reach herdr as two arguments.
function fmw {
    if (-not ($v = Get-LifHostValue FirstmateHost, HerdrPath)) { return }
    $q = ($args | ForEach-Object { "'" + ("$_" -replace "'", "'\''") + "'" }) -join ' '
    ssh -t $v[0] "exec '$($v[1])' $q"
}

# Directory shortcuts. `github` deliberately shadows GitHub Desktop's `github`
# launcher where that is on PATH.
function lif { if ($v = Get-LifHostValue StudioDir) { Set-Location $v } }
function notes { if ($v = Get-LifHostValue NotesDir) { Set-Location $v } }
function imagehub { if ($v = Get-LifHostValue ImageHubDir) { Set-Location $v } }
function github { if ($v = Get-LifHostValue GithubDir) { Set-Location $v } }

# Multiplexing lives in `tm` near the top of this file. The previous `z`
# function existed only to force Zellij's shell, which it dropped on Windows.

# --- BWS access token ---
# DPAPI is read only inside each `bws` invocation. Shell startup deliberately
# removes an inherited token, and `bws run` removes it before its command starts.
Remove-Item Env:BWS_ACCESS_TOKEN -ErrorAction SilentlyContinue
if ($LifHost.BwsProjectId) { $env:LIF_STUDIO_BWS_PROJECT = $LifHost.BwsProjectId }
function Get-LifBwsToken {
    $path = Join-Path $env:USERPROFILE '.bws\token.dpapi'
    if (-not (Test-Path $path)) { return $null }
    $secure = Get-Content $path | ConvertTo-SecureString
    try { [System.Net.NetworkCredential]::new('', $secure).Password }
    finally { Remove-Variable secure -ErrorAction SilentlyContinue }
}
function bws {
    $exe = (Get-Command bws.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
    if (-not $exe) { Write-Error 'bws.exe not found on PATH'; return }
    $token = Get-LifBwsToken
    if (-not $token) { Write-Error 'lif: BWS access token is not configured'; return }
    $had = Test-Path Env:BWS_ACCESS_TOKEN
    $previous = if ($had) { $env:BWS_ACCESS_TOKEN } else { $null }
    try {
        $env:BWS_ACCESS_TOKEN = $token
        # BWS 2.1 removes its authentication token from `run` children before
        # starting any selected shell. Do not prepend PowerShell syntax to an
        # arbitrary --shell command.
        & $exe @args
    } finally {
        if ($had) { $env:BWS_ACCESS_TOKEN = $previous }
        else { Remove-Item Env:BWS_ACCESS_TOKEN -ErrorAction SilentlyContinue }
        Remove-Variable token -ErrorAction SilentlyContinue
    }
}

# Claude is direct and secret-free by default. This explicitly named legacy
# path injects the configured whole BWS project for tasks that truly need it.
# Prefer a narrower direct `bws run` selection when the installed CLI offers it.
function claude {
    $exe = (Get-Command claude.exe -CommandType Application -ErrorAction SilentlyContinue).Source
    if (-not $exe) { Write-Error 'claude.exe not found on PATH'; return }
    & $exe @args
}
function claude-bws {
    if (-not $LifHost.BwsProjectId) { Write-Error 'lif-host overlay does not define BwsProjectId'; return }
    $exe = (Get-Command claude.exe -CommandType Application -ErrorAction SilentlyContinue).Source
    if (-not $exe) { Write-Error 'claude.exe not found on PATH'; return }
    $cmd = @('$env:BWS_ACCESS_TOKEN = $null; $env:CLAUDE_CODE_OAUTH_TOKEN = $null;', "& '$exe'") + ($args | ForEach-Object { "'" + ("$_" -replace "'", "''") + "'" })
    bws run --shell pwsh --project-id $LifHost.BwsProjectId -- ($cmd -join ' ')
}
