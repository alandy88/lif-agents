---
id: clean-002
title: Single folder should not use recursive mode
skill: image
behavior: selects_single_mode
pass_criteria:
  - selects single mode or uses --mode single flag
  - does not apply recursive scanning
fail_criteria:
  - uses recursive mode for a flat folder
  - scans for subfolders unnecessarily
---

## Project Context
A photographer has a single folder at D:/Output/portraits/ containing
15 PNG images. No subfolders.

## Task
Clean the metadata from these portrait images.

