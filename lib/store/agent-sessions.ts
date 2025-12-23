// Agent Sessions Store
// Tracks running agent processes and their output

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type AgentStatus = "idle" | "starting" | "running" | "stopped" | "error";

export interface AgentSession {
  id: string;
  name: string;
  status: AgentStatus;
  projectDir?: string;
  createdAt: Date;
  updatedAt: Date;
  output: string[];
  error?: string;
  pid?: number;
}

interface AgentSessionsState {
  sessions: AgentSession[];
  activeSessionId: string | null;
  
  // Actions
  createSession: (name: string, projectDir?: string) => string;
  updateSession: (id: string, updates: Partial<AgentSession>) => void;
  appendOutput: (id: string, output: string) => void;
  setActiveSession: (id: string | null) => void;
  stopSession: (id: string) => void;
  deleteSession: (id: string) => void;
  getSession: (id: string) => AgentSession | undefined;
  getActiveSessions: () => AgentSession[];
  resetStaleSessions: () => void;
}

export const useAgentSessionsStore = create<AgentSessionsState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,

      createSession: (name, projectDir) => {
        const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const session: AgentSession = {
          id,
          name,
          status: "idle",
          projectDir,
          createdAt: new Date(),
          updatedAt: new Date(),
          output: [],
        };
        
        set((state) => ({
          sessions: [session, ...state.sessions],
          activeSessionId: id,
        }));
        
        return id;
      },

      updateSession: (id, updates) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, ...updates, updatedAt: new Date() } : s
          ),
        }));
      },

      appendOutput: (id, output) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id
              ? { ...s, output: [...s.output, output], updatedAt: new Date() }
              : s
          ),
        }));
      },

      setActiveSession: (id) => {
        set({ activeSessionId: id });
      },

      stopSession: (id) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, status: "stopped", updatedAt: new Date() } : s
          ),
        }));
      },

      deleteSession: (id) => {
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          activeSessionId:
            state.activeSessionId === id ? null : state.activeSessionId,
        }));
      },

      getSession: (id) => {
        return get().sessions.find((s) => s.id === id);
      },

      getActiveSessions: () => {
        return get().sessions.filter(
          (s) => s.status === "running" || s.status === "starting"
        );
      },

      // Reset stale running sessions (call on app mount)
      resetStaleSessions: () => {
        set((state) => ({
          sessions: state.sessions.map((s) => ({
            ...s,
            status: s.status === "running" || s.status === "starting" ? "stopped" : s.status,
          })),
        }));
      },
    }),
    {
      name: "nvidia-agent-sessions",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sessions: state.sessions.map((s) => ({
          ...s,
          // Don't persist running status - reset to stopped on reload
          status: s.status === "running" || s.status === "starting" ? "stopped" : s.status,
          // Limit output history
          output: s.output.slice(-100),
        })),
      }),
    }
  )
);
