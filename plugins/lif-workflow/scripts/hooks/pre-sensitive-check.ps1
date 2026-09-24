# Consolidated PreToolUse guard for Read|Edit|Write|MultiEdit
# Checks: sensitive files, git internals, lockfiles
$RawInput = [Console]::In.ReadToEnd()
$Data = $RawInput | ConvertFrom-Json
$Tool = $Data.tool_name

switch ($Tool) {
    { $_ -in 'Read','Edit','Write','MultiEdit' } {
        $File = $Data.tool_input.file_path
        if (-not $File) { exit 0 }

        # Secret files
        if ($File -match '\.(env|env\..+)$' -and $File -notmatch '\.example$') {
            Write-Output '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Sensitive file"}}'
            exit 0
        }
        if ($File -match '_rsa$|\.pem$|\.key$|credentials\.json$|secrets\.') {
            Write-Output '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Sensitive file"}}'
            exit 0
        }

        # Git internals and lockfiles — prompt on write operations only
        if ($_ -ne 'Read') {
            if ($File -match '[\\/]\.git[\\/]|^\.git[\\/]') {
                Write-Output '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Git internal file"}}'
                exit 0
            }
            if ($File -match '(^|[\\/])(uv\.lock|bun\.lock|poetry\.lock|pnpm-lock\.yaml|package-lock\.json)$') {
                Write-Output '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Lock file"}}'
                exit 0
            }
        }
    }
}

exit 0
