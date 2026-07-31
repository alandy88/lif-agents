<#
.SYNOPSIS
  Point WezTerm, Starship, and the PowerShell profile at this repo.

.DESCRIPTION
  Windows symlinks need Developer Mode or admin, and junctions only work on
  directories -- so redirect env vars are used instead. Idempotent: safe to
  re-run after a `git pull`.

  Backs up any file it replaces to <name>.pre-lif-terminal.bak. The original
  configs are left in place; delete them once you have verified the new paths
  actually load.

.PARAMETER WhatIf
  Show what would change without touching anything.
#>
[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'
$repo = $PSScriptRoot

function Set-UserEnv {
    param([string]$Name, [string]$Value)

    $current = [Environment]::GetEnvironmentVariable($Name, 'User')
    if ($current -eq $Value) {
        Write-Host "  ok   $Name" -ForegroundColor DarkGray
        return
    }
    if ($PSCmdlet.ShouldProcess($Name, "set user env -> $Value")) {
        [Environment]::SetEnvironmentVariable($Name, $Value, 'User')
        Set-Item "env:$Name" $Value   # so the current session sees it too
        Write-Host "  set  $Name = $Value" -ForegroundColor Green
    }
}

Write-Host "Environment variables" -ForegroundColor Cyan
Set-UserEnv WEZTERM_CONFIG_FILE (Join-Path $repo 'wezterm\wezterm.lua')
Set-UserEnv STARSHIP_CONFIG     (Join-Path $repo 'starship\starship.toml')

Write-Host "PowerShell profile" -ForegroundColor Cyan
$stub = ". '$(Join-Path $repo 'pwsh\profile.ps1')'"
if ((Test-Path $PROFILE) -and (Get-Content $PROFILE -Raw).Trim() -eq $stub) {
    Write-Host "  ok   $PROFILE" -ForegroundColor DarkGray
}
elseif ($PSCmdlet.ShouldProcess($PROFILE, 'replace with dot-source stub')) {
    if (Test-Path $PROFILE) {
        Copy-Item $PROFILE "$PROFILE.pre-lif-terminal.bak" -Force
        Write-Host "  bak  $PROFILE.pre-lif-terminal.bak" -ForegroundColor Yellow
    }
    else {
        New-Item (Split-Path $PROFILE) -ItemType Directory -Force | Out-Null
    }
    Set-Content $PROFILE $stub
    Write-Host "  set  $PROFILE -> stub" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Open a new WezTerm window, then verify the config actually" -ForegroundColor Cyan
Write-Host "loaded -- WezTerm falls back to full defaults on any error, silently:" -ForegroundColor Cyan
Write-Host "  (wezterm show-keys | Select-String 'Split').Count   # 0 = loaded, 6 = defaults" -ForegroundColor White
