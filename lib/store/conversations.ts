// Zustand Store - Part 1: Types and Conversation Store
// Features 46-67: Conversation Management

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import type { ModelId } from "../nvidia";

// Types
export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  images?: string[];
  inputTokens?: number;
  outputTokens?: number;
  isEdited?: boolean;
  isRegenerated?: boolean;
  originalContent?: string;
  createdAt: Date;
  artifacts?: Artifact[];
}

export interface Artifact {
  id: string;
  title: string;
  type: "code" | "html" | "svg" | "react" | "mermaid" | "text" | "markdown";
  language?: string;
  content: string;
  version: number;
  createdAt: Date;
}

export interface Conversation {
  id: string;
  title: string;
  model: ModelId;
  messages: Message[];
  temperature: number;
  maxTokens: number;
  topP: number;
  systemPrompt?: string;
  thinkingMode: boolean;
  isPinned: boolean;
  isArchived: boolean;
  hasUnread: boolean;
  projectId?: string;
  folderId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
  customInstructions?: string;
  defaultModel: ModelId;
  isPinned: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Folder {
  id: string;
  name: string;
  color?: string;
  parentId?: string;
  isExpanded: boolean;
  sortOrder: number;
}

export interface PromptTemplate {
  id: string;
  title: string;
  content: string;
  description?: string;
  category: string;
  tags: string[];
  useCount: number;
  isFavorite: boolean;
}

// Conversation Store
interface ConversationState {
  conversations: Conversation[];
  currentConversationId: string | null;
  isLoading: boolean;
  isStreaming: boolean;
  streamingContent: string;
  
  // Actions (Features 46-67)
  createConversation: (projectId?: string) => string;
  deleteConversation: (id: string) => void;
  updateConversation: (id: string, updates: Partial<Conversation>) => void;
  setCurrentConversation: (id: string | null) => void;
  duplicateConversation: (id: string) => string;
  
  // Messages
  addMessage: (conversationId: string, message: Omit<Message, "id" | "createdAt">) => string;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  deleteMessage: (conversationId: string, messageId: string) => void;
  regenerateMessage: (conversationId: string, messageId: string) => void;
  
  // Streaming
  setStreaming: (isStreaming: boolean) => void;
  appendStreamingContent: (content: string) => void;
  clearStreamingContent: () => void;
  
  // Bulk operations
  pinConversation: (id: string, isPinned: boolean) => void;
  archiveConversation: (id: string, isArchived: boolean) => void;
  moveToFolder: (conversationId: string, folderId: string | null) => void;
  moveToProject: (conversationId: string, projectId: string | null) => void;
  
  // Search (Features 50-51)
  searchConversations: (query: string) => Conversation[];
  
  // Getters
  getCurrentConversation: () => Conversation | null;
  getConversationsByProject: (projectId: string | null) => Conversation[];
  getConversationsByFolder: (folderId: string | null) => Conversation[];
  getPinnedConversations: () => Conversation[];
  getArchivedConversations: () => Conversation[];
}

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      isLoading: false,
      isStreaming: false,
      streamingContent: "",

      // Feature 46: Create new conversations
      createConversation: (projectId) => {
        const id = nanoid();
        const newConversation: Conversation = {
          id,
          title: "New Conversation",
          model: "nvidia/nemotron-3-nano-30b-a3b",
          messages: [],
          temperature: 1,
          maxTokens: 16384,
          topP: 1,
          thinkingMode: false,
          isPinned: false,
          isArchived: false,
          hasUnread: false,
          projectId,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
        };
        set((state) => ({
          conversations: [newConversation, ...state.conversations],
          currentConversationId: id,
        }));
        return id;
      },

      // Feature 49: Delete conversations
      deleteConversation: (id) => {
        set((state) => ({
          conversations: state.conversations.filter((c) => c.id !== id),
          currentConversationId:
            state.currentConversationId === id ? null : state.currentConversationId,
        }));
      },

      // Feature 48: Rename/update conversations
      updateConversation: (id, updates) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, ...updates, updatedAt: new Date() } : c
          ),
        }));
      },

      setCurrentConversation: (id) => {
        set({ currentConversationId: id });
        if (id) {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === id ? { ...c, hasUnread: false } : c
            ),
          }));
        }
      },

      // Feature 55: Duplicate conversation
      duplicateConversation: (id) => {
        const conversation = get().conversations.find((c) => c.id === id);
        if (!conversation) return "";
        
        const newId = nanoid();
        const duplicated: Conversation = {
          ...conversation,
          id: newId,
          title: `${conversation.title} (Copy)`,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
        };
        set((state) => ({
          conversations: [duplicated, ...state.conversations],
          currentConversationId: newId,
        }));
        return newId;
      },

      // Add message to conversation
      addMessage: (conversationId, message) => {
        const messageId = nanoid();
        const newMessage: Message = {
          ...message,
          id: messageId,
          createdAt: new Date(),
        };
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: [...c.messages, newMessage],
                  lastMessageAt: new Date(),
                  updatedAt: new Date(),
                  // Auto-generate title from first user message (max 20 chars to fit sidebar)
                  title:
                    c.messages.length === 0 && message.role === "user"
                      ? message.content.split(/\s+/).slice(0, 3).join(" ").slice(0, 20) + (message.content.length > 20 ? "…" : "")
                      : c.title,
                }
              : c
          ),
        }));
        return messageId;
      },

      // Feature 10: Message editing
      updateMessage: (conversationId, messageId, updates) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId
                      ? {
                          ...m,
                          ...updates,
                          isEdited: updates.content !== undefined ? true : m.isEdited,
                          originalContent:
                            updates.content !== undefined && !m.originalContent
                              ? m.content
                              : m.originalContent,
                        }
                      : m
                  ),
                  updatedAt: new Date(),
                }
              : c
          ),
        }));
      },

      deleteMessage: (conversationId, messageId) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.filter((m) => m.id !== messageId),
                  updatedAt: new Date(),
                }
              : c
          ),
        }));
      },

      // Feature 11: Message regeneration
      regenerateMessage: (conversationId, messageId) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, isRegenerated: true } : m
                  ),
                }
              : c
          ),
        }));
      },

      // Streaming state
      setStreaming: (isStreaming) => set({ isStreaming }),
      appendStreamingContent: (content) =>
        set((state) => ({ streamingContent: state.streamingContent + content })),
      clearStreamingContent: () => set({ streamingContent: "" }),

      // Feature 52: Pin conversations
      pinConversation: (id, isPinned) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, isPinned, updatedAt: new Date() } : c
          ),
        }));
      },

      // Feature 53: Archive conversations
      archiveConversation: (id, isArchived) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, isArchived, updatedAt: new Date() } : c
          ),
        }));
      },

      // Feature 67: Move to folder
      moveToFolder: (conversationId, folderId) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, folderId: folderId ?? undefined, updatedAt: new Date() } : c
          ),
        }));
      },

      // Feature 75: Move between projects
      moveToProject: (conversationId, projectId) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, projectId: projectId ?? undefined, updatedAt: new Date() } : c
          ),
        }));
      },

      // Features 50-51: Search
      searchConversations: (query) => {
        const q = query.toLowerCase();
        return get().conversations.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.messages.some((m) => m.content.toLowerCase().includes(q))
        );
      },

      // Getters
      getCurrentConversation: () => {
        const { conversations, currentConversationId } = get();
        return conversations.find((c) => c.id === currentConversationId) ?? null;
      },

      getConversationsByProject: (projectId) => {
        return get().conversations.filter((c) => c.projectId === projectId && !c.isArchived);
      },

      getConversationsByFolder: (folderId) => {
        return get().conversations.filter((c) => c.folderId === folderId && !c.isArchived);
      },

      getPinnedConversations: () => {
        return get().conversations.filter((c) => c.isPinned && !c.isArchived);
      },

      getArchivedConversations: () => {
        return get().conversations.filter((c) => c.isArchived);
      },
    }),
    {
      name: "nvidia-cli-conversations",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        conversations: state.conversations,
        currentConversationId: state.currentConversationId,
      }),
    }
  )
);
