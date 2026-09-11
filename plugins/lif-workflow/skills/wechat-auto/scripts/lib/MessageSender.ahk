#Requires AutoHotkey v2.0

class MessageSender {
    static SendText(chatName, text, delay := 1200) {
        r := Sidebar.NavigateToChat(chatName)
        if !r.ok
            return r

        if !WeChatSafety.CheckRateLimit(chatName)
            return {ok: false, error: "Rate limit exceeded for " chatName, code: 3}

        inputBox := ChatPanel.GetInputBox()
        if !inputBox
            return {ok: false, error: "Input box not found", code: 3}

        try {
            inputBox.Type(text)
            if !WeChat.EnsureFocus()
                return {ok: false, error: "Lost focus before send", code: 3}
            Send("{Enter}")
            WeChatSafety.SleepJittered(delay)
            WeChatSafety.RecordSend(chatName)
            return {ok: true, sent: 1, type: "text"}
        } catch Error as e {
            return {ok: false, error: "Send failed: " e.Message, code: 3}
        }
    }

    static SendImage(chatName, imagePath, delay := 1200) {
        r := Sidebar.NavigateToChat(chatName)
        if !r.ok
            return r

        if !FileExist(imagePath)
            return {ok: false, error: "File not found: " imagePath, code: 4}

        if !WeChatSafety.CheckRateLimit(chatName)
            return {ok: false, error: "Rate limit exceeded for " chatName, code: 3}

        inputBox := ChatPanel.GetInputBox()
        if !inputBox
            return {ok: false, error: "Input box not found", code: 3}

        try {
            inputBox.Click()
            WeChatSafety.SleepJittered(200)

            prevClip := ClipboardAll()
            this._CopyFileToClipboard(imagePath)
            WeChatSafety.SleepJittered(300)

            if !WeChat.EnsureFocus()
                return {ok: false, error: "Cannot focus WeChat window", code: 3}
            Send("^v")
            WeChatSafety.SleepJittered(1000)

            if !WeChat.EnsureFocus()
                return {ok: false, error: "Lost focus before send", code: 3}
            Send("{Enter}")
            WeChatSafety.SleepJittered(delay)

            A_Clipboard := prevClip
            WeChatSafety.RecordSend(chatName)
            return {ok: true, sent: 1, type: "image", file: imagePath}
        } catch Error as e {
            return {ok: false, error: "Image send failed: " e.Message, code: 3}
        }
    }

    static SendImageDir(chatName, dirPath, delay := 1200) {
        if !DirExist(dirPath)
            return {ok: false, error: "Directory not found: " dirPath, code: 4}

        files := []
        Loop Files dirPath "\*.*" {
            ext := StrLower(SubStr(A_LoopFileExt, 1))
            if ext ~= "^(png|jpg|jpeg|gif|bmp|webp)$"
                files.Push(A_LoopFileFullPath)
        }

        if files.Length = 0
            return {ok: false, error: "No image files in directory: " dirPath, code: 4}

        this._SortArray(files)

        chunks := []
        chunk := []
        for file in files {
            chunk.Push(file)
            if chunk.Length >= 9 {
                chunks.Push(chunk)
                chunk := []
            }
        }
        if chunk.Length > 0
            chunks.Push(chunk)

        r := Sidebar.NavigateToChat(chatName)
        if !r.ok
            return r

        prevClip := ClipboardAll()
        sent := 0
        failed := []
        for ci, chunk in chunks {
            if !WeChatSafety.CheckRateLimit(chatName) {
                for f in chunk
                    failed.Push(f)
                continue
            }

            try {
                inputBox := ChatPanel.GetInputBox()
                if !inputBox {
                    for f in chunk
                        failed.Push(f)
                    continue
                }
                inputBox.Click()
                WeChatSafety.SleepJittered(200)

                this._CopyFilesToClipboard(chunk)
                WeChatSafety.SleepJittered(300)

                if !WeChat.EnsureFocus() {
                    for f in chunk
                        failed.Push(f)
                    continue
                }
                Send("^v")
                WeChatSafety.SleepJittered(1500)

                if !WeChat.EnsureFocus() {
                    for f in chunk
                        failed.Push(f)
                    continue
                }
                Send("{Enter}")
                WeChatSafety.SleepJittered(delay)

                sent += chunk.Length
                WeChatSafety.RecordSend(chatName)
            } catch Error as e {
                for f in chunk
                    failed.Push(f)
            }

            if ci < chunks.Length
                WeChatSafety.SleepJittered(delay)
        }

        A_Clipboard := prevClip
        return {ok: true, sent: sent, chunks: chunks.Length, failed: failed, type: "image-batch"}
    }

    static _CopyFileToClipboard(filePath) {
        cmd := 'powershell.exe -NoProfile -Command "Set-Clipboard -Path '
        cmd .= "'" filePath "'" '"'
        RunWait(cmd,, "Hide")
    }

    static _CopyFilesToClipboard(filePaths) {
        paths := ""
        for i, fp in filePaths {
            if i > 1
                paths .= ","
            paths .= "'" fp "'"
        }
        cmd := 'powershell.exe -NoProfile -Command "Set-Clipboard -Path '
        cmd .= paths '"'
        RunWait(cmd,, "Hide")
    }

    static _SortArray(arr) {
        i := 2
        while i <= arr.Length {
            key := arr[i]
            j := i - 1
            while j >= 1 && StrCompare(arr[j], key) > 0 {
                arr[j + 1] := arr[j]
                j--
            }
            arr[j + 1] := key
            i++
        }
    }
}
