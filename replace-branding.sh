#!/bin/bash
set -euo pipefail

echo "=== Replacing 'Epic Notes' branding with 'Epic Shop' ==="

# Count current occurrences
echo "Before: $(rg 'Epic Notes' app/ -c | wc -l) files, $(rg 'Epic Notes' app/ --count-matches | cut -d: -f2 | paste -sd+ | bc || echo 0) total matches"

# Use sed for straightforward replacement: "Epic Notes" → "Epic Shop"
find app/ -type f \( -name '*.tsx' -o -name '*.ts' -o -name '*.json' \) -print0 | while IFS= read -r -d '' file; do
    if grep -q 'Epic Notes' "$file" 2>/dev/null; then
        echo "  Processing: $file"
        sed -i 's/Epic Notes/Epic Shop/g' "$file"
    fi
done

# Handle the Logo component: lowercase "notes" → "shop" in the Logo function
# Only in root.tsx, within the Logo component
sed -i '/function Logo()/,/^}$/ s/notes/shop/' app/root.tsx

echo ""
echo "=== After replacement ==="
echo "Files still containing 'Epic Notes': $(rg 'Epic Notes' app/ -l | wc -l)"
echo "Total remaining matches: $(rg 'Epic Notes' app/ --count-matches | cut -d: -f2 | paste -sd+ | bc 2>/dev/null || echo 0)"
