// Terminal WebSocket Server
// Run alongside Next.js for full xterm.js support
// Usage: npx tsx lib/terminal-server.ts

import { WebSocketServer, WebSocket } from "ws";
import * as pty from "node-pty";
import * as os from "os";
import { createLogger } from "./logger";

const log = createLogger("Terminal");

const PORT = 3001;

interface TerminalSession {
  pty: pty.IPty;
  ws: WebSocket;
}

const sessions = new Map<string, TerminalSession>();

function createTerminalServer() {
  const wss = new WebSocketServer({ port: PORT });

  log.info(`WebSocket server running on ws://localhost:${PORT}`);

  wss.on("connection", (ws, req) => {
    const sessionId = Math.random().toString(36).substring(7);
    const cwd = new URL(req.url || "", `http://localhost:${PORT}`).searchParams.get("cwd") || os.homedir();

    log.info(`New terminal session: ${sessionId}`, { cwd });

    const shell = os.platform() === "win32" ? "powershell.exe" : "/bin/zsh";
    const ptyProcess = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols: 80,
      rows: 24,
      cwd,
      env: {
        PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin",
        HOME: "/Users/home",
        USER: "home",
        TERM: "xterm-256color"
      },
    });

    sessions.set(sessionId, { pty: ptyProcess, ws });

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

    ws.on("message", (message) => {
      try {
        const msg = JSON.parse(message.toString());
        
        switch (msg.type) {
          case "input": ptyProcess.write(msg.data); break;
          case "resize": ptyProcess.resize(msg.cols, msg.rows); break;
          case "cwd": ptyProcess.write(`cd ${msg.path}\r`); break;
        }
      } catch (error) {
        log.error("Error handling message", { error: String(error) });
      }
    });

    ws.on("close", () => {
      log.info(`Terminal session closed: ${sessionId}`);
      ptyProcess.kill();
      sessions.delete(sessionId);
    });

    ws.on("error", (error) => {
      log.error(`WebSocket error for session ${sessionId}`, { error: String(error) });
      ptyProcess.kill();
      sessions.delete(sessionId);
    });

    ws.send(JSON.stringify({ type: "session", id: sessionId }));
  });

  return wss;
}

createTerminalServer();

export { createTerminalServer };
