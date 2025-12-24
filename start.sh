#!/bin/bash
cd /Users/home/Documents/nvidia-cli

pkill -f "next dev" 2>/dev/null
pkill -f "terminal-server" 2>/dev/null
sleep 1

LOG_FILE="/tmp/nvidia-cli-dev.log"
> "$LOG_FILE"

# Start terminal server (detached)
nohup npx tsx lib/terminal-server.ts > /tmp/nvidia-cli-terminal.log 2>&1 &

# Start next dev (detached, survives terminal close)
nohup bash -c 'NODE_OPTIONS="--max-old-space-size=8192 --no-deprecation --no-warnings" npm run dev' > "$LOG_FILE" 2>&1 &

# Wait for server to start
sleep 3
open http://localhost:3000

echo "Dory running at http://localhost:3000 (detached)"
echo "Logs: tail -f $LOG_FILE"
