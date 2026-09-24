#Requires AutoHotkey v2.0
#Include ..\scripts\lib\UIA.ahk
#Include ..\scripts\lib\Output.ahk
#Include ..\scripts\lib\WeChat.ahk

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
        result := "`nNavigate Tests: " total " total, " this.passed " passed, " this.failed " failed"
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

; Test 1: Navigate to 文件传输助手
r := WeChat.NavigateToChat("文件传输助手")
TestRunner.Assert(r.ok, "navigate-to-file-helper")

; Test 2: Navigate again (should be no-op)
r := WeChat.NavigateToChat("文件传输助手")
TestRunner.Assert(r.ok, "navigate-same-chat-noop")

; Test 3: Navigate to non-existent chat
r := WeChat.NavigateToChat("不存在的聊天_" A_TickCount)
TestRunner.Assert(!r.ok, "navigate-nonexistent-fails")
TestRunner.Assert(r.code = 2, "navigate-nonexistent-code-2")

; Test 4: Navigate back to 文件传输助手 after failed search
r := WeChat.NavigateToChat("文件传输助手")
TestRunner.Assert(r.ok, "navigate-recovery-after-fail")

TestRunner.Report()
