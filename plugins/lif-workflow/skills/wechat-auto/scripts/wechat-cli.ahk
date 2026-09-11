#Requires AutoHotkey v2.0
#SingleInstance Force

#Include lib\UIA.ahk
#Include lib\OCR.ahk
#Include lib\Output.ahk
#Include lib\Locators.ahk
#Include lib\Element.ahk
#Include lib\WeChat.ahk
#Include lib\ChatPanel.ahk
#Include lib\Sidebar.ahk
#Include lib\MessageSender.ahk
#Include lib\HistoryReader.ahk

class CLI {
    static Version := "0.1.0"

    static Exit(code, data := "") {
        if data {
            Output.Emit(Output.FormatByName(data, "toon"))
            Output.WriteResult(data)
        }
        ExitApp code
    }

    static ExitError(command, msg, code, format := "toon") {
        data := Map("command", command, "status", "error", "code", code, "error", msg)
        Output.Emit(Output.FormatError(command, msg, code, format))
        Output.WriteResult(data)
        ExitApp code
    }

    static Run() {
        args := this.ParseArgs()
        if !args.command {
            this.PrintUsage()
            ExitApp 4
        }

        ; Clean stale result file
        try FileDelete(Output.ResultPath)

        ; Global timeout watchdog
        SetTimer(() => this.ExitError(args.command, "Timeout after " args.timeout "ms", 5, args.format), -args.timeout)

        ; Concurrency guard
        if !WeChatSafety.AcquireLock()
            this.ExitError(args.command, "Another wechat-cli instance is running", 6, args.format)
        OnExit((*) => WeChatSafety.ReleaseLock())

        switch args.command {
            case "status":    this.CmdStatus(args)
            case "navigate":  this.CmdNavigate(args)
            case "send":      this.CmdSend(args)
            case "history":   this.CmdHistory(args)
            default:
                this.ExitError(args.command, "Unknown command: " args.command, 4, args.format)
        }
    }

    static ParseArgs() {
        result := {
            command: "",
            chat: "",
            to: "",
            text: "",
            image: "",
            imageDir: "",
            format: "toon",
            delay: 1200,
            quiet: false,
            saveDir: EnvGet("TEMP") "\wechat-cli",
            limit: 20,
            saveImages: false,
            screenshot: false,
            timeout: 30000,
            dryRun: false
        }
        args := A_Args
        if args.Length < 1
            return result
        result.command := args[1]
        i := 2
        while i <= args.Length {
            switch args[i] {
                case "--chat":      result.chat := args[++i]
                case "--to":        result.to := args[++i]
                case "--text":      result.text := args[++i]
                case "--image":     result.image := args[++i]
                case "--image-dir": result.imageDir := args[++i]
                case "--format":    result.format := args[++i]
                case "--delay":     result.delay := Integer(args[++i])
                case "--quiet":     result.quiet := true
                case "--save-dir":  result.saveDir := args[++i]
                case "--limit":     result.limit := Integer(args[++i])
                case "--save-images": result.saveImages := true
                case "--screenshot": result.screenshot := true
                case "--timeout":   result.timeout := Integer(args[++i])
                case "--dry-run":   result.dryRun := true
            }
            i++
        }
        return result
    }

    static PrintUsage() {
        FileAppend("
        (
wechat-cli v" this.Version "
Usage: wechat-cli.ahk <command> [options]

Commands:
  status                          Check WeChat accessibility
  navigate --chat <name>          Navigate to chat
  send --to <name> [options]      Send message/images
  history --chat <name> [options] Read chat history

Send options:
  --text <message>    Text to send
  --image <path>      Single image file
  --image-dir <path>  Directory of images (batched by 9)

History options:
  --limit <n>         Number of messages (default: 20)
  --save-images       Save all images in range
  --screenshot        Capture visible chat area

Global options:
  --format <toon|json|text>  Output format (default: toon)
  --delay <ms>               Base delay between actions (default: 1200)
  --quiet                    Suppress progress output
  --save-dir <path>          Image/screenshot save directory
  --timeout <ms>             Global timeout (default: 30000)
        )", "*", "UTF-8")
    }

    static CmdStatus(args) {
        status := WeChat.GetStatus()
        data := Map(
            "command", "status",
            "status", status["running"] ? "ok" : "error",
            "result", status
        )
        this.Exit(status["running"] ? 0 : 1, data)
    }

    static CmdNavigate(args) {
        if !args.chat
            this.ExitError("navigate", "Missing --chat argument", 4, args.format)
        r := Sidebar.NavigateToChat(args.chat)
        if r.ok {
            this.Exit(0, Map("command", "navigate", "status", "ok", "chat", args.chat))
        } else {
            this.ExitError("navigate", r.error, r.code, args.format)
        }
    }

    static CmdSend(args) {
        if !args.to
            this.ExitError("send", "Missing --to argument", 4, args.format)
        if !args.text && !args.image && !args.imageDir
            this.ExitError("send", "Nothing to send (need --text, --image, or --image-dir)", 4, args.format)

        results := []

        if args.text {
            r := MessageSender.SendText(args.to, args.text, args.delay)
            results.Push(r)
            if !r.ok
                this.ExitError("send", r.error, r.code, args.format)
        }

        if args.image {
            r := MessageSender.SendImage(args.to, args.image, args.delay)
            results.Push(r)
            if !r.ok
                this.ExitError("send", r.error, r.code, args.format)
        }

        if args.imageDir {
            r := MessageSender.SendImageDir(args.to, args.imageDir, args.delay)
            results.Push(r)
            if !r.ok && r.sent = 0
                this.ExitError("send", r.error, r.code, args.format)
        }

        totalSent := 0
        for r in results
            totalSent += r.HasProp("sent") ? r.sent : 0

        this.Exit(0, Map(
            "command", "send",
            "status", "ok",
            "result", Map("chat", args.to, "messagesSent", totalSent)
        ))
    }

    static CmdHistory(args) {
        if !args.chat
            this.ExitError("history", "Missing --chat argument", 4, args.format)

        if args.screenshot {
            r := HistoryReader.TakeScreenshot(args.chat, args.saveDir)
            if r.ok {
                this.Exit(0, Map("command", "history", "status", "ok", "chat", args.chat, "screenshot", r.file))
            } else {
                this.ExitError("history", r.error, r.code, args.format)
            }
        }

        r := HistoryReader.ReadMessages(args.chat, args.limit, args.saveImages, args.saveDir)
        if !r.ok
            this.ExitError("history", r.error, r.code, args.format)

        data := Map(
            "command", "history",
            "status", "ok",
            "chat", r.chat,
            "messages", r.messages
        )

        switch args.format {
            case "text":
                Output.Emit("Chat: " args.chat "`n" Output.FormatTextMessages(r.messages))
            case "json":
                Output.Emit(Output.FormatJson(data))
            default:
                header := Output.FormatToon(Map("command", "history", "status", "ok", "chat", r.chat))
                table := Output.FormatToonTable("messages", r.messages, ["sender", "time", "type", "content"])
                Output.Emit(header . table)
        }
        Output.WriteResult(data)
        ExitApp 0
    }
}

CLI.Run()
