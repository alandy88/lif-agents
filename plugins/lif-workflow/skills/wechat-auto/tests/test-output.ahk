#Requires AutoHotkey v2.0
#Include ..\scripts\lib\Output.ahk

class TestRunner {
    static passed := 0
    static failed := 0
    static errors := []

    static Assert(condition, name) {
        if condition {
            this.passed++
        } else {
            this.failed++
            this.errors.Push(name)
        }
    }

    static AssertEq(actual, expected, name) {
        if (actual == expected) {
            this.passed++
        } else {
            this.failed++
            this.errors.Push(name ": expected [" expected "] got [" actual "]")
        }
    }

    static Report() {
        total := this.passed + this.failed
        result := "Tests: " total " total, " this.passed " passed, " this.failed " failed"
        if this.failed > 0 {
            result .= "`n`nFailures:"
            for err in this.errors
                result .= "`n  - " err
        }
        FileAppend result "`n", "*", "UTF-8"
        ExitApp this.failed > 0 ? 1 : 0
    }
}

TestToonFlatKeyValue()
TestToonNestedObject()
TestToonTabularArray()
TestToonContentWithCommas()
TestToonChineseText()
TestJsonRoundtrip()
TestTextFormat()
TestErrorOutput()
TestRunner.Report()

TestToonFlatKeyValue() {
    data := Map("command", "status", "status", "ok")
    result := Output.FormatToon(data)
    TestRunner.Assert(InStr(result, "command: status"), "toon-flat-command")
    TestRunner.Assert(InStr(result, "status: ok"), "toon-flat-status")
}

TestToonNestedObject() {
    data := Map(
        "command", "send",
        "status", "ok",
        "result", Map("chat", "文件传输助手", "messagesSent", 1)
    )
    result := Output.FormatToon(data)
    TestRunner.Assert(InStr(result, "result:"), "toon-nested-header")
    TestRunner.Assert(InStr(result, "  chat: 文件传输助手"), "toon-nested-chat")
    TestRunner.Assert(InStr(result, "  messagesSent: 1"), "toon-nested-count")
}

TestToonTabularArray() {
    messages := [
        Map("sender", "me", "time", "14:30", "type", "text", "content", "hello"),
        Map("sender", "me", "time", "14:31", "type", "text", "content", "world")
    ]
    result := Output.FormatToonTable("messages", messages, ["sender", "time", "type", "content"])
    TestRunner.Assert(InStr(result, "messages[2]{sender,time,type,content}:"), "toon-table-header")
    TestRunner.Assert(InStr(result, "  me,14:30,text,hello"), "toon-table-row1")
    TestRunner.Assert(InStr(result, "  me,14:31,text,world"), "toon-table-row2")
}

TestToonContentWithCommas() {
    messages := [
        Map("sender", "me", "time", "14:30", "type", "text", "content", "hello, world, foo")
    ]
    result := Output.FormatToonTable("messages", messages, ["sender", "time", "type", "content"])
    TestRunner.Assert(InStr(result, "  me,14:30,text,hello, world, foo"), "toon-comma-in-content")
}

TestToonChineseText() {
    data := Map("command", "send", "chat", "文件传输助手")
    result := Output.FormatToon(data)
    TestRunner.Assert(InStr(result, "chat: 文件传输助手"), "toon-chinese")
}

TestJsonRoundtrip() {
    data := Map("command", "status", "status", "ok", "version", "4.0")
    result := Output.FormatJson(data)
    TestRunner.Assert(InStr(result, '"command"'), "json-has-command")
    TestRunner.Assert(InStr(result, '"status":"ok"'), "json-has-status")
    TestRunner.Assert(InStr(result, '"version":"4.0"'), "json-has-version")
}

TestTextFormat() {
    messages := [
        Map("sender", "me", "time", "14:30", "type", "text", "content", "hello"),
    ]
    result := Output.FormatTextMessages(messages)
    TestRunner.AssertEq(Trim(result, " `t`n`r"), "[14:30] me: hello", "text-format-basic")
}

TestErrorOutput() {
    result := Output.FormatError("send", "Chat not found", 2, "toon")
    TestRunner.Assert(InStr(result, "status: error"), "error-toon-status")
    TestRunner.Assert(InStr(result, "code: 2"), "error-toon-code")
    TestRunner.Assert(InStr(result, "error: Chat not found"), "error-toon-msg")
}
