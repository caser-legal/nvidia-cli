#!/bin/bash
cd /Users/home/Documents/nvidia-cli

# Kill any existing processes
pkill -f "next dev" 2>/dev/null
pkill -f "terminal-server" 2>/dev/null
pkill -f "mcp-server" 2>/dev/null
pkill -f "elasticsearch" 2>/dev/null
sleep 1

LOG_FILE="/tmp/nvidia-cli-dev.log"
> "$LOG_FILE"

# Start Elasticsearch if not running
if ! curl -s http://localhost:9200 > /dev/null 2>&1; then
  echo "Starting Elasticsearch..."
  if [ -d ~/Downloads/elasticsearch-8.11.0 ]; then
    cd ~/Downloads/elasticsearch-8.11.0
    ./bin/elasticsearch -E xpack.security.enabled=false -d -p es.pid
    cd /Users/home/Documents/nvidia-cli
    sleep 5
  fi
fi

# Start MCP server (detached)
echo "Starting MCP server..."
nohup npx tsx mcp-server.ts > /tmp/nvidia-cli-mcp.log 2>&1 &

# Start terminal server (detached)
echo "Starting terminal server..."
nohup npx tsx lib/terminal-server.ts > /tmp/nvidia-cli-terminal.log 2>&1 &

# Start next dev (detached)
echo "Starting Next.js..."
nohup bash -c 'NODE_OPTIONS="--max-old-space-size=8192 --no-deprecation --no-warnings" npm run dev' > "$LOG_FILE" 2>&1 &

# Wait for server to start
sleep 3
open http://localhost:3000

echo ""
echo "✅ Dory running:"
echo "   - UI:            http://localhost:3000"
echo "   - MCP Server:    running (log: /tmp/nvidia-cli-mcp.log)"
echo "   - Terminal:      running (log: /tmp/nvidia-cli-terminal.log)"
echo "   - Elasticsearch: http://localhost:9200"
echo ""
echo "Logs: tail -f $LOG_FILE"
echo "Stop: nvquit"
