#!/bin/bash

find . -type f \
    -not -path "*/env/*" \
    -not -path "*/__pycache__/*" \
    -not -path "*/.idea/*" \
    -not -path "*/node_modules/*" \
    -not -path "*/logs/*" \
    -not -path "*/.git/*" \
    -not -path "*/dist/*" \
    -not -name "*.png" \
    -not -name "package.json" \
    -not -name "package-lock.json" \
    -not -name "*.ico" \
    -not -name "*.pyc" \
    -not -name "*.so" \
    -not -name "*.dll" \
    -not -name "*.exe" \
    -not -name "*.bin" \
    -not -name "*.pdf" \
    -not -name "*.map" \
    -not -name "*.pem" \
    -not -name "*.jpg" \
    -not -name "*.ipynb" \
    -not -name "*.gz" \
    -not -name ".DS_Store" \
    -not -path "*/frontend/*" \
    -not -name "project.txt" \
    -not -name ".gitignore" \
    -not -name "cat_files.sh" \
    -print0 | while IFS= read -r -d '' file; do
        echo "======== FILE: $file ========"
        cat "$file"
        echo ""
    done
