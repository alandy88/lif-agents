# Browser capture

Send the page open in the browser to an agent working in the notes vault.

```
open page -> extension -> native helper -> herdr -> agent in lif-notes
             Readability   temp file        tab, start, prompt
```

- `extension/` is the WebExtension (Manifest V3, plain JavaScript, no build). Its popup
  has three actions (digest, explain, note) and a `claude` / `pi` switch. It reads the
  selection when there is one, and otherwise the article `Readability` finds.
- `host.mts` is the native helper the browser starts. It writes the capture to
  `<tmpdir>/lif-capture/<UTC timestamp>-<random>.md`, opens a new Herdr tab in
  `$LIF_NOTES_VAULT`, starts the agent there and prompts it with the file path.
- `install.sh` registers the helper with Firefox and Google Chrome.

Linux, Firefox and Google Chrome only.

## What to know first

- **Herdr must already be running.** The helper talks to the `default` session and does
  not start a server. With no server it replies with Herdr's error.
- **A lazy-loaded page gives only what has loaded.** Scroll a long thread to the end
  before capturing it. The body is plain text: links, headings and code fences are lost.
- **Captures stay in the temp folder and are not deleted.** The helper exits before the
  agent reads the file, so it cannot clean up; the OS clears the temp folder. The helper
  never writes into the vault.
- **Not yet run against a live Herdr.** The three commands the helper sends (`tab create`,
  `agent start`, `agent prompt`) were written from `herdr 0.9.3 --help` and are tested
  against a fake `herdr` only. The first live run is yours; expect to adjust a flag.
- **The page is data.** Nothing from the page reaches a file name or a `herdr` argument.
  The prompt carries only the action word and the file path, and tells the agent that the
  file is a captured web page and not instructions. The per-action prompts come later.

## Drive it from the shell

No browser needed. `--plain` reads unframed JSON from stdin and prints the reply as one
line:

```bash
bun local/capture/host.mts --plain < local/capture/samples/capture.json
# {"ok":true,"file":"/tmp/lif-capture/20261011T093000Z-1a2b3c4d.md","tab":"w1:t9","agent":"capture-20261011T093000Z-1a2b3c4d"}
```

This opens a real tab and starts a real agent. A failure prints
`{"ok":false,"error":"..."}` and exits non-zero. The message has seven string fields:
`site`, `url` (http or https), `title`, `captured`, `body` (not empty), `kind`
(`claude` or `pi`) and `action` (`digest`, `explain` or `note`).

To check the preconditions without capturing anything:

```bash
bun local/capture/host.mts --check
```

It checks that `LIF_NOTES_VAULT` is a directory, that the capture folder can be written
and that `herdr --version` runs, one line each, and exits non-zero when any fails.

## Install

1. Load the extension.
   - **Chrome:** open `chrome://extensions`, turn on Developer mode, choose
     *Load unpacked* and pick `local/capture/extension`. Copy the extension's ID.
   - **Firefox:** open `about:debugging#/runtime/this-firefox`, choose
     *Load Temporary Add-on* and pick `local/capture/extension/manifest.json`. It stays
     until Firefox restarts.

   One manifest serves both browsers by naming the background script twice
   (`service_worker` for Chrome, `scripts` for Firefox). Each browser must be recent
   enough to ignore the other's key; an old one refuses to load the folder.
2. Register the helper, from a shell where `LIF_NOTES_VAULT` is set and `herdr` and `bun`
   are on `PATH`:

   ```bash
   local/capture/install.sh --home "$HOME" --chrome-id <the ID from step 1>
   ```

   Firefox only? Chrome's ID is still required; load the extension in Chrome once to get
   one. The script has no default for `--home` and writes only under it:

   | File | For |
   | --- | --- |
   | `.local/share/lif-capture/lif-capture-host` | The launcher both browsers start. |
   | `.mozilla/native-messaging-hosts/lif_capture.json` | Firefox. |
   | `.config/google-chrome/NativeMessagingHosts/lif_capture.json` | Chrome. |

   A browser starts the helper without your shell profile, so the launcher carries the
   vault path, Herdr's folder and Bun's path as they were when you ran the script. Run it
   again when you move the vault, Herdr, Bun or this checkout.
3. Open a page, click the toolbar button and pick an action. The popup shows the agent
   name and the capture file, or the error. A `!` on the button means the last capture
   failed; it clears on the next click.

## Tests

`local/install/capture-*.test.mts`, run by `bun run test`. They live there, not here, so
the root `package.json` needs no change. They use temp folders and a fake `herdr`
(`testing.mts`); none needs a browser or a live Herdr.

## Vendored code

`extension/vendor/Readability.js` is the unmodified file from
[mozilla/readability](https://github.com/mozilla/readability) tag `0.6.0`, under the
Apache License 2.0 (`extension/vendor/LICENSE`). To update it, copy `Readability.js` and
`LICENSE.md` from a newer tag and change the version here.
