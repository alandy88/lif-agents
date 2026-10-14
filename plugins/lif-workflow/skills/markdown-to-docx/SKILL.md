---
name: markdown-to-docx
disable-model-invocation: true
description: "Converts a folder tree of Markdown files to .docx with pandoc, flattens nested folders into hyphenated file-name prefixes, and can group the output into bucket folders for upload. Use when the user wants a Markdown docs folder turned into Word files, for example to upload it to Google Drive."
argument-hint: "[input-dir] [output-dir]"
allowed-tools: Bash(bash *)
---

# markdown-to-docx

Needs bash and pandoc. On Windows, run it from Git Bash.

## Steps

1. Take the input and output folders from the arguments. Ask for any that is
   missing.
2. The output folder must be absent or empty; the script refuses anything else
   and never deletes files. If it holds files, ask the user whether to empty it
   or use a new folder. Empty it only on a yes.
3. Run, from any folder:

   ```bash
   bash <this skill's folder>/scripts/convert.sh INPUT_DIR OUTPUT_DIR
   ```

   Environment variables:
   - `MD_BUCKET_SIZE`: files per `bucket-NN` folder, default 50; `0` leaves
     every file in the output root.
   - `PANDOC_DIR`: the folder that holds `pandoc` or `pandoc.exe`, when pandoc
     is not on `PATH`. If the script says pandoc is missing, ask the user to
     install it.
4. Read the exit code and the last line (`converted: N, failed: N, name
   collisions: N`):
   - `0`: every file converted.
   - `1`: nothing converted, or bad input; the error line says why.
   - `2`: some files failed (pandoc's own message is above each `failed:` line)
     or two inputs mapped to one output name (`skip (name taken ...)` lines).
     Report each one to the user.

## Output names

- `readme.md` becomes `readme.docx`; `cli/agent.md` becomes `cli-agent.docx`.
- `a/b-c.md` and `a-b/c.md` both map to `a-b-c.docx`; the first in sorted order
  wins and the other is reported as a collision.
- A top-level `zh-CN/` folder is skipped (a translated copy in the docs this
  was written for).
