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
"Environment overlay" in [local/README.md](../../README.md).
`local/install/install.ps1` does not touch them; `local/install/install.sh` is not used on
this machine.

`host.sh` has no meaning here: the unix profile is not installed on Windows.

## firstmate

firstmate does not live on this machine, so `fm`, `fmsh` and `fmw` are remote:
they ssh to `FirstmateHost` (`firstmate@100.110.209.2`) using `FirstmateDir` and
`HerdrPath` as paths *on that host*, not here. `fmw` forces a tty with `ssh -t`,
without which herdr has no terminal to attach to, and `HerdrPath` is absolute
because a non-login ssh command never sources the rc that would put it on PATH.

They bridged into WSL until firstmate moved to the Mac mini. The WSL checkout is
still there and still current, so the box is dormant rather than retired — but
nothing points at it, and the `fm-herdr` workspace-bootstrap launcher it needed
has no counterpart on the Mac mini, whose herdr server keeps its workspace.

That move renamed keys in the overlay, which is hand-placed and uncommitted, so
nothing in the repo migrates it. It has already been applied on this machine;
redo it by hand if the overlay is ever rebuilt from the example:

| Was | Now |
|---|---|
| `WslDistro = 'Ubuntu-24.04'` | dropped — nothing reads it |
| `FirstmateDir = '/home/peter/firstmate'` | `/Users/firstmate/firstmate` |
| `HerdrPath = '/home/peter/.local/bin/fm-herdr'` | `/opt/homebrew/bin/herdr` |
| — | `FirstmateHost = 'firstmate@100.110.209.2'` |

Missing the new key is loud rather than silent: `Get-LifHostValue` warns naming
`FirstmateHost` and the helper returns without running.

The host and dir above are the **dedicated `firstmate` account** (uid 503), not
the captain's `peteryu`. That account is the isolation boundary firstmate is
meant to run behind; pointing these keys at `peteryu` puts agent work in the
captain's home, which is what happened on 2026-08-14 and was unwound the next
day. The address is the tailnet IP because that is how the captain reaches it
from both this machine and the phone.

## Herdr

`local/herdr/config.toml` ships `default_shell = "@LIF_HERDR_DEFAULT_SHELL@"`.
This environment's value is the PowerShell 7 path, so the copy step substitutes
it (run from the directory holding the checkout):

```powershell
New-Item -ItemType Directory -Force "$env:APPDATA\herdr" | Out-Null
(Get-Content .\lif-agents\local\herdr\config.toml -Raw).Replace(
    '@LIF_HERDR_DEFAULT_SHELL@', 'C:/Program Files/PowerShell/7/pwsh.exe'
) | Set-Content "$env:APPDATA\herdr\config.toml"
herdr config check
```

That produces exactly the file this machine ran before the value was moved into
the environment. Do not leave the placeholder in the installed copy and do not
blank the value: an empty `default_shell` falls back to Windows PowerShell 5.1
rather than pwsh 7.
