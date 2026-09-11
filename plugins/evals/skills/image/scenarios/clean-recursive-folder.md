---
id: clean-001
title: Recursive folder selects recursive mode
skill: image
behavior: selects_recursive_mode
pass_criteria:
  - selects recursive mode or uses --mode recursive flag
  - mentions the timestamped output folder convention
fail_criteria:
  - defaults to single mode without addressing subfolders
  - ignores the subfolder structure
---

## Project Context
A photographer has a batch folder at D:/Output/batch-2026-03/ containing
8 numbered subfolders (01/ through 08/), each with 20-30 ComfyUI-generated
PNG images that need metadata stripped.

## Task
Clean all the images in this batch folder.

