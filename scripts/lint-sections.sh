#!/bin/bash
# CI guard: Validate section header format in Dory system prompt
# Fails if:
#   1. Any main header (^[0-9]+\. [A-Z]) lacks em-dash (—)
#   2. Any numbered list (^[0-9]+\.) appears inside section body (sub-steps must use bullets/letters)

set -e

FILE="app/api/agent-chat/route.ts"
EMDASH=$'\xe2\x80\x94'  # U+2014

echo "Checking section headers in $FILE..."

# Check 1: All main headers must contain em-dash
HEADERS_WITHOUT_EMDASH=$(grep -nE "^[0-9]+\. [A-Z]" "$FILE" | grep -v "$EMDASH" || true)
if [ -n "$HEADERS_WITHOUT_EMDASH" ]; then
    echo "❌ FAIL: Section headers missing em-dash (—):"
    echo "$HEADERS_WITHOUT_EMDASH"
    exit 1
fi

# Check 2: Count sections (should be exactly 29)
SECTION_COUNT=$(grep -cE "^[0-9]+\. .*$EMDASH" "$FILE")
if [ "$SECTION_COUNT" -ne 29 ]; then
    echo "❌ FAIL: Expected 29 sections, found $SECTION_COUNT"
    exit 1
fi

# Check 3: No numbered sub-steps (lines starting with digit. inside prompt string)
# Exclude: section headers (have em-dash), workflow letters (A., B., etc.)
NUMBERED_SUBSTEPS=$(grep -nE "^[0-9]+\. [a-z]" "$FILE" | grep -v "$EMDASH" || true)
if [ -n "$NUMBERED_SUBSTEPS" ]; then
    echo "❌ FAIL: Numbered sub-steps found (use bullets or letters instead):"
    echo "$NUMBERED_SUBSTEPS"
    exit 1
fi

echo "✅ PASS: 29 sections, all with em-dash, no numbered sub-steps"
