#Requires AutoHotkey v2.0

class ChatPanel {
    static GetCurrentChatName() {
        try {
            el := WeChat.El("chat_name_label")
            if el.Find()
                return el.Name
        }
        return ""
    }

    static IsChat(chatName) {
        actual := this.GetCurrentChatName()
        return actual && InStr(actual, chatName)
    }

    static GetInputBox() {
        el := WeChat.El("chat_input")
        if el.Find()
            return el
        return ""
    }

    static GetMessageElements() {
        el := WeChat.El("message_list")
        if !el.Find()
            return []
        try return el.Raw.FindElements({}, 2)
        catch
            return []
    }
}
