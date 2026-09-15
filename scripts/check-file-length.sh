#!/usr/bin/env bash
# Enforce the 400-line rule on source files (CONTRIBUTING.md).
# Checks git-tracked .rs/.ts/.tsx/.css files; generated dirs are ignored
# because they are not tracked.
set -euo pipefail

MAX=400
failed=0

while IFS= read -r file; do
  lines=$(wc -l <"$file" | tr -d ' ')
  if [ "$lines" -gt "$MAX" ]; then
    echo "FAIL: $file has $lines lines (max $MAX)"
    failed=1
  fi
done < <(git ls-files '*.rs' '*.ts' '*.tsx' '*.css')

if [ "$failed" -ne 0 ]; then
  echo ""
  echo "Files over $MAX lines — split them (see CONTRIBUTING.md)."
  exit 1
fi
echo "OK: all source files are ≤ $MAX lines"
