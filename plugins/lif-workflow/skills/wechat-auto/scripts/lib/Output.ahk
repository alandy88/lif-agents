#Requires AutoHotkey v2.0

class Output {
    static FormatToon(data) {
        result := ""
        for key, val in data {
            if val is Map {
                result .= key ":`n"
                for k2, v2 in val
                    result .= "  " k2 ": " String(v2) "`n"
            } else {
                result .= key ": " String(val) "`n"
            }
        }
        return result
    }

    static FormatToonTable(name, rows, fields) {
        if rows.Length = 0
            return name "[0]{" this._JoinArr(fields) "}:`n"
        result := name "[" rows.Length "]{" this._JoinArr(fields) "}:`n"
        for row in rows {
            parts := []
            for i, field in fields {
                val := row.Has(field) ? String(row[field]) : ""
                parts.Push(val)
            }
            result .= "  " this._JoinArr(parts) "`n"
        }
        return result
    }

    static FormatJson(data) {
        return this._JsonObj(data)
    }

    static FormatJsonArray(arr) {
        parts := []
        for item in arr
            parts.Push(this._JsonObj(item))
        return "[" this._JoinArr(parts) "]"
    }

    static FormatTextMessages(messages) {
        result := ""
        for msg in messages {
            time := msg.Has("time") ? msg["time"] : "??:??"
            sender := msg.Has("sender") ? msg["sender"] : "unknown"
            content := msg.Has("content") ? msg["content"] : ""
            mtype := msg.Has("type") ? msg["type"] : "text"
            if mtype = "image" && content = ""
                content := "[image]"
            result .= "[" time "] " sender ": " content "`n"
        }
        return result
    }

    static FormatError(command, msg, code, format := "toon") {
        data := Map("command", command, "status", "error", "code", code, "error", msg)
        switch format {
            case "json":  return this.FormatJson(data)
            case "text":  return "ERROR (" code "): " msg "`n"
            default:      return this.FormatToon(data)
        }
    }

    static FormatByName(data, format) {
        switch format {
            case "json":  return this.FormatJson(data) "`n"
            case "text":  return this.FormatToon(data)
            default:      return this.FormatToon(data)
        }
    }

    static ResultPath := EnvGet("WECHAT_CLI_RESULT") || (EnvGet("TEMP") "\wechat-cli-result.json")

    static Emit(text) {
        try FileAppend text, "*", "UTF-8"
    }

    static WriteResult(data) {
        try FileDelete(this.ResultPath)
        FileAppend this.FormatJson(data) "`n", this.ResultPath, "UTF-8"
    }

    static _JsonObj(data) {
        parts := []
        for key, val in data {
            jkey := '"' this._JsonEsc(String(key)) '"'
            if val is Map {
                parts.Push(jkey ":" this._JsonObj(val))
            } else if val is Array {
                arrParts := []
                for item in val {
                    if item is Map
                        arrParts.Push(this._JsonObj(item))
                    else
                        arrParts.Push('"' this._JsonEsc(String(item)) '"')
                }
                parts.Push(jkey ":[" this._JoinArr(arrParts) "]")
            } else if val is Integer || val is Float {
                parts.Push(jkey ":" String(val))
            } else {
                parts.Push(jkey ':"' this._JsonEsc(String(val)) '"')
            }
        }
        return "{" this._JoinArr(parts) "}"
    }

    static _JsonEsc(s) {
        s := StrReplace(s, "\", "\\")
        s := StrReplace(s, '"', '\"')
        s := StrReplace(s, "`n", "\n")
        s := StrReplace(s, "`r", "\r")
        s := StrReplace(s, "`t", "\t")
        return s
    }

    static _JoinArr(arr) {
        result := ""
        for i, v in arr {
            if i > 1
                result .= ","
            result .= String(v)
        }
        return result
    }
}
