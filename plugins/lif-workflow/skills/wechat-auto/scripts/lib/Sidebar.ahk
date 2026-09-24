#Requires AutoHotkey v2.0

class Sidebar {
    static NavigateToChat(chatName) {
        if !WeChat.Connect()
            return {ok: false, error: "WeChat window not found", code: 1}

        WeChatSafety.DismissModals()

        if ChatPanel.IsChat(chatName)
            return {ok: true}

        ; Strategy 1: Click session item in sidebar
        try {
            el := WeChat.El(Locators.SessionItem(chatName))
            if el.Find() {
                WeChat.EnsureFocus()
                loc := el.Location
                CoordMode "Mouse", "Screen"
                Click(loc.x + loc.w // 2, loc.y + loc.h // 2)
                if this._WaitForChat(chatName)
                    return {ok: true}
            }
        }

        ; Strategy 2: Search box
        try {
            searchBox := WeChat.El("search_box")
            if !searchBox.Find()
                return {ok: false, error: "Search box not found", code: 1}

            searchBox.Click()
            WeChatSafety.SleepJittered(300)

            if !WeChat.EnsureFocus()
                return {ok: false, error: "Cannot focus WeChat window", code: 1}
            Send("^a")
            WeChatSafety.SleepJittered(100)
            SendText(chatName)
            WeChatSafety.SleepJittered(1000)

            ; Find in search results by AutomationId
            try {
                resultEl := WeChat.El(Locators.SessionItem(chatName))
                if resultEl.Find() {
                    WeChat.EnsureFocus()
                    loc := resultEl.Location
                    CoordMode "Mouse", "Screen"
                    Click(loc.x + loc.w // 2, loc.y + loc.h // 2)
                    if this._WaitForChat(chatName)
                        return {ok: true}
                }
            }

            ; Find in search results by Name match
            try {
                listEl := WeChat.El("session_list")
                if listEl.Find() {
                    items := listEl.Raw.FindElements({ClassName: Locators.SessionCellClass}, 6)
                    for item in items {
                        if InStr(item.Name, chatName) = 1 {
                            WeChat.EnsureFocus()
                            loc := item.Location
                            CoordMode "Mouse", "Screen"
                            Click(loc.x + loc.w // 2, loc.y + loc.h // 2)
                            if this._WaitForChat(chatName)
                                return {ok: true}
                        }
                    }
                }
            }

            WeChatSafety.SleepJittered(300)
            return {ok: false, error: "Chat not found: " chatName, code: 2}

        } catch Error as e {
            return {ok: false, error: "Navigation error: " e.Message, code: 1}
        }
    }

    static _WaitForChat(chatName) {
        Loop 4 {
            Sleep 500
            WeChat.Refresh()
            if ChatPanel.IsChat(chatName)
                return true
        }
        return false
    }
}
