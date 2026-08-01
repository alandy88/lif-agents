# oh-my-posh init pwsh --config C:\Users\peter\emodipt-extend.omp.json | Invoke-Expression
Invoke-Expression (&starship init powershell)

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
# Launches Claude Code inside Ubuntu-24.04 at ~/firstmate. `bash -lc` is required:
# nvm's PATH lives in ~/.profile, and firstmate's non-interactive bin/*.sh need node.
# wsl.exe drops trailing positional args before bash sees them, so args are
# single-quoted and spliced into the command string instead of passed through.
function fm {
    $q = ($args | ForEach-Object { "'" + ("$_" -replace "'", "'\''") + "'" }) -join ' '
    wsl.exe -d Ubuntu-24.04 --cd /home/peter/firstmate -- bash -lc "claude --dangerously-skip-permissions $q"
}

# Shell in the firstmate home, for bin/ scripts, bootstrap, herdr, treehouse.
function fmsh { wsl.exe -d Ubuntu-24.04 --cd /home/peter/firstmate -- bash -l }

# Herdr in WSL, with a Claude pane already up in ~/firstmate. The logic lives in
# the Linux script because PowerShell's native-arg handling eats $(...) and
# embedded double quotes, and herdr sizes new panes from the attached client.
function fmw { wsl.exe -d Ubuntu-24.04 -- /home/peter/.local/bin/fm-herdr }

function lif { Set-Location 'D:\Git\lif-studio' }
function notes { Set-Location 'D:\Git\lif-notes' }
function imagehub { Set-Location 'D:\Git\Image-MetaHub-Personal' }

# psmux is the multiplexer. It defaults to pwsh and ships `psmux`/`pmux`/`tmux`
# aliases of its own, so no wrapper function is needed here — the previous `z`
# function existed only to force Zellij's shell, which it dropped on Windows.

# --- BWS access token (DPAPI-decrypted at session start) ---
$__bws = "$env:USERPROFILE\.bws\token.dpapi"
if (Test-Path $__bws) {
    $sec = Get-Content $__bws | ConvertTo-SecureString
    $env:BWS_ACCESS_TOKEN       = [System.Net.NetworkCredential]::new('', $sec).Password
    $env:LIF_STUDIO_BWS_PROJECT = 'be3c7d47-4b61-4b34-bef7-b45c00ae000f'
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

