#!/bin/bash
cd /Users/home/Documents/nvidia-cli

pkill -f "next dev" 2>/dev/null
pkill -f "terminal-server" 2>/dev/null

# Clear and create log file
LOG_FILE="/tmp/nvidia-cli-dev.log"
> "$LOG_FILE"

# Start terminal server in background (silent)
npx ts-node --esm lib/terminal-server.ts > /tmp/nvidia-cli-terminal.log 2>&1 &

# Open browser after a delay
(sleep 3 && open http://localhost:3000) &

# Run next dev with increased memory, tee to log file for live viewing
NODE_OPTIONS="--max-old-space-size=8192 --no-deprecation --no-warnings" npm run dev 2>&1 | tee -a "$LOG_FILE"
