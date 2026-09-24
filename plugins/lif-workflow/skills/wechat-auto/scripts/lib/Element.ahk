#Requires AutoHotkey v2.0

class Element {
    _uia := ""
    _root := ""
    _hwnd := 0
    _locator := {}
    _maxRetries := 3

    __New(root, hwnd, locator) {
        this._root := root
        this._hwnd := hwnd
        this._locator := locator
    }

    Find() {
        cond := this._BuildCondition()
        try {
            found := this._root.FindElement(cond, this._locator.depth)
            if found {
                this._uia := found
                return true
            }
        }
        return false
    }

    Refresh() {
        this._root := UIA.ElementFromHandle(this._hwnd)
        this._uia := ""
        return this.Find()
    }

    Click() {
        this._EnsureFound()
        ; Try UIA Click first
        try {
            this._uia.Click()
            return true
        }
        ; Fallback: screen-coord click
        try {
            WinActivate(this._hwnd)
            WinWaitActive(this._hwnd,, 3)
            loc := this._uia.Location
            CoordMode "Mouse", "Screen"
            Click(loc.x + loc.w // 2, loc.y + loc.h // 2)
            return true
        }
        throw Error("Click failed on " this._Describe())
    }

    Type(text) {
        this._EnsureFound()
        this.Click()
        Sleep 200
        WinActivate(this._hwnd)
        WinWaitActive(this._hwnd,, 3)
        prevClip := ClipboardAll()
        A_Clipboard := text
        ClipWait(2)
        Send("^v")
        Sleep 300
        A_Clipboard := prevClip
    }

    Name {
        get {
            this._EnsureFound()
            return this._uia.Name
        }
    }

    Location {
        get {
            this._EnsureFound()
            return this._uia.Location
        }
    }

    ClassName {
        get {
            this._EnsureFound()
            return this._uia.ClassName
        }
    }

    AutomationId {
        get {
            this._EnsureFound()
            return this._uia.AutomationId
        }
    }

    Raw {
        get {
            this._EnsureFound()
            return this._uia
        }
    }

    _EnsureFound() {
        if this._uia
            return
        Loop this._maxRetries {
            if this.Find()
                return
            Sleep 500
            this.Refresh()
        }
        throw Error("Element not found: " this._Describe())
    }

    _BuildCondition() {
        cond := {}
        loc := this._locator
        if loc.HasOwnProp("AutomationId") && loc.AutomationId
            cond.AutomationId := loc.AutomationId
        if loc.HasOwnProp("Name") && loc.Name
            cond.Name := loc.Name
        if loc.HasOwnProp("ClassName") && loc.ClassName
            cond.ClassName := loc.ClassName
        if loc.HasOwnProp("mm")
            cond.mm := loc.mm
        return cond
    }

    _Describe() {
        loc := this._locator
        if loc.HasOwnProp("AutomationId") && loc.AutomationId
            return "AutomationId=" loc.AutomationId
        if loc.HasOwnProp("Name") && loc.Name
            return "Name=" loc.Name
        return "unknown locator"
    }
}
