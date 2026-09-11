#Requires AutoHotkey v2.0

class WeChatSafety {
    static MinDelay := 800
    static MaxMessagesPerHour := 30
    static MaxGlobalPerHour := 150
    static JitterRange := 0.3
    static _sendLog := Map()
    static _globalLog := []
    static _lockFile := EnvGet("TEMP") "\wechat-cli.lock"

    static Jitter(baseMs) {
        jitter := baseMs * this.JitterRange
        return baseMs + Random(-jitter, jitter)
    }

    static SleepJittered(baseMs) {
        Sleep(this.Jitter(baseMs))
    }

    static AcquireLock() {
        if FileExist(this._lockFile) {
            age := Abs(DateDiff(A_Now, FileGetTime(this._lockFile), "Seconds"))
            if age < 60
                return false
            FileDelete(this._lockFile)
        }
        FileAppend(A_ScriptHwnd, this._lockFile)
        return true
    }

    static ReleaseLock() {
        try FileDelete(this._lockFile)
    }

    static CheckRateLimit(contact) {
        if contact = "文件传输助手"
            return true
        now := A_TickCount
        hourAgo := now - 3600000

        fresh := []
        for ts in this._globalLog {
            if ts > hourAgo
                fresh.Push(ts)
        }
        this._globalLog := fresh
        if fresh.Length >= this.MaxGlobalPerHour
            return false

        if !this._sendLog.Has(contact)
            this._sendLog[contact] := []
        log := this._sendLog[contact]
        fresh := []
        for ts in log {
            if ts > hourAgo
                fresh.Push(ts)
        }
        this._sendLog[contact] := fresh
        return fresh.Length < this.MaxMessagesPerHour
    }

    static RecordSend(contact) {
        if !this._sendLog.Has(contact)
            this._sendLog[contact] := []
        this._sendLog[contact].Push(A_TickCount)
        this._globalLog.Push(A_TickCount)
    }

    static DismissModals() {
    }
}

class WeChat {
    static _hwnd := 0
    static _root := ""

    static Connect() {
        loc := Locators.Get("main_window")
        hwnd := WinExist(loc.winTitle " ahk_class " loc.winClass)
        if !hwnd
            return false
        this._hwnd := hwnd
        this._root := UIA.ElementFromHandle(hwnd)
        return true
    }

    static Refresh() {
        if !this._hwnd
            return false
        this._root := UIA.ElementFromHandle(this._hwnd)
        return true
    }

    static EnsureFocus() {
        if !this._hwnd
            return false
        try {
            WinActivate(this._hwnd)
            if !WinWaitActive(this._hwnd,, 3)
                return false
        } catch {
            return false
        }
        return true
    }

    static IsRunning() {
        loc := Locators.Get("main_window")
        return WinExist(loc.winTitle " ahk_class " loc.winClass) != 0
    }

    static El(locatorOrName) {
        loc := locatorOrName is String ? Locators.Get(locatorOrName) : locatorOrName
        return Element(this._root, this._hwnd, loc)
    }

    static GetStatus() {
        running := this.IsRunning()
        result := Map("running", running, "version", "4.x")
        if running && this.Connect() {
            loc := Locators.Get("main_window")
            try result["windowTitle"] := WinGetTitle(loc.winTitle " ahk_class " loc.winClass)
            try result["currentChat"] := ChatPanel.GetCurrentChatName()
        }
        return result
    }
}
