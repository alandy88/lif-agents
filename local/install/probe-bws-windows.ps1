# Explicit, credential-safe compatibility probe for a configured Windows BWS host.
# Reports versions/features and booleans only; never reads or reports secret values.
[CmdletBinding()]
param(
    [string]$ProjectId,
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
$root = Join-Path ([System.IO.Path]::GetTempPath()) ("lif-bws-probe-" + [guid]::NewGuid())
$marker = 'lif-safe-parent-marker'
$previousMarker = $env:LIF_BWS_PROBE_PARENT
$hadMarker = Test-Path Env:LIF_BWS_PROBE_PARENT

function One-Application([string]$Name) {
    $applications = @(Get-Command $Name -CommandType Application -ErrorAction Stop | Sort-Object Source -Unique)
    if ($applications.Count -eq 0) { throw "$Name was not found" }
    $applications[0].Source
}

try {
    $pwshExe = One-Application 'pwsh.exe'
    if (-not $SelfTest) {
        if (-not $ProjectId) { throw '-ProjectId is required unless -SelfTest is used' }
        $bwsCommand = Get-Command bws -ErrorAction Stop
        $bwsExe = One-Application 'bws.exe'
        if ($bwsCommand.CommandType -ne 'Function') {
            throw 'Run from a session that loaded local/pwsh/profile.ps1 (the bws compatibility function is required).'
        }
        $versionText = (& $bwsExe --version 2>$null | Select-Object -First 1) -as [string]
        $version = if ($versionText -match '(\d+\.\d+\.\d+)') { $Matches[1] } else { 'unknown' }
        $helpText = (& $bwsExe run --help 2>&1) -join "`n"
        $supportsRun = $LASTEXITCODE -eq 0
        $supportsShell = $helpText -match '(?m)--shell\b'
        $supportsNoInherit = $helpText -match '(?m)--no-inherit-env\b'
    } else {
        $version = 'self-test'
        $supportsRun = $supportsShell = $supportsNoInherit = $true
    }

    New-Item -ItemType Directory -Path $root | Out-Null
    $baselineStartup = Join-Path $root 'baseline-startup.txt'
    $actualStartup = Join-Path $root 'actual-startup.txt'
    $baselineClaude = Join-Path $root 'baseline-claude.txt'
    $actualClaude = Join-Path $root 'actual-claude.txt'
    $baselineNoop = Join-Path $root 'baseline-claude.cmd'
    $actualNoop = Join-Path $root 'actual-claude.cmd'

    function Write-Recorder([string]$Path, [string]$Result) {
        $lines = @(
            '@echo off',
            ('if defined BWS_ACCESS_TOKEN (echo token_absent=false>"{0}") else (echo token_absent=true>"{0}")' -f $Result),
            ('if "%LIF_BWS_PROBE_PARENT%"=="{0}" (echo parent_survives=true>>"{1}") else (echo parent_survives=false>>"{1}")' -f $marker, $Result),
            ('if defined PATH (echo path_available=true>>"{0}") else (echo path_available=false>>"{0}")' -f $Result),
            ('if defined SystemRoot (echo systemroot_available=true>>"{0}") else (echo systemroot_available=false>>"{0}")' -f $Result),
            'exit /b 0'
        )
        Set-Content -LiteralPath $Path -Value $lines -Encoding Ascii
    }
    Write-Recorder $baselineNoop $baselineClaude
    Write-Recorder $actualNoop $actualClaude

    function Write-Shell([string]$Path, [string]$Result, [string]$Noop) {
        $lines = @(
            '@echo off',
            ('if defined BWS_ACCESS_TOKEN (echo token_absent=false>"{0}") else (echo token_absent=true>"{0}")' -f $Result),
            ('if "%LIF_BWS_PROBE_PARENT%"=="{0}" (echo parent_survives=true>>"{1}") else (echo parent_survives=false>>"{1}")' -f $marker, $Result),
            ('if defined PATH (echo path_available=true>>"{0}") else (echo path_available=false>>"{0}")' -f $Result),
            ('if defined SystemRoot (echo systemroot_available=true>>"{0}") else (echo systemroot_available=false>>"{0}")' -f $Result),
            # Ignore BWS's `-c command` arguments. The fixed no-op is safer and
            # still starts normal pwsh profiles under the exact BWS environment.
            ('"{0}" -NoLogo -NonInteractive -Command "& ''{1}''"' -f $pwshExe, $Noop),
            'exit /b %ERRORLEVEL%'
        )
        Set-Content -LiteralPath $Path -Value $lines -Encoding Ascii
    }
    $baselineShell = Join-Path $root 'baseline-shell.cmd'
    $actualShell = Join-Path $root 'actual-shell.cmd'
    Write-Shell $baselineShell $baselineStartup $baselineNoop
    Write-Shell $actualShell $actualStartup $actualNoop

    $env:LIF_BWS_PROBE_PARENT = $marker
    if ($SelfTest) {
        Remove-Item Env:BWS_ACCESS_TOKEN -ErrorAction SilentlyContinue
        & $baselineShell -c ignored
        $baselineRun = $LASTEXITCODE -eq 0
        Remove-Item Env:LIF_BWS_PROBE_PARENT -ErrorAction SilentlyContinue
        & $actualShell -c ignored
        $actualRun = $LASTEXITCODE -eq 0
        $env:LIF_BWS_PROBE_PARENT = $marker
    } else {
        bws run --shell $baselineShell --project-id $ProjectId -- ignored
        $baselineRun = $LASTEXITCODE -eq 0
        bws run --no-inherit-env --shell $actualShell --project-id $ProjectId -- ignored
        $actualRun = $LASTEXITCODE -eq 0
    }

    function Read-Bools([string]$Path) {
        if (Test-Path $Path) { @(Get-Content $Path) } else { @() }
    }
    $bs = Read-Bools $baselineStartup; $as = Read-Bools $actualStartup
    $bc = Read-Bools $baselineClaude; $ac = Read-Bools $actualClaude
    $result = [ordered]@{
        bws_version = $version; run_supported = $supportsRun; shell_supported = $supportsShell; no_inherit_supported = $supportsNoInherit
        baseline_authenticated_run_succeeded = $baselineRun
        baseline_token_absent_before_profile = $bs -contains 'token_absent=true'; baseline_parent_survived_before_profile = $bs -contains 'parent_survives=true'
        baseline_path_available_before_profile = $bs -contains 'path_available=true'; baseline_systemroot_available_before_profile = $bs -contains 'systemroot_available=true'
        baseline_noop_claude_launched = Test-Path $baselineClaude; baseline_token_absent_in_noop_claude = $bc -contains 'token_absent=true'; baseline_parent_survived_in_noop_claude = $bc -contains 'parent_survives=true'
        actual_authenticated_run_succeeded = $actualRun
        actual_token_absent_before_profile = $as -contains 'token_absent=true'; actual_parent_survived_before_profile = $as -contains 'parent_survives=true'
        actual_path_available_before_profile = $as -contains 'path_available=true'; actual_systemroot_available_before_profile = $as -contains 'systemroot_available=true'
        actual_noop_claude_launched = Test-Path $actualClaude; actual_token_absent_in_noop_claude = $ac -contains 'token_absent=true'; actual_parent_survived_in_noop_claude = $ac -contains 'parent_survives=true'
    }
    if ($SelfTest -and (-not $baselineRun -or -not $actualRun -or -not (Test-Path $baselineClaude) -or -not (Test-Path $actualClaude))) {
        throw 'temporary cmd shell self-test failed'
    }
    $result | ConvertTo-Json
} catch {
    Write-Error ("probe_failed=true; reason=" + $_.Exception.Message)
    exit 1
} finally {
    if ($hadMarker) { $env:LIF_BWS_PROBE_PARENT = $previousMarker } else { Remove-Item Env:LIF_BWS_PROBE_PARENT -ErrorAction SilentlyContinue }
    Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
}
