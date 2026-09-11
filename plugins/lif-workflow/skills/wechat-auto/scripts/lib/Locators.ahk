#Requires AutoHotkey v2.0

class Locators {
    static _registry := Map(
        ; Sidebar
        "search_box",      {AutomationId: "", Name: "搜索", ClassName: "mmui::XValidatorTextEdit", depth: 6, mm: 3},
        "session_list",    {AutomationId: "session_list", depth: 6, mm: 3},

        ; Chat Panel
        "chat_name_label", {AutomationId: "current_chat_name_label", depth: 6, mm: 2},
        "chat_input",      {AutomationId: "chat_input_field", depth: 6, mm: 3},
        "message_list",    {AutomationId: "chat_message_list", depth: 6, mm: 3},

        ; Window
        "main_window",     {winTitle: "WeChat", winClass: "Qt51514QWindowIcon"}
    )

    static TextMessageClass := "mmui::ChatTextItemView"
    static ImageMessageClass := "mmui::ChatBubbleReferItemView"
    static TimestampClass := "mmui::ChatItemView"
    static SessionCellClass := "mmui::ChatSessionCell"

    static Get(name) {
        if !this._registry.Has(name)
            throw Error("Unknown locator: " name)
        return this._registry[name]
    }

    static SessionItem(chatName) {
        return {AutomationId: "session_item_" . chatName, depth: 6, mm: 3}
    }
}
