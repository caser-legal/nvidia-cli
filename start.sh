#!/bin/bash
cd /Users/home/Documents/nvidia-cli

pkill -f "next dev" 2>/dev/null
pkill -f "terminal-server" 2>/dev/null

# Start terminal server in background (silent)
npx ts-node --esm lib/terminal-server.ts > /tmp/nvidia-cli-terminal.log 2>&1 &

# Open browser after a delay
(sleep 3 && open http://localhost:3000) &

# Run next dev in foreground (shows logs)
npm run dev
