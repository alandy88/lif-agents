# Explicit, credential-safe compatibility probe for a configured Windows BWS host.
# Reports versions/features and booleans only. It never reads, enumerates, prints,
# persists, hashes, or copies credential values.
[CmdletBinding()]
param([Parameter(Mandatory)][string]$ProjectId)

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
        throw 'Run this from a session that loaded local/pwsh/profile.ps1 (the bws compatibility function is required).'
    }

    $versionText = (& $bwsExe --version 2>$null | Select-Object -First 1) -as [string]
    $version = if ($versionText -match '(\d+\.\d+\.\d+)') { $Matches[1] } else { 'unknown' }
    $helpText = (& $bwsExe run --help 2>&1) -join "`n"
    $supportsRun = $LASTEXITCODE -eq 0
    $supportsShell = $helpText -match '(?m)--shell\b'
    $supportsNoInherit = $helpText -match '(?m)--no-inherit-env\b'

    New-Item -ItemType Directory -Path $root | Out-Null
    $baselineStartup = Join-Path $root 'baseline-startup.txt'
    $actualStartup = Join-Path $root 'actual-startup.txt'
    $baselineClaude = Join-Path $root 'baseline-claude.txt'
    $actualClaude = Join-Path $root 'actual-claude.txt'
    $source = @"
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
public static class Probe {
  const string Marker = "$marker";
  const string BaselineStartup = @"$baselineStartup";
  const string ActualStartup = @"$actualStartup";
  const string BaselineClaude = @"$baselineClaude";
  const string ActualClaude = @"$actualClaude";
  const string Pwsh = @"$pwshExe";
  static bool TokenAbsent() => String.IsNullOrEmpty(Environment.GetEnvironmentVariable("BWS_ACCESS_TOKEN"));
  static bool MarkerSurvives() => Environment.GetEnvironmentVariable("LIF_BWS_PROBE_PARENT") == Marker;
  static bool PathAvailable() => !String.IsNullOrEmpty(Environment.GetEnvironmentVariable("PATH"));
  static bool SystemRootAvailable() => !String.IsNullOrEmpty(Environment.GetEnvironmentVariable("SystemRoot"));
  static void Record(string path) => File.WriteAllText(path,
    "token_absent=" + TokenAbsent().ToString().ToLowerInvariant() + "`n" +
    "parent_survives=" + MarkerSurvives().ToString().ToLowerInvariant() + "`n" +
    "path_available=" + PathAvailable().ToString().ToLowerInvariant() + "`n" +
    "systemroot_available=" + SystemRootAvailable().ToString().ToLowerInvariant() + "`n");
  public static int Main(string[] args) {
    string name = Path.GetFileNameWithoutExtension(Environment.GetCommandLineArgs()[0]);
    bool isClaude = name.Equals("claude", StringComparison.OrdinalIgnoreCase);
    bool actual = (isClaude && args.FirstOrDefault() == "actual") || name.StartsWith("actual-", StringComparison.OrdinalIgnoreCase);
    Record(isClaude ? (actual ? ActualClaude : BaselineClaude) : (actual ? ActualStartup : BaselineStartup));
    if (isClaude) return 0;
    string command = args.Length > 1 && args[0] == "-c" ? String.Join(" ", args.Skip(1)) : String.Join(" ", args);
    // Deliberately allow normal profile startup. The probe does not edit the profile;
    // this verifies the environment seen by the real configured startup path.
    var p = Process.Start(new ProcessStartInfo(Pwsh, "-NoLogo -NonInteractive -Command " + Quote(command)) { UseShellExecute = false });
    p.WaitForExit(); return p.ExitCode;
  }
  static string Quote(string value) => "\"" + value.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
}
"@
    $baselineShell = Join-Path $root 'baseline-shell.exe'
    $actualShell = Join-Path $root 'actual-shell.exe'
    Add-Type -TypeDefinition $source -Language CSharp -OutputAssembly $baselineShell -OutputType ConsoleApplication
    Copy-Item $baselineShell $actualShell
    Copy-Item $baselineShell (Join-Path $root 'claude.exe')

    $env:LIF_BWS_PROBE_PARENT = $marker
    $oldPath = $env:PATH
    $env:PATH = "$root;$oldPath"
    try {
        bws run --shell $baselineShell --project-id $ProjectId -- 'claude.exe baseline'
        $baselineRun = $LASTEXITCODE -eq 0
        bws run --no-inherit-env --shell $actualShell --project-id $ProjectId -- 'claude.exe actual'
        $actualRun = $LASTEXITCODE -eq 0
    } finally {
        $env:PATH = $oldPath
    }

    function Read-Bools([string]$Path) {
        if (-not (Test-Path $Path)) { return @() }
        @(Get-Content $Path)
    }
    $bs = Read-Bools $baselineStartup
    $as = Read-Bools $actualStartup
    $bc = Read-Bools $baselineClaude
    $ac = Read-Bools $actualClaude
    [ordered]@{
        bws_version = $version
        run_supported = $supportsRun
        shell_supported = $supportsShell
        no_inherit_supported = $supportsNoInherit
        baseline_authenticated_run_succeeded = $baselineRun
        baseline_token_absent_before_profile = $bs -contains 'token_absent=true'
        baseline_parent_survived_before_profile = $bs -contains 'parent_survives=true'
        baseline_path_available_before_profile = $bs -contains 'path_available=true'
        baseline_systemroot_available_before_profile = $bs -contains 'systemroot_available=true'
        baseline_noop_claude_launched = Test-Path $baselineClaude
        baseline_token_absent_in_noop_claude = $bc -contains 'token_absent=true'
        baseline_parent_survived_in_noop_claude = $bc -contains 'parent_survives=true'
        actual_authenticated_run_succeeded = $actualRun
        actual_token_absent_before_profile = $as -contains 'token_absent=true'
        actual_parent_survived_before_profile = $as -contains 'parent_survives=true'
        actual_path_available_before_profile = $as -contains 'path_available=true'
        actual_systemroot_available_before_profile = $as -contains 'systemroot_available=true'
        actual_noop_claude_launched = Test-Path $actualClaude
        actual_token_absent_in_noop_claude = $ac -contains 'token_absent=true'
        actual_parent_survived_in_noop_claude = $ac -contains 'parent_survives=true'
    } | ConvertTo-Json
} catch {
    Write-Error ("probe_failed=true; reason=" + $_.Exception.Message)
    exit 1
} finally {
    if ($hadMarker) { $env:LIF_BWS_PROBE_PARENT = $previousMarker }
    else { Remove-Item Env:LIF_BWS_PROBE_PARENT -ErrorAction SilentlyContinue }
    Remove-Item $root -Recurse -Force -ErrorAction SilentlyContinue
}
