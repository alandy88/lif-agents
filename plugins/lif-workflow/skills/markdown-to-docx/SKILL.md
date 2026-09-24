---
name: markdown-to-docx
disable-model-invocation: true
description: "Use when converting markdown files to .docx, flattening nested folders with prefixed filenames and optional upload bucketing."
argument-hint: "[input-dir] [output-dir]"
allowed-tools: Bash(bash *)
---

# Markdown to DOCX Converter

Convert markdown documentation to Microsoft Word format with automatic setup, intelligent file organization, and optional bucket organization for easier file management.

## Quick Start

Default usage (set `MD_INPUT_DIR` and `MD_OUTPUT_DIR`, or use defaults from env):

```bash
# Run the conversion script
bash scripts/convert.sh
```

## Usage with Custom Paths

```bash
# Set environment variables for custom paths
export MD_INPUT_DIR="/path/to/your/docs"
export MD_OUTPUT_DIR="/path/to/output"
bash scripts/convert.sh
```

## What This Skill Does

1. **Checks for Pandoc** - Installs pandoc if not found (Windows only)
2. **Creates output directory** - Makes the destination folder if it doesn't exist
3. **Converts all .md files** - Uses pandoc to convert markdown to .docx
4. **Removes zh-CN/ folder** - Deletes Chinese localization folder
5. **Flattens structure** - Moves all files to root with folder prefix naming:
   - `docs/cli/agent.md` → `cli-agent.docx`
   - `docs/concepts/memory.md` → `concepts-memory.docx`
   - `docs/platforms/mac/setup.md` → `platforms-mac-setup.docx`
6. **Organizes into buckets** (optional) - Groups files into folders of 50 for easier management
7. **Verifies results** - Counts files and shows final structure

## Features

- **Recursive processing** - Handles nested subdirectories of any depth
- **Folder prefix naming** - Preserves directory context in filenames
- **Bucket organization** - Groups files into buckets of 50 for easier upload/download
- **Image warnings only** - Missing images don't stop conversion (replaced with description)
- **Clean output** - Removes empty directories after flattening
- **Cross-platform** - Works on Windows (Git Bash, MSYS2, WSL)

## Bucket Organization

For easier file management (especially with Google Drive or cloud storage), you can organize files into buckets of 50:

```bash
# Set bucket size (default: 50, set to 0 to disable)
export MD_BUCKET_SIZE=50
bash scripts/convert.sh
```

**Output with buckets:**
```
output-dir/
├── bucket-01/          # First 50 files
│   ├── readme.docx
│   ├── automation-cron.docx
│   └── ... (48 more)
├── bucket-02/          # Next 50 files
│   ├── cli-agent.docx
│   └── ... (49 more)
├── bucket-03/          # Next 50 files
│   └── ...
└── bucket-07/          # Last 5 files
    └── ... (5 files)
```

**Benefits:**
- Easier to upload in batches to Google Drive
- Prevents browser timeouts with large file sets
- Better organization for 300+ files
- Progress tracking (upload bucket 1 of 7)

## Output Structure

Input:
```
input-dir/
├── readme.md
├── automation/
│   ├── cron.md
│   └── webhook.md
└── cli/
    └── agent.md
```

Output:
```
output-dir/
├── readme.docx
├── automation-cron.docx
├── automation-webhook.docx
└── cli-agent.docx
```

## Requirements

- Git Bash, MSYS2, or WSL on Windows
- curl (for downloading pandoc)
- unzip (for extracting pandoc)

## Notes

- Root-level files keep their original names (e.g., `readme.md` → `readme.docx`)
- Nested files get folder prefixes (path separators become hyphens)
- Chinese documentation folder (zh-CN/) is automatically removed
- Total file count is displayed after conversion for verification
