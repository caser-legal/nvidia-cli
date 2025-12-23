#!/bin/bash
# CI guard: Validate section header format in Dory system prompt
# Fails if:
#   1. Any line ^[0-9]+\. lacks em-dash (numbered sub-steps not allowed)
#   2. Section count != 29

set -e

FILE="app/api/agent-chat/route.ts"
EMDASH=$'\xe2\x80\x94'  # U+2014

echo "Checking section headers in $FILE..."

# Check 1: Any line starting with digit. must contain em-dash
NUMBERED_WITHOUT_EMDASH=$(grep -nE "^[0-9]+\. " "$FILE" | grep -v "$EMDASH" || true)
if [ -n "$NUMBERED_WITHOUT_EMDASH" ]; then
    echo "❌ FAIL: Numbered lines missing em-dash (use bullets/letters for sub-steps):"
    echo "$NUMBERED_WITHOUT_EMDASH"
    exit 1
fi

# Check 2: Count sections (should be exactly 29)
SECTION_COUNT=$(grep -cE "^[0-9]+\. .*$EMDASH" "$FILE")
if [ "$SECTION_COUNT" -ne 29 ]; then
    echo "❌ FAIL: Expected 29 sections, found $SECTION_COUNT"
    exit 1
fi

echo "✅ PASS: 29 sections, all numbered lines have em-dash"
