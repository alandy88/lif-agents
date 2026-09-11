#Requires AutoHotkey v2.0
#Include ..\scripts\lib\UIA.ahk
#Include ..\scripts\lib\Output.ahk
#Include ..\scripts\lib\WeChat.ahk
#Include ..\scripts\lib\MessageSender.ahk
#Include ..\scripts\lib\HistoryReader.ahk

class TestRunner {
    static passed := 0
    static failed := 0
    static errors := []

    static Assert(condition, name) {
        if condition {
            this.passed++
            FileAppend "  PASS: " name "`n", "*", "UTF-8"
        } else {
            this.failed++
            this.errors.Push(name)
            FileAppend "  FAIL: " name "`n", "*", "UTF-8"
        }
    }

    static Report() {
        total := this.passed + this.failed
        result := "`nHistory Tests: " total " total, " this.passed " passed, " this.failed " failed"
        if this.failed > 0 {
            result .= "`nFailures:"
            for err in this.errors
                result .= "`n  - " err
        }
        FileAppend result "`n", "*", "UTF-8"
        ExitApp this.failed > 0 ? 1 : 0
    }
}

if !WeChat.IsRunning() {
    FileAppend "SKIP: WeChat not running`n", "*", "UTF-8"
    ExitApp 0
}

target := "文件传输助手"

; Send a known marker message first
marker := "HISTORY_TEST_" A_Now
MessageSender.SendText(target, marker)
Sleep(2000)

; Test 1: Read last 5 messages
r := HistoryReader.ReadMessages(target, 5)
TestRunner.Assert(r.ok, "history-read-ok")
TestRunner.Assert(r.messages.Length > 0, "history-has-messages")
TestRunner.Assert(r.messages.Length <= 5, "history-respects-limit")

; Test 2: Last message should contain our marker
if r.messages.Length > 0 {
    lastMsg := r.messages[r.messages.Length]
    TestRunner.Assert(InStr(lastMsg["content"], marker), "history-contains-marker")
    TestRunner.Assert(lastMsg.Has("sender"), "history-has-sender")
    TestRunner.Assert(lastMsg.Has("type"), "history-has-type")
}

; Test 3: TOON format output
header := Output.FormatToon(Map("command", "history", "status", "ok", "chat", target))
table := Output.FormatToonTable("messages", r.messages, ["sender", "time", "type", "content"])
toonOut := header . table
TestRunner.Assert(InStr(toonOut, "command: history"), "toon-format-command")
TestRunner.Assert(InStr(toonOut, "messages["), "toon-format-table")

; Test 4: JSON format
jsonOut := Output.FormatJson(Map("command", "history", "status", "ok", "chat", target))
TestRunner.Assert(InStr(jsonOut, '"command"'), "json-format-command")

; Test 5: Text format
textOut := Output.FormatTextMessages(r.messages)
TestRunner.Assert(InStr(textOut, marker), "text-format-contains-marker")

; Test 6: Screenshot
saveDir := A_Temp "\wechat-cli-test-screenshots"
sr := HistoryReader.TakeScreenshot(target, saveDir)
TestRunner.Assert(sr.ok, "screenshot-ok")
if sr.ok
    TestRunner.Assert(FileExist(sr.file), "screenshot-file-exists")

; Cleanup
try DirDelete(saveDir, true)

TestRunner.Report()
