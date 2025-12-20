#!/bin/bash
cd /Users/home/nvidia-cli

# Colors
G='\033[38;5;118m'
R='\033[38;5;196m'
D='\033[38;5;240m'
X='\033[0m'

pkill -f "next dev" 2>/dev/null
pkill -f "terminal-server" 2>/dev/null

npm run dev > /tmp/nvidia-cli-next.log 2>&1 &
npx ts-node --esm lib/terminal-server.ts > /tmp/nvidia-cli-terminal.log 2>&1 &

echo -ne "  ${R}○${X} Starting"
for i in {1..30}; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "\r  ${G}◉${X} Ready                    "
    echo ""
    echo "  ┌──────────────────────────────────────────────┐"
    echo "  │  ▸ localhost:3000                            │"
    echo "  │  ▸ nvquit to stop                            │"
    echo "  └──────────────────────────────────────────────┘"
    break
  fi
  sleep 1
done

open http://localhost:3000
