# PreToolUse guard for Bash — destructive/risky git commands only
$RawInput = [Console]::In.ReadToEnd()
$Data = $RawInput | ConvertFrom-Json
$Cmd = $Data.tool_input.command

if (-not $Cmd) { exit 0 }

# Blank quoted spans so documentation text is never read as an executed command
# (`echo '(git commit --no-verify)'`), then split into command segments so each
# is judged on its own (`cd x && git push --force`, `a --force-with-lease && b --force`).
$Scan = [regex]::Replace($Cmd, "'[^']*'|" + '"[^"]*"', ' ')
$GitSegments = $Scan -split '[\r\n;&|()]+' |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ -match '^git(\s|$)' }

if (-not $GitSegments) { exit 0 }

# Bypass flags — checked first so a block always wins over a prompt
foreach ($Seg in $GitSegments) {
    if ($Seg -match '--no-verify|--no-gpg-sign') {
        [Console]::Error.WriteLine("BLOCKED: Do not bypass git hooks")
        exit 2
    }
}

foreach ($Seg in $GitSegments) {
    # Destructive
    if ($Seg -match 'git clean.*-f|git checkout -- \.|git reset --hard|git branch -[Dd]\b') {
        Write-Output '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Destructive git command"}}'
        exit 0
    }

    # --force-with-lease is the safe form — don't prompt on it
    if ($Seg -match 'push.*--force(?!-with-lease)|push.*\s-f\s|push.*\s-f$') {
        Write-Output '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Force push"}}'
        exit 0
    }
}

exit 0
