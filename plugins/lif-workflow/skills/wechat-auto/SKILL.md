---
name: wechat-auto
disable-model-invocation: true
description: "Drives the WeChat desktop app (v4.x) on Windows through UI Automation with an AutoHotkey v2 command-line script: checks status, opens a chat, sends text or images, reads recent messages, or screenshots a chat. Use when the user asks to send something to a WeChat contact or to read a WeChat chat on the Windows workstation."
argument-hint: "<command> [options]"
allowed-tools: PowerShell(* wechat-cli* *)
---

# wechat-auto

Windows only. `scripts/wechat-cli.ahk` is the command-line script; `scripts/lib/`
holds the modules it includes.

## Setup

- AutoHotkey v2 at `C:/Users/peter/AppData/Local/Programs/AutoHotkey/v2/AutoHotkey64.exe`.
- WeChat desktop open and logged in, not minimized to the tray.
- Run from PowerShell. Bash/MSYS2 mangles Windows paths when it starts
  AutoHotkey, and the script then fails with "script not found".

Set `$SKILL_DIR` to this skill's folder, then define the helper once per session:

```powershell
function Invoke-WeChatCLI {
    param([string[]]$Arguments)
    $ahk = "C:/Users/peter/AppData/Local/Programs/AutoHotkey/v2/AutoHotkey64.exe"
    $cli = [System.IO.Path]::GetFullPath("$SKILL_DIR/scripts/wechat-cli.ahk")
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

Every command also writes its result as JSON to `$env:TEMP/wechat-cli-result.json`
(or the path in `WECHAT_CLI_RESULT`). Read it after each command.

## Before you send

`send` posts to a real contact. Show the user the recipient and the exact text
or the list of image files, and run `send` only after a yes. For a test, send
to `文件传输助手` (File Transfer), which only the user sees.

## Commands

```powershell
Invoke-WeChatCLI status                                          # is WeChat reachable
Invoke-WeChatCLI navigate, --chat, "张三"                         # open a chat
Invoke-WeChatCLI send, --to, "张三", --text, "你好"
Invoke-WeChatCLI send, --to, "张三", --image, "C:/path/to/photo.png"
Invoke-WeChatCLI send, --to, "张三", --image-dir, "C:/path/to/folder"   # 9 images per message
Invoke-WeChatCLI history, --chat, "张三", --limit, 30, --format, json   # last 30 messages, with senders
Invoke-WeChatCLI history, --chat, "张三", --screenshot                  # PNG of the visible chat
```

To check that a message arrived, run `history` on the same chat with `--limit 3`.

## Options

| Option | Default | Used by |
|---|---|---|
| `--format toon\|json\|text` | `toon` | `history` output and error messages; `status`, `navigate` and `send` always print toon |
| `--delay <ms>` | 1200, jittered ±30% | `send` |
| `--limit <n>` | 20 | `history` |
| `--save-images` | off | `history`: save the images in range to the save folder |
| `--screenshot` | off | `history` |
| `--save-dir <path>` | `$env:TEMP/wechat-cli` | `history` |
| `--timeout <ms>` | 30000 | all; exit code 5 when reached |

`--quiet` and `--dry-run` are accepted and have no effect. Unknown options are
dropped without a warning, so check the spelling.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | WeChat window not found or cannot be focused, or navigation failed |
| 2 | Chat not found |
| 3 | Send or read failed, including a rate-limit refusal |
| 4 | Invalid arguments, or the image file or folder does not exist |
| 5 | Timeout |
| 6 | Another instance is running |

## What the safety code does and does not do

- One instance at a time, through the lock file `$env:TEMP/wechat-cli.lock`. A
  lock older than 60 seconds counts as stale and is replaced.
- Delays between actions are jittered ±30%.
- The rate limits (30 sends per contact and 150 in total per hour;
  `文件传输助手` exempt) are counted in memory and reset when the command exits.
  They only cap sends inside one `send` command; across commands there is no
  limit, so pace repeated sends yourself.
- WeChat is brought to the front for navigation, sending and reading history,
  and the window that was active before is not restored. Warn the user before a
  run if they are working in another window.
- `send --image-dir` exits 0 even when some or all batches failed. Compare
  `messagesSent` in the result file with the number of images in the folder.

## Tests

`tests/run-all.ahk --unit-only` runs the output-format unit tests without
WeChat. Without `--unit-only` it also runs end-to-end suites that drive the live
WeChat window and send to `文件传输助手`; run those only when the user asks.
