# windows-5090

The Windows machine (RTX 5090). This is the environment that owns the Windows
drive paths — `D:\Git\...`, `C:\Program Files\PowerShell\7\pwsh.exe` and the
like. They are values of *this* environment, not defaults for the repo.

**Its overlay files are deliberately not committed.** They carry the captain's
real checkout paths and the BWS project id, which `local/.gitignore` keeps out
of the repo. They live at:

```
%USERPROFILE%\.config\lif-host.lua
%USERPROFILE%\.config\lif-host.ps1
```

and are hand-placed from `local/hosts/lif-host.{lua,ps1}.example` — see
"Environment overlay" in [local/README.md](../../local/README.md).
`install/install.ps1` does not touch them; `install/install.sh` is not used on
this machine.

`host.sh` has no meaning here: the unix profile is not installed on Windows.

## Herdr

`local/herdr/config.toml` ships `default_shell = "@LIF_HERDR_DEFAULT_SHELL@"`.
This environment's value is the PowerShell 7 path, so the copy step substitutes
it (run from the directory holding the checkout):

```powershell
New-Item -ItemType Directory -Force "$env:APPDATA\herdr" | Out-Null
(Get-Content .\lif-sandcastle\local\herdr\config.toml -Raw).Replace(
    '@LIF_HERDR_DEFAULT_SHELL@', 'C:/Program Files/PowerShell/7/pwsh.exe'
) | Set-Content "$env:APPDATA\herdr\config.toml"
herdr config check
```

That produces exactly the file this machine ran before the value was moved into
the environment. Do not leave the placeholder in the installed copy and do not
blank the value: an empty `default_shell` falls back to Windows PowerShell 5.1
rather than pwsh 7.
