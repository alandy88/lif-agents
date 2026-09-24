#!/bin/bash

# Markdown to DOCX Converter
# Converts all markdown files to docx format with pandoc

set -e

# Configuration with defaults
INPUT_DIR="${MD_INPUT_DIR:-D:/Git/openclaw-docs}"
OUTPUT_DIR="${MD_OUTPUT_DIR:-D:/Git/openclaw-docs-google}"
PANDOC_DIR="${PANDOC_DIR:-D:/Git/pandoc-3.9}"
BUCKET_SIZE="${MD_BUCKET_SIZE:-50}"

# Colors for output (if terminal supports it)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "Markdown to DOCX Converter"
echo "=========================================="
echo ""
echo "Configuration:"
echo "  Input: $INPUT_DIR"
echo "  Output: $OUTPUT_DIR"
echo "  Bucket size: $BUCKET_SIZE (set MD_BUCKET_SIZE=0 to disable)"
echo ""

# Function to check if pandoc is installed
check_pandoc() {
    echo "Checking for pandoc..."
    
    if command -v pandoc &> /dev/null; then
        echo -e "${GREEN}✓ Pandoc found: $(pandoc --version | head -1)${NC}"
        PANDOC_CMD="pandoc"
        return 0
    elif [ -f "$PANDOC_DIR/pandoc.exe" ]; then
        echo -e "${GREEN}✓ Pandoc found at: $PANDOC_DIR/pandoc.exe${NC}"
        PANDOC_CMD="$PANDOC_DIR/pandoc.exe"
        return 0
    else
        return 1
    fi
}

# Function to install pandoc
install_pandoc() {
    echo -e "${YELLOW}Pandoc not found. Installing...${NC}"
    
    # Download latest pandoc for Windows
    PANDOC_VERSION="3.9"
    PANDOC_ZIP="pandoc-${PANDOC_VERSION}-windows-x86_64.zip"
    PANDOC_URL="https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/${PANDOC_ZIP}"
    
    echo "Downloading pandoc ${PANDOC_VERSION}..."
    cd /d/Git
    
    if ! curl -L -o "$PANDOC_ZIP" "$PANDOC_URL"; then
        echo -e "${RED}✗ Failed to download pandoc${NC}"
        exit 1
    fi
    
    echo "Extracting pandoc..."
    if ! unzip -q "$PANDOC_ZIP"; then
        echo -e "${RED}✗ Failed to extract pandoc${NC}"
        exit 1
    fi
    
    rm -f "$PANDOC_ZIP"
    
    if [ -d "pandoc-${PANDOC_VERSION}" ]; then
        PANDOC_DIR="/d/Git/pandoc-${PANDOC_VERSION}"
        PANDOC_CMD="$PANDOC_DIR/pandoc.exe"
        echo -e "${GREEN}✓ Pandoc installed successfully${NC}"
    else
        echo -e "${RED}✗ Pandoc installation failed${NC}"
        exit 1
    fi
}

# Function to verify input directory
verify_input() {
    echo ""
    echo "Input directory: $INPUT_DIR"
    
    if [ ! -d "$INPUT_DIR" ]; then
        echo -e "${RED}✗ Input directory does not exist: $INPUT_DIR${NC}"
        echo "Set MD_INPUT_DIR environment variable or ensure default path exists"
        exit 1
    fi
    
    # Count markdown files
    MD_COUNT=$(find "$INPUT_DIR" -name "*.md" -type f | wc -l)
    
    if [ "$MD_COUNT" -eq 0 ]; then
        echo -e "${RED}✗ No markdown files found in $INPUT_DIR${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Found $MD_COUNT markdown files${NC}"
}

# Function to create output directory
setup_output() {
    echo ""
    echo "Output directory: $OUTPUT_DIR"
    
    if [ -d "$OUTPUT_DIR" ]; then
        # Never clean the tree we are about to read from.
        if [ "$(cd "$OUTPUT_DIR" && pwd -P)" = "$(cd "$INPUT_DIR" && pwd -P)" ]; then
            echo -e "${RED}✗ Output directory is the input directory ($OUTPUT_DIR); refusing to clean it${NC}"
            exit 1
        fi
        echo "Cleaning existing output directory..."
        rm -rf "$OUTPUT_DIR"/*
    else
        mkdir -p "$OUTPUT_DIR"
    fi
    
    echo -e "${GREEN}✓ Output directory ready${NC}"
}

# Function to convert markdown files
convert_files() {
    echo ""
    echo "Converting markdown files..."
    echo "This may take a moment..."
    echo ""
    
    cd "$INPUT_DIR"
    
    # Convert all markdown files
    find . -name "*.md" -type f | while read -r file; do
        # Create target directory
        target_dir=$(dirname "$OUTPUT_DIR/$file")
        mkdir -p "$target_dir"
        
        # Convert file
        output_file="${OUTPUT_DIR}/${file%.md}.docx"
        resource_path="${INPUT_DIR}/$(dirname "$file")"
        
        if ! "$PANDOC_CMD" "$file" -o "$output_file" --resource-path="$resource_path" 2>/dev/null; then
            echo -e "${YELLOW}⚠ Warning: Could not convert $file${NC}"
        fi
    done
    
    echo -e "${GREEN}✓ Conversion complete${NC}"
}

# Function to remove zh-CN folder
remove_zh_cn() {
    echo ""
    echo "Removing zh-CN folder..."
    
    if [ -d "$OUTPUT_DIR/zh-CN" ]; then
        rm -rf "$OUTPUT_DIR/zh-CN"
        echo -e "${GREEN}✓ Removed zh-CN folder${NC}"
    else
        echo -e "${YELLOW}⚠ zh-CN folder not found (may already be removed)${NC}"
    fi
}

# Function to flatten directory structure
flatten_structure() {
    echo ""
    echo "Flattening directory structure..."
    
    cd "$OUTPUT_DIR"
    
    # Move all docx files from subdirectories to root with prefix
    find . -mindepth 2 -name "*.docx" -type f | while read -r file; do
        # Get directory path and filename
        dirpath=$(dirname "$file" | sed 's|^\./||')
        filename=$(basename "$file")
        
        # Create new name with folder prefix
        newname="${dirpath//\//-}-${filename}"
        
        # Move file
        if mv "$file" "$newname" 2>/dev/null; then
            echo "  Moved: $file → $newname"
        fi
    done
    
    # Remove empty directories
    find . -mindepth 1 -type d | sort -r | while read -r dir; do
        if [ -z "$(ls -A "$dir" 2>/dev/null)" ]; then
            rmdir "$dir" 2>/dev/null
        fi
    done
    
    echo -e "${GREEN}✓ Structure flattened${NC}"
}

# Function to organize files into buckets
organize_into_buckets() {
    # Skip if bucket size is 0
    if [ "$BUCKET_SIZE" -eq 0 ]; then
        echo ""
        echo "Bucket organization disabled (MD_BUCKET_SIZE=0)"
        return 0
    fi
    
    echo ""
    echo "Organizing files into buckets of $BUCKET_SIZE..."
    
    cd "$OUTPUT_DIR"
    
    # Count total files
    TOTAL_FILES=$(ls *.docx 2>/dev/null | wc -l)
    
    if [ "$TOTAL_FILES" -eq 0 ]; then
        echo -e "${YELLOW}⚠ No .docx files found to organize${NC}"
        return 0
    fi
    
    # Calculate number of buckets needed
    NUM_BUCKETS=$(( (TOTAL_FILES + BUCKET_SIZE - 1) / BUCKET_SIZE ))
    
    echo "Total files: $TOTAL_FILES"
    echo "Creating $NUM_BUCKETS buckets..."
    echo ""
    
    # Organize files into buckets
    ls *.docx 2>/dev/null | awk -v bucket_size="$BUCKET_SIZE" '
    BEGIN { 
        count = 0
        folder = 1
    }
    {
        if (count >= bucket_size) {
            count = 0
            folder++
        }
        bucket_name = sprintf("bucket-%02d", folder)
        print bucket_name " " $0
        count++
    }' | while read bucket file; do
        # Create bucket directory if it doesn't exist
        mkdir -p "$bucket"
        # Move file into bucket
        if mv "$file" "$bucket/" 2>/dev/null; then
            echo "  Moved: $file → $bucket/"
        fi
    done
    
    echo ""
    echo -e "${GREEN}✓ Files organized into buckets${NC}"
    echo ""
    
    # Show bucket summary
    echo "Bucket summary:"
    for bucket in bucket-*; do
        if [ -d "$bucket" ]; then
            count=$(ls "$bucket"/*.docx 2>/dev/null | wc -l)
            echo "  $bucket: $count files"
        fi
    done
}

# Function to verify results
verify_results() {
    echo ""
    echo "=========================================="
    echo "Verification"
    echo "=========================================="
    
    cd "$OUTPUT_DIR"
    
    # Count files
    DOCX_COUNT=$(find . -name "*.docx" -type f | wc -l)
    
    # Count buckets if they exist
    BUCKET_COUNT=$(ls -d bucket-* 2>/dev/null | wc -l)
    
    echo ""
    echo "Files converted: $DOCX_COUNT"
    
    if [ "$BUCKET_COUNT" -gt 0 ]; then
        echo "Buckets created: $BUCKET_COUNT"
        echo ""
        echo -e "${GREEN}✓ Files organized into buckets${NC}"
        echo ""
        echo "Bucket contents:"
        for bucket in bucket-*; do
            if [ -d "$bucket" ]; then
                count=$(ls "$bucket"/*.docx 2>/dev/null | wc -l)
                echo "  $bucket: $count files"
            fi
        done
    else
        SUBDIRS=$(find . -mindepth 1 -type d | wc -l)
        echo "Subdirectories remaining: $SUBDIRS"
        echo ""
        
        # Check for remaining subdirectories
        if [ "$SUBDIRS" -gt 0 ]; then
            echo -e "${YELLOW}⚠ Warning: Some subdirectories still exist:${NC}"
            find . -mindepth 1 -type d
        else
            echo -e "${GREEN}✓ All files in root directory${NC}"
        fi
        
        # Show sample files (only if no buckets)
        echo ""
        echo "Sample output files:"
        ls -la *.docx 2>/dev/null | head -10 | awk '{print "  " $9 " (" $5 " bytes)"}'
    fi
    
    echo ""
    
    # Show total size
    TOTAL_SIZE=$(du -sh . | cut -f1)
    echo "Total size: $TOTAL_SIZE"
    echo ""
    
    if [ "$DOCX_COUNT" -gt 0 ]; then
        echo -e "${GREEN}✓ Conversion successful!${NC}"
        echo "Output location: $OUTPUT_DIR"
    else
        echo -e "${RED}✗ No files were converted${NC}"
        exit 1
    fi
}

# Main execution
main() {
    # Check/install pandoc
    if ! check_pandoc; then
        install_pandoc
    fi
    
    # Verify input
    verify_input
    
    # Setup output
    setup_output
    
    # Convert files
    convert_files
    
    # Remove zh-CN
    remove_zh_cn
    
    # Flatten structure
    flatten_structure
    
    # Organize into buckets (if enabled)
    organize_into_buckets
    
    # Verify
    verify_results
    
    echo ""
    echo "=========================================="
    echo -e "${GREEN}Done!${NC}"
    echo "=========================================="
}

# Run main function
main
