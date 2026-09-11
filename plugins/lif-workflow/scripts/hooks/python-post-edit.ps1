# PostToolUse hook — Ruff lint+format, Pyright typecheck, print() detection
# Runs sequentially: ruff fix → ruff format → pyright → print check
# Always exits 0 — failures are advisory, never blocking.
$RawInput = [Console]::In.ReadToEnd()
$Data = $RawInput | ConvertFrom-Json
$File = $Data.tool_input.file_path

if ($File -notmatch '\.py$') { exit 0 }

# --- Ruff lint + format ---
$hasRuff = $null -ne (Get-Command ruff -ErrorAction SilentlyContinue)
if ($hasRuff) {
    & ruff check --fix $File 2>&1 | ForEach-Object { [Console]::Error.WriteLine($_) }
    if ($LASTEXITCODE -ne 0) {
        [Console]::Error.WriteLine("[Hook] Ruff check reported issues in $File")
    }
    & ruff format $File 2>&1 | ForEach-Object { [Console]::Error.WriteLine($_) }
    if ($LASTEXITCODE -ne 0) {
        [Console]::Error.WriteLine("[Hook] Ruff format reported issues in $File")
    }
} else {
    [Console]::Error.WriteLine("[Hook] ruff not found on PATH (run lif-cli dev bootstrap), skipping")
}

# --- Pyright typecheck ---
$hasPyright = $null -ne (Get-Command pyright -ErrorAction SilentlyContinue)
if ($hasPyright) {
    & pyright $File 2>&1 | ForEach-Object { [Console]::Error.WriteLine($_) }
    if ($LASTEXITCODE -ne 0) {
        [Console]::Error.WriteLine("[Hook] Pyright found type errors in $File")
    }
} else {
    [Console]::Error.WriteLine("[Hook] pyright not found on PATH, skipping")
}

# --- Print statement detection ---
if (Test-Path $File) {
    $count = @(Select-String -Path $File -Pattern '\bprint\(' -ErrorAction SilentlyContinue).Count
    if ($count -gt 0) {
        $ctx = "Warning: $count print() statement(s) found in $File — prefer logging module"
        Write-Output "{`"hookSpecificOutput`":{`"hookEventName`":`"PostToolUse`",`"additionalContext`":`"$ctx`"}}"
    }
}

exit 0
