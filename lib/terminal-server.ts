// Terminal WebSocket Server
// Run alongside Next.js for full xterm.js support
// Usage: npx tsx lib/terminal-server.ts

import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import * as os from "os";

const PORT = 3001;

interface TerminalSession {
  pty: pty.IPty;
  ws: WebSocket;
}

const sessions = new Map<string, TerminalSession>();

function createTerminalServer() {
  const wss = new WebSocketServer({ port: PORT });

  console.log(`Terminal WebSocket server running on ws://localhost:${PORT}`);

  wss.on("connection", (ws, req) => {
    const sessionId = Math.random().toString(36).substring(7);
    const cwd = new URL(req.url || "", `http://localhost:${PORT}`).searchParams.get("cwd") || os.homedir();

    console.log(`New terminal session: ${sessionId}, cwd: ${cwd}`);

    // Create pseudo-terminal
    const shell = os.platform() === "win32" ? "powershell.exe" : process.env.SHELL || "/bin/bash";
    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: process.env as Record<string, string>,
    });

    sessions.set(sessionId, { pty: ptyProcess, ws });

    // Send terminal output to client
    ptyProcess.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "output", data }));
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "exit", code: exitCode }));
      }
      sessions.delete(sessionId);
    });

    // Handle client messages
    ws.on("message", (message) => {
      try {
        const msg = JSON.parse(message.toString());
        
        switch (msg.type) {
          case "input":
            ptyProcess.write(msg.data);
            break;
          case "resize":
            ptyProcess.resize(msg.cols, msg.rows);
            break;
          case "cwd":
            // Change directory
            ptyProcess.write(`cd ${msg.path}\r`);
            break;
        }
      } catch (error) {
        console.error("Error handling message:", error);
      }
    });

    ws.on("close", () => {
      console.log(`Terminal session closed: ${sessionId}`);
      ptyProcess.kill();
      sessions.delete(sessionId);
    });

    ws.on("error", (error) => {
      console.error(`WebSocket error for session ${sessionId}:`, error);
      ptyProcess.kill();
      sessions.delete(sessionId);
    });

    // Send session ID to client
    ws.send(JSON.stringify({ type: "session", id: sessionId }));
  });

  return wss;
}

// Auto-start when run directly
createTerminalServer();

export { createTerminalServer };
