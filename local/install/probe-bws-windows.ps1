# Explicit, credential-safe compatibility probe for a configured Windows BWS host.
# It reports only versions/features and boolean outcomes. It never reads or
# enumerates project secrets and never prints, persists, hashes, or copies tokens.
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$ProjectId
)

$ErrorActionPreference = 'Stop'
$root = Join-Path ([System.IO.Path]::GetTempPath()) ("lif-bws-probe-" + [guid]::NewGuid())
$marker = 'lif-safe-parent-marker'
$previousMarker = $env:LIF_BWS_PROBE_PARENT
$hadMarker = Test-Path Env:LIF_BWS_PROBE_PARENT

try {
    $bwsCommand = Get-Command bws -ErrorAction Stop
    $bwsExe = (Get-Command bws.exe -CommandType Application -ErrorAction Stop).Source
    $pwshExe = (Get-Command pwsh.exe -CommandType Application -ErrorAction Stop).Source
    if ($bwsCommand.CommandType -ne 'Function') {
        throw 'Run this from a PowerShell session that loaded local/pwsh/profile.ps1 (the bws compatibility function is required).'
    }

    $versionText = (& $bwsExe --version 2>$null | Select-Object -First 1) -as [string]
    $version = if ($versionText -match '(\d+\.\d+\.\d+)') { $Matches[1] } else { 'unknown' }
    $helpText = (& $bwsExe run --help 2>&1) -join "`n"
    $supportsRun = $LASTEXITCODE -eq 0
    $supportsShell = $helpText -match '(?m)--shell\b'
    $supportsNoInherit = $helpText -match '(?m)--no-inherit-env\b'

    New-Item -ItemType Directory -Path $root | Out-Null
    $startupResult = Join-Path $root 'startup.txt'
    $claudeResult = Join-Path $root 'claude.txt'
    $source = @"
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
public static class Probe {
  const string Marker = "$marker";
  const string Startup = @"$startupResult";
  const string Claude = @"$claudeResult";
  const string Pwsh = @"$pwshExe";
  static bool TokenAbsent() => String.IsNullOrEmpty(Environment.GetEnvironmentVariable("BWS_ACCESS_TOKEN"));
  static bool MarkerSurvives() => Environment.GetEnvironmentVariable("LIF_BWS_PROBE_PARENT") == Marker;
  public static int Main(string[] args) {
    bool isClaude = Path.GetFileNameWithoutExtension(Environment.GetCommandLineArgs()[0]).Equals("claude", StringComparison.OrdinalIgnoreCase);
    File.WriteAllText(isClaude ? Claude : Startup, "token_absent=" + TokenAbsent().ToString().ToLowerInvariant() + "`nparent_survives=" + MarkerSurvives().ToString().ToLowerInvariant() + "`n");
    if (isClaude) return 0;
    string command = args.Length > 1 && args[0] == "-c" ? String.Join(" ", args.Skip(1)) : String.Join(" ", args);
    var p = Process.Start(new ProcessStartInfo(Pwsh, "-NoLogo -NoProfile -NonInteractive -Command " + Quote(command)) { UseShellExecute = false });
    p.WaitForExit(); return p.ExitCode;
  }
  static string Quote(string value) => "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
}
"@
    $shellExe = Join-Path $root 'lif-probe-shell.exe'
    Add-Type -TypeDefinition $source -Language CSharp -OutputAssembly $shellExe -OutputType ConsoleApplication
    Copy-Item $shellExe (Join-Path $root 'claude.exe')

    $env:LIF_BWS_PROBE_PARENT = $marker
    $oldPath = $env:PATH
    $env:PATH = "$root;$oldPath"
    try {
        # No --no-inherit-env: this tests the installed BWS contract that should
        # remove only BWS_ACCESS_TOKEN while preserving harmless parent inputs.
        bws run --shell $shellExe --project-id $ProjectId -- 'claude.exe'
        $authenticatedRun = $LASTEXITCODE -eq 0
    } finally {
        $env:PATH = $oldPath
    }

    $startup = if (Test-Path $startupResult) { Get-Content $startupResult } else { @() }
    $claude = if (Test-Path $claudeResult) { Get-Content $claudeResult } else { @() }
    [ordered]@{
        bws_version = $version
        run_supported = $supportsRun
        shell_supported = $supportsShell
        no_inherit_supported = $supportsNoInherit
        authenticated_run_succeeded = $authenticatedRun
        token_absent_before_powershell_startup = $startup -contains 'token_absent=true'
        harmless_parent_survived_before_startup = $startup -contains 'parent_survives=true'
        noop_claude_launched = (Test-Path $claudeResult)
        token_absent_in_noop_claude = $claude -contains 'token_absent=true'
        harmless_parent_survived_in_noop_claude = $claude -contains 'parent_survives=true'
    } | ConvertTo-Json
} catch {
    Write-Error ("probe_failed=true; reason=" + $_.Exception.Message)
    exit 1
} finally {
    if ($hadMarker) { $env:LIF_BWS_PROBE_PARENT = $previousMarker }
    else { Remove-Item Env:LIF_BWS_PROBE_PARENT -ErrorAction SilentlyContinue }
    Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
}
