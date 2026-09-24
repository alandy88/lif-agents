#Requires AutoHotkey v2.0

class Runner {
    static Run() {
        args := A_Args
        unitOnly := false
        for arg in args {
            if arg = "--unit-only"
                unitOnly := true
        }

        thisDir := A_ScriptDir
        passed := 0
        failed := 0

        FileAppend "=== Unit Tests ===`n", "*", "UTF-8"
        r := this.RunTest(thisDir "\test-output.ahk")
        if r
            passed++
        else
            failed++

        if !unitOnly {
            FileAppend "`n=== E2E Tests (requires WeChat) ===`n", "*", "UTF-8"

            FileAppend "`n--- Navigate ---`n", "*", "UTF-8"
            r := this.RunTest(thisDir "\test-navigate.ahk")
            if r
                passed++
            else
                failed++

            FileAppend "`n--- Send ---`n", "*", "UTF-8"
            r := this.RunTest(thisDir "\test-send.ahk")
            if r
                passed++
            else
                failed++

            FileAppend "`n--- History ---`n", "*", "UTF-8"
            r := this.RunTest(thisDir "\test-history.ahk")
            if r
                passed++
            else
                failed++
        }

        FileAppend "`n=== Summary: " passed "/" (passed + failed) " suites passed ===`n", "*", "UTF-8"
        ExitApp failed > 0 ? 1 : 0
    }

    static RunTest(scriptPath) {
        if !FileExist(scriptPath) {
            FileAppend "  SKIP: " scriptPath " not found`n", "*", "UTF-8"
            return true
        }
        try {
            result := RunWait('autohotkey.exe "' scriptPath '"',, "Hide")
            return result = 0
        } catch Error as e {
            FileAppend "  ERROR: " e.Message "`n", "*", "UTF-8"
            return false
        }
    }
}

Runner.Run()
