<#
.SYNOPSIS
  Point WezTerm, Starship, and the PowerShell profile at this repo.

.DESCRIPTION
  Windows symlinks need Developer Mode or admin, and junctions only work on
  directories -- so redirect env vars are used instead. Idempotent: safe to
  re-run after a `git pull`.

  Backs up any file it replaces to <name>.pre-lif-terminal.bak, using a
  numbered suffix when that backup already exists. The original configs are
  left in place; delete them once you have verified the new paths actually load.

.PARAMETER WhatIf
  Show what would change without touching anything.
#>
[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'
# This script lives in local/install/; the configs live beside it under local/.
$localRoot = Split-Path $PSScriptRoot -Parent

function Get-BackupPath {
    param([string]$Path)

    $backup = "$Path.pre-lif-terminal.bak"
    $backupIndex = 1
    while (Test-Path -LiteralPath $backup) {
        $backup = "$Path.pre-lif-terminal.$backupIndex.bak"
        $backupIndex++
    }
    return $backup
}

function Set-ManagedFile {
    param(
        [string]$Source,
        [string]$Destination
    )

    $destinationItem = Get-Item -LiteralPath $Destination -Force -ErrorAction SilentlyContinue
    if ($destinationItem -and $destinationItem.PSObject.Properties.Name -contains 'LinkType' -and $destinationItem.LinkType) {
        $resolved = Resolve-Path -LiteralPath $Destination -ErrorAction SilentlyContinue
        $sourcePath = [IO.Path]::GetFullPath($Source)
        if (-not $resolved -or [IO.Path]::GetFullPath($resolved.Path) -ne $sourcePath) {
            Write-Host "  keep $Destination (symlink outside this checkout)" -ForegroundColor DarkGray
            return
        }
    }

    if ($destinationItem -and -not $destinationItem.PSIsContainer) {
        $sourceText = Get-Content -LiteralPath $Source -Raw
        $destinationText = Get-Content -LiteralPath $Destination -Raw
        if ($sourceText -eq $destinationText) {
            Write-Host "  ok   $Destination" -ForegroundColor DarkGray
            return
        }
    }

    $backup = if ($destinationItem) { Get-BackupPath $Destination } else { $null }
    $operation = if ($backup) { "backup to $backup and copy managed file" } else { 'copy managed file' }
    if ($PSCmdlet.ShouldProcess($Destination, $operation)) {
        if ($backup) {
            Copy-Item -LiteralPath $Destination -Destination $backup -Force
            Write-Host "  bak  $backup" -ForegroundColor Yellow
        }
        New-Item (Split-Path $Destination) -ItemType Directory -Force | Out-Null
        Copy-Item -LiteralPath $Source -Destination $Destination -Force
        Write-Host "  set  $Destination" -ForegroundColor Green
    }
}

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
Set-UserEnv WEZTERM_CONFIG_FILE (Join-Path $localRoot 'wezterm\wezterm.lua')
Set-UserEnv STARSHIP_CONFIG     (Join-Path $localRoot 'starship\starship.toml')

Write-Host "Pi extension" -ForegroundColor Cyan
Set-ManagedFile (Join-Path $localRoot 'pi\extensions\pi-status-footer.ts') (Join-Path $HOME '.pi\agent\extensions\pi-status-footer.ts')
Set-ManagedFile (Join-Path $localRoot 'pi\extensions\quiet-tools.ts') (Join-Path $HOME '.pi\agent\extensions\quiet-tools.ts')

Write-Host "Noninteractive BWS wrapper" -ForegroundColor Cyan
Set-ManagedFile (Join-Path $localRoot 'bin\lif-bws.ps1') (Join-Path $HOME '.local\bin\lif-bws.ps1')
Set-ManagedFile (Join-Path $localRoot 'bin\lif-bws.cmd') (Join-Path $HOME '.local\bin\lif-bws.cmd')

Write-Host "PowerShell profile" -ForegroundColor Cyan
$profileScript = Join-Path $localRoot 'pwsh\profile.ps1'
$escapedProfileScript = $profileScript.Replace("'", "''")
$stub = ". '$escapedProfileScript'"
if ((Test-Path $PROFILE) -and (Get-Content $PROFILE -Raw).Trim() -eq $stub) {
    Write-Host "  ok   $PROFILE" -ForegroundColor DarkGray
}
elseif ($PSCmdlet.ShouldProcess($PROFILE, 'replace with dot-source stub')) {
    if (Test-Path $PROFILE) {
        $backup = "$PROFILE.pre-lif-terminal.bak"
        $backupIndex = 1
        while (Test-Path -LiteralPath $backup) {
            $backup = "$PROFILE.pre-lif-terminal.$backupIndex.bak"
            $backupIndex++
        }
        Copy-Item $PROFILE $backup
        Write-Host "  bak  $backup" -ForegroundColor Yellow
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
