#Requires AutoHotkey v2.0

class HistoryReader {
    static ReadMessages(chatName, limit := 20, saveImages := false, saveDir := "") {
        r := Sidebar.NavigateToChat(chatName)
        if !r.ok
            return {ok: false, error: r.error, code: r.code, messages: []}

        this._ScrollToBottom()

        allMessages := []
        seenKeys := Map()
        maxScrollAttempts := Max(10, limit // 2)
        scrollAttempt := 0

        loop {
            elements := ChatPanel.GetMessageElements()
            if elements.Length = 0
                break

            currentTime := ""
            newCount := 0
            batch := []
            yPositions := []
            i := 1
            while i <= elements.Length {
                el := elements[i]
                parsed := this._ParseMessageElement(el, &currentTime)
                if parsed {
                    key := parsed["time"] "|" parsed["type"] "|" parsed["content"]
                    if parsed["type"] != "text" {
                        try key .= "|" el.Location.y
                        catch
                            key .= "|" A_Index "_" i
                    }
                    if !seenKeys.Has(key) {
                        seenKeys[key] := true
                        batch.Push(parsed)
                        try yPositions.Push(el.Location.y)
                        catch
                            yPositions.Push(0)
                        newCount++
                    }
                }
                i++
            }

            if batch.Length > 0
                this._DetectSenders(batch, yPositions, chatName)

            if batch.Length > 0 {
                merged := []
                for msg in batch
                    merged.Push(msg)
                for msg in allMessages
                    merged.Push(msg)
                allMessages := merged
            }

            if allMessages.Length >= limit
                break
            if newCount = 0 {
                scrollAttempt++
                if scrollAttempt >= 4
                    break
            } else {
                scrollAttempt := 0
            }

            if scrollAttempt >= maxScrollAttempts
                break

            this._ScrollUp()
        }

        if allMessages.Length > limit {
            trimmed := []
            startFrom := allMessages.Length - limit + 1
            j := startFrom
            while j <= allMessages.Length {
                trimmed.Push(allMessages[j])
                j++
            }
            allMessages := trimmed
        }

        if saveImages && saveDir {
            if !DirExist(saveDir)
                DirCreate(saveDir)
            elements := ChatPanel.GetMessageElements()
            this._SaveAllImages(allMessages, elements, 1, saveDir)
        }

        return {ok: true, messages: allMessages, chat: chatName}
    }

    static _ScrollToBottom() {
        msgListEl := WeChat.El("message_list")
        if !msgListEl.Find()
            return
        try {
            WeChat.EnsureFocus()
            loc := msgListEl.Location
            CoordMode("Mouse", "Screen")
            Click(loc.x + loc.w // 2, loc.y + loc.h // 2)
            Sleep(200)
            Send("{End}")
            Sleep(500)
        }
    }

    static _ScrollUp() {
        msgListEl := WeChat.El("message_list")
        if !msgListEl.Find()
            return

        try {
            loc := msgListEl.Location
            cx := loc.x + loc.w // 2
            cy := loc.y + loc.h // 2
            lParam := (cy << 16) | (cx & 0xFFFF)
            loop 15 {
                PostMessage(0x020A, (120 * 3) << 16, lParam, , WeChat._hwnd)
                Sleep(150)
            }
            Sleep(1000)
        }
    }

    static _DetectSenders(messages, yPositions, chatName) {
        try {
            msgListEl := WeChat.El("message_list")
            if !msgListEl.Find()
                return
            loc := msgListEl.Location
            halfW := loc.w / 2

            result := OCR.FromRect(loc.x, loc.y, loc.w, loc.h, "zh-Hans-CN")
            if !result || !result.Lines
                return

            for idx, msg in messages {
                msgY := yPositions[idx]
                if msgY = 0
                    continue
                content := msg["content"]

                ; Find OCR line matching this message content by y-proximity
                bestLine := ""
                bestDist := 999999
                for line in result.Lines {
                    dy := Abs(line.y - msgY)
                    if dy > 100
                        continue
                    if content != "[image]" {
                        if InStr(line.Text, SubStr(content, 1, 8)) && dy < bestDist {
                            bestDist := dy
                            bestLine := line
                        }
                    } else {
                        if (line.Text = "图片" || InStr(line.Text, "[图片]")) && dy < bestDist {
                            bestDist := dy
                            bestLine := line
                        }
                    }
                }

                ; Use OCR text x-position for left/right classification
                if bestLine && (bestLine.x - loc.x) > halfW {
                    msg["sender"] := "me"
                    continue
                }

                ; Non-me: look for sender name above this message
                senderName := ""
                bestNameDist := 999999
                for line in result.Lines {
                    dy := msgY - line.y
                    if dy < 5 || dy > 50
                        continue
                    if StrLen(line.Text) > 20 || StrLen(line.Text) < 2
                        continue
                    if RegExMatch(line.Text, "^\d{1,2}:\d{2}")
                        continue
                    if (line.x - loc.x) > halfW
                        continue
                    if content != "[image]" && InStr(line.Text, SubStr(content, 1, 6))
                        continue
                    if dy < bestNameDist {
                        bestNameDist := dy
                        senderName := line.Text
                    }
                }

                msg["sender"] := senderName ? senderName : chatName
            }
        }
    }

    static TakeScreenshot(chatName, saveDir) {
        r := Sidebar.NavigateToChat(chatName)
        if !r.ok
            return {ok: false, error: r.error, code: r.code}

        if !DirExist(saveDir)
            DirCreate(saveDir)

        filename := saveDir "\screenshot_" FormatTime(, "yyyyMMdd_HHmmss") ".png"

        loc := Locators.Get("main_window")
        hwnd := WinExist(loc.winTitle " ahk_class " loc.winClass)
        if !hwnd
            return {ok: false, error: "WeChat window not found", code: 1}

        try {
            WinGetPos(&x, &y, &w, &h, hwnd)
            cmd := 'powershell.exe -NoProfile -Command "'
                . 'Add-Type -AssemblyName System.Drawing;'
                . '$b = [System.Drawing.Bitmap]::new(' w ',' h ');'
                . '$g = [System.Drawing.Graphics]::FromImage($b);'
                . '$g.CopyFromScreen(' x ',' y ',0,0,[System.Drawing.Size]::new(' w ',' h '));'
                . "$b.Save('" filename "');"
                . '$g.Dispose();$b.Dispose()"'
            RunWait(cmd,, "Hide")

            if FileExist(filename)
                return {ok: true, file: filename}
            else
                return {ok: false, error: "Screenshot capture failed", code: 3}
        } catch Error as e {
            return {ok: false, error: "Screenshot error: " e.Message, code: 3}
        }
    }

    static _ParseMessageElement(el, &currentTime) {
        try {
            cn := el.ClassName
            nm := el.Name

            if cn = Locators.TimestampClass {
                if RegExMatch(nm, "^\d{1,2}:\d{2}")
                    currentTime := nm
                return ""
            }

            if cn = Locators.TextMessageClass {
                return Map(
                    "sender", "unknown",
                    "time", currentTime,
                    "type", "text",
                    "content", nm
                )
            }

            if cn = Locators.ImageMessageClass {
                return Map(
                    "sender", "unknown",
                    "time", currentTime,
                    "type", "image",
                    "content", "[image]"
                )
            }

            return ""
        } catch {
            return ""
        }
    }

    static _SaveAllImages(messages, elements, startIdx, saveDir) {
        imgCount := 0
        for mi, msg in messages {
            if msg["type"] != "image"
                continue

            imgCount++
            savePath := saveDir "\img" Format("{:03}", imgCount) ".png"

            elIdx := startIdx + mi - 1
            if elIdx > elements.Length
                continue

            try {
                el := elements[elIdx]
                el.Click("right")
                WeChatSafety.SleepJittered(500)

                try {
                    menuEl := UIA.ElementFromPoint()
                    saveItem := menuEl.FindElement({Name: "另存为"}, 4)
                    if !saveItem
                        saveItem := menuEl.FindElement({Name: "Save As"}, 4)
                    if saveItem {
                        saveItem.Click()
                        WeChatSafety.SleepJittered(500)
                        Send(savePath)
                        WeChatSafety.SleepJittered(300)
                        Send("{Enter}")
                        WeChatSafety.SleepJittered(500)
                    }
                } catch {
                }

                if FileExist(savePath)
                    msg["content"] := "[saved:" savePath "]"
            } catch {
            }
        }
    }
}
