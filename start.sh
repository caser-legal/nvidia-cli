#!/bin/bash
# Dory Startup Script
# Starts all services: Elasticsearch, MCP Server, Terminal Server, Flywheel API, Next.js

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# Kill any existing processes
echo "Cleaning up existing processes..."
pkill -f "next dev" 2>/dev/null
pkill -f "terminal-server" 2>/dev/null
pkill -f "mcp-server" 2>/dev/null
pkill -f "flywheel-api" 2>/dev/null
sleep 1

LOG_FILE="/tmp/nvidia-cli-dev.log"
> "$LOG_FILE"

# ============================================================================
# ELASTICSEARCH
# ============================================================================
if ! curl -s http://localhost:9200 > /dev/null 2>&1; then
  echo "Starting Elasticsearch..."
  if [ -d "$ROOT/elasticsearch-8.11.0" ]; then
    cd "$ROOT/elasticsearch-8.11.0"
    ./bin/elasticsearch -E xpack.security.enabled=false -d -p es.pid
    cd "$ROOT"
    echo "Waiting for Elasticsearch to start..."
    sleep 5
    # Wait for ES to be ready
    for i in {1..30}; do
      if curl -s http://localhost:9200 > /dev/null 2>&1; then
        echo "Elasticsearch ready!"
        break
      fi
      sleep 1
    done
  else
    echo "⚠️  Elasticsearch not found at $ROOT/elasticsearch-8.11.0"
  fi
else
  echo "Elasticsearch already running"
fi

# ============================================================================
# ENSURE DIRECTORIES EXIST
# ============================================================================
mkdir -p sft_traces dpo_traces dlq

# ============================================================================
# MCP SERVER
# ============================================================================
echo "Starting MCP server..."
nohup npx tsx mcp-server.ts > /tmp/nvidia-cli-mcp.log 2>&1 &
MCP_PID=$!
echo "MCP server started (PID: $MCP_PID)"

# ============================================================================
# TERMINAL SERVER
# ============================================================================
echo "Starting terminal server..."
nohup npx tsx lib/terminal-server.ts > /tmp/nvidia-cli-terminal.log 2>&1 &
TERMINAL_PID=$!
echo "Terminal server started (PID: $TERMINAL_PID)"

# ============================================================================
# FLYWHEEL API SERVER
# ============================================================================
echo "Starting flywheel API..."
nohup npx tsx flywheel-api.ts > /tmp/nvidia-cli-flywheel.log 2>&1 &
FLYWHEEL_PID=$!
echo "Flywheel API started (PID: $FLYWHEEL_PID)"

# ============================================================================
# NEXT.JS
# ============================================================================
echo "Starting Next.js..."
nohup bash -c 'NODE_OPTIONS="--max-old-space-size=8192 --no-deprecation --no-warnings" npm run dev' > "$LOG_FILE" 2>&1 &
NEXT_PID=$!
echo "Next.js started (PID: $NEXT_PID)"

# Wait for Next.js to be ready
echo "Waiting for Next.js to start..."
for i in {1..30}; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "Next.js ready!"
    break
  fi
  sleep 1
done

# Open browser
open http://localhost:3000

# ============================================================================
# STATUS
# ============================================================================
echo ""
echo "✅ Dory running:"
echo "   - UI:            http://localhost:3000"
echo "   - Dashboard:     http://localhost:3000/dashboard"
echo "   - MCP Server:    running (log: /tmp/nvidia-cli-mcp.log)"
echo "   - Terminal:      running (log: /tmp/nvidia-cli-terminal.log)"
echo "   - Flywheel API:  http://localhost:3001 (log: /tmp/nvidia-cli-flywheel.log)"
echo "   - Elasticsearch: http://localhost:9200"
echo ""
echo "Training directories:"
echo "   - SFT traces:    $(pwd)/sft_traces/"
echo "   - DPO traces:    $(pwd)/dpo_traces/"
echo "   - DLQ:           $(pwd)/dlq/"
echo ""
echo "Logs: tail -f $LOG_FILE"
echo "Stop: nvquit"
