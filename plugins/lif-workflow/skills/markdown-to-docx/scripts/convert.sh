#!/usr/bin/env bash
# Convert every .md file under INPUT_DIR to .docx in OUTPUT_DIR, flatten the
# folders into name prefixes (cli/agent.md -> cli-agent.docx), then optionally
# group the files into bucket-NN folders.
#
# Usage: convert.sh INPUT_DIR OUTPUT_DIR
#   (or set MD_INPUT_DIR and MD_OUTPUT_DIR)
# Env:   MD_BUCKET_SIZE  files per bucket folder, 0 = no buckets (default 50)
#        PANDOC_DIR      folder holding pandoc or pandoc.exe, when it is not on PATH

set -euo pipefail

INPUT_DIR="${1:-${MD_INPUT_DIR:-}}"
OUTPUT_DIR="${2:-${MD_OUTPUT_DIR:-}}"
# 50 files per folder keeps a browser upload to Google Drive to one batch.
BUCKET_SIZE="${MD_BUCKET_SIZE:-50}"

die() { echo "error: $*" >&2; exit 1; }

[ -n "$INPUT_DIR" ] && [ -n "$OUTPUT_DIR" ] || die "usage: convert.sh INPUT_DIR OUTPUT_DIR (or set MD_INPUT_DIR and MD_OUTPUT_DIR)"
[ -d "$INPUT_DIR" ] || die "input directory does not exist: $INPUT_DIR"
[[ "$BUCKET_SIZE" =~ ^[0-9]+$ ]] || die "MD_BUCKET_SIZE must be a whole number, got: $BUCKET_SIZE"

if command -v pandoc >/dev/null 2>&1; then
    PANDOC=pandoc
elif [ -n "${PANDOC_DIR:-}" ] && [ -x "$PANDOC_DIR/pandoc.exe" ]; then
    PANDOC="$PANDOC_DIR/pandoc.exe"
elif [ -n "${PANDOC_DIR:-}" ] && [ -x "$PANDOC_DIR/pandoc" ]; then
    PANDOC="$PANDOC_DIR/pandoc"
else
    die "pandoc not found on PATH or in PANDOC_DIR; install it (https://pandoc.org/installing.html) or set PANDOC_DIR"
fi

INPUT_DIR="$(cd "$INPUT_DIR" && pwd -P)"
# Never write into, or clear, a folder that already holds files: the caller
# empties it after asking the user.
if [ -e "$OUTPUT_DIR" ]; then
    [ -d "$OUTPUT_DIR" ] || die "output path exists and is not a directory: $OUTPUT_DIR"
    [ -z "$(ls -A "$OUTPUT_DIR")" ] || die "output directory is not empty: $OUTPUT_DIR"
fi
mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd -P)"

echo "pandoc: $("$PANDOC" --version | head -1)"
echo "input:  $INPUT_DIR"
echo "output: $OUTPUT_DIR"

# Convert. Top-level zh-CN/ (a translated copy in the docs this was written
# for) is skipped. Nested paths become hyphenated name prefixes.
converted=0 failed=0 collided=0
cd "$INPUT_DIR"
while IFS= read -r -d '' file; do
    rel="${file#./}"
    name="${rel%.md}.docx"
    name="${name//\//-}"
    target="$OUTPUT_DIR/$name"
    if [ -e "$target" ]; then
        echo "skip (name taken by another file): $rel -> $name" >&2
        collided=$((collided + 1))
        continue
    fi
    if "$PANDOC" "$rel" -o "$target" --resource-path="$INPUT_DIR/$(dirname "$rel")"; then
        converted=$((converted + 1))
    else
        echo "failed: $rel" >&2
        failed=$((failed + 1))
    fi
done < <(find . -path ./zh-CN -prune -o -type f -name '*.md' -print0 | sort -z)

# Bucket. Sorted order, so bucket-01 holds the first names alphabetically.
if [ "$BUCKET_SIZE" -gt 0 ] && [ "$converted" -gt 0 ]; then
    cd "$OUTPUT_DIR"
    i=0
    for f in *.docx; do
        bucket=$(printf 'bucket-%02d' $((i / BUCKET_SIZE + 1)))
        mkdir -p "$bucket"
        mv -n -- "$f" "$bucket/"
        i=$((i + 1))
    done
    for b in bucket-*/; do
        n=$(find "$b" -maxdepth 1 -name '*.docx' | wc -l)
        echo "${b%/}: $n files"
    done
fi

echo "converted: $converted, failed: $failed, name collisions: $collided"
[ "$converted" -gt 0 ] || die "no files were converted"
[ "$failed" -eq 0 ] && [ "$collided" -eq 0 ] || exit 2
