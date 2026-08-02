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

function cc {
    $base = @('--dangerously-skip-permissions')
    $rest = if ($args.Count -gt 1) { $args[1..($args.Count - 1)] } else { @() }

    switch -Exact ($args[0]) {
        'resume'   { claude @base --resume @rest }
        'remote'   { claude @base remote-control --spawn worktree @rest }
        'w'        { if ($rest.Count -gt 0) { claude @base --worktree $rest[0] } else { claude @base --worktree } }
        'sonnet'   { claude @base --model claude-sonnet-4-6 @rest }
        'opus'     { claude @base --model 'claude-opus-4-6[1m]' @rest }
        'opus45'   { claude @base --model claude-opus-4-5-20251101 @rest }
        'bare'     { claude @base --bare --print @rest }
        'print'    { claude @base -p @rest }
        'designer' { claude @base --agent designer-genz @rest }
        default    { claude @base @args }
    }
}
function _img {
    param([string]$slashCmd, [string]$path, [string[]]$extra)
    $prompt = if ($extra.Count -gt 0) { "$slashCmd $path $($extra -join ' ')" } else { "$slashCmd $path" }
    cc print $prompt
}
function ccc {
    if ($args.Count -lt 1) { Write-Host "Usage: ccc <path> [extra args...]"; return }
    _img '/image clean' $args[0] $(if ($args.Count -gt 1) { $args[1..($args.Count-1)] } else { @() })
}
function ccp {
    if ($args.Count -lt 1) { Write-Host "Usage: ccp <path> [extra args...]"; return }
    _img '/image preview' $args[0] $(if ($args.Count -gt 1) { $args[1..($args.Count-1)] } else { @() })
}
function ccm {
    if ($args.Count -lt 1) { Write-Host "Usage: ccm <dir> [extra args...]"; return }
    _img '/image-matcher' $args[0] $(if ($args.Count -gt 1) { $args[1..($args.Count-1)] } else { @() })
}

# --- firstmate (WSL) ---
# Launches Claude Code inside the overlay's WSL distro at its firstmate dir.
# `bash -lc` is required:
# nvm's PATH lives in ~/.profile, and firstmate's non-interactive bin/*.sh need node.
# wsl.exe drops trailing positional args before bash sees them, so args are
# single-quoted and spliced into the command string instead of passed through.
function fm {
    if (-not ($v = Get-LifHostValue WslDistro, FirstmateDir)) { return }
    $q = ($args | ForEach-Object { "'" + ("$_" -replace "'", "'\''") + "'" }) -join ' '
    wsl.exe -d $v[0] --cd $v[1] -- bash -lc "claude --dangerously-skip-permissions $q"
}

# Shell in the firstmate home, for bin/ scripts, bootstrap, herdr, treehouse.
function fmsh {
    if (-not ($v = Get-LifHostValue WslDistro, FirstmateDir)) { return }
    wsl.exe -d $v[0] --cd $v[1] -- bash -l
}

# Herdr in WSL, with a Claude pane already up in the firstmate directory. The
# logic lives in the Linux script because PowerShell's native-arg handling
# eats $(...) and embedded double quotes, and herdr sizes new panes from the
# attached client.
function fmw {
    if (-not ($v = Get-LifHostValue WslDistro, HerdrPath)) { return }
    wsl.exe -d $v[0] -- $v[1]
}

function lif { if ($v = Get-LifHostValue StudioDir) { Set-Location $v } }
function notes { if ($v = Get-LifHostValue NotesDir) { Set-Location $v } }
function imagehub { if ($v = Get-LifHostValue ImageHubDir) { Set-Location $v } }

# Herdr handles multiplexing; no wrapper function is needed here. The previous
# `z` function existed only to force Zellij's shell, which it dropped on Windows.

# --- BWS access token (DPAPI-decrypted at session start) ---
$__bws = "$env:USERPROFILE\.bws\token.dpapi"
if (Test-Path $__bws) {
    $sec = Get-Content $__bws | ConvertTo-SecureString
    $env:BWS_ACCESS_TOKEN       = [System.Net.NetworkCredential]::new('', $sec).Password
    if ($LifHost.BwsProjectId) { $env:LIF_STUDIO_BWS_PROJECT = $LifHost.BwsProjectId }
    Remove-Variable sec
}
Remove-Variable __bws -ErrorAction SilentlyContinue

# --- ADR-0020: launch Claude Code wrapped in `bws run` (memory-only secrets) ---
# Shadows claude.exe so every launch path (cc, bare `claude`) gets process-scoped
# secrets. Guard skips re-wrapping when secrets are already injected (child of a
# wrapped process). bws run loses arg quoting, so args are re-quoted manually.
function claude {
    $exe = (Get-Command claude.exe -CommandType Application -ErrorAction SilentlyContinue).Source
    if (-not $exe) { Write-Error 'claude.exe not found on PATH'; return }
    if ($env:BWS_ACCESS_TOKEN -and $env:LIF_STUDIO_BWS_PROJECT -and -not $env:GH_TOKEN) {
        # Strip CLAUDE_CODE_OAUTH_TOKEN: it's for the headless .sandcastle agent;
        # if present it overrides Claude Code's interactive claude.ai login
        # (breaks Remote Control / model access). Other secrets stay injected.
        $cmd = @('$env:CLAUDE_CODE_OAUTH_TOKEN = $null;', "& '$exe'") + ($args | ForEach-Object { "'" + ("$_" -replace "'", "''") + "'" })
        # --shell pwsh: default shell is Windows PowerShell 5.1, whose Restricted
        # execution policy fails dot-sourcing its profile on this box
        bws run --shell pwsh --project-id $env:LIF_STUDIO_BWS_PROJECT -- ($cmd -join ' ')
    } else {
        & $exe @args
    }
}
