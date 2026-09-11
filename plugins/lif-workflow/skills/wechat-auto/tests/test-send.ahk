#Requires AutoHotkey v2.0
#Include ..\scripts\lib\UIA.ahk
#Include ..\scripts\lib\Output.ahk
#Include ..\scripts\lib\WeChat.ahk
#Include ..\scripts\lib\MessageSender.ahk

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
        result := "`nSend Tests: " total " total, " this.passed " passed, " this.failed " failed"
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

; Test 1: Send plain text
r := MessageSender.SendText(target, "AHK test: plain text " A_Now)
TestRunner.Assert(r.ok, "send-plain-text")

; Test 2: Send Chinese + emoji
r := MessageSender.SendText(target, "测试中文消息 🎉 " A_Now)
TestRunner.Assert(r.ok, "send-chinese-emoji")

; Test 3: Send special chars
r := MessageSender.SendText(target, "a,b,c & <test> " A_Now)
TestRunner.Assert(r.ok, "send-special-chars")

; Test 4: Send single image
testImg := A_Temp "\wechat-cli-test.png"
if !FileExist(testImg) {
    cmd := 'powershell.exe -NoProfile -Command "Add-Type -AssemblyName System.Drawing; $b = [System.Drawing.Bitmap]::new(100,100); $g = [System.Drawing.Graphics]::FromImage($b); $g.Clear([System.Drawing.Color]::Red); '
    cmd .= "$b.Save('" testImg "'); "
    cmd .= '$g.Dispose(); $b.Dispose()"'
    RunWait(cmd,, "Hide")
}
if FileExist(testImg) {
    r := MessageSender.SendImage(target, testImg)
    TestRunner.Assert(r.ok, "send-single-image")
} else {
    TestRunner.Assert(false, "send-single-image (could not create test image)")
}

; Test 5: Send image-dir with small batch
testDir := A_Temp "\wechat-cli-test-images"
DirCreate(testDir)
Loop 3 {
    imgPath := testDir "\test_" A_Index ".png"
    if !FileExist(imgPath)
        FileCopy(testImg, imgPath, true)
}
r := MessageSender.SendImageDir(target, testDir)
TestRunner.Assert(r.ok, "send-image-dir-3")
TestRunner.Assert(r.sent = 3, "send-image-dir-3-count")

; Test 6: Send to non-existent chat
r := MessageSender.SendText("不存在的聊天_" A_TickCount, "should fail")
TestRunner.Assert(!r.ok, "send-nonexistent-chat-fails")

; Test 7: Send with empty image dir
emptyDir := A_Temp "\wechat-cli-empty"
DirCreate(emptyDir)
r := MessageSender.SendImageDir(target, emptyDir)
TestRunner.Assert(!r.ok, "send-empty-dir-fails")

; Cleanup
try FileDelete(testImg)
try DirDelete(testDir, true)
try DirDelete(emptyDir, true)

TestRunner.Report()
