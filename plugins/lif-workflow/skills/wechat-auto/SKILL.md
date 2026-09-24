---
name: wechat-auto
disable-model-invocation: true
description: "Automate WeChat desktop (v4.x) — send/read messages, images via UI Automation. CLI for agent consumption."
argument-hint: "<command> [options]"
allowed-tools: PowerShell(* wechat-cli* *)
---

## Setup

AutoHotkey v2 executable: `C:\Users\peter\AppData\Local\Programs\AutoHotkey\v2\AutoHotkey64.exe`

**Prerequisite:** WeChat desktop must be open and logged in (not minimized to tray).

**Important:** Always use PowerShell for invocation. Bash/MSYS2 mangles Windows paths when spawning AHK — causes silent "script not found" failures.

## Invocation

Define helper once per session. All examples below use it.

```powershell
function Invoke-WeChatCLI {
    param([string[]]$Arguments)
    $ahk = "C:\Users\peter\AppData\Local\Programs\AutoHotkey\v2\AutoHotkey64.exe"
    $cli = "$SKILL_DIR\scripts\wechat-cli.ahk"   # substitute actual path
    $stdout = [System.IO.Path]::GetTempFileName()
    $stderr = [System.IO.Path]::GetTempFileName()
    # Quote every argument so values with spaces survive Start-Process's re-split.
    $quoted = $Arguments | ForEach-Object { '"' + ($_ -replace '"', '\"') + '"' }
    $argString = "/ErrorStdOut `"$cli`" " + ($quoted -join " ")
    $p = Start-Process -FilePath $ahk -ArgumentList $argString `
        -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    Get-Content $stdout -Encoding UTF8
    if ($p.ExitCode -ne 0) { Get-Content $stderr -Encoding UTF8 | Write-Warning }
    Remove-Item $stdout, $stderr -ErrorAction SilentlyContinue
    return $p.ExitCode
}
```

### Result file

Every invocation writes structured JSON to `%TEMP%\wechat-cli-result.json` (override with `WECHAT_CLI_RESULT` env var). Read after each command for machine-parseable output:

```powershell
Get-Content "$env:TEMP\wechat-cli-result.json" -Encoding UTF8
```

## Commands

```powershell
# Check WeChat accessible
Invoke-WeChatCLI status

# Navigate to chat
Invoke-WeChatCLI navigate, --chat, "张三"

# Send text message
Invoke-WeChatCLI send, --to, "张三", --text, "你好"

# Send single image
Invoke-WeChatCLI send, --to, "张三", --image, "C:\path\to\photo.png"

# Send folder of images (auto-batched 9 per send)
Invoke-WeChatCLI send, --to, "张三", --image-dir, "C:\path\to\folder"

# Read last N messages (scrolls to load more)
Invoke-WeChatCLI history, --chat, "张三", --limit, 10

# Screenshot visible chat area
Invoke-WeChatCLI history, --chat, "张三", --screenshot

# JSON output
Invoke-WeChatCLI history, --chat, "张三", --format, json
```

## Agent Patterns

### "Send all images in folder X to person Y"

```powershell
Invoke-WeChatCLI send, --to, "Y", --image-dir, "X"
```

### "Read what Z said and summarize"

```powershell
Invoke-WeChatCLI history, --chat, "Z", --limit, 30, --format, json
# Then read result file for structured data with sender attribution
Get-Content "$env:TEMP\wechat-cli-result.json" -Encoding UTF8
```

### "Send text then check it arrived"

```powershell
Invoke-WeChatCLI send, --to, "文件传输助手", --text, "hello"
Invoke-WeChatCLI history, --chat, "文件传输助手", --limit, 3
```

## Global Options

- `--format toon|json|text` (default: toon)
- `--delay <ms>` (default: 1200, jittered ±30%)
- `--quiet` — suppress progress, only result
- `--save-dir <path>` (default: %TEMP%\wechat-cli)
- `--timeout <ms>` (default: 30000)
- `--save-images` — save all images in history range to save-dir
- `--screenshot` — capture visible chat area as PNG

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | WeChat not found |
| 2 | Chat not found |
| 3 | Send/read failed |
| 4 | Invalid args |
| 5 | Timeout |
| 6 | Another instance running |

## Safety

- Rate limits: 30/contact/hr, 150 global/hr. `文件传输助手` exempt.
- Mutex lock prevents concurrent instances. Auto-expires 60s.
- Jittered delays avoid bot-like timing.
- Script does NOT steal window focus — uses UIA and PostMessage for all interaction. Safe to run from background process.
- EnsureFocus guard activates WeChat only when Send() keystroke is needed; returns focus after.
