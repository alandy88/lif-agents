# PostToolUse hook — Biome check+write for JS/JSX files
# Always exits 0 — failures are advisory, never blocking.
$RawInput = [Console]::In.ReadToEnd()
$Data = $RawInput | ConvertFrom-Json
$File = $Data.tool_input.file_path

if ($File -notmatch '\.(jsx?)$') { exit 0 }

try { Get-Command biome -ErrorAction Stop } catch {
    [Console]::Error.WriteLine("[Hook] biome not found on PATH, skipping")
    exit 0
}

& biome check --write $File 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    [Console]::Error.WriteLine("[Hook] Biome reported issues in $File")
}

exit 0
